#!/usr/bin/env node

/**
 * Generate a modern app icon for YouTube Thumbnail Maker Studio
 *
 * Design concept:
 *   - macOS-style rounded squircle with subtle shadow
 *   - Rich gradient background (warm red → deep crimson, YouTube-aligned)
 *   - Central motif: 2×2 image grid (representing thumbnail combiner)
 *   - Small play-button accent (YouTube connection)
 *   - Clean, minimal, modern aesthetic
 *
 * Generates all macOS iconset sizes + .icns via iconutil.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ICONSET_DIR = path.join(__dirname, '..', 'macos-icon.iconset');
const ICON_OUT = path.join(__dirname, '..', 'build', 'mac', 'icon.icns');

// macOS icon sizes: [filename, pixel-size]
const SIZES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

/**
 * Generate the master 1024×1024 icon as SVG, then render to PNG.
 */
function createIconSVG() {
  // macOS squircle approximation using a rounded rect with large radius
  // The icon features:
  //   1. Gradient background (YouTube red → deep crimson)
  //   2. A 2×2 grid of "image" tiles with rounded corners
  //   3. A small play button overlay in the bottom-right
  //   4. Subtle inner glow and depth

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Background gradient: warm YouTube red to deeper crimson -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF4444"/>
      <stop offset="50%" stop-color="#E60023"/>
      <stop offset="100%" stop-color="#CC0020"/>
    </linearGradient>

    <!-- Subtle inner shine -->
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="white" stop-opacity="0.25"/>
      <stop offset="40%" stop-color="white" stop-opacity="0"/>
    </linearGradient>

    <!-- Tile gradients for the 2×2 grid - each slightly different for depth -->
    <linearGradient id="tile1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF5F5" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#FFE0E0" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="tile2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE8E8" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#FFD4D4" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="tile3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFECEC" stop-opacity="0.93"/>
      <stop offset="100%" stop-color="#FFD8D8" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="tile4" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF0F0" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#FFDCDC" stop-opacity="0.89"/>
    </linearGradient>

    <!-- Play button gradient -->
    <linearGradient id="playBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F0F0F0"/>
    </linearGradient>

    <!-- Shadow filter for tiles -->
    <filter id="tileShadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.15"/>
    </filter>

    <!-- Shadow for play button -->
    <filter id="playShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.25"/>
    </filter>

    <!-- Outer shadow for the squircle -->
    <filter id="outerShadow" x="-5%" y="-3%" width="110%" height="112%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.3"/>
    </filter>

    <!-- Clip to squircle shape -->
    <clipPath id="squircle">
      <rect x="40" y="40" width="944" height="944" rx="212" ry="212"/>
    </clipPath>
  </defs>

  <!-- Background squircle with shadow -->
  <g filter="url(#outerShadow)">
    <rect x="40" y="40" width="944" height="944" rx="212" ry="212" fill="url(#bg)"/>
  </g>

  <!-- Content clipped to squircle -->
  <g clip-path="url(#squircle)">
    <!-- Inner shine overlay -->
    <rect x="40" y="40" width="944" height="944" fill="url(#shine)"/>

    <!-- Subtle grid pattern background decoration -->
    <g opacity="0.06">
      <line x1="512" y1="40" x2="512" y2="984" stroke="white" stroke-width="2"/>
      <line x1="40" y1="512" x2="984" y2="512" stroke="white" stroke-width="2"/>
    </g>

    <!-- ═══ 2×2 Thumbnail Grid ═══ -->
    <!-- Represents the app's core feature: combining images into thumbnails -->
    <g filter="url(#tileShadow)">
      <!-- Top-left tile -->
      <rect x="218" y="218" width="252" height="178" rx="18" ry="18" fill="url(#tile1)"/>
      <!-- Landscape icon inside -->
      <g transform="translate(300, 280)">
        <path d="M0 30 Q0 0 30 0 L60 0 Q90 0 90 30 L90 60 Q90 90 60 90 L30 90 Q0 90 0 60 Z" fill="#E63946" opacity="0.6"/>
        <circle cx="30" cy="35" r="12" fill="#F4A261" opacity="0.7"/>
        <path d="M10 70 L35 45 L55 62 L70 50 L85 70 Q85 85 70 85 L20 85 Q10 85 10 70Z" fill="#2A9D8F" opacity="0.6"/>
      </g>

      <!-- Top-right tile -->
      <rect x="490" y="218" width="252" height="178" rx="18" ry="18" fill="url(#tile2)"/>
      <g transform="translate(572, 280)">
        <path d="M0 30 Q0 0 30 0 L60 0 Q90 0 90 30 L90 60 Q90 90 60 90 L30 90 Q0 90 0 60 Z" fill="#457B9D" opacity="0.6"/>
        <circle cx="60" cy="30" r="10" fill="#F4A261" opacity="0.7"/>
        <path d="M5 75 L30 50 L50 65 L70 45 L85 60 L85 70 Q85 85 70 85 L20 85 Q5 85 5 75Z" fill="#264653" opacity="0.5"/>
      </g>

      <!-- Bottom-left tile -->
      <rect x="218" y="416" width="252" height="178" rx="18" ry="18" fill="url(#tile3)"/>
      <g transform="translate(300, 478)">
        <path d="M0 30 Q0 0 30 0 L60 0 Q90 0 90 30 L90 60 Q90 90 60 90 L30 90 Q0 90 0 60 Z" fill="#E9C46A" opacity="0.6"/>
        <circle cx="25" cy="30" r="10" fill="#E76F51" opacity="0.6"/>
        <path d="M5 75 L25 50 L45 65 L65 48 L85 65 L85 70 Q85 85 70 85 L20 85 Q5 85 5 75Z" fill="#2A9D8F" opacity="0.5"/>
      </g>

      <!-- Bottom-right tile -->
      <rect x="490" y="416" width="252" height="178" rx="18" ry="18" fill="url(#tile4)"/>
      <g transform="translate(572, 478)">
        <path d="M0 30 Q0 0 30 0 L60 0 Q90 0 90 30 L90 60 Q90 90 60 90 L30 90 Q0 90 0 60 Z" fill="#6A4C93" opacity="0.6"/>
        <circle cx="55" cy="35" r="12" fill="#F4A261" opacity="0.6"/>
        <path d="M5 70 L30 48 L50 60 L70 42 L85 58 L85 70 Q85 85 70 85 L20 85 Q5 85 5 70Z" fill="#1D3557" opacity="0.5"/>
      </g>
    </g>

    <!-- Center dividers (the "delimiter" feature) -->
    <g opacity="0.8">
      <!-- Vertical divider -->
      <rect x="478" y="228" width="4" height="358" rx="2" fill="white"/>
      <!-- Horizontal divider -->
      <rect x="228" y="402" width="506" height="4" rx="2" fill="white"/>
    </g>

    <!-- ═══ Play Button (bottom-right corner) ═══ -->
    <!-- YouTube connection -->
    <g filter="url(#playShadow)" transform="translate(690, 620)">
      <circle cx="60" cy="60" r="52" fill="url(#playBg)"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="#FF0000" stroke-width="3" opacity="0.9"/>
      <!-- Triangle play icon, slightly offset right for optical center -->
      <path d="M48 36 L80 60 L48 84 Z" fill="#FF0000" opacity="0.9"/>
    </g>

    <!-- ═══ Title text accent (small "T" badge, top-left) ═══ -->
    <g transform="translate(140, 140)">
      <circle cx="40" cy="40" r="36" fill="white" opacity="0.95"/>
      <text x="40" y="54" text-anchor="middle" font-family="-apple-system, SF Pro Display, Helvetica Neue, sans-serif"
            font-size="42" font-weight="800" fill="#E60023" letter-spacing="-1">T</text>
    </g>
  </g>
</svg>`;
}

async function main() {
  console.log('🎨 Generating modern app icon...\n');

  // Create master 1024×1024
  const svg = Buffer.from(createIconSVG());
  const masterPng = await sharp(svg, { density: 144 })
    .resize(1024, 1024)
    .png()
    .toBuffer();

  console.log('  ✅ Master 1024×1024 generated');

  // Generate all iconset sizes
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  for (const [filename, size] of SIZES) {
    const outPath = path.join(ICONSET_DIR, filename);
    await sharp(masterPng)
      .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
      .png()
      .toFile(outPath);
    console.log(`  📐 ${filename} (${size}×${size})`);
  }

  // Build .icns using macOS iconutil
  console.log('\n🔨 Building icon.icns...');
  fs.mkdirSync(path.dirname(ICON_OUT), { recursive: true });
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${ICON_OUT}"`, { stdio: 'pipe' });
    console.log(`  ✅ ${ICON_OUT}`);
  } catch (e) {
    console.error('  ❌ iconutil failed:', e.message);
    console.log('  Trying manual copy as fallback...');
    // Copy the 512@2x as a fallback
    fs.copyFileSync(path.join(ICONSET_DIR, 'icon_512x512@2x.png'), ICON_OUT);
  }

  // Also update the iOS/universal icon.iconset if it exists
  const iosIconset = path.join(__dirname, '..', 'icon.iconset');
  if (fs.existsSync(iosIconset)) {
    console.log('\n📱 Updating icon.iconset (universal)...');
    const iosMapping = {
      'AppIcon@2x.png': 120,          // 60×60 @2x
      'AppIcon@3x.png': 180,          // 60×60 @3x
      'AppIcon~ipad.png': 76,         // 76×76 @1x
      'AppIcon@2x~ipad.png': 152,     // 76×76 @2x
      'AppIcon-83.5@2x~ipad.png': 167,// 83.5×83.5 @2x
      'AppIcon-40@2x.png': 80,        // 40×40 @2x
      'AppIcon-40@3x.png': 120,       // 40×40 @3x
      'AppIcon-40~ipad.png': 40,      // 40×40 @1x
      'AppIcon-40@2x~ipad.png': 80,   // 40×40 @2x
      'AppIcon-20@2x.png': 40,        // 20×20 @2x
      'AppIcon-20@3x.png': 60,        // 20×20 @3x
      'AppIcon-20~ipad.png': 20,      // 20×20 @1x
      'AppIcon-20@2x~ipad.png': 40,   // 20×20 @2x
      'AppIcon-29.png': 29,
      'AppIcon-29@2x.png': 58,
      'AppIcon-29@3x.png': 87,
      'AppIcon-29~ipad.png': 29,
      'AppIcon-29@2x~ipad.png': 58,
      'AppIcon-60@2x~car.png': 120,
      'AppIcon-60@3x~car.png': 180,
      'AppIcon~ios-marketing.png': 1024,
    };

    for (const [fname, size] of Object.entries(iosMapping)) {
      const dest = path.join(iosIconset, fname);
      if (fs.existsSync(dest)) {
        await sharp(masterPng)
          .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
          .png()
          .toFile(dest);
        console.log(`  📐 ${fname} (${size}×${size})`);
      }
    }
  }

  console.log('\n✅ App icon updated successfully!\n');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
