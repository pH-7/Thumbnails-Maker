const path = require('path');
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Local unsigned packages are only used for content and launch verification.
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('Skipping notarization for unsigned verification build');
    return;
  }

  const targetNames = Array.from(context.targets || []).map((target) => target.name || String(target));
  const packagerOptions = context.packager && (context.packager.options || context.packager.config);
  const configuredTargets = packagerOptions && packagerOptions.mac && packagerOptions.mac.target;
  const isMasBuild = targetNames.includes('mas') ||
    String(appOutDir).includes(`${path.sep}mas`) ||
    (Array.isArray(configuredTargets) && configuredTargets.length === 1 && configuredTargets[0] === 'mas');

  // Mac App Store builds are reviewed by Apple and do not use notarization.
  if (isMasBuild) {
    console.log('Skipping notarization for MAS build');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}`);

  try {
    const keyPath = process.env.APP_STORE_KEY_PATH;
    if (keyPath && process.env.APP_STORE_ISSUER_ID) {
      await notarize({
        appPath,
        appleApiKey: path.resolve(keyPath),
        appleApiIssuer: process.env.APP_STORE_ISSUER_ID
      });
    } else {
      const required = ['APPLE_ID', 'APPLE_ID_PASSWORD', 'APPLE_TEAM_ID'];
      const missing = required.filter((key) => !process.env[key]);
      if (missing.length) {
        throw new Error(`Missing notarization credentials: ${missing.join(', ')}`);
      }
      await notarize({
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      });
    }
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
