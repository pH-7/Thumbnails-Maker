#!/usr/bin/env node

/**
 * Mac App Store Build & Publish Pipeline
 * 
 * Automated pipeline that:
 * 1. Validates/creates required certificates
 * 2. Builds the Electron app for Mac App Store (MAS)
 * 3. Signs the .app and .pkg
 * 4. Validates and uploads to App Store Connect using API Key
 * 
 * Usage: node scripts/mas-publish-pipeline.js
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Load environment variables from .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  TEAM_ID: process.env.APPLE_TEAM_ID || '',
  APP_BUNDLE_ID: 'ph7.me.youtube-thumbnail-combiner',
  PRODUCT_NAME: 'YouTube Thumbnail Creator',
  VERSION: '3.1.0',
  
  // App Store Connect API Key
  API_KEY_ID: process.env.APP_STORE_KEY_ID || '',
  API_ISSUER_ID: process.env.APP_STORE_ISSUER_ID || '',
  API_KEY_PATH: process.env.APP_STORE_KEY_PATH || path.join(__dirname, '..', 'AuthKey.p8'),
  
  // Paths
  PROJECT_ROOT: path.join(__dirname, '..'),
  BUILD_DIR: path.join(__dirname, '..', 'build'),
  DIST_DIR: path.join(__dirname, '..', 'dist'),
  PROVISIONING_PROFILE: path.join(__dirname, '..', 'build', 'embedded.provisionprofile'),
  ENTITLEMENTS: path.join(__dirname, '..', 'build', 'entitlements.mac.plist'),
  ENTITLEMENTS_INHERIT: path.join(__dirname, '..', 'build', 'entitlements.mac.inherit.plist'),
  ICON: path.join(__dirname, '..', 'build', 'mac', 'icon.icns'),
};

// ============================================================
// UTILITIES
// ============================================================
function log(emoji, message) {
  console.log(`${emoji}  ${message}`);
}

function logStep(step, message) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  STEP ${step}: ${message}`);
  console.log(`${'='.repeat(60)}\n`);
}

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: CONFIG.PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (error) {
    if (options.ignoreError) {
      return error.stdout || error.stderr || '';
    }
    throw error;
  }
}

function runCmdSilent(cmd) {
  return runCmd(cmd, { silent: true, stdio: 'pipe', ignoreError: true });
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================================
// STEP 1: Validate Prerequisites
// ============================================================
async function validatePrerequisites() {
  logStep(1, 'Validating Prerequisites');
  
  // Check API Key
  if (!fs.existsSync(CONFIG.API_KEY_PATH)) {
    log('❌', `API Key file not found at: ${CONFIG.API_KEY_PATH}`);
    process.exit(1);
  }
  log('✅', `API Key file found: ${CONFIG.API_KEY_PATH}`);
  
  // Check provisioning profile
  if (!fs.existsSync(CONFIG.PROVISIONING_PROFILE)) {
    log('❌', `Provisioning profile not found at: ${CONFIG.PROVISIONING_PROFILE}`);
    process.exit(1);
  }
  log('✅', `Provisioning profile found`);
  
  // Check entitlements
  if (!fs.existsSync(CONFIG.ENTITLEMENTS)) {
    log('❌', `Entitlements file not found at: ${CONFIG.ENTITLEMENTS}`);
    process.exit(1);
  }
  log('✅', 'Entitlements files found');
  
  // Check icon
  if (!fs.existsSync(CONFIG.ICON)) {
    log('⚠️', 'Icon file not found, will use default');
  } else {
    log('✅', 'App icon found');
  }
  
  // Check Xcode command line tools
  try {
    runCmdSilent('xcode-select -p');
    log('✅', 'Xcode command line tools installed');
  } catch {
    log('❌', 'Xcode command line tools not found. Install with: xcode-select --install');
    process.exit(1);
  }
  
  // Check node_modules
  if (!fs.existsSync(path.join(CONFIG.PROJECT_ROOT, 'node_modules'))) {
    log('📦', 'Installing dependencies...');
    runCmd('npm install');
  }
  log('✅', 'Node dependencies installed');
}

// ============================================================
// STEP 2: Validate/Create Certificates
// ============================================================
async function validateCertificates() {
  logStep(2, 'Validating Code Signing Certificates');
  
  const allIdentities = runCmdSilent('security find-identity -v');
  const codesignIdentities = runCmdSilent('security find-identity -v -p codesigning');
  
  log('📋', 'Available identities:');
  console.log(codesignIdentities);
  
  // Check for Apple Distribution / 3rd Party Mac Developer Application
  let appCert = null;
  const appleDistMatch = codesignIdentities.match(/([A-F0-9]{40})\s+"(Apple Distribution:[^"]+)"/);
  const thirdPartyAppMatch = codesignIdentities.match(/([A-F0-9]{40})\s+"(3rd Party Mac Developer Application:[^"]+)"/);
  
  if (appleDistMatch) {
    appCert = { hash: appleDistMatch[1], name: appleDistMatch[2] };
    log('✅', `Application certificate: ${appCert.name}`);
  } else if (thirdPartyAppMatch) {
    appCert = { hash: thirdPartyAppMatch[1], name: thirdPartyAppMatch[2] };
    log('✅', `Application certificate: ${appCert.name}`);
  } else {
    log('❌', 'No Apple Distribution or 3rd Party Mac Developer Application certificate found!');
    log('📝', 'You need to create one at https://developer.apple.com/account/resources/certificates/add');
    log('📝', 'Select "Apple Distribution" certificate type');
    
    const shouldCreate = await prompt('Would you like me to generate a CSR for you? (y/n): ');
    if (shouldCreate.toLowerCase() === 'y') {
      await generateCSR('app_distribution');
      log('📝', 'After creating the certificate on Apple Developer Portal:');
      log('📝', '1. Download the .cer file');
      log('📝', '2. Double-click to import into Keychain');
      const done = await prompt('Press Enter when you have imported the certificate...');
      return validateCertificates(); // Re-validate
    }
    process.exit(1);
  }
  
  // Check for 3rd Party Mac Developer Installer certificate
  let installerCert = null;
  const installerMatch = allIdentities.match(/([A-F0-9]{40})\s+"(3rd Party Mac Developer Installer:[^"]+)"/);
  const macInstallerMatch = allIdentities.match(/([A-F0-9]{40})\s+"(Mac Installer Distribution:[^"]+)"/);
  
  if (installerMatch) {
    installerCert = { hash: installerMatch[1], name: installerMatch[2] };
    log('✅', `Installer certificate: ${installerCert.name}`);
  } else if (macInstallerMatch) {
    installerCert = { hash: macInstallerMatch[1], name: macInstallerMatch[2] };
    log('✅', `Installer certificate: ${installerCert.name}`);
  } else {
    log('⚠️', 'No Mac Installer Distribution certificate found!');
    log('📝', 'This certificate is required to sign the .pkg for App Store submission.');
    log('');
    log('🔧', 'Generating Certificate Signing Request (CSR)...');
    
    const csrPath = await generateCSR('installer');
    
    console.log('\n' + '─'.repeat(60));
    log('📋', 'MANUAL STEP REQUIRED:');
    console.log('─'.repeat(60));
    log('1️⃣', 'Go to: https://developer.apple.com/account/resources/certificates/add');
    log('2️⃣', 'Select "Mac Installer Distribution" certificate');
    log('3️⃣', 'Upload the CSR file: ' + csrPath);
    log('4️⃣', 'Download the generated .cer file');
    log('5️⃣', 'Double-click the .cer file to import into Keychain Access');
    console.log('─'.repeat(60));
    
    // Open the Apple Developer portal
    try {
      runCmd('open "https://developer.apple.com/account/resources/certificates/add"', { silent: true, stdio: 'pipe' });
    } catch(e) {}
    
    // Open the CSR file location
    try {
      runCmd(`open -R "${csrPath}"`, { silent: true, stdio: 'pipe' });
    } catch(e) {}
    
    await prompt('\n✋ Press Enter AFTER you have created and imported the installer certificate...');
    
    // Re-check for the installer certificate
    const recheck = runCmdSilent('security find-identity -v');
    const recheckInstaller = recheck.match(/([A-F0-9]{40})\s+"(3rd Party Mac Developer Installer:[^"]+)"/);
    const recheckMacInstaller = recheck.match(/([A-F0-9]{40})\s+"(Mac Installer Distribution:[^"]+)"/);
    
    if (recheckInstaller) {
      installerCert = { hash: recheckInstaller[1], name: recheckInstaller[2] };
      log('✅', `Installer certificate found: ${installerCert.name}`);
    } else if (recheckMacInstaller) {
      installerCert = { hash: recheckMacInstaller[1], name: recheckMacInstaller[2] };
      log('✅', `Installer certificate found: ${installerCert.name}`);
    } else {
      log('❌', 'Installer certificate still not found after import.');
      log('💡', 'Make sure you downloaded the .cer file and double-clicked it to import.');
      const retry = await prompt('Retry? (y/n): ');
      if (retry.toLowerCase() === 'y') {
        return validateCertificates();
      }
      process.exit(1);
    }
  }
  
  return { appCert, installerCert };
}

async function generateCSR(type) {
  const csrDir = path.join(CONFIG.PROJECT_ROOT, 'certs');
  if (!fs.existsSync(csrDir)) {
    fs.mkdirSync(csrDir, { recursive: true });
  }
  
  const keyPath = path.join(csrDir, `${type}_key.key`);
  const csrPath = path.join(csrDir, `${type}_cert.certSigningRequest`);
  
  // Generate private key and CSR
  runCmd(`openssl req -new -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${csrPath}" -subj "/emailAddress=pierre-henry@soria.tel/CN=${type === 'installer' ? 'Mac Installer Distribution' : 'Apple Distribution'}/C=US"`, { silent: true, stdio: 'pipe' });
  
  log('✅', `CSR generated at: ${csrPath}`);
  log('🔑', `Private key saved at: ${keyPath}`);
  
  return csrPath;
}

// ============================================================
// STEP 3: Clean & Prepare Build
// ============================================================
function prepareBuild() {
  logStep(3, 'Preparing Build Environment');
  
  // Clean previous builds
  if (fs.existsSync(CONFIG.DIST_DIR)) {
    log('🧹', 'Cleaning previous builds...');
    fs.rmSync(CONFIG.DIST_DIR, { recursive: true, force: true });
  }
  
  // Rebuild native modules for Electron
  log('🔧', 'Rebuilding native modules for Electron...');
  try {
    runCmd('npx @electron/rebuild -f -w sharp 2>&1 || true');
  } catch (e) {
    log('⚠️', 'Sharp rebuild had warnings (may be fine for MAS build)');
  }
  
  log('✅', 'Build environment prepared');
}

// ============================================================
// STEP 4: Build MAS App
// ============================================================
function buildMASApp(certs) {
  logStep(4, 'Building Mac App Store Package');
  
  // Set environment variables
  const env = {
    ...process.env,
    APPLE_TEAM_ID: CONFIG.TEAM_ID,
    CSC_NAME: certs.appCert.hash,
    CSC_IDENTITY_AUTO_DISCOVERY: 'true',
    SKIP_NOTARIZATION: 'true',
    ELECTRON_TEAM_ID: CONFIG.TEAM_ID,
    DEBUG: 'electron-builder',
  };
  
  // Write electron-builder config for MAS
  const builderConfig = {
    appId: CONFIG.APP_BUNDLE_ID,
    productName: CONFIG.PRODUCT_NAME,
    forceCodeSigning: true,
    mac: {
      category: 'public.app-category.graphics-design',
      icon: 'build/mac/icon.icns',
      hardenedRuntime: false,
      gatekeeperAssess: false,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.inherit.plist',
      target: ['mas'],
      type: 'distribution',
      identity: certs.appCert.name,
      extendInfo: {
        ElectronTeamID: CONFIG.TEAM_ID,
      },
    },
    mas: {
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.inherit.plist',
      hardenedRuntime: false,
      provisioningProfile: 'build/embedded.provisionprofile',
      type: 'distribution',
      category: 'public.app-category.graphics-design',
      identity: certs.appCert.name,
      binaries: [],
    },
    afterSign: undefined,
  };
  
  const configPath = path.join(CONFIG.PROJECT_ROOT, 'mas-build-config.json');
  fs.writeFileSync(configPath, JSON.stringify(builderConfig, null, 2));
  log('📝', 'Created build configuration');
  
  log('📦', 'Building app with electron-builder...');
  log('⏳', 'This may take a few minutes...');
  
  try {
    execSync(
      `npx electron-builder --mac mas --publish never --config mas-build-config.json`,
      {
        cwd: CONFIG.PROJECT_ROOT,
        stdio: 'inherit',
        env: {
          ...env,
          ELECTRON_TEAM_ID: CONFIG.TEAM_ID,
        },
        timeout: 600000, // 10 minute timeout
      }
    );
  } catch (error) {
    log('❌', 'electron-builder failed. Attempting manual build approach...');
    return manualBuild(certs, env);
  }
  
  // Clean up config
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
  
  log('✅', 'MAS app built successfully');
  return findBuiltPackage();
}

function manualBuild(certs, env) {
  log('🔧', 'Trying manual packaging approach...');
  
  // Use @electron/packager + @electron/osx-sign + productbuild
  const appDir = path.join(CONFIG.DIST_DIR, 'mas');
  fs.mkdirSync(appDir, { recursive: true });
  
  // Package with electron-packager
  log('📦', 'Packaging with @electron/packager...');
  execSync(
    `npx @electron/packager . "${CONFIG.PRODUCT_NAME}" ` +
    `--platform=mas --arch=${process.arch === 'arm64' ? 'arm64' : 'x64'} ` +
    `--app-bundle-id="${CONFIG.APP_BUNDLE_ID}" ` +
    `--build-version="${CONFIG.VERSION}" ` +
    `--app-version="${CONFIG.VERSION}" ` +
    `--icon="build/mac/icon.icns" ` +
    `--out="${appDir}" ` +
    `--overwrite ` +
    `--extend-info="build/Info.plist" ` +
    `--prune=true ` +
    `--ignore="dist" ` +
    `--ignore="certs" ` +
    `--ignore="build" ` +
    `--ignore="mas-build-config.json"`,
    {
      cwd: CONFIG.PROJECT_ROOT,
      stdio: 'inherit',
      env,
      timeout: 300000,
    }
  );
  
  // Find the .app
  const archDirs = fs.readdirSync(appDir);
  let appPath = null;
  for (const dir of archDirs) {
    const fullDir = path.join(appDir, dir);
    if (fs.statSync(fullDir).isDirectory()) {
      const files = fs.readdirSync(fullDir);
      for (const f of files) {
        if (f.endsWith('.app')) {
          appPath = path.join(fullDir, f);
          break;
        }
      }
    }
    if (appPath) break;
  }
  
  if (!appPath) {
    log('❌', 'Could not find packaged .app');
    process.exit(1);
  }
  
  // Copy provisioning profile into the app
  log('📋', 'Embedding provisioning profile...');
  fs.copyFileSync(
    CONFIG.PROVISIONING_PROFILE,
    path.join(appPath, 'Contents', 'embedded.provisionprofile')
  );
  
  // Remove nested build/ directory that contains Info.plist (causes Bad CFBundleExecutable error)
  const nestedBuildDir = path.join(appPath, 'Contents', 'Resources', 'app', 'build');
  if (fs.existsSync(nestedBuildDir)) {
    log('🧹', 'Removing nested build/ directory from app bundle (prevents CFBundleExecutable error)...');
    fs.rmSync(nestedBuildDir, { recursive: true, force: true });
  }
  
  // Fix file permissions so all files are readable by non-root users
  log('🔧', 'Fixing file permissions (ensuring non-root readability)...');
  execSync(`chmod -R a+r "${appPath}"`, { cwd: CONFIG.PROJECT_ROOT, stdio: 'pipe' });
  execSync(`find "${appPath}" -type d -exec chmod a+rx {} \\;`, { cwd: CONFIG.PROJECT_ROOT, stdio: 'pipe' });
  
  // Sign the app with @electron/osx-sign (using programmatic API)
  // Sign the app with @electron/osx-sign (correct CLI binary name)
  log('✍️', 'Signing app...');
  execSync(
    `npx electron-osx-sign "${appPath}" ` +
    `--identity="${certs.appCert.name}" ` +
    `--type=distribution ` +
    `--platform=mas ` +
    `--entitlements="${CONFIG.ENTITLEMENTS}" ` +
    `--entitlements-inherit="${CONFIG.ENTITLEMENTS_INHERIT}" ` +
    `--provisioning-profile="${CONFIG.PROVISIONING_PROFILE}"`,
    {
      cwd: CONFIG.PROJECT_ROOT,
      stdio: 'inherit',
      env,
      timeout: 300000,
    }
  );
  
  // Create .pkg with productbuild
  const pkgPath = path.join(CONFIG.DIST_DIR, 'mas', `${CONFIG.PRODUCT_NAME}-${CONFIG.VERSION}.pkg`);
  log('📦', 'Creating installer package (.pkg)...');
  
  const installerIdentity = certs.installerCert.name;
  execSync(
    `productbuild --component "${appPath}" /Applications ` +
    `--sign "${installerIdentity}" ` +
    `"${pkgPath}"`,
    {
      cwd: CONFIG.PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 120000,
    }
  );
  
  log('✅', `Package created at: ${pkgPath}`);
  return pkgPath;
}

function findBuiltPackage() {
  const masDir = path.join(CONFIG.DIST_DIR, 'mas');
  if (!fs.existsSync(masDir)) {
    // Also check dist/ root
    const distFiles = fs.readdirSync(CONFIG.DIST_DIR);
    for (const f of distFiles) {
      if (f.endsWith('.pkg')) {
        return path.join(CONFIG.DIST_DIR, f);
      }
    }
    log('❌', 'dist/mas directory not found');
    process.exit(1);
  }
  
  const files = fs.readdirSync(masDir);
  for (const f of files) {
    if (f.endsWith('.pkg')) {
      const pkgPath = path.join(masDir, f);
      log('📦', `Found package: ${pkgPath}`);
      return pkgPath;
    }
  }
  
  // Check for .app (electron-builder might not create .pkg with mas target without installer cert)
  for (const f of files) {
    if (f.endsWith('.app') || fs.statSync(path.join(masDir, f)).isDirectory()) {
      const dirPath = path.join(masDir, f);
      if (f.endsWith('.app')) {
        log('⚠️', 'Found .app but no .pkg. Will create .pkg manually.');
        return null; // Signal that we need to create pkg manually
      }
    }
  }
  
  log('❌', 'No .pkg file found in dist/mas/');
  console.log('Contents of dist/mas:', files);
  return null;
}

// ============================================================
// STEP 5: Create .pkg if needed (manual signing)
// ============================================================
function createSignedPkg(certs) {
  logStep(5, 'Creating Signed Installer Package');
  
  const masDir = path.join(CONFIG.DIST_DIR, 'mas');
  const universalDir = path.join(CONFIG.DIST_DIR, 'mas-universal');
  
  let appPath = null;
  
  // Look in multiple possible locations
  const searchDirs = [masDir, universalDir, CONFIG.DIST_DIR];
  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue;
    const items = fs.readdirSync(searchDir);
    for (const item of items) {
      if (item.endsWith('.app')) {
        appPath = path.join(searchDir, item);
        break;
      }
    }
    if (appPath) break;
    
    // Also check subdirectories
    for (const item of items) {
      const subPath = path.join(searchDir, item);
      if (fs.statSync(subPath).isDirectory() && !item.endsWith('.app')) {
        const subItems = fs.readdirSync(subPath);
        for (const subItem of subItems) {
          if (subItem.endsWith('.app')) {
            appPath = path.join(subPath, subItem);
            break;
          }
        }
      }
      if (appPath) break;
    }
    if (appPath) break;
  }
  
  if (!appPath) {
    log('❌', 'No .app found to create .pkg from');
    process.exit(1);
  }
  
  log('📱', `Found app: ${appPath}`);
  
  const pkgPath = path.join(masDir, `${CONFIG.PRODUCT_NAME}-${CONFIG.VERSION}.pkg`);
  
  // Ensure provisioning profile is embedded
  const embeddedProfile = path.join(appPath, 'Contents', 'embedded.provisionprofile');
  if (!fs.existsSync(embeddedProfile)) {
    log('📋', 'Embedding provisioning profile...');
    fs.copyFileSync(CONFIG.PROVISIONING_PROFILE, embeddedProfile);
  }
  
  // Create .pkg with productbuild
  log('📦', 'Creating signed .pkg with productbuild...');
  const installerIdentity = certs.installerCert.name;
  
  execSync(
    `productbuild --component "${appPath}" /Applications ` +
    `--sign "${installerIdentity}" ` +
    `"${pkgPath}"`,
    {
      cwd: CONFIG.PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 120000,
    }
  );
  
  log('✅', `Signed package created: ${pkgPath}`);
  return pkgPath;
}

// ============================================================
// STEP 6: Validate Package
// ============================================================
function validatePackage(pkgPath) {
  logStep(6, 'Validating Package for App Store');
  
  log('🔍', 'Validating with App Store Connect...');
  
  try {
    execSync(
      `xcrun altool --validate-app ` +
      `-f "${pkgPath}" ` +
      `-t macos ` +
      `--apiKey "${CONFIG.API_KEY_ID}" ` +
      `--apiIssuer "${CONFIG.API_ISSUER_ID}"`,
      {
        cwd: CONFIG.PROJECT_ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          // API key needs to be in a specific location or referenced via path
          API_PRIVATE_KEYS_DIR: path.dirname(CONFIG.API_KEY_PATH),
        },
        timeout: 300000,
      }
    );
    log('✅', 'Package validation passed!');
    return true;
  } catch (error) {
    log('⚠️', 'altool validation failed, trying with newer API...');
    
    // Try with xcrun notarytool (though this is for notarization, not validation)
    // For App Store, altool is still the standard tool
    try {
      // Try with the private key path directly specified
      setupAPIKeyForAltool();
      execSync(
        `xcrun altool --validate-app ` +
        `-f "${pkgPath}" ` +
        `-t macos ` +
        `--apiKey "${CONFIG.API_KEY_ID}" ` +
        `--apiIssuer "${CONFIG.API_ISSUER_ID}"`,
        {
          cwd: CONFIG.PROJECT_ROOT,
          stdio: 'inherit',
          timeout: 300000,
        }
      );
      log('✅', 'Package validation passed!');
      return true;
    } catch (err2) {
      log('⚠️', 'Validation failed (this may be OK if app is already registered)');
      log('📝', 'Error: ' + (err2.message || '').substring(0, 200));
      return false;
    }
  }
}

// ============================================================
// STEP 7: Upload to App Store Connect
// ============================================================
function uploadToAppStore(pkgPath) {
  logStep(7, 'Uploading to App Store Connect');
  
  // Ensure API key is in the right place for altool/Transporter
  setupAPIKeyForAltool();
  
  log('📤', 'Uploading package to App Store Connect...');
  log('⏳', 'This may take several minutes depending on upload speed...');
  
  try {
    // Primary method: xcrun altool with API Key
    execSync(
      `xcrun altool --upload-app ` +
      `-f "${pkgPath}" ` +
      `-t macos ` +
      `--apiKey "${CONFIG.API_KEY_ID}" ` +
      `--apiIssuer "${CONFIG.API_ISSUER_ID}"`,
      {
        cwd: CONFIG.PROJECT_ROOT,
        stdio: 'inherit',
        timeout: 1800000, // 30 minute timeout for upload
      }
    );
    log('✅', 'Upload successful!');
    return true;
  } catch (error) {
    log('⚠️', 'altool upload failed. Trying Transporter...');
    
    try {
      // Fallback: Use Transporter (iTMSTransporter)
      execSync(
        `xcrun iTMSTransporter -m upload ` +
        `-assetFile "${pkgPath}" ` +
        `-apiKey "${CONFIG.API_KEY_ID}" ` +
        `-apiIssuer "${CONFIG.API_ISSUER_ID}"`,
        {
          cwd: CONFIG.PROJECT_ROOT,
          stdio: 'inherit',
          timeout: 1800000,
        }
      );
      log('✅', 'Upload via Transporter successful!');
      return true;
    } catch (err2) {
      log('❌', 'Upload failed with both methods.');
      log('📝', 'You can manually upload using Transporter app:');
      log('📝', `  open -a Transporter "${pkgPath}"`);
      log('📝', 'Or via command line:');
      log('📝', `  xcrun altool --upload-app -f "${pkgPath}" -t macos --apiKey ${CONFIG.API_KEY_ID} --apiIssuer ${CONFIG.API_ISSUER_ID}`);
      return false;
    }
  }
}

// ============================================================
// Helper: Setup API Key for altool/Transporter
// ============================================================
function setupAPIKeyForAltool() {
  // altool expects API keys in ~/private_keys/ or the AuthKey file accessible
  const privateKeysDir = path.join(process.env.HOME, 'private_keys');
  const expectedKeyPath = path.join(privateKeysDir, `AuthKey_${CONFIG.API_KEY_ID}.p8`);
  
  if (!fs.existsSync(expectedKeyPath)) {
    log('🔑', 'Setting up API key for altool/Transporter...');
    fs.mkdirSync(privateKeysDir, { recursive: true });
    fs.copyFileSync(CONFIG.API_KEY_PATH, expectedKeyPath);
    log('✅', `API key copied to ${expectedKeyPath}`);
  }
  
  // Also set environment variable
  process.env.API_PRIVATE_KEYS_DIR = privateKeysDir;
}

// ============================================================
// MAIN PIPELINE
// ============================================================
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('   MAC APP STORE BUILD & PUBLISH PIPELINE');
  console.log('   ' + CONFIG.PRODUCT_NAME + ' v' + CONFIG.VERSION);
  console.log('═'.repeat(60));
  
  try {
    // Step 1: Validate prerequisites
    await validatePrerequisites();
    
    // Step 2: Validate/create certificates
    const certs = await validateCertificates();
    
    // Step 3: Prepare build
    prepareBuild();
    
    // Step 4: Build MAS app
    let pkgPath = buildMASApp(certs);
    
    // Step 5: Create .pkg if electron-builder didn't
    if (!pkgPath) {
      pkgPath = createSignedPkg(certs);
    }
    
    if (!pkgPath || !fs.existsSync(pkgPath)) {
      log('❌', 'Failed to create .pkg package');
      process.exit(1);
    }
    
    log('📦', `Package size: ${(fs.statSync(pkgPath).size / 1024 / 1024).toFixed(2)} MB`);
    
    // Step 6: Validate
    const isValid = validatePackage(pkgPath);
    
    // Step 7: Upload
    if (isValid) {
      const uploaded = uploadToAppStore(pkgPath);
      
      if (uploaded) {
        console.log('\n' + '═'.repeat(60));
        log('🎉', 'SUCCESS! App uploaded to App Store Connect!');
        console.log('═'.repeat(60));
        log('📝', 'Next steps:');
        log('1️⃣', 'Go to https://appstoreconnect.apple.com');
        log('2️⃣', 'Select your app and go to the build section');
        log('3️⃣', 'Wait for the build to finish processing (can take 15-30 min)');
        log('4️⃣', 'Add the build to a new version'); 
        log('5️⃣', 'Fill in App Store listing details (screenshots, description, etc.)');
        log('6️⃣', 'Submit for review');
      }
    } else {
      // Try uploading anyway - validation can be strict
      const shouldUpload = await prompt('Validation had issues. Upload anyway? (y/n): ');
      if (shouldUpload.toLowerCase() === 'y') {
        uploadToAppStore(pkgPath);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
