const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('store release readiness', () => {
  test('release versions match the editable App Store records', () => {
    const packageJson = require('../package.json');
    const xcodeProject = fs.readFileSync(
      path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'),
      'utf8'
    );
    const fastfile = fs.readFileSync(path.join(root, 'fastlane/Fastfile'), 'utf8');

    expect(packageJson.version).toBe('4.2.0');
    expect(xcodeProject).toContain('MARKETING_VERSION = 1.3.0;');
    expect(fastfile).toContain('IOS_RELEASE_VERSION = "1.3.0"');
    expect(fastfile).toContain('npx cap copy ios');
  });

  test('both platform listings have final metadata and valid categories', () => {
    for (const platform of ['ios', 'mac']) {
      const metadata = path.join(root, 'fastlane/metadata', platform);
      expect(fs.readFileSync(path.join(metadata, 'primary_category.txt'), 'utf8').trim()).toBe(
        'GRAPHICS_AND_DESIGN'
      );
      for (const file of ['name.txt', 'description.txt', 'keywords.txt', 'release_notes.txt', 'support_url.txt', 'privacy_url.txt']) {
        expect(fs.readFileSync(path.join(metadata, 'en-US', file), 'utf8').trim()).not.toBe('');
      }
    }
  });

  test('store screenshot generators use current Apple sizes and opaque output', () => {
    const iosGenerator = fs.readFileSync(path.join(root, 'scripts/generate-ios-screenshots.js'), 'utf8');
    const macGenerator = fs.readFileSync(path.join(root, 'scripts/generate-macos-screenshots.js'), 'utf8');

    expect(iosGenerator).toContain('width: 1320');
    expect(iosGenerator).toContain('height: 2868');
    expect(iosGenerator).toContain('width: 2064');
    expect(iosGenerator).toContain('height: 2752');
    expect(iosGenerator).toContain('flatten({ background:');
    expect(macGenerator).toContain('const WIDTH = 2880');
    expect(macGenerator).toContain('const HEIGHT = 1800');
    expect(macGenerator).toContain('flatten({ background:');
    expect(fs.existsSync(path.join(root, 'store-assets/creator-scenes.png'))).toBe(true);
  });

  test('Mac release validates its branded icon and removes unused permission prompts', () => {
    const pipeline = fs.readFileSync(path.join(root, 'scripts/mas-publish-pipeline.js'), 'utf8');
    const packageJson = require('../package.json');

    expect(pipeline).toContain('--ignore="^/store-assets($|/)"');
    expect(pipeline).toContain('assertCleanRuntimePayload(appPath)');
    expect(pipeline).toContain('Unexpected native binary:');
    expect(pipeline).toContain('removeUnusedLoginHelper(appPath)');
    expect(pipeline).toContain('--asar.unpackDir="node_modules/@img"');
    expect(pipeline).toContain('libvips dynamic library is missing');
    expect(packageJson.build.files).not.toContain('**/*');
    expect(packageJson.build.files).toContain('main.js');
    expect(packageJson.devDependencies.electron).toBe('43.1.1');
    expect(pipeline).toContain('installBrandedAppIcon(appPath)');
    expect(pipeline).toContain("plistIcon !== 'icon.icns'");
    expect(pipeline).toContain("sourceBytes.equals(bundledBytes)");
    expect(pipeline).toContain('removeUnusedPrivacyUsageDescriptions(appPath)');
    expect(pipeline).toContain('NSCameraUsageDescription');
    expect(pipeline).toContain('NSMicrophoneUsageDescription');
    expect(pipeline).toContain('NSAudioCaptureUsageDescription');
    expect(pipeline).toContain('NSAppTransportSecurity');
    expect(pipeline).toContain('unrestricted-network metadata');
  });

  test('desktop previews encode local file paths safely', () => {
    const desktopHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    expect(desktopHtml).toContain("const { pathToFileURL } = require('url')");
    expect(desktopHtml).toContain('pathToFileURL(selectedImagePaths[index]).href');
    expect(desktopHtml).toContain('pathToFileURL(result.outputPath).href');
    expect(desktopHtml).not.toContain('`file://${result.outputPath}`');
  });

  test('iOS release includes bounded imports, first-five rewards and native sharing', () => {
    const mobileApp = fs.readFileSync(path.join(root, 'mobile/app.js'), 'utf8');
    const mobileHtml = fs.readFileSync(path.join(root, 'mobile/index.html'), 'utf8');

    expect(mobileApp).toContain('const MAX_IMAGES = 12');
    expect(mobileApp).toContain('const REWARDED_GENERATIONS = 5');
    expect(mobileApp).toContain('rewardSuccessfulCreation()');
    expect(mobileApp).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(mobileApp).toContain('photoSaver.shareImage');
    expect(mobileHtml).toContain('id="confettiLayer"');
    expect(mobileHtml).toContain('id="shareBtn"');
  });

  test('iOS App Store screenshots advertise the supported twelve-photo layout', () => {
    const screenshotGenerator = fs.readFileSync(
      path.join(root, 'scripts/generate-ios-screenshots.js'),
      'utf8'
    );

    expect(screenshotGenerator).toContain("layout: 'magazine-grid', count: 12");
    expect(screenshotGenerator).toContain("headline: 'Up to 12 photos'");
    expect(screenshotGenerator).not.toContain('Up to 9 photos');
  });
});

describe('notarization hook', () => {
  test('unsigned local verification builds skip notarization safely', async () => {
    const previous = process.env.CSC_IDENTITY_AUTO_DISCOVERY;
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    try {
      const hook = require('../scripts/notarize').default;
      await expect(hook({ electronPlatformName: 'darwin' })).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.CSC_IDENTITY_AUTO_DISCOVERY;
      else process.env.CSC_IDENTITY_AUTO_DISCOVERY = previous;
    }
  });
});
