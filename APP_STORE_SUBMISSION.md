# App Store Submission Guide for YouTube Thumbnail Creator

This guide will walk you through the process of submitting your YouTube Thumbnail Creator app to the Mac App Store.

## Prerequisites

1. **Apple Developer Program Enrollment**: ✅ Already enrolled (Team ID: 2V8LZ2444Y)
2. **App Bundle Identifier**: `ph7.me.youtube-thumbnail-combiner` ✅ Already configured
3. **App Store Connect Setup**: Your app is already created in App Store Connect with ID 6743055043

## Step 1: Obtain a Distribution Provisioning Profile

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/profiles/list)
2. Click the "+" button to create a new profile
3. Select "Mac App Store" as the distribution method
4. Select your App ID (`ph7.me.youtube-thumbnail-combiner`)
5. Select your distribution certificate
6. Name the profile (e.g., "YouTube Thumbnail Creator Mac App Store")
7. Download the provisioning profile
8. Save it as `build/embedded.provisionprofile` in your project directory

## Step 2: Store App-Specific Password in Keychain

The submission script uses `@keychain:AC_PASSWORD` to securely access your App Store Connect credentials.

1. Generate an app-specific password in your Apple ID account:
   - Go to [appleid.apple.com](https://appleid.apple.com/)
   - Sign in with your Apple ID
   - Go to "Security" > "App-Specific Passwords"
   - Click "Generate Password..." and follow the instructions

2. Store the password in your macOS Keychain:
   ```bash
   xcrun altool --store-password-in-keychain-item AC_PASSWORD -u "your_apple_id@example.com" -p "your-app-specific-password"
   ```

## Step 3: Build and Submit

Run the submission script:

```bash
npm run submit-appstore
```

This script will:
1. Check for the provisioning profile
2. Build the app for Mac App Store
3. Validate the app package
4. Upload it to App Store Connect

## Step 4: Complete Submission in App Store Connect

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

## Troubleshooting

### Common Issues:

1. **Missing Provisioning Profile**:
   - Ensure you've downloaded the profile and saved it as `build/embedded.provisionprofile`

2. **Certificate Issues**:
   - Verify your distribution certificate is valid and not expired
   - Check that the certificate in your keychain matches the one in your provisioning profile

3. **Upload Errors**:
   - Check your internet connection
   - Verify your app-specific password is correct
   - Ensure your app version in package.json is higher than any previous submissions

4. **Validation Errors**:
   - Check the error message for specific issues
   - Common problems include missing entitlements or incorrect provisioning profile

For additional help, refer to [Apple's App Distribution Guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).
