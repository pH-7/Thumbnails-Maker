# Creating a Mac App Store Provisioning Profile

This guide will walk you through the process of creating a Mac App Store Distribution Provisioning Profile for your YouTube Thumbnail Creator app.

## Prerequisites

1. An active Apple Developer Program membership
2. Access to the Apple Developer Portal
3. A Mac App Distribution Certificate in your keychain
4. Your app ID registered in the Developer Portal

## Step 1: Log in to the Apple Developer Portal

1. Go to [developer.apple.com/account/resources/profiles/list](https://developer.apple.com/account/resources/profiles/list)
2. Sign in with your Apple Developer account credentials

## Step 2: Create a New Provisioning Profile

1. Click the "+" button to create a new profile
2. Under "Distribution", select **"Mac App Store"**
   - This is critical - do not select Developer ID or any other type

## Step 3: Configure the Profile

1. **Select Your App ID**
   - Choose `ph7.me.youtube-thumbnail-combiner` from the list
   - If it's not listed, you'll need to create it first in the Identifiers section

2. **Select Your Distribution Certificate**
   - Choose your Mac App Distribution Certificate
   - If you don't have one, you'll need to create it first in the Certificates section
   - The certificate should match the identity in your package.json: `C25440E62CC75D95ABAE5173EDA22189CBC98331`

3. **Name Your Profile**
   - Give it a descriptive name like "YouTube Thumbnail Creator Mac App Store"
   - This helps you identify it later

## Step 4: Generate and Download

1. Click "Generate" to create the provisioning profile
2. Download the generated profile to your computer
3. Save it as `build/embedded.provisionprofile` in your project directory
   - Create the `build` directory if it doesn't exist

## Step 5: Verify the Profile

1. Make sure the file is named exactly `embedded.provisionprofile`
2. Ensure it's placed in the `build` directory at the root of your project
3. The full path should be: `/Users/pierre-henrysoria/Code/Thumbnail-Creator/build/embedded.provisionprofile`

## Common Issues and Solutions

### "No profiles found" error
- Make sure your Apple Developer Program membership is active
- Verify that you have the correct App ID registered

### "Certificate not found" error
- Ensure your Mac App Distribution Certificate is valid and not expired
- Check that the certificate is installed in your keychain

### "Invalid profile" error when building
- The profile might be for the wrong type of distribution
- Make sure you selected "Mac App Store" and not "Developer ID"

## Next Steps

After creating and placing your provisioning profile, you can build and submit your app:

```bash
# Build for Mac App Store
npm run mas-build

# Submit to App Store Connect
npm run submit-appstore
```

For more information, refer to [Apple's documentation on provisioning profiles](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases). 