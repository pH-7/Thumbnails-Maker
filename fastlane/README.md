fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Mac

### mac release

```sh
[bundle exec] fastlane mac release
```

Submit to Mac App Store

### mac build_mac_app

```sh
[bundle exec] fastlane mac build_mac_app
```

Build the Mac app with proper signing

### mac create_plist_file

```sh
[bundle exec] fastlane mac create_plist_file
```

Create and merge Info.plist additions

### mac sign_mac_app

```sh
[bundle exec] fastlane mac sign_mac_app
```

Sign the app with proper entitlements

### mac package_mac_app

```sh
[bundle exec] fastlane mac package_mac_app
```

Create .pkg file for App Store

### mac match_appstore

```sh
[bundle exec] fastlane mac match_appstore
```

Fetch certificates and provisioning profiles

### mac clean_certificates

```sh
[bundle exec] fastlane mac clean_certificates
```

Clean up old or unused certificates

### mac upload_to_app_store

```sh
[bundle exec] fastlane mac upload_to_app_store
```

Upload to App Store via Transporter

### mac no_certs_build

```sh
[bundle exec] fastlane mac no_certs_build
```

Build the app without using match for certificates

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
