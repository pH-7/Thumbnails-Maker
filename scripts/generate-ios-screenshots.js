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

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(__dirname, 'screenshot-template.html');
const OUT_DIR = path.join(ROOT, 'fastlane', 'screenshots', 'ios', 'en-US');

// Apple device classes. Resolutions must match App Store Connect's accepted
// screenshot sizes exactly or the upload is rejected.
const DEVICES = [
  {
    family: 'iphone',
    kind: 'phone',
    name: '6.7',
    ascType: 'iphone67',
    width: 1284,
    height: 2778
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
    name: '12.9',
    ascType: 'ipadPro129',
    width: 2048,
    height: 2732
  },
  {
    family: 'ipad',
    kind: 'tablet',
    name: '11',
    ascType: 'ipadPro11',
    width: 1668,
    height: 2388
  }
];

// One entry per screenshot in the listing (shared across device sizes).
const SCREENS = [
  { layout: '2x2', count: 4, enhance: true, headline: 'Join your photos', sub: 'Multiple shots, one perfect thumbnail' },
  { layout: '1x2', count: 2, enhance: false, headline: 'Side by side', sub: 'Before & after in a single tap' },
  { layout: '3x3', count: 9, enhance: true, headline: 'Up to 9 photos', sub: 'Smart grids for every video' },
  { layout: '1x1', count: 1, enhance: true, headline: 'Auto enhance', sub: 'Brighter, punchier, scroll-stopping' },
  { layout: 'auto', count: 3, enhance: false, headline: 'Save to Photos', sub: 'Export at 1280×720, ready for YouTube' }
];

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
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Remove stale screenshots so deliver only sees this run's intended files.
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.toLowerCase().endsWith('.png')) {
      fs.unlinkSync(path.join(OUT_DIR, file));
    }
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb']
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
        await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });

        const index = String(i + 1).padStart(2, '0');
        const file = path.join(OUT_DIR, `${index}_${device.ascType}_${screen.layout}.png`);
        await page.screenshot({ path: file, type: 'png' });
        await page.close();
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
