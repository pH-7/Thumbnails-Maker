#!/usr/bin/env node
/**
 * generate-ios-screenshots.js
 *
 * Renders polished, App-Store-ready screenshots from the real app output.
 *
 * It loads scripts/screenshot-template.html (which uses the same
 * thumbnail-engine.js as the iPhone app) at the exact pixel dimensions Apple
 * requires, then writes PNGs into fastlane/screenshots/ios/en-US/ where
 * `deliver` (Fastlane) picks them up automatically.
 *
 * Run with: npm run ios:screenshots
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(__dirname, 'screenshot-template.html');
const OUT_DIR = path.join(ROOT, 'fastlane', 'screenshots', 'ios', 'en-US');
const SOURCE_IMAGE = path.join(ROOT, 'store-assets', 'creator-scenes.png');

// Apple device classes. Resolutions must match App Store Connect's accepted
// screenshot sizes exactly or the upload is rejected.
const DEVICES = [
  {
    family: 'iphone',
    kind: 'phone',
    name: '6.9',
    ascType: 'iphone69',
    width: 1320,
    height: 2868
  },
  {
    family: 'iphone',
    kind: 'phone',
    name: '6.5',
    ascType: 'iphone65',
    width: 1242,
    height: 2688
  },
  {
    family: 'ipad',
    kind: 'tablet',
    name: '13',
    ascType: 'ipadPro13',
    width: 2064,
    height: 2752
  },
  {
    family: 'ipad',
    kind: 'tablet',
    name: '11',
    ascType: 'ipadPro11',
    width: 1668,
    height: 2420
  }
];

// One entry per screenshot in the listing (shared across device sizes).
const SCREENS = [
  { layout: '2x2', count: 4, enhance: true, headline: 'Join your photos', sub: 'Multiple shots, one polished thumbnail' },
  { layout: '1x2', count: 2, enhance: false, headline: 'Side by side', sub: 'Compare moments in a single frame' },
  { layout: '3x3', count: 9, enhance: true, headline: 'Up to 9 photos', sub: 'Smart grids for every video idea' },
  { layout: '1x1', count: 1, enhance: true, headline: 'Shoot. Create. Save.', sub: 'Turn a new photo into a thumbnail' },
  { layout: 'auto', count: 3, enhance: false, headline: 'Save to Photos', sub: 'Export at 1280 × 720, ready to share' }
];

async function validateScreenshot(file, device) {
  const metadata = await sharp(file).metadata();
  if (metadata.width !== device.width || metadata.height !== device.height) {
    throw new Error(`Invalid screenshot dimensions for ${file}: ${metadata.width}x${metadata.height}`);
  }
  if (metadata.hasAlpha) {
    throw new Error(`Screenshot must not contain an alpha channel: ${file}`);
  }

  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let pureBlackPixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] <= 2 && data[offset + 1] <= 2 && data[offset + 2] <= 2) {
      pureBlackPixels += 1;
    }
  }
  const pureBlackRatio = pureBlackPixels / (info.width * info.height);
  if (pureBlackRatio > 0.02) {
    throw new Error(`Screenshot appears corrupted (${(pureBlackRatio * 100).toFixed(2)}% pure black): ${file}`);
  }
}

async function removeAlphaChannel(file) {
  const temporaryFile = `${file}.opaque.png`;
  await sharp(file)
    .flatten({ background: '#111318' })
    .png({ compressionLevel: 9, palette: false })
    .toFile(temporaryFile);
  fs.renameSync(temporaryFile, file);
}

function buildUrl(screen) {
  const q = new URLSearchParams({
    layout: screen.layout,
    count: String(screen.count),
    enhance: screen.enhance ? '1' : '0',
    headline: screen.headline,
    sub: screen.sub,
    deviceKind: screen.deviceKind || 'phone'
  });
  return `file://${TEMPLATE}?${q.toString()}`;
}

async function loadPuppeteer() {
  try {
    return require('puppeteer');
  } catch (e) {
    console.error('\n✖ Puppeteer is not installed.');
    console.error('  Install it once with:  npm install\n');
    process.exit(1);
  }
}

async function main() {
  const puppeteer = await loadPuppeteer();
  if (!fs.existsSync(SOURCE_IMAGE)) {
    throw new Error(`Missing App Store screenshot source image: ${SOURCE_IMAGE}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Remove stale screenshots so deliver only sees this run's intended files.
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.toLowerCase().endsWith('.png')) {
      fs.unlinkSync(path.join(OUT_DIR, file));
    }
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--force-color-profile=srgb']
  });

  try {
    for (const device of DEVICES) {
      for (let i = 0; i < SCREENS.length; i++) {
        const screen = { ...SCREENS[i], deviceKind: device.kind };
        const page = await browser.newPage();
        await page.setViewport({
          width: device.width,
          height: device.height,
          deviceScaleFactor: 1
        });

        await page.goto(buildUrl(screen), { waitUntil: 'networkidle0' });
        try {
          await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
        } catch (error) {
          const pageError = await page.evaluate(() => document.body.dataset.error || 'unknown page error');
          throw new Error(`Screenshot template did not finish: ${pageError}`, { cause: error });
        }
        await new Promise((resolve) => setTimeout(resolve, 120));

        const index = String(i + 1).padStart(2, '0');
        const file = path.join(OUT_DIR, `${index}_${device.ascType}_${screen.layout}.png`);
        await page.screenshot({ path: file, type: 'png', omitBackground: false });
        await page.close();
        await removeAlphaChannel(file);
        await validateScreenshot(file, device);
        console.log(`  ✓ ${path.relative(ROOT, file)}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n📸 Done. Screenshots written to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
