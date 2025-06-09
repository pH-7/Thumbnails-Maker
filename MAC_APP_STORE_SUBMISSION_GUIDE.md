# Mac App Store Submission Guide (Updated)

## Certificate Information

There appears to be a discrepancy between how your certificates are identified:

- In Apple Developer Portal: Your certificate ID is `V3U6559QP8` (Profile ID: `RDJVP23528`)
- In your keychain: The same certificate appears with fingerprint `1120764EF3BFD48561A2FD422B610358F637B508`

This is causing issues with the electron-builder system, which cannot properly determine your team ID from these identifiers.

## Recommended Approach

Given the challenges with electron-builder, we recommend a direct approach:

1. **Build the app manually**:
   ```bash
   electron-builder --mac --publish never
   ```

2. **Sign and package it manually using Apple's tools**:
   ```bash
   xcrun notarytool store-credentials "AC_PASSWORD" \
     --apple-id "your_apple_id@example.com" \
     --team-id "2V8LZ2444Y" \
     --password "your_app_specific_password"

   xcrun productbuild --component "dist/mac/YouTube Thumbnail Creator.app" \
     /Applications \
     --sign "1120764EF3BFD48561A2FD422B610358F637B508" \
     "dist/mas/YouTube Thumbnail Creator.pkg"
   ```

3. **Submit using Apple's transport tool**:
   ```bash
   xcrun altool --upload-app -f "dist/mas/YouTube Thumbnail Creator.pkg" \
     -t macos \
     -p "@keychain:AC_PASSWORD" \
     --team-id "2V8LZ2444Y"
   ```

## Certificate Troubleshooting

If you're having certificate issues:

1. **Verify the certificate in keychain**:
   ```bash
   security find-identity -v -p codesigning
   ```
   You should see: `1120764EF3BFD48561A2FD422B610358F637B508 "Apple Distribution: SimpliXio Pte. Ltd. (2V8LZ2444Y)"`

2. **Extract and verify certificates from your provisioning profile**:
   ```bash
   security cms -D -i build/embedded.provisionprofile | grep -A 10 -B 10 "DeveloperCertificates"
   ```

