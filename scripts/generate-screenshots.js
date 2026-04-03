#!/usr/bin/env node

/**
 * App Store Screenshot Generator
 *
 * Captures screenshots by launching Electron windows at specific sizes,
 * injecting demo content, and using capturePage().
 *
 * On a 2x Retina display:
 *   1440×900 window → 2880×1800 capture (Retina 16")
 *   1280×800 window → 2560×1600 capture (Retina 15")
 * Non-Retina sizes are downscaled from Retina captures.
 *
 * Usage: npx electron scripts/generate-screenshots.js
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const SAMPLES_DIR = path.join(SCREENSHOT_DIR, 'samples');

const delay = ms => new Promise(r => setTimeout(r, ms));

// Register stub IPC handlers so the renderer doesn't hang
ipcMain.handle('select-images', async () => ({ canceled: true, filePaths: [] }));
ipcMain.handle('select-single-image', async () => null);
ipcMain.handle('create-thumbnail', async () => null);

function getFileUrl(filename) {
  return 'file://' + path.join(SAMPLES_DIR, filename).replace(/ /g, '%20');
}

async function captureScene(win, name, subdir) {
  const outDir = path.join(SCREENSHOT_DIR, subdir);
  fs.mkdirSync(outDir, { recursive: true });
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  const filePath = path.join(outDir, `${name}_${size.width}x${size.height}.png`);
  fs.writeFileSync(filePath, image.toPNG());
  console.log(`  📸 ${name} → ${size.width}×${size.height}`);
  return filePath;
}

async function exec(win, code) {
  try {
    return await win.webContents.executeJavaScript(code);
  } catch (e) {
    console.log(`    [exec-err] ${e.message}`);
    return null;
  }
}

async function makeWindow(w, h) {
  const win = new BrowserWindow({
    width: w,
    height: h,
    useContentSize: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  // Wait for page scripts to initialize
  await delay(3000);
  return win;
}

async function injectImages(win, filenames) {
  for (let i = 0; i < filenames.length; i++) {
    const fileUrl = getFileUrl(filenames[i]);
    // Show the preview slot
    await exec(win, `
      (function() {
        var p = document.getElementById('imagePreview${i + 1}');
        if (p) { p.style.display = 'flex'; }
      })();
    `);
    // Set image content separately (avoids potential issues with long URLs)
    await exec(win, `
      (function() {
        var p = document.getElementById('imagePreview${i + 1}');
        if (!p) return;
        var img = document.createElement('img');
        img.src = '${fileUrl}';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        p.innerHTML = '';
        p.appendChild(img);
        var btn = document.createElement('button');
        btn.className = 'remove-btn';
        btn.style.cssText = 'position:absolute;top:0.2rem;right:0.2rem;background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:24px;height:24px;font-weight:bold;cursor:pointer;';
        btn.textContent = '\\u00d7';
        p.appendChild(btn);
      })();
    `);
    // Show delimiters between images
    if (i > 0) {
      await exec(win, `
        (function() {
          var delims = document.querySelectorAll('.delimiter');
          if (delims[${i - 1}]) delims[${i - 1}].style.display = 'flex';
        })();
      `);
    }
  }
  // Update status
  await exec(win, `
    (function() {
      var btn = document.getElementById('createThumbnailBtn');
      if (btn) btn.disabled = false;
      var s = document.getElementById('status');
      if (s) { s.textContent = '${filenames.length} images loaded'; s.style.color = '#28a745'; }
    })();
  `);
  await delay(500);
}

// Prevent app quit when windows close
app.on('window-all-closed', () => { /* no-op */ });

app.whenReady().then(async () => {
  console.log('\n🖼️  App Store Screenshot Generator\n');
  console.log('='.repeat(50));
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const scenes = [
    {
      name: '01-hero-grid',
      label: 'Hero — 4 images in 2×2 grid',
      size: [1440, 900],
      subdir: 'retina',
      images: ['travel.jpg', 'food.jpg', 'tech.jpg', 'nature.jpg'],
      setup: async (win) => {
        // Show 4th preview slot
        await exec(win, "var el = document.getElementById('imagePreview4'); if (el) el.style.display = 'flex';");
        await exec(win, "var ds = document.querySelectorAll('.delimiter'); for (var i=0;i<3;i++) { if(ds[i]) ds[i].style.display='flex'; }");
      },
      after: async (win) => {
        await exec(win, "var s = document.getElementById('layoutMode'); if(s) s.value='2x2';");
      },
    },
    {
      name: '02-horizontal-strip',
      label: 'Horizontal strip with red delimiter',
      size: [1440, 900],
      subdir: 'retina',
      images: ['food.jpg', 'travel.jpg', 'gaming.jpg'],
      after: async (win) => {
        await exec(win, `
          (function() {
            var s = document.getElementById('layoutMode'); if(s) s.value='1x3';
            var dc = document.getElementById('delimiterColor');
            if(dc) { dc.value='#ff0000'; dc.dispatchEvent(new Event('input')); }
          })();
        `);
      },
    },
    {
      name: '03-text-overlay',
      label: 'Text overlay feature',
      size: [1440, 900],
      subdir: 'retina',
      images: ['music.jpg'],
      after: async (win) => {
        await exec(win, "var s=document.getElementById('layoutMode'); if(s) s.value='1x1';");
        await delay(300);
        await exec(win, `
          (function() {
            var t = document.getElementById('enableTextOverlay');
            if (t && !t.checked) { t.checked = true; t.dispatchEvent(new Event('change')); }
          })();
        `);
        await delay(500);
        await exec(win, `
          (function() {
            var opts = document.getElementById('textOverlayOptions');
            if (opts) opts.style.display = 'block';
            var ti = document.getElementById('overlayText');
            if (ti) { ti.value = 'MY EPIC VLOG!'; ti.dispatchEvent(new Event('input')); }
          })();
        `);
        await delay(300);
        await exec(win, "var p = document.querySelector('[data-preset=\"bold-impact\"]'); if(p) p.click();");
      },
    },
    {
      name: '04-options-panel',
      label: 'Customization options',
      size: [1440, 900],
      subdir: 'retina',
      images: ['travel.jpg', 'nature.jpg'],
      after: async (win) => {
        await exec(win, `
          (function() {
            var s = document.getElementById('layoutMode'); if(s) s.value='1x2';
            var dc = document.getElementById('delimiterColor');
            if(dc) { dc.value='#3366ff'; dc.dispatchEvent(new Event('input')); }
            var dt = document.getElementById('delimiterTilt');
            if(dt) { dt.value='12'; dt.dispatchEvent(new Event('input')); }
            var tv = document.getElementById('tiltValue');
            if(tv) tv.textContent='12\\u00b0';
          })();
        `);
        await delay(300);
        await exec(win, "var oc=document.querySelector('.options-container'); if(oc) oc.scrollIntoView({block:'center'});");
      },
    },
    {
      name: '05-six-grid',
      label: '6 images in 2×3 grid',
      size: [1440, 900],
      subdir: 'retina',
      images: ['travel.jpg', 'food.jpg', 'tech.jpg', 'nature.jpg', 'gaming.jpg', 'music.jpg'],
      setup: async (win) => {
        await exec(win, `
          (function() {
            for(var i=1;i<=6;i++){ var el=document.getElementById('imagePreview'+i); if(el) el.style.display='flex'; }
            document.querySelectorAll('.delimiter').forEach(function(d){ d.style.display='flex'; });
          })();
        `);
      },
      after: async (win) => {
        await exec(win, "var s=document.getElementById('layoutMode'); if(s) s.value='2x3';");
      },
    },
    {
      name: '01-hero-grid',
      label: 'Hero at 1280×800 (→ 2560×1600)',
      size: [1280, 800],
      subdir: 'retina-15',
      images: ['travel.jpg', 'food.jpg', 'tech.jpg', 'nature.jpg'],
      setup: async (win) => {
        await exec(win, "var el=document.getElementById('imagePreview4'); if(el) el.style.display='flex';");
        await exec(win, "var ds=document.querySelectorAll('.delimiter'); for(var i=0;i<3;i++){if(ds[i])ds[i].style.display='flex';}");
      },
      after: async (win) => {
        await exec(win, "var s=document.getElementById('layoutMode'); if(s) s.value='2x2';");
      },
    },
  ];

  for (const scene of scenes) {
    console.log(`\n📷 ${scene.label}`);
    try {
      const win = await makeWindow(scene.size[0], scene.size[1]);

      if (scene.setup) await scene.setup(win);
      await delay(300);

      await injectImages(win, scene.images);

      if (scene.after) await scene.after(win);
      await delay(1000);

      win.showInactive();
      await delay(500);

      await captureScene(win, scene.name, scene.subdir);
      win.destroy();
    } catch (e) {
      console.error(`  ❌ Error: ${e.message}`);
    }
    await delay(500);
  }

  // Downscale retina → non-retina
  console.log('\n📐 Generating non-Retina sizes...');
  const retinaDir = path.join(SCREENSHOT_DIR, 'retina');
  if (fs.existsSync(retinaDir)) {
    const files = fs.readdirSync(retinaDir).filter(f => f.endsWith('.png'));
    for (const file of files) {
      const src = path.join(retinaDir, file);
      const base = file.replace(/_\d+x\d+\.png$/, '');

      const dir1440 = path.join(SCREENSHOT_DIR, '1440x900');
      fs.mkdirSync(dir1440, { recursive: true });
      await sharp(src).resize(1440, 900, { fit: 'cover' }).png().toFile(path.join(dir1440, `${base}_1440x900.png`));
      console.log(`  📐 ${base} → 1440×900`);

      const dir1280 = path.join(SCREENSHOT_DIR, '1280x800');
      fs.mkdirSync(dir1280, { recursive: true });
      await sharp(src).resize(1280, 800, { fit: 'cover' }).png().toFile(path.join(dir1280, `${base}_1280x800.png`));
      console.log(`  📐 ${base} → 1280×800`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ All screenshots generated!\n');
  console.log('📁 Output:');
  console.log('   screenshots/retina/      → 2880×1800 (Retina 16")');
  console.log('   screenshots/retina-15/   → 2560×1600 (Retina 15")');
  console.log('   screenshots/1440x900/    → 1440×900  (Non-Retina)');
  console.log('   screenshots/1280x800/    → 1280×800  (Minimum)\n');
  app.quit();
});
