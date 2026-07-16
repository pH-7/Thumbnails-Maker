#!/usr/bin/env ruby

require 'dotenv'
require 'json'
require 'spaceship'

root = File.expand_path('..', __dir__)
Dotenv.load(File.join(root, '.env'))

required = %w[APP_STORE_KEY_ID APP_STORE_ISSUER_ID APP_STORE_KEY_PATH]
missing = required.select { |key| ENV[key].to_s.strip.empty? }
abort("Missing App Store Connect configuration: #{missing.join(', ')}") unless missing.empty?

raw_key_path = ENV.fetch('APP_STORE_KEY_PATH')
key_path = raw_key_path.start_with?('/') ? raw_key_path : File.expand_path(raw_key_path, root)
Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
  key_id: ENV.fetch('APP_STORE_KEY_ID'),
  issuer_id: ENV.fetch('APP_STORE_ISSUER_ID'),
  filepath: key_path,
  in_house: false
)

bundle_ids = {
  ios: ENV['IOS_APP_IDENTIFIER'].to_s.strip.empty? ? 'me.ph7.youtubethumbnailmaker' : ENV['IOS_APP_IDENTIFIER'].to_s.strip,
  macos: ENV['APP_IDENTIFIER'].to_s.strip
}

result = {}
bundle_ids.each do |label, bundle_id|
  next if bundle_id.empty?

  app = Spaceship::ConnectAPI::App.find(bundle_id)
  unless app
    result[label] = { bundle_id: bundle_id, found: false }
    next
  end

  versions = app.get_app_store_versions(includes: 'build').sort_by do |version|
    version.created_date.to_s
  end.reverse.map do |version|
    build = version.respond_to?(:build) ? version.build : nil
    {
      version: version.version_string,
      platform: version.platform,
      state: version.app_version_state || version.app_store_state,
      build: build&.version,
      created_date: version.created_date
    }
  end

  builds = Spaceship::ConnectAPI::Build.all(app_id: app.id, limit: 30).map do |build|
    {
      version: build.app_version,
      build: build.version,
      platform: build.platform,
      processing_state: build.processing_state,
      uploaded_date: build.uploaded_date
    }
  rescue StandardError
    {
      build: build.version,
      processing_state: build.processing_state,
      uploaded_date: build.uploaded_date
    }
  end

  reviews = app.get_review_submissions(includes: 'appStoreVersionForReview').sort_by do |review|
    review.submitted_date.to_s
  end.reverse.map do |review|
    version = review.app_store_version_for_review
    {
      platform: review.platform,
      state: review.state,
      version: version&.version_string,
      submitted_date: review.submitted_date
    }
  end

  result[label] = {
    bundle_id: bundle_id,
    found: true,
    name: app.name,
    versions: versions,
    builds: builds,
    reviews: reviews
  }
end

puts JSON.pretty_generate(result)
