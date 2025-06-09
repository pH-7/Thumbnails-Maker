# Certificate Management Guide

## Common Problems

### Problem 1: Too Many Certificates

If you see this error:
```
Could not create another Distribution certificate, reached the maximum number of available Distribution certificates.
```

Apple limits developer accounts to a maximum of 3 distribution certificates at any time. You'll need to manually revoke unused ones before creating new ones.

### Problem 2: Certificate Not Found

If you see this error:
```
Could not find appropriate signing identity for "1120764EF3BFD48561A2FD422B610358F637B508"
```

This means the certificate with that specific ID cannot be found in your keychain. This can happen if:
- The certificate was revoked
- The certificate expired
- The certificate is not in your local keychain
- The certificate ID format is incorrect

## Solutions

### Option 1: List Available Certificates

First, check what certificates are available in your keychain:

```bash
npm run list-certs
```

This will show all available certificates and highlight the one that will be used for signing.

### Option 2: Clean Up Using Fastlane

If you have too many certificates:

1. Run the certificate cleanup script:
   ```bash
   npm run fastlane-clean
   ```
   
   This will prompt you to confirm which certificates to revoke.

2. After cleaning up, try setting up certificates again:
   ```bash
   npm run fastlane-setup
   ```

### Option 3: Manually Revoke Certificates

If the automatic cleanup doesn't work, you'll need to manually revoke certificates in the Apple Developer Portal:

1. Log in to [Apple Developer Portal](https://developer.apple.com/account/)
2. Go to "Certificates, Identifiers & Profiles"
3. Select "Certificates" under the "Distribute" section
4. Look for any existing Mac Distribution certificates:
   - Review the expiration dates and usages
   - Keep the most recent one if it's being used by production apps
   - Revoke any older or unused certificates
5. To revoke, select the certificate and click the "Revoke" button

### Option 4: Update Xcode and Developer Tools

Sometimes certificate issues can be fixed by updating Xcode and the Command Line Tools:

```bash
xcode-select --install
```

## Important Notes

- **Be careful** when revoking certificates that might be used by apps in production
- **Back up your certificates** before revoking them
- After revoking certificates, you may need to rebuild and resubmit apps using the old certificates
- Consider configuring Fastlane match to use a Git repository for storing and sharing certificates with your team 