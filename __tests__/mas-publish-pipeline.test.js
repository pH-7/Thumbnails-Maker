const {
  assertCleanRuntimePayload,
  generateAutoBuildNumber,
  hasAltoolErrors,
  isDuplicateBundleVersionError,
  isClosedPreReleaseTrainError,
  suggestNextBuildNumber,
  suggestNextMarketingVersion,
} = require('../scripts/mas-publish-pipeline');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('MAS publish pipeline guards', () => {
  test('auto build number uses numeric dot-separated format', () => {
    const buildNumber = generateAutoBuildNumber();
    const parts = buildNumber.split('.');

    expect(parts).toHaveLength(3);
    expect(parts.every((part) => /^\d+$/.test(part))).toBe(true);
    expect(parts[2]).toHaveLength(8);
  });

  test('detects altool validation/upload failures', () => {
    expect(hasAltoolErrors('2026-04-22 ERROR: Failed to upload package.')).toBe(true);
    expect(hasAltoolErrors('status : 409 detail : duplicate build version')).toBe(true);
    expect(hasAltoolErrors('{ "product-errors": [{ "message": "Validation failed" }] }')).toBe(true);
    expect(hasAltoolErrors('Upload completed successfully.')).toBe(false);
  });

  test('detects duplicate bundle version rejection', () => {
    const duplicateOutput = 'The bundle version must be higher than the previously uploaded version.';
    expect(isDuplicateBundleVersionError(duplicateOutput)).toBe(true);
    expect(isDuplicateBundleVersionError('Validation passed')).toBe(false);
  });

  test('suggests next build number by incrementing last segment', () => {
    expect(suggestNextBuildNumber('3.2.5')).toBe('3.2.6');
    expect(suggestNextBuildNumber('2026.4.22150001')).toBe('2026.4.22150002');
    expect(suggestNextBuildNumber('invalid')).toBe('1');
  });

  test('detects closed pre-release train and short-version errors', () => {
    expect(
      isClosedPreReleaseTrainError(
        'This bundle is invalid. The value for key CFBundleShortVersionString [3.2.5] must contain a higher version.'
      )
    ).toBe(true);
    expect(
      isClosedPreReleaseTrainError("Invalid Pre-Release Train. The train version '3.2.5' is closed for new build submissions")
    ).toBe(true);
    expect(isClosedPreReleaseTrainError('Validation passed')).toBe(false);
  });

  test('suggests next marketing version by incrementing patch segment', () => {
    expect(suggestNextMarketingVersion('3.2.5')).toBe('3.2.6');
    expect(suggestNextMarketingVersion('3.2')).toBe('3.2.1');
    expect(suggestNextMarketingVersion('invalid')).toBe('1.0.0');
  });

  test('rejects build and mobile tooling from the packaged runtime', async () => {
    const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-runtime-audit-'));
    const forbiddenPath = path.join(appPath, 'Contents', 'Resources', 'vendor', 'bundle');
    fs.mkdirSync(forbiddenPath, { recursive: true });

    try {
      await expect(assertCleanRuntimePayload(appPath)).rejects.toThrow(/Forbidden payload: vendor/);
    } finally {
      fs.rmSync(appPath, { recursive: true, force: true });
    }
  });
});
