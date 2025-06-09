# Creating a New Provisioning Profile for Your Certificate

Based on our diagnostics, we've identified that you need to create a new Mac App Store provisioning profile that includes your existing Apple Distribution certificate.

## Current Status

- **Certificate Available**: ✅ `1120764EF3BFD48561A2FD422B610358F637B508` ("Apple Distribution: SimpliXio Pte. Ltd. (2V8LZ2444Y)")
- **Provisioning Profile**: ⚠️ Your current profile doesn't include this certificate

## Step 1: Create a New Mac App Store Provisioning Profile

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

## Step 2: Replace Your Existing Provisioning Profile

1. Save the downloaded profile as `embedded.provisionprofile` in the `build` directory of your project:
   ```
   /Users/pierre-henrysoria/Code/Thumbnail-Creator/build/embedded.provisionprofile
   ```
2. Overwrite the existing file if prompted

## Step 3: Verify the Profile

After placing the new provisioning profile, run the certificate checker:

```bash
npm run check-certs
```

This should now show:
```
✅ Certificate ID 1120764EF3BFD48561A2FD422B610358F637B508 found in provisioning profile
```

## Step 4: Try Building Again

Once the profile is correctly set up, try building the app:

```bash
npm run mas-build
```

## Common Problems and Solutions

### Can't Find the Right Certificate in Apple Developer Portal

If you don't see your "Apple Distribution" certificate in the list when creating the provisioning profile:

1. Make sure you're signed in with the right Apple Developer account
2. Check if your certificate is revoked or expired
3. The certificate name in the portal may be slightly different from what shows in your keychain

### Profile Creation Fails

If you get an error when creating the profile:

1. Make sure your Apple Developer Program membership is active
2. Verify that your App ID is properly configured
3. Check that your certificate is valid and not revoked

### Understanding the Certificate-Profile Relationship

For Mac App Store submission, everything must match:

1. The certificate in your keychain
2. The certificate selected when creating the provisioning profile
3. The certificate ID referenced in your build configuration

When these three elements are aligned, the build process should succeed! 