#!/bin/bash

# Script to automate the Mac App Store submission process using Fastlane
# Usage: ./deploy-to-app-store.sh [lane_name]
#
# Available options:
#   setup         - Initialize certificates and provisioning profiles
#   build_mac_app - Just build the app
#   release       - Full release process (default)
#   upload_to_app_store - Upload an already built app
#   clean         - Clean up unused certificates and profiles
#   no_certs_build - Build without certificate management (for testing)

# Set error handling
set -e

# Display banner
echo "========================================"
echo "  YouTube Thumbnail Creator Deployment  "
echo "========================================"

# Check for bundle
if ! command -v bundle &> /dev/null; then
    echo "Bundler not found, installing..."
    gem install bundler
fi

# Install gems if needed
if [ ! -d "vendor/bundle" ]; then
    echo "Installing dependencies..."
    bundle install --path vendor/bundle
fi

# Recommend updating Fastlane
echo "NOTE: Consider updating Fastlane to the latest version:"
echo "      bundle update fastlane"
echo "========================================"

# Check for lane argument
LANE=${1:-"release"}

# Handle special setup case
if [ "$LANE" == "setup" ]; then
    echo "Setting up certificates and provisioning profiles..."
    echo "========================================"
    cd fastlane && bundle exec fastlane mac match_appstore
    exit $?
fi

# Handle clean certificates case
if [ "$LANE" == "clean" ]; then
    echo "Cleaning up certificates and provisioning profiles..."
    echo "⚠️  This will remove certificates from Apple Developer Portal"
    echo "========================================"
    cd fastlane && bundle exec fastlane mac clean_certificates
    exit $?
fi

# Handle emergency no-certs build
if [ "$LANE" == "no_certs_build" ]; then
    echo "Building WITHOUT certificate management (for testing only)..."
    echo "⚠️ This build will NOT be suitable for App Store submission"
    echo "========================================"
    cd fastlane && bundle exec fastlane mac no_certs_build
    exit $?
fi

# Display selected lane
echo "Running Fastlane lane: $LANE"
echo "========================================"

# Run Fastlane with the specified lane - need to be in fastlane directory
cd fastlane && bundle exec fastlane mac $LANE

# Check exit code
if [ $? -eq 0 ]; then
    echo "========================================"
    echo "✅ Fastlane completed successfully!"
    echo "========================================"
else
    echo "========================================"
    echo "❌ Fastlane encountered an error!"
    echo "   Check the logs above for details."
    echo "========================================"
    exit 1
fi 