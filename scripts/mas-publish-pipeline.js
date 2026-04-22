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
const os = require('os');
const readline = require('readline');
const { signAsync } = require('@electron/osx-sign');

// Load environment variables from .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const PACKAGE_VERSION = require(path.join(__dirname, '..', 'package.json')).version;

function generateAutoBuildNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  // Apple accepts dot-separated integers for CFBundleVersion.
  // We use a monotonic timestamp segment to avoid duplicate uploads.
  return `${year}.${month}.${day}${hour}${minute}${second}`;
}

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  TEAM_ID: process.env.APPLE_TEAM_ID || '',
  APP_BUNDLE_ID: 'ph7.me.youtube-thumbnail-combiner',
  PRODUCT_NAME: 'YouTube Thumbnail Creator',
  VERSION: PACKAGE_VERSION,
  BUILD_VERSION: process.env.APP_BUILD_NUMBER || generateAutoBuildNumber(),

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
  ENTITLEMENTS_LOGINHELPER: path.join(__dirname, '..', 'build', 'entitlements.loginhelper.plist'),
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

function runCommandCapture(cmd, options = {}) {
  try {
    const output = execSync(cmd, {
      cwd: CONFIG.PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      ...options
    }) || '';
    return { success: true, output: String(output) };
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`.trim();
    return { success: false, output: String(output), error };
  }
}

function hasAltoolErrors(output) {
  return /\bERROR:\b|Failed to (validate|upload)|ENTITY_ERROR|status\s*:\s*409/i.test(output || '');
}

function isDuplicateBundleVersionError(output) {
  return /bundle version must be higher|ATTRIBUTE\.INVALID\.DUPLICATE|previousBundleVersion/i.test(output || '');
}

function suggestNextBuildNumber(currentBuildVersion) {
  const parts = String(currentBuildVersion || '').split('.');
  const numericParts = parts.map((part) => Number.parseInt(part, 10));

  if (numericParts.some((part) => Number.isNaN(part))) {
    return '1';
  }

  numericParts[numericParts.length - 1] += 1;
  return numericParts.join('.');
}

function extractSignedEntitlements(target) {
  const safeName = path.basename(target).replace(/[^a-zA-Z0-9._-]/g, '_');
  const entitlementsPath = path.join(
    os.tmpdir(),
    `ytc-entitlements-${safeName}-${Date.now()}-${Math.random().toString(16).slice(2)}.plist`
  );

  const result = runCommandCapture(`codesign -d --entitlements "${entitlementsPath}" "${target}"`);
  if (!result.success) {
    throw new Error(`Failed to read entitlements for ${target}\n${result.output || ''}`.trim());
  }

  let contents = '';
  if (fs.existsSync(entitlementsPath)) {
    contents = fs.readFileSync(entitlementsPath, 'utf8');
    fs.rmSync(entitlementsPath, { force: true });
  }

  return contents;
}

function assertEntitlementKeys(target, requiredKeys) {
  const entitlements = extractSignedEntitlements(target);
  const missing = requiredKeys.filter((key) => !entitlements.includes(key));
  if (missing.length > 0) {
    throw new Error(
      [
        `Signed target is missing required entitlements: ${target}`,
        `Missing keys: ${missing.join(', ')}`,
        'This build is likely to crash on launch in TestFlight/MAS.'
      ].join('\n')
    );
  }
}

function validateSignedEntitlements(appPath) {
  assertEntitlementKeys(appPath, [
    'com.apple.security.app-sandbox',
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory'
  ]);

  const helperTargets = [
    path.join(appPath, 'Contents', 'Frameworks', `${CONFIG.PRODUCT_NAME} Helper.app`),
    path.join(appPath, 'Contents', 'Frameworks', `${CONFIG.PRODUCT_NAME} Helper (Renderer).app`),
    path.join(appPath, 'Contents', 'Frameworks', `${CONFIG.PRODUCT_NAME} Helper (GPU).app`),
    path.join(appPath, 'Contents', 'Frameworks', `${CONFIG.PRODUCT_NAME} Helper (Plugin).app`)
  ].filter((p) => fs.existsSync(p));

  for (const helperPath of helperTargets) {
    assertEntitlementKeys(helperPath, [
      'com.apple.security.app-sandbox',
      'com.apple.security.inherit',
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.allow-unsigned-executable-memory'
    ]);
  }
}

function verifySignedBundle(appPath) {
  const verify = runCommandCapture(`codesign --verify --deep --strict --verbose=2 "${appPath}"`);
  if (!verify.success || /invalid signature|code or signature have been modified|not signed/i.test(verify.output || '')) {
    throw new Error(`codesign verification failed for ${appPath}\n${verify.output || ''}`.trim());
  }
}

function validateBuildNumberConfiguration() {
  if (!/^\d+(\.\d+){0,2}$/.test(CONFIG.BUILD_VERSION)) {
    log('❌', `Invalid APP_BUILD_NUMBER format: "${CONFIG.BUILD_VERSION}"`);
    log('📝', 'Use numeric dot-separated format, e.g. 326 or 3.2.6');
    process.exit(1);
  }

  if (!process.env.APP_BUILD_NUMBER) {
    log('⚠️', `APP_BUILD_NUMBER not provided. Auto-generated build number: ${CONFIG.BUILD_VERSION}`);
    log('📝', 'For deterministic release numbering, pass APP_BUILD_NUMBER explicitly.');
  }
}

function ensureSharpAddonPresent(appPath) {
  const candidatePaths = [
    path.join(appPath, 'Contents', 'Resources', 'app', 'node_modules', 'sharp', 'build', 'Release', 'sharp-darwin-arm64v8.node'),
    path.join(appPath, 'Contents', 'Resources', 'app', 'node_modules', 'sharp', 'build', 'Release', 'sharp-darwin-x64.node'),
    path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'sharp', 'build', 'Release', 'sharp-darwin-arm64v8.node'),
    path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'sharp', 'build', 'Release', 'sharp-darwin-x64.node'),
  ];

  if (candidatePaths.some((candidatePath) => fs.existsSync(candidatePath))) {
    return;
  }

  throw new Error(
    [
      'Sharp native addon is missing from the packaged app bundle.',
      'Expected one of:',
      ...candidatePaths.map((candidatePath) => `- ${candidatePath}`),
      'This usually means packaging ignore patterns removed node_modules/sharp/build.'
    ].join('\n')
  );
}

function collectSharpBinariesForSigning(appPath) {
  const results = [];
  const root = path.join(appPath, 'Contents', 'Resources');
  const stack = [root];
  const seen = new Set();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current) || !fs.existsSync(current)) {
      continue;
    }
    seen.add(current);

    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }

    const normalized = current.replace(/\\/g, '/');
    const isSharpNode = /\/node_modules\/sharp\/build\/Release\/sharp-.*\.node$/.test(normalized);
    const isSharpDylib = /\/node_modules\/sharp\/vendor\/.*\/lib\/.*\.dylib$/.test(normalized);
    if (isSharpNode || isSharpDylib) {
      results.push(current);
    }
  }

  return results;
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

function ensurePlistEntitlements(plistPath, requiredKeys) {
  const contents = fs.readFileSync(plistPath, 'utf8');
  let updated = contents;
  let changed = false;

  for (const key of requiredKeys) {
    if (!updated.includes(`<key>${key}</key>`)) {
      updated = updated.replace(
        '</dict>',
        `  <key>${key}</key>\n  <true/>\n</dict>`
      );
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(plistPath, updated, 'utf8');
  }

  return changed;
}

function removePlistEntitlements(plistPath, keysToRemove) {
  let contents = fs.readFileSync(plistPath, 'utf8');
  let changed = false;

  for (const key of keysToRemove) {
    const pattern = new RegExp(`\\s*<key>${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</key>\\s*<true\\/>\\s*`, 'g');
    const next = contents.replace(pattern, '\n');
    if (next !== contents) {
      contents = next;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(plistPath, contents, 'utf8');
  }

  return changed;
}

function ensureApplicationGroupEntitlement(plistPath) {
  const contents = fs.readFileSync(plistPath, 'utf8');
  if (contents.includes('<key>com.apple.security.application-groups</key>')) {
    return false;
  }

  const identifierMatch = contents.match(
    /<key>com\.apple\.application-identifier<\/key>\s*<string>([^<]+)<\/string>/
  );

  if (!identifierMatch || !identifierMatch[1]) {
    return false;
  }

  const appIdentifier = identifierMatch[1].trim();
  const updated = contents.replace(
    '</dict>',
    `  <key>com.apple.security.application-groups</key>\n  <array>\n    <string>${appIdentifier}</string>\n  </array>\n</dict>`
  );

  if (updated !== contents) {
    fs.writeFileSync(plistPath, updated, 'utf8');
    return true;
  }

  return false;
}

function ensureMasRuntimeEntitlements() {
  const appEntitlementsChanged = ensurePlistEntitlements(CONFIG.ENTITLEMENTS, [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory'
  ]);

  const inheritEntitlementsChanged = ensurePlistEntitlements(CONFIG.ENTITLEMENTS_INHERIT, [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory'
  ]);

  const removedAppKey = removePlistEntitlements(CONFIG.ENTITLEMENTS, [
    'com.apple.security.cs.disable-library-validation'
  ]);
  const removedInheritKey = removePlistEntitlements(CONFIG.ENTITLEMENTS_INHERIT, [
    'com.apple.security.cs.disable-library-validation'
  ]);

  const appGroupsAdded = ensureApplicationGroupEntitlement(CONFIG.ENTITLEMENTS);

  if (appEntitlementsChanged || inheritEntitlementsChanged || removedAppKey || removedInheritKey || appGroupsAdded) {
    log('🛡️', 'Updated MAS runtime entitlements (JIT + unsigned executable memory + app groups; removed library-validation bypass).');
  } else {
    log('✅', 'MAS runtime entitlements already match expected configuration.');
  }
}

// ============================================================
// STEP 1: Validate Prerequisites
// ============================================================
async function validatePrerequisites() {
  logStep(1, 'Validating Prerequisites');
  validateBuildNumberConfiguration();

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
  if (!fs.existsSync(CONFIG.ENTITLEMENTS_INHERIT)) {
    log('❌', `Inherited entitlements file not found at: ${CONFIG.ENTITLEMENTS_INHERIT}`);
    process.exit(1);
  }
  if (!fs.existsSync(CONFIG.ENTITLEMENTS_LOGINHELPER)) {
    log('❌', `Login helper entitlements file not found at: ${CONFIG.ENTITLEMENTS_LOGINHELPER}`);
    process.exit(1);
  }
  log('✅', 'Entitlements files found');
  ensureMasRuntimeEntitlements();

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
    } catch (e) { }

    // Open the CSR file location
    try {
      runCmd(`open -R "${csrPath}"`, { silent: true, stdio: 'pipe' });
    } catch (e) { }

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
  const email = process.env.APPLE_EMAIL || 'developer@example.com';
  runCmd(`openssl req -new -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${csrPath}" -subj "/emailAddress=${email}/CN=${type === 'installer' ? 'Mac Installer Distribution' : 'Apple Distribution'}/C=US"`, { silent: true, stdio: 'pipe' });

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
async function buildMASApp(certs) {
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
    buildVersion: CONFIG.BUILD_VERSION,
    forceCodeSigning: true,
    mac: {
      category: 'public.app-category.graphics-design',
      icon: 'build/mac/icon.icns',
      hardenedRuntime: false,
      timestamp: 'none',
      gatekeeperAssess: false,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.inherit.plist',
      entitlementsLoginHelper: 'build/entitlements.loginhelper.plist',
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
      entitlementsLoginHelper: 'build/entitlements.loginhelper.plist',
      hardenedRuntime: false,
      timestamp: 'none',
      provisioningProfile: 'build/embedded.provisionprofile',
      type: 'distribution',
      category: 'public.app-category.graphics-design',
      identity: certs.appCert.name,
      binaries: [
        'Contents/Resources/app.asar.unpacked/node_modules/sharp/build/Release/sharp-*.node',
        'Contents/Resources/app.asar.unpacked/node_modules/sharp/vendor/**/lib/*.dylib',
        'Contents/Resources/app/node_modules/sharp/build/Release/sharp-*.node',
        'Contents/Resources/app/node_modules/sharp/vendor/**/lib/*.dylib'
      ],
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
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    if (/timestamp service is not available/i.test(output)) {
      log('⚠️', 'codesign timestamp service unavailable; falling back to manual signing without network timestamp dependency.');
    } else {
      log('❌', 'electron-builder failed. Attempting manual build approach...');
    }
    return await manualBuild(certs, env);
  }

  // Clean up config
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  log('✅', 'MAS app built successfully');
  return findBuiltPackage();
}

async function manualBuild(certs, env) {
  log('🔧', 'Trying manual packaging approach...');
  const signingTimeoutMs = 1800000; // 30 minutes; signing large Electron bundles can take time

  // Use @electron/packager + @electron/osx-sign + productbuild
  const appDir = path.join(CONFIG.DIST_DIR, 'mas');
  fs.mkdirSync(appDir, { recursive: true });

  // Package with electron-packager
  log('📦', 'Packaging with @electron/packager...');
  execSync(
    `npx @electron/packager . "${CONFIG.PRODUCT_NAME}" ` +
    `--platform=mas --arch=${process.arch === 'arm64' ? 'arm64' : 'x64'} ` +
    `--app-bundle-id="${CONFIG.APP_BUNDLE_ID}" ` +
    `--build-version="${CONFIG.BUILD_VERSION}" ` +
    `--app-version="${CONFIG.VERSION}" ` +
    `--icon="build/mac/icon.icns" ` +
    `--out="${appDir}" ` +
    `--overwrite ` +
    `--extend-info="build/Info.plist" ` +
    `--prune=true ` +
    `--ignore="^/dist($|/)" ` +
    `--ignore="^/certs($|/)" ` +
    `--ignore="^/build($|/)" ` +
    `--ignore="\\.p8$" ` +
    `--ignore="\\.p12$" ` +
    `--ignore="\\.mobileprovision$" ` +
    `--ignore="\\.provisionprofile$" ` +
    `--ignore="^/\\.env(\\..*)?$" ` +
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

  ensureSharpAddonPresent(appPath);
  log('✅', 'Verified sharp native addon is present in packaged app.');
  const sharpBinaries = collectSharpBinariesForSigning(appPath);
  log('✅', `Discovered ${sharpBinaries.length} sharp native binary file(s) for signing.`);

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

  // Sign the app with @electron/osx-sign
  log('✍️', 'Signing app...');

  // Strip existing signatures first to avoid codesign "internal error"
  try {
    execSync(`find "${appPath}" -name "*.dylib" -o -name "*.so" -o -name "*.node" | while read f; do codesign --remove-signature "$f" 2>/dev/null || true; done`, { cwd: CONFIG.PROJECT_ROOT, stdio: 'pipe' });
    log('🧹', 'Stripped existing signatures from binaries');
  } catch (e) {
    // Ignore - some files may not have signatures
  }

  const signStart = Date.now();
  try {
    const signOptions = {
      app: appPath,
      binaries: sharpBinaries,
      identity: certs.appCert.name,
      type: 'distribution',
      platform: 'mas',
      provisioningProfile: CONFIG.PROVISIONING_PROFILE,
      preAutoEntitlements: false,
      optionsForFile: (filePath) => {
        const loginItemsSegment = `${path.sep}Contents${path.sep}Library${path.sep}LoginItems${path.sep}`;

        if (filePath === appPath) {
          return {
            entitlements: CONFIG.ENTITLEMENTS,
            hardenedRuntime: false,
            timestamp: 'none'
          };
        }

        if (filePath.includes(loginItemsSegment)) {
          return {
            entitlements: CONFIG.ENTITLEMENTS_LOGINHELPER,
            hardenedRuntime: false,
            timestamp: 'none'
          };
        }

        return {
          entitlements: CONFIG.ENTITLEMENTS_INHERIT,
          hardenedRuntime: false,
          timestamp: 'none'
        };
      }
    };

    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Signing timed out after ${Math.round(signingTimeoutMs / 60000)} minutes.`));
      }, signingTimeoutMs);
    });

    try {
      await Promise.race([signAsync(signOptions), timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }

    log('✅', `Application signed in ${Math.round((Date.now() - signStart) / 1000)}s`);
    verifySignedBundle(appPath);
    log('✅', 'codesign --verify passed for app bundle.');
    validateSignedEntitlements(appPath);
    log('✅', 'Entitlements validated for app and helper binaries.');
  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      log('❌', `Signing timed out after ${Math.round(signingTimeoutMs / 60000)} minutes.`);
      log('📝', 'If Keychain prompts are pending, allow access for codesign and rerun.');
    }
    throw error;
  }

  // Create .pkg with productbuild
  const pkgPath = path.join(CONFIG.DIST_DIR, 'mas', `${CONFIG.PRODUCT_NAME}-${CONFIG.BUILD_VERSION}.pkg`);
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

  const pkgPath = path.join(masDir, `${CONFIG.PRODUCT_NAME}-${CONFIG.BUILD_VERSION}.pkg`);

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
  const command =
    `xcrun altool --validate-app ` +
    `-f "${pkgPath}" ` +
    `-t macos ` +
    `--apiKey "${CONFIG.API_KEY_ID}" ` +
    `--apiIssuer "${CONFIG.API_ISSUER_ID}"`;

  const result = runCommandCapture(command, {
    env: {
      ...process.env,
      API_PRIVATE_KEYS_DIR: path.dirname(CONFIG.API_KEY_PATH),
    },
    timeout: 300000,
  });

  if (result.output) {
    process.stdout.write(result.output + '\n');
  } else {
    log('📝', 'altool returned no detailed validation output.');
  }

  if (result.success && !hasAltoolErrors(result.output)) {
    log('✅', 'Package validation passed!');
    return true;
  }

  if (isDuplicateBundleVersionError(result.output)) {
    log('❌', `Validation failed: build version "${CONFIG.BUILD_VERSION}" was already uploaded.`);
    log('📝', `Set a higher build number and rerun: APP_BUILD_NUMBER=${suggestNextBuildNumber(CONFIG.BUILD_VERSION)} npm run mas-publish`);
    return false;
  }

  log('❌', `Package validation failed for build version "${CONFIG.BUILD_VERSION}".`);
  return false;
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

  const altoolCommand =
    `xcrun altool --upload-app ` +
    `-f "${pkgPath}" ` +
    `-t macos ` +
    `--apiKey "${CONFIG.API_KEY_ID}" ` +
    `--apiIssuer "${CONFIG.API_ISSUER_ID}"`;

  const altoolResult = runCommandCapture(altoolCommand, {
    timeout: 1800000,
  });

  if (altoolResult.output) {
    process.stdout.write(altoolResult.output + '\n');
  }

  if (altoolResult.success && !hasAltoolErrors(altoolResult.output)) {
    log('✅', 'Upload successful!');
    return true;
  }

  if (isDuplicateBundleVersionError(altoolResult.output)) {
    log('❌', `Upload rejected: build version "${CONFIG.BUILD_VERSION}" already exists on App Store Connect.`);
    log('📝', 'Use a higher build number and retry.');
    return false;
  }

  log('⚠️', 'altool upload failed. Trying Transporter...');

  const transporterResult = runCommandCapture(
    `xcrun iTMSTransporter -m upload ` +
    `-assetFile "${pkgPath}" ` +
    `-apiKey "${CONFIG.API_KEY_ID}" ` +
    `-apiIssuer "${CONFIG.API_ISSUER_ID}"`,
    { timeout: 1800000 }
  );

  if (transporterResult.output) {
    process.stdout.write(transporterResult.output + '\n');
  }

  if (transporterResult.success && !hasAltoolErrors(transporterResult.output)) {
    log('✅', 'Upload via Transporter successful!');
    return true;
  }

  log('❌', 'Upload failed with both methods.');
  log('📝', 'You can manually upload using Transporter app:');
  log('📝', `  open -a Transporter "${pkgPath}"`);
  log('📝', 'Or via command line:');
  log('📝', `  xcrun altool --upload-app -f "${pkgPath}" -t macos --apiKey ${CONFIG.API_KEY_ID} --apiIssuer ${CONFIG.API_ISSUER_ID}`);
  return false;
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
  console.log('   Build Number: ' + CONFIG.BUILD_VERSION);
  console.log('═'.repeat(60));

  try {
    // Step 1: Validate prerequisites
    await validatePrerequisites();

    // Step 2: Validate/create certificates
    const certs = await validateCertificates();

    // Step 3: Prepare build
    prepareBuild();

    // Step 4: Build MAS app
    let pkgPath = await buildMASApp(certs);

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
      log('🛑', 'Upload skipped because validation failed.');
      log('📝', 'Fix the validation issue and rerun with a new APP_BUILD_NUMBER.');
    }

  } catch (error) {
    console.error('\n❌ Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateAutoBuildNumber,
  hasAltoolErrors,
  isDuplicateBundleVersionError,
  suggestNextBuildNumber,
};
