# Mac App Store Submission Troubleshooting Guide

This guide provides detailed troubleshooting steps for common issues encountered when submitting your YouTube Thumbnail Creator app to the Mac App Store.

## Identified Issue: Wrong Certificate Type

The diagnostics show that you have an **Apple Development** certificate instead of a **Mac App Distribution** certificate:

```
C25440E62CC75D95ABAE5173EDA22189CBC98331 "Apple Development: Pierre-Henry Soria (UC7JMRBLS3)"
```

For Mac App Store submission, you need a Mac App Distribution certificate.

## How to Fix the Certificate Issue

1. **Go to Apple Developer Portal**
   - Visit [developer.apple.com/account/resources/certificates/list](https://developer.apple.com/account/resources/certificates/list)

2. **Create a Mac App Distribution Certificate**
   - Click the "+" button to create a new certificate
   - Select "Mac App Distribution" under "Software" category
   - Follow the prompts to create the Certificate Signing Request (CSR) if needed
   - Upload the CSR and download the new certificate

3. **Import the Certificate**
   - Double-click the downloaded certificate to add it to your keychain
   - Note the new certificate ID that appears when you run:
     ```bash
     security find-identity -v -p codesigning
     ```

4. **Update Your Build Configuration**
   - Edit the `scripts/mas-build.js` file to use the new certificate ID
   - Replace all occurrences of `C25440E62CC75D95ABAE5173EDA22189CBC98331` with your new Mac App Distribution certificate ID

5. **Create a New Provisioning Profile**
   - After getting your Mac App Distribution certificate, create a new Mac App Store provisioning profile
   - Make sure to select the new Mac App Distribution certificate when creating the profile

## First Step: Run the Diagnostics

Run the certificate and environment diagnostics:

```bash
npm run check-certs
```

This will check your certificates, provisioning profile, and environment variables, providing detailed information about any issues.

## Common Issues and Solutions

### 1. Certificate Not Found

**Symptoms:**
- Error message: "Could not automatically determine ElectronTeamID from identity"
- Certificate not showing up in diagnostic output

**Solutions:**
- Import your Mac App Distribution Certificate into your keychain:
  1. Download the certificate from Apple Developer Portal
  2. Double-click the .p12 file to import into Keychain Access
  3. Enter the certificate password if prompted

- Verify your certificate with:
  ```bash
  security find-identity -v -p codesigning
  ```
  Look for certificates with "Mac App Distribution" in the name

### 2. Provisioning Profile Issues

**Symptoms:**
- "No provisioning profile found" error
- Profile exists but build still fails

**Solutions:**
- Verify profile exists at `build/embedded.provisionprofile`
- Make sure the profile was created for Mac App Store distribution
- Check that the profile matches your app bundle ID and team ID
- Ensure the profile is not expired
- Download a fresh profile from Apple Developer Portal

To examine your provisioning profile:

```bash
security cms -D -i build/embedded.provisionprofile | grep -A 2 -B 2 "application-identifier"
security cms -D -i build/embedded.provisionprofile | grep -A 2 -B 2 "com.apple.developer.team-identifier"
security cms -D -i build/embedded.provisionprofile | grep -A 2 -B 2 "ExpirationDate"
```

### 3. Configuration Errors

**Symptoms:**
- "Invalid configuration object" in electron-builder
- Configuration properties not recognized

**Solutions:**
- Use the `scripts/mas-build.js` script which creates a proper configuration
- Clear any temporary `electron-builder.yml` files in your project root
- Verify electron-builder version in package.json matches your expectations

### 4. Entitlements Issues

**Symptoms:**
- "Missing entitlements" or "entitlement not found" errors
- Sandbox-related build failures

**Solutions:**
- Make sure both entitlements files exist:
  1. `build/entitlements.mac.plist`
  2. `build/entitlements.mac.inherit.plist`

- The mas-build script will create default entitlements if they don't exist

### 5. Environment Variables

Set these environment variables before building:

```bash
export APPLE_TEAM_ID=2V8LZ2444Y
export CSC_IDENTITY_AUTO_DISCOVERY=true
# Replace with your new Mac App Distribution certificate ID
export CSC_NAME="YOUR_MAC_APP_DISTRIBUTION_CERTIFICATE_ID"
```

For notarization (non-MAS builds), also set:
```bash
export APPLE_ID=your_apple_id@example.com
export APPLE_ID_PASSWORD=your_app_specific_password
```

## Advanced Troubleshooting

### Manual Verification of Provisioning Profile

1. Extract and examine the profile's contents:
   ```bash
   mkdir -p /tmp/profile-check
   security cms -D -i build/embedded.provisionprofile > /tmp/profile-check/profile.plist
   open /tmp/profile-check/profile.plist
   ```

2. Verify these key elements:
   - `<key>application-identifier</key>` - Should include your team ID and bundle ID
   - `<key>com.apple.developer.team-identifier</key>` - Should be `2V8LZ2444Y`
   - `<key>Entitlements</key>` - Should include app sandbox and other required entitlements
   - `<key>ExpirationDate</key>` - Should be a future date
   - `<key>DeveloperCertificates</key>` - Should contain your Mac App Distribution certificate

### Manual Build with Explicit Options

Try building with explicit options (after getting your Mac App Distribution certificate):

```bash
electron-builder --mac mas \
  --publish never \
  --config.appId=ph7.me.youtube-thumbnail-combiner \
  --config.productName="YouTube Thumbnail Creator" \
  --config.mac.identity="YOUR_MAC_APP_DISTRIBUTION_CERTIFICATE_ID" \
  --config.mas.provisioningProfile=build/embedded.provisionprofile \
  --config.mas.identity="YOUR_MAC_APP_DISTRIBUTION_CERTIFICATE_ID" \
  --verbose
```

### Checking App Structure

After a successful build, verify the app structure:

```bash
find dist/mas -type f -name "*.pkg" | xargs ls -la
```

## Common Error Messages and Solutions

1. **"No identity found"**: Your certificate is missing from the keychain or misreferenced
2. **"No provisioning profile matching..."**: Wrong profile for your app ID
3. **"Invalid entitlements"**: Your entitlements files have issues
4. **"Failed to locate team"**: Team ID issues in certificate or provisioning profile
5. **"You must use the newest certificates for Mac App Store"**: Certificate needs to be renewed

## Apple Developer Documentation

For more information on creating the correct certificates and profiles, refer to these Apple resources:

- [Creating Distribution Certificates](https://help.apple.com/xcode/mac/current/#/dev154b28f09)
- [App Distribution Guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)

## If All Else Fails

1. Create a completely fresh provisioning profile in the Apple Developer Portal
2. Generate a new distribution certificate if necessary
3. Delete any temporary build folders and try again
4. Try a simpler test app to verify your environment works properly
5. Contact Apple Developer Support if issues persist 