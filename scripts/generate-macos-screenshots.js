#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(__dirname, 'macos-screenshot-template.html');
const SOURCE_IMAGE = path.join(ROOT, 'store-assets', 'creator-scenes.png');
const OUT_DIR = path.join(ROOT, 'fastlane', 'screenshots', 'mac', 'en-US');
const WIDTH = 2880;
const HEIGHT = 1800;

const SCREENS = [
  {
    scenario: 'TRAVEL VLOGS',
    layout: 'hero-side',
    frames: '0,1,2,8',
    mode: 'text',
    overlay: 'COASTAL ESCAPE',
    headline: 'Make every journey impossible to miss',
    sub: 'Bring destination, detail and personality into one polished travel thumbnail.'
  },
  {
    scenario: 'COOKING TUTORIALS',
    layout: '1x3',
    frames: '3,4,5',
    mode: 'text',
    overlay: 'DINNER IN 20',
    headline: 'Turn recipes into must-watch moments',
    sub: 'Show the creator, the process and the finished dish in one appetizing cover.'
  },
  {
    scenario: 'EVERY CREATOR',
    layout: '2x3',
    frames: '0,3,6,7,8,4',
    mode: 'standard',
    headline: 'One tool for every kind of video',
    sub: 'Travel, food, gaming, podcasts and reviews — combine up to six photos with ease.'
  },
  {
    scenario: 'GAMING CHANNELS',
    layout: '1x1',
    frames: '6',
    mode: 'text',
    overlay: 'BIG WIN',
    headline: 'Put your message center stage',
    sub: 'Add bold text and vibrant enhancement for a thumbnail that stands out instantly.'
  },
  {
    scenario: 'PODCASTS & REVIEWS',
    layout: '1x2',
    frames: '7,8',
    mode: 'export',
    headline: 'Export sharp 1280 × 720 artwork',
    sub: 'Create locally, keep every photo private and save a polished PNG in seconds.'
  }
];

function screenshotUrl(screen) {
  const query = new URLSearchParams(Object.fromEntries(Object.entries(screen).map(([key, value]) => [key, String(value)])));
  return `file://${TEMPLATE}?${query.toString()}`;
}

async function makeOpaque(file) {
  const temporaryFile = `${file}.opaque.png`;
  await sharp(file).flatten({ background: '#eef1f4' }).png({ compressionLevel: 9, palette: false }).toFile(temporaryFile);
  fs.renameSync(temporaryFile, file);
}

async function validate(file) {
  const metadata = await sharp(file).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT || metadata.hasAlpha) {
    throw new Error(`Invalid Mac screenshot output: ${file}`);
  }
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let blackPixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] <= 2 && data[offset + 1] <= 2 && data[offset + 2] <= 2) blackPixels += 1;
  }
  if (blackPixels / (info.width * info.height) > 0.02) {
    throw new Error(`Mac screenshot appears corrupted: ${file}`);
  }
}

async function main() {
  if (!fs.existsSync(SOURCE_IMAGE)) throw new Error(`Missing screenshot source imagery: ${SOURCE_IMAGE}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.toLowerCase().endsWith('.png')) fs.unlinkSync(path.join(OUT_DIR, file));
  }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb'] });
  try {
    for (let index = 0; index < SCREENS.length; index += 1) {
      const page = await browser.newPage();
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
      await page.goto(screenshotUrl(SCREENS[index]), { waitUntil: 'networkidle0' });
      try {
        await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
      } catch (error) {
        const pageError = await page.evaluate(() => document.body.dataset.error || 'unknown page error');
        throw new Error(`Screenshot template did not finish: ${pageError}`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      const file = path.join(OUT_DIR, `${String(index + 1).padStart(2, '0')}_mac_2880x1800.png`);
      await page.screenshot({ path: file, type: 'png', omitBackground: false });
      await page.close();
      await makeOpaque(file);
      await validate(file);
      console.log(`  ✓ ${path.relative(ROOT, file)}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\nMac screenshots written to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
