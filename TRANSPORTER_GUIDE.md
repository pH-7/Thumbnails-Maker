# Mac App Store Submission with Transporter

This guide provides instructions for submitting your YouTube Thumbnail Creator app to the Mac App Store using Apple's Transporter app.

## Why This Approach?

We're using this approach because:

1. Traditional `electron-builder --mac mas` approach is having issues with certificate identification
2. Transporter provides a more reliable and direct way to submit apps to the App Store
3. This method gives us direct control over the signing and packaging process

## Prerequisites

1. Make sure you have:
   - An active Apple Developer account
   - The [Transporter app](https://apps.apple.com/us/app/transporter/id1450874784) installed from the Mac App Store
   - Your Apple Distribution certificate installed in your keychain
   - Your app already created in App Store Connect

2. Verify your certificate:
   ```bash
   security find-identity -v -p codesigning
   ```
   You should see your certificate: 
   ```
   1120764EF3BFD48561A2FD422B610358F637B508 "Apple Distribution: SimpliXio Pte. Ltd. (2V8LZ2444Y)"
   ```

## Step 1: Prepare Your App for Transporter

Run the following command:

```bash
npm run prepare-for-transporter
```

This script will:
1. Package your app using electron-packager (more reliable than electron-builder for this purpose)
2. Set the correct app category and metadata
3. Properly sign all app components and frameworks with the correct entitlements
4. Create a .pkg file ready for App Store submission
5. Place the final package in `~/Desktop/AppPrep/YouTube Thumbnail Creator.pkg`

## Step 2: Submit Using Transporter

1. Open the Transporter app
2. Sign in with your Apple ID associated with your developer account
3. Click the "+" button or select "Add App" from the File menu
4. Navigate to `~/Desktop/AppPrep/YouTube Thumbnail Creator.pkg` and select it
5. Click "Deliver" to upload your app to App Store Connect

## Step 3: Complete Submission in App Store Connect

1. After successful upload, go to [App Store Connect](https://appstoreconnect.apple.com/apps/6743055043/distribution/macos/version/inflight)
2. Complete any remaining information:
   - App metadata
   - Screenshots
   - Privacy policy
   - Age rating
   - Pricing and availability
3. Submit for review

## Troubleshooting

### Packaging Issues

If the app packaging fails:
- Make sure electron-packager is installed (`npm install --save-dev electron-packager`)
- Check that your app's main code is properly set up for packaging

### Signing Issues

If app signing fails:
- Verify your certificate is valid: `security find-identity -v -p codesigning`
- Check that your entitlements files exist in the build directory
- Make sure the app bundle ID matches what's in your Apple Developer account

### Transporter Issues

If Transporter shows errors:
- Make sure your app is properly created in App Store Connect
- Check that your .pkg file is properly signed
- For validation errors, review Apple's guidelines for Mac App Store submissions

## Manual Steps (If Needed)

If you need to perform the steps manually:

```bash
# Create a clean directory
rm -rf ~/Desktop/AppPrep
mkdir -p ~/Desktop/AppPrep

# Package the app 
npx electron-packager . "YouTube Thumbnail Creator" --platform=darwin --arch=x64 --out=~/Desktop/AppPrep --icon=build/mac/icon.icns --overwrite --app-bundle-id="ph7.me.youtube-thumbnail-combiner" --app-version="1.0.0"

# Create Info.plist addition for app category
cat > ~/Desktop/AppPrep/Info.plist.extra << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.graphics-design</string>
</dict>
</plist>
EOF

# Merge into main Info.plist
/usr/libexec/PlistBuddy -c "Merge ~/Desktop/AppPrep/Info.plist.extra" "~/Desktop/AppPrep/YouTube Thumbnail Creator-darwin-x64/YouTube Thumbnail Creator.app/Contents/Info.plist"

# Copy entitlements file (to make the path shorter)
cp build/entitlements.mac.plist ~/Desktop/AppPrep/

# Sign the app with a single command (--deep handles all components)
codesign --force --options runtime --deep --entitlements "~/Desktop/AppPrep/entitlements.mac.plist" --verbose --sign "1120764EF3BFD48561A2FD422B610358F637B508" "~/Desktop/AppPrep/YouTube Thumbnail Creator-darwin-x64/YouTube Thumbnail Creator.app"

# Verify signature
codesign --verify --verbose "~/Desktop/AppPrep/YouTube Thumbnail Creator-darwin-x64/YouTube Thumbnail Creator.app"

# Create pkg
productbuild --component "~/Desktop/AppPrep/YouTube Thumbnail Creator-darwin-x64/YouTube Thumbnail Creator.app" /Applications --sign "1120764EF3BFD48561A2FD422B610358F637B508" "~/Desktop/AppPrep/YouTube Thumbnail Creator.pkg"
```

Then use Transporter to upload the resulting package.

## If You Encounter Issues with Signing

Common signing errors can be resolved by:

1. **Using the `--force` flag**: This helps when there are pre-existing signatures in components
2. **Using the `--deep` flag**: Signs all nested components at once
3. **Adding the `--verbose` flag**: Provides more detailed information about the signing process

If you see an error about "bundle format unrecognized", try this alternative approach:

```bash
# First, sign all frameworks individually
cd ~/Desktop/AppPrep/YouTube\ Thumbnail\ Creator-darwin-x64/YouTube\ Thumbnail\ Creator.app/Contents/Frameworks/
for framework in *.framework; do
  codesign --force --options runtime --verbose --sign "1120764EF3BFD48561A2FD422B610358F637B508" "$framework"
done

# Then sign all .dylib files
for dylib in *.dylib; do
  codesign --force --options runtime --verbose --sign "1120764EF3BFD48561A2FD422B610358F637B508" "$dylib"
done

# Finally sign the app
cd ~/Desktop/AppPrep
codesign --force --options runtime --verbose --entitlements "entitlements.mac.plist" --sign "1120764EF3BFD48561A2FD422B610358F637B508" "YouTube Thumbnail Creator-darwin-x64/YouTube Thumbnail Creator.app"
``` 