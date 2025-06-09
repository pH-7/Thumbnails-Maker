# Using Fastlane with Bundler

This guide explains how to properly use Fastlane with Bundler to avoid common issues.

## What is Bundler?

Bundler is a dependency manager for Ruby projects. It helps ensure that the gems (Ruby libraries) your project depends on are installed and at the correct versions.

## Why Use Bundler with Fastlane?

- **Consistent Versions**: Ensures everyone uses the same version of Fastlane and plugins
- **Isolated Environment**: Prevents conflicts with other global gems
- **Reproducible Builds**: Makes your CI/CD process more reliable

## Setup Guide

### 1. Install Bundler

```bash
gem install bundler
```

### 2. Install Dependencies

```bash
bundle install --path vendor/bundle
```

This installs all the gems specified in the Gemfile into the `vendor/bundle` directory, keeping them isolated from your global gem installation.

### 3. Running Fastlane Commands

Always prefix Fastlane commands with `bundle exec` and run them from the fastlane directory:

```bash
cd fastlane
bundle exec fastlane [lane_name]
```

For example:
```bash
cd fastlane
bundle exec fastlane mac release
```

### 4. Using the Deployment Script

The `deploy-to-app-store.sh` script has been updated to use Bundler automatically. You can run it as before:

```bash
./deploy-to-app-store.sh [lane_name]
```

Or via npm scripts:
```bash
npm run fastlane-release
```

## Keeping Fastlane Updated

We recommend regularly updating Fastlane to get the latest features and bug fixes:

```bash
bundle update fastlane
```

This is especially important since recent versions of Fastlane include critical fixes for authentication with Apple's services.

## Troubleshooting

### Common Issues

If you encounter errors, try these fixes:

1. Make sure you're running commands from the fastlane directory:
   ```bash
   cd fastlane
   bundle exec fastlane mac release
   ```

2. Delete the vendor directory and try again:
   ```bash
   rm -rf vendor/
   bundle install --path vendor/bundle
   ```

3. Update Bundler:
   ```bash
   gem update bundler
   ```

4. Clear the Bundler cache:
   ```bash
   bundle clean --force
   ``` 