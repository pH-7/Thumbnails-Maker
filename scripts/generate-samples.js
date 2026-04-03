#!/usr/bin/env node

/**
 * Generate sample images for App Store screenshots
 * Creates colorful placeholder images that look like real YouTube content
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..', 'screenshots', 'samples');
fs.mkdirSync(outDir, { recursive: true });

async function createSampleImage(filename, width, height, colors, label) {
  // Create a vibrant gradient image using raw pixel data
  const { r1, g1, b1, r2, g2, b2 } = colors;
  
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const idx = (y * width + x) * 3;
      pixels[idx] = Math.round(r1 + (r2 - r1) * t);
      pixels[idx + 1] = Math.round(g1 + (g2 - g1) * t);
      pixels[idx + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }

  const svgOverlay = `<svg width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.15)" rx="0"/>
    <text x="${width/2}" y="${height/2}" font-family="Helvetica Neue, Arial" font-size="${Math.round(height/6)}" 
      fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="bold"
      style="text-shadow: 2px 2px 8px rgba(0,0,0,0.5)">${label}</text>
  </svg>`;

  await sharp(pixels, { raw: { width, height, channels: 3 } })
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toFile(path.join(outDir, filename));
  
  console.log(`Created ${filename}`);
}

async function main() {
  const w = 800, h = 600;
  
  await Promise.all([
    createSampleImage('travel.jpg', w, h, 
      { r1: 30, g1: 144, b1: 255, r2: 0, g2: 200, b2: 150 }, '🌍 Travel'),
    createSampleImage('food.jpg', w, h, 
      { r1: 255, g1: 100, b1: 50, r2: 255, g2: 200, b2: 0 }, '🍕 Food'),
    createSampleImage('tech.jpg', w, h, 
      { r1: 100, g1: 50, b1: 200, r2: 0, g2: 150, b2: 255 }, '💻 Tech'),
    createSampleImage('nature.jpg', w, h, 
      { r1: 0, g1: 180, b1: 80, r2: 120, g2: 220, b2: 50 }, '🌿 Nature'),
    createSampleImage('gaming.jpg', w, h, 
      { r1: 200, g1: 0, b1: 100, r2: 100, g2: 0, b2: 200 }, '🎮 Gaming'),
    createSampleImage('music.jpg', w, h, 
      { r1: 255, g1: 50, b1: 50, r2: 200, g2: 50, b2: 150 }, '🎵 Music'),
  ]);

  console.log('\nSample images created in screenshots/samples/');
}

main().catch(console.error);
