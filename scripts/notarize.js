const { notarize } = require('electron-notarize');
const { build } = require('../package.json');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization for MAS builds (Mac App Store will handle this)
  if (context.packager.options.mac && context.packager.options.mac.target.includes('mas')) {
    console.log('Skipping notarization for MAS build');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}`);

  // Set the team ID explicitly
  const teamId = process.env.APPLE_TEAM_ID || '';
  console.log(`Using Team ID: ${teamId}`);

  try {
    // Make sure these environment variables are set before running the build
    await notarize({
      appBundleId: build.appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      ascProvider: teamId
    });
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