3. **If needed, download a new certificate**:
   - Go to [developer.apple.com/account/resources/certificates/download/V3U6559QP8](https://developer.apple.com/account/resources/certificates/download/V3U6559QP8)
   - Double-click to install in keychain

## Next Steps

1. Complete the App Store information at:
   [App Store Connect](https://appstoreconnect.apple.com/apps/6743055043/distribution/macos/version/inflight)

2. Submit for App Review

## Additional Resources

- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Uploading to App Store Connect](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)

## Quick Start

1. Verify your certificate and provisioning profile match:
   ```bash
   npm run verify-profile
   ```

2. If verification passes, build the app:
   ```bash
   npm run direct-build
   ```

3. Submit to App Store Connect:
   ```bash
   npm run submit-appstore
   ```

## Steps for Submission

### Step 1: Verify Certificate and Profile Match

Before attempting to build, verify that your certificate and provisioning profile are correctly matched:

```bash
npm run verify-profile
```

This will:
- Check if the certificate is in your keychain
- Extract certificates from your provisioning profile
- Verify the team ID and app bundle ID 
- Check the expiration date

### Step 2: Build for Mac App Store

If verification is successful, build the app:

```bash
npm run direct-build
```

This script:
- Uses the certificate ID `V3U6559QP8`
- Sets all required environment variables
- Builds using explicit command-line parameters
- Provides detailed diagnostic information if an error occurs

### Step 3: Submit to App Store Connect

When the build succeeds, submit the app to App Store Connect:

```bash
npm run submit-appstore
```

### Step 4: Complete Submission in App Store Connect

After successful upload:

1. Go to [App Store Connect](https://appstoreconnect.apple.com/apps/6743055043/distribution/macos/version/inflight)
2. Complete any missing information
3. Submit for review

## Troubleshooting Certificate Issues

If you encounter certificate-related errors:

1. **Verify the certificate is in your keychain**:
   ```bash
   security find-identity -v -p codesigning
   ```
   Look for the certificate with ID `V3U6559QP8` or the fingerprint `1120764EF3BFD48561A2FD422B610358F637B508`

2. **Import certificate if missing**:
   - Download it from [developer.apple.com/account/resources/certificates/download/V3U6559QP8](https://developer.apple.com/account/resources/certificates/download/V3U6559QP8)
   - Double-click to add to your keychain

3. **Verify certificate is included in provisioning profile**:
   ```bash
   security cms -D -i build/embedded.provisionprofile | grep -A 10 -B 10 "DeveloperCertificates"
   ```

## Prerequisites

- Apple Developer Program membership (✓ Confirmed)
- App bundle ID: `ph7.me.youtube-thumbnail-combiner` (✓ Confirmed)
- Apple Distribution certificate (✓ ID: `V3U6559QP8`)
- Mac App Store provisioning profile (Profile ID: `RDJVP23528`)

## Step 1: Create or Update Provisioning Profile

Your provisioning profile **must** include your Apple Distribution certificate. Follow these steps:

1. Go to [Apple Developer Portal - Profiles](https://developer.apple.com/account/resources/profiles/list)
2. Click the "+" button to create a new profile
3. Under "Distribution", select **"Mac App Store"**
4. Select your App ID (`ph7.me.youtube-thumbnail-combiner`)
5. **Important**: On the certificate selection page, select your "Apple Distribution" certificate:
   ```
   Apple Distribution: SimpliXio Pte. Ltd. (2V8LZ2444Y)
   ```
6. Name the profile (e.g., "YouTube Thumbnail Creator Mac App Store")
7. Generate and download the profile
8. Save the downloaded file as `build/embedded.provisionprofile` in your project directory

## Step 2: Verify Certificate and Profile

Run the following command to verify that your certificate and provisioning profile are correctly set up:

```bash
npm run check-certs
```

Look for these success messages:
- `✅ Found target certificate: 1120764EF3BFD48561A2FD422B610358F637B508`
- `✅ Profile includes Certificate ID: 1120764EF3BFD48561A2FD422B610358F637B508`

If any warnings or errors appear, address them before proceeding.

## Step 3: Build for Mac App Store

We now have an improved build process that uses direct command-line arguments instead of a configuration file:

```bash
npm run direct-build
```

This script:
- Validates your provisioning profile and certificate
- Sets all required environment variables
- Builds using explicit command-line parameters
- Provides detailed diagnostic information if an error occurs

## Step 4: Submit to App Store Connect

When the build succeeds, you can submit the app to App Store Connect:

```bash
npm run submit-appstore
```

This script:
1. Builds the app (using the direct-build approach)
2. Validates the package with Apple's submission tools
3. Uploads it to App Store Connect

## Step 5: Complete Submission in App Store Connect

After successful upload:

1. Go to [App Store Connect](https://appstoreconnect.apple.com/apps/6743055043/distribution/macos/version/inflight)
2. Complete any missing information:
   - App description
   - Screenshots
   - Privacy policy
   - Age rating
   - Pricing and availability
   - Version information
3. Submit for review

## Troubleshooting Common Issues

### Certificate Issues

If your certificate isn't being recognized:

1. **Check certificate in keychain**:
   ```bash
   security find-identity -v -p codesigning
   ```
   Look for your Apple Distribution certificate.

2. **Import certificate if missing**:
   - Download it from Apple Developer Portal
   - Double-click to add to keychain

### Provisioning Profile Issues

If your provisioning profile is causing problems:

1. **Verify contents**:
   ```bash
   security cms -D -i build/embedded.provisionprofile
   ```
   Check for:
   - Correct app ID (`2V8LZ2444Y.ph7.me.youtube-thumbnail-combiner`)
   - Your Apple Distribution certificate
   - Valid expiration date

2. **Create a new profile** if needed, ensuring it includes your current Apple Distribution certificate

### Build Errors

If the build fails:

1. **Check error message** for specific issues
2. **Run with diagnostics**:
   ```bash
   DEBUG=electron-builder npm run direct-build
   ```
3. **Try simplified command**:
   ```bash
   electron-builder --mac mas --publish never
   ```

### Submission Errors

If submission fails:

1. **Check App-Specific Password** is set up correctly:
   ```bash
   xcrun altool --store-password-in-keychain-item AC_PASSWORD -u "your_apple_id@example.com" -p "your-app-specific-password"
   ```

2. **Verify the built package**:
   ```bash
   xcrun altool --validate-app -f "dist/mas/YouTube Thumbnail Creator-1.0.0.pkg" -t macos -p "@keychain:AC_PASSWORD" --team-id "2V8LZ2444Y"
   ```

## Need Help?

If you're still having issues after following this guide, please:
1. Check the detailed error messages
2. Run the diagnostics with `npm run check-certs`
3. Review Apple's [documentation on app submission](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases) 