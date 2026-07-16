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
    expect(xcodeProject).toContain('MARKETING_VERSION = 1.2.0;');
    expect(fastfile).toContain('IOS_RELEASE_VERSION = "1.2.0"');
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

    expect(pipeline).toContain('--ignore="^/store-assets($|/)"');
    expect(pipeline).toContain('installBrandedAppIcon(appPath)');
    expect(pipeline).toContain("plistIcon !== 'icon.icns'");
    expect(pipeline).toContain("sourceBytes.equals(bundledBytes)");
    expect(pipeline).toContain('removeUnusedPrivacyUsageDescriptions(appPath)');
    expect(pipeline).toContain('NSCameraUsageDescription');
    expect(pipeline).toContain('NSMicrophoneUsageDescription');
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
