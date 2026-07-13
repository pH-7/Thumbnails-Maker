#!/usr/bin/env node

/**
 * Generate the iOS app icon set from a single finalized SVG source.
 *
 * The App Store review rejection called out placeholder-looking icons. This
 * source avoids generic empty-image glyphs and keeps every iOS size visually
 * consistent from Settings through the 1024px marketing icon.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const iosAppIconDir = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const legacyIconDir = path.join(root, 'icon.iconset');

const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="132" y1="96" x2="892" y2="930" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ff4e5f"/>
      <stop offset="0.48" stop-color="#ff0030"/>
      <stop offset="1" stop-color="#c80022"/>
    </linearGradient>
    <linearGradient id="shine" x1="180" y1="40" x2="880" y2="840" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#075985"/>
    </linearGradient>
    <linearGradient id="skyB" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#f97316"/>
    </linearGradient>
    <linearGradient id="skyC" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#a78bfa"/>
      <stop offset="1" stop-color="#4c1d95"/>
    </linearGradient>
    <linearGradient id="skyD" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#5eead4"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#650013" flood-opacity="0.28"/>
    </filter>
    <clipPath id="tileClipA"><rect x="218" y="247" width="276" height="177" rx="22"/></clipPath>
    <clipPath id="tileClipB"><rect x="530" y="247" width="276" height="177" rx="22"/></clipPath>
    <clipPath id="tileClipC"><rect x="218" y="462" width="276" height="177" rx="22"/></clipPath>
    <clipPath id="tileClipD"><rect x="530" y="462" width="276" height="177" rx="22"/></clipPath>
  </defs>

  <rect width="1024" height="1024" fill="#e00025"/>
  <rect x="28" y="28" width="968" height="968" rx="218" fill="url(#bg)"/>
  <path d="M51 248C228 160 378 93 548 28H778C457 226 224 467 46 785L51 248Z" fill="url(#shine)"/>
  <path d="M512 28V996M28 512H996" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>

  <g filter="url(#softShadow)">
    <rect x="198" y="227" width="628" height="432" rx="34" fill="#fff6f6" opacity="0.98"/>
    <rect x="218" y="247" width="276" height="177" rx="22" fill="url(#skyA)"/>
    <g clip-path="url(#tileClipA)">
      <circle cx="443" cy="292" r="24" fill="#fde68a"/>
      <path d="M216 419L303 329L378 419H216Z" fill="#164e63"/>
      <path d="M303 419L398 314L496 419H303Z" fill="#0f766e"/>
    </g>
    <rect x="530" y="247" width="276" height="177" rx="22" fill="url(#skyB)"/>
    <g clip-path="url(#tileClipB)">
      <circle cx="733" cy="299" r="23" fill="#fff7ad"/>
      <rect x="551" y="322" width="102" height="102" rx="20" fill="#ef4444"/>
      <path d="M530 424L625 331L722 424H530Z" fill="#14532d"/>
      <path d="M660 424L742 347L806 424H660Z" fill="#7c2d12"/>
    </g>
    <rect x="218" y="462" width="276" height="177" rx="22" fill="url(#skyC)"/>
    <g clip-path="url(#tileClipC)">
      <circle cx="288" cy="513" r="21" fill="#f0abfc"/>
      <rect x="319" y="491" width="86" height="118" rx="43" fill="#f5d0fe"/>
      <path d="M218 639L318 543L413 639H218Z" fill="#312e81"/>
      <path d="M364 639L439 567L494 639H364Z" fill="#581c87"/>
    </g>
    <rect x="530" y="462" width="276" height="177" rx="22" fill="url(#skyD)"/>
    <g clip-path="url(#tileClipD)">
      <circle cx="719" cy="512" r="21" fill="#fef3c7"/>
      <path d="M530 639L612 554L686 639H530Z" fill="#065f46"/>
      <path d="M653 639L735 536L806 639H653Z" fill="#134e4a"/>
      <rect x="570" y="520" width="62" height="62" rx="14" fill="#22c55e"/>
    </g>
    <path d="M512 231V655M202 443H822" stroke="#fff" stroke-width="18" stroke-linecap="round"/>
    <path d="M512 231V655" stroke="#e00025" stroke-width="7" stroke-linecap="round"/>
    <path d="M202 443H822" stroke="#e00025" stroke-width="7" stroke-linecap="round"/>
  </g>

  <circle cx="775" cy="723" r="74" fill="#fff" stroke="#e00025" stroke-width="8"/>
  <path d="M753 677L812 723L753 769V677Z" fill="#ff0030"/>
  <circle cx="169" cy="166" r="47" fill="#fff"/>
  <path d="M143 143H196V157H177V196H162V157H143V143Z" fill="#e00025"/>
</svg>`;

const iconEntries = [
  { filename: 'AppIcon@2x.png', idiom: 'iphone', size: '60x60', scale: '2x', pixels: 120 },
  { filename: 'AppIcon@3x.png', idiom: 'iphone', size: '60x60', scale: '3x', pixels: 180 },
  { filename: 'AppIcon~ipad.png', idiom: 'ipad', size: '76x76', scale: '1x', pixels: 76 },
  { filename: 'AppIcon@2x~ipad.png', idiom: 'ipad', size: '76x76', scale: '2x', pixels: 152 },
  { filename: 'AppIcon-83.5@2x~ipad.png', idiom: 'ipad', size: '83.5x83.5', scale: '2x', pixels: 167 },
  { filename: 'AppIcon-40@2x.png', idiom: 'iphone', size: '40x40', scale: '2x', pixels: 80 },
  { filename: 'AppIcon-40@3x.png', idiom: 'iphone', size: '40x40', scale: '3x', pixels: 120 },
  { filename: 'AppIcon-40~ipad.png', idiom: 'ipad', size: '40x40', scale: '1x', pixels: 40 },
  { filename: 'AppIcon-40@2x~ipad.png', idiom: 'ipad', size: '40x40', scale: '2x', pixels: 80 },
  { filename: 'AppIcon-20@2x.png', idiom: 'iphone', size: '20x20', scale: '2x', pixels: 40 },
  { filename: 'AppIcon-20@3x.png', idiom: 'iphone', size: '20x20', scale: '3x', pixels: 60 },
  { filename: 'AppIcon-20~ipad.png', idiom: 'ipad', size: '20x20', scale: '1x', pixels: 20 },
  { filename: 'AppIcon-20@2x~ipad.png', idiom: 'ipad', size: '20x20', scale: '2x', pixels: 40 },
  { filename: 'AppIcon-29.png', idiom: 'iphone', size: '29x29', scale: '1x', pixels: 29 },
  { filename: 'AppIcon-29@2x.png', idiom: 'iphone', size: '29x29', scale: '2x', pixels: 58 },
  { filename: 'AppIcon-29@3x.png', idiom: 'iphone', size: '29x29', scale: '3x', pixels: 87 },
  { filename: 'AppIcon-29~ipad.png', idiom: 'ipad', size: '29x29', scale: '1x', pixels: 29 },
  { filename: 'AppIcon-29@2x~ipad.png', idiom: 'ipad', size: '29x29', scale: '2x', pixels: 58 },
  { filename: 'AppIcon-60@2x~car.png', idiom: 'car', size: '60x60', scale: '2x', pixels: 120 },
  { filename: 'AppIcon-60@3x~car.png', idiom: 'car', size: '60x60', scale: '3x', pixels: 180 },
  { filename: 'AppIcon~ios-marketing.png', idiom: 'ios-marketing', size: '1024x1024', scale: '1x', pixels: 1024 }
];

async function renderIcon(outputPath, pixels) {
  await sharp(Buffer.from(iconSvg))
    .resize(pixels, pixels, { fit: 'fill' })
    .flatten({ background: '#e00025' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function writeIconSet(directory, entries) {
  await fs.promises.mkdir(directory, { recursive: true });

  const existingPngs = await fs.promises.readdir(directory).catch(() => []);
  await Promise.all(
    existingPngs
      .filter((file) => file.endsWith('.png'))
      .map((file) => fs.promises.unlink(path.join(directory, file)))
  );

  await Promise.all(entries.map((entry) => renderIcon(path.join(directory, entry.filename), entry.pixels)));
  await fs.promises.writeFile(
    path.join(directory, 'Contents.json'),
    JSON.stringify(
      {
        images: entries.map(({ pixels, ...entry }) => entry),
        info: { author: 'xcode', version: 1 }
      },
      null,
      2
    ) + '\n'
  );
}

async function main() {
  await writeIconSet(legacyIconDir, iconEntries);
  await writeIconSet(iosAppIconDir, iconEntries);
  console.log(`Generated ${iconEntries.length} iOS icons in ${path.relative(root, iosAppIconDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
