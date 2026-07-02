/**
 * thumbnail-engine.js
 *
 * Shared, dependency-free thumbnail compositing engine.
 *
 * This is the browser/Canvas replacement for the desktop app's `sharp`
 * pipeline (which is a native module and cannot run on iOS). It runs anywhere
 * a Canvas 2D context is available: iOS WKWebView (Capacitor), mobile Safari,
 * and Electron's renderer.
 *
 * It focuses on the core need: joining multiple images into a single
 * 1280x720 YouTube thumbnail using standard grid layouts, with optional white
 * delimiters and a light, eye-catching enhancement.
 *
 * Layouts are described as normalized rectangles (x, y, w, h in the 0..1 range)
 * so new layouts can be added declaratively without touching the renderer.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.ThumbnailEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard YouTube thumbnail dimensions.
  const THUMBNAIL_WIDTH = 1280;
  const THUMBNAIL_HEIGHT = 720;

  /**
   * Layout catalogue — mirrors the desktop (Electron) app so the mobile app
   * produces the exact same frames. Standard grids carry `rows`/`cols`; the
   * creative "innovative" layouts are flagged `type: 'custom'` and their frames
   * are computed by `calculateInnovativeLayoutPositions` (ported from desktop).
   */
  const GRID_LAYOUTS = {
    // Standard grid layouts
    '1x1': { rows: 1, cols: 1, maxImages: 1 },
    '2x1': { rows: 2, cols: 1, maxImages: 2 },
    '1x2': { rows: 1, cols: 2, maxImages: 2 },
    '2x2': { rows: 2, cols: 2, maxImages: 4 },
    '3x1': { rows: 3, cols: 1, maxImages: 3 },
    '1x3': { rows: 1, cols: 3, maxImages: 3 },
    '2x3': { rows: 2, cols: 3, maxImages: 6 },
    '3x2': { rows: 3, cols: 2, maxImages: 6 },
    '3x3': { rows: 3, cols: 3, maxImages: 9 },

    // Creative YouTube-optimised layouts (match desktop `main.js`)
    'hero-side': { type: 'custom', maxImages: 4, layout: 'hero-side' },
    'corner-grid': { type: 'custom', maxImages: 5, layout: 'corner-grid' },
    'banner-split': { type: 'custom', maxImages: 3, layout: 'banner-split' },
    'spotlight': { type: 'custom', maxImages: 4, layout: 'spotlight' },
    'l-shape': { type: 'custom', maxImages: 5, layout: 'l-shape' },
    'trio-hero': { type: 'custom', maxImages: 3, layout: 'trio-hero' },
    'pyramid': { type: 'custom', maxImages: 4, layout: 'pyramid' },
    'filmstrip': { type: 'custom', maxImages: 6, layout: 'filmstrip' },
    'triptych': { type: 'custom', maxImages: 3, layout: 'triptych' },
    'magazine-grid': { type: 'custom', maxImages: 12, layout: 'magazine-grid' }
  };

  // Backwards-compatible alias (older callers referenced `LAYOUTS`).
  const LAYOUTS = GRID_LAYOUTS;

  /**
   * Compute pixel frames for the creative layouts. Ported from the desktop
   * app's `calculateInnovativeLayoutPositions` (main.js) so both platforms
   * render byte-for-byte equivalent frame geometry.
   *
   * @returns {{left:number, top:number, width:number, height:number}[]}
   */
  function calculateInnovativeLayoutPositions(layoutType, imageCount, width, height, padding) {
    const positions = [];

    if (!width || !height || width <= 0 || height <= 0 || imageCount <= 0) {
      return positions;
    }

    width = Math.max(100, Math.floor(Number(width) || 1280));
    height = Math.max(100, Math.floor(Number(height) || 720));
    padding = Math.max(0, Math.floor(Number(padding) || 0));
    imageCount = Math.max(1, Math.floor(Number(imageCount) || 1));

    const ensureValidDimension = (value, minimum = 100) => {
      const num = Math.floor(Number(value) || minimum);
      return Math.max(minimum, num);
    };

    switch (layoutType) {
      case 'hero-side': {
        // Adaptive hero + stacked side images.
        const heroWidth = ensureValidDimension(width * 0.65 - padding, 200);
        const sideWidth = ensureValidDimension(width - heroWidth - padding * 3, 100);
        const sideImageCount = Math.max(1, imageCount - 1);
        const sideHeight = ensureValidDimension((height - padding * (sideImageCount + 1)) / sideImageCount, 100);

        positions.push({
          width: heroWidth,
          height: ensureValidDimension(height - padding * 2, 100),
          left: padding,
          top: padding
        });

        for (let i = 1; i < imageCount; i++) {
          positions.push({
            width: sideWidth,
            height: sideHeight,
            left: heroWidth + padding * 2,
            top: padding + (i - 1) * (sideHeight + padding)
          });
        }
        break;
      }

      case 'corner-grid': {
        // True mosaic: every pixel is covered, cells have varied sizes.
        if (imageCount <= 2) {
          const halfW = ensureValidDimension((width - padding * 3) / 2, 100);
          const fullH = ensureValidDimension(height - padding * 2, 100);
          positions.push({ width: halfW, height: fullH, left: padding, top: padding });
          if (imageCount === 2) {
            positions.push({ width: halfW, height: fullH, left: halfW + padding * 2, top: padding });
          }
        } else if (imageCount === 3) {
          const leftW = ensureValidDimension(width * 0.6 - padding * 1.5, 200);
          const rightW = ensureValidDimension(width - leftW - padding * 3, 100);
          const topRH = ensureValidDimension((height - padding * 3) * 0.55, 100);
          const botRH = ensureValidDimension(height - topRH - padding * 3, 100);
          positions.push({ width: leftW, height: ensureValidDimension(height - padding * 2, 100), left: padding, top: padding });
          positions.push({ width: rightW, height: topRH, left: leftW + padding * 2, top: padding });
          positions.push({ width: rightW, height: botRH, left: leftW + padding * 2, top: topRH + padding * 2 });
        } else if (imageCount === 4) {
          const bigW = ensureValidDimension(width * 0.55 - padding * 1.5, 200);
          const bigH = ensureValidDimension(height * 0.6 - padding * 1.5, 150);
          const rightW = ensureValidDimension(width - bigW - padding * 3, 100);
          const botH = ensureValidDimension(height - bigH - padding * 3, 100);
          const botSmW = ensureValidDimension((bigW - padding) / 2, 80);
          positions.push({ width: bigW, height: bigH, left: padding, top: padding });
          positions.push({ width: rightW, height: ensureValidDimension(height - padding * 2, 100), left: bigW + padding * 2, top: padding });
          positions.push({ width: botSmW, height: botH, left: padding, top: bigH + padding * 2 });
          positions.push({ width: botSmW, height: botH, left: padding + botSmW + padding, top: bigH + padding * 2 });
        } else if (imageCount === 5) {
          const leftW = ensureValidDimension(width * 0.38 - padding * 1.5, 150);
          const midW = ensureValidDimension(width * 0.32 - padding, 120);
          const rightW = ensureValidDimension(width - leftW - midW - padding * 4, 100);
          const topH = ensureValidDimension(height * 0.58 - padding * 1.5, 150);
          const botH = ensureValidDimension(height - topH - padding * 3, 100);
          positions.push({ width: leftW, height: topH, left: padding, top: padding });
          positions.push({ width: leftW, height: botH, left: padding, top: topH + padding * 2 });
          positions.push({ width: midW, height: ensureValidDimension(height - padding * 2, 100), left: leftW + padding * 2, top: padding });
          positions.push({ width: rightW, height: topH, left: leftW + midW + padding * 3, top: padding });
          positions.push({ width: rightW, height: botH, left: leftW + midW + padding * 3, top: topH + padding * 2 });
        } else {
          const cols = 3;
          const colW = ensureValidDimension((width - padding * (cols + 1)) / cols, 100);
          const tallH = ensureValidDimension(height * 0.62 - padding * 1.5, 150);
          const shortH = ensureValidDimension(height - tallH - padding * 3, 100);
          const colLayout = [
            [{ h: tallH, top: padding }, { h: shortH, top: tallH + padding * 2 }],
            [{ h: shortH, top: padding }, { h: tallH, top: shortH + padding * 2 }],
            [{ h: tallH, top: padding }, { h: shortH, top: tallH + padding * 2 }]
          ];
          let imgIdx = 0;
          for (let c = 0; c < cols && imgIdx < imageCount; c++) {
            for (let r = 0; r < 2 && imgIdx < imageCount; r++) {
              const cell = colLayout[c][r];
              positions.push({ width: colW, height: cell.h, left: padding + c * (colW + padding), top: cell.top });
              imgIdx++;
            }
          }
        }
        break;
      }

      case 'banner-split': {
        // Wide banner on top, split content below.
        const bannerHeight = ensureValidDimension(height * 0.55, 150);
        const bottomHeight = ensureValidDimension(height - bannerHeight - padding * 3, 100);
        const splitImageCount = Math.max(1, imageCount - 1);
        const splitWidth = ensureValidDimension((width - padding * (splitImageCount + 1)) / splitImageCount, 100);

        positions.push({
          width: ensureValidDimension(width - padding * 2, 100),
          height: bannerHeight,
          left: padding,
          top: padding
        });

        for (let i = 1; i < imageCount; i++) {
          positions.push({
            width: splitWidth,
            height: bottomHeight,
            left: padding + (i - 1) * (splitWidth + padding),
            top: bannerHeight + padding * 2
          });
        }
        break;
      }

      case 'spotlight': {
        // Magazine-style spotlight.
        if (imageCount <= 3) {
          const mainWidth = ensureValidDimension(width * 0.6 - padding, 250);
          const sideWidth = ensureValidDimension((width - mainWidth - padding * 3) / Math.max(1, imageCount - 1), 100);
          const imageHeight = ensureValidDimension(height - padding * 2, 100);

          positions.push({ width: mainWidth, height: imageHeight, left: padding, top: padding });

          for (let i = 1; i < imageCount; i++) {
            positions.push({
              width: sideWidth,
              height: imageHeight,
              left: mainWidth + padding + (i - 1) * (sideWidth + padding),
              top: padding
            });
          }
        } else {
          const cols = 2;
          const rows = Math.ceil(imageCount / cols);
          const cellWidth = ensureValidDimension((width - padding * (cols + 1)) / cols, 100);
          const cellHeight = ensureValidDimension((height - padding * (rows + 1)) / rows, 100);

          for (let i = 0; i < imageCount; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            positions.push({
              width: cellWidth,
              height: cellHeight,
              left: padding + col * (cellWidth + padding),
              top: padding + row * (cellHeight + padding)
            });
          }
        }
        break;
      }

      case 'l-shape': {
        // True L-shape with good space utilisation.
        if (imageCount === 3) {
          const topWidth = ensureValidDimension(width * 0.7 - padding, 250);
          const topHeight = ensureValidDimension(height * 0.6 - padding, 200);
          const bottomLeftWidth = topWidth;
          const bottomLeftHeight = ensureValidDimension(height - topHeight - padding * 3, 100);
          const rightWidth = ensureValidDimension(width - topWidth - padding * 3, 100);
          const rightHeight = topHeight;

          positions.push({ width: topWidth, height: topHeight, left: padding, top: padding });
          positions.push({ width: bottomLeftWidth, height: bottomLeftHeight, left: padding, top: topHeight + padding * 2 });
          positions.push({ width: rightWidth, height: rightHeight, left: topWidth + padding * 2, top: padding });
        } else {
          const mainWidth = ensureValidDimension(width * 0.6, 300);
          const mainHeight = ensureValidDimension(height * 0.6, 200);
          const remainingWidth = ensureValidDimension(width - mainWidth - padding * 3, 100);
          const remainingHeight = ensureValidDimension(height - mainHeight - padding * 3, 100);

          positions.push({ width: mainWidth, height: mainHeight, left: padding, top: padding });

          let imageIndex = 1;
          const rightImages = Math.min(2, imageCount - 1);
          const rightCellHeight = ensureValidDimension(mainHeight / rightImages, 100);

          for (let i = 0; i < rightImages && imageIndex < imageCount; i++) {
            positions.push({
              width: remainingWidth,
              height: rightCellHeight,
              left: mainWidth + padding * 2,
              top: padding + i * rightCellHeight
            });
            imageIndex++;
          }

          const bottomImages = imageCount - imageIndex;
          if (bottomImages > 0) {
            const bottomCellWidth = ensureValidDimension(width / bottomImages, 100);
            for (let i = 0; i < bottomImages; i++) {
              positions.push({
                width: ensureValidDimension(bottomCellWidth - padding, 100),
                height: remainingHeight,
                left: padding + i * bottomCellWidth,
                top: mainHeight + padding * 2
              });
            }
          }
        }
        break;
      }

      case 'triptych': {
        // 3 perfectly equal tall columns.
        const colW = ensureValidDimension((width - padding * 4) / 3, 100);
        const colH = ensureValidDimension(height - padding * 2, 100);
        for (let i = 0; i < Math.min(imageCount, 3); i++) {
          positions.push({ width: colW, height: colH, left: padding + i * (colW + padding), top: padding });
        }
        break;
      }

      case 'trio-hero': {
        // Wide hero banner (top 55%) + 2 equal panels (bottom 45%).
        const heroH = ensureValidDimension(height * 0.55 - padding * 1.5, 150);
        const botH = ensureValidDimension(height - heroH - padding * 3, 100);
        const heroW = ensureValidDimension(width - padding * 2, 100);
        const panelW = ensureValidDimension((width - padding * 3) / 2, 100);
        positions.push({ width: heroW, height: heroH, left: padding, top: padding });
        if (imageCount >= 2) {
          positions.push({ width: panelW, height: botH, left: padding, top: heroH + padding * 2 });
        }
        if (imageCount >= 3) {
          positions.push({ width: panelW, height: botH, left: panelW + padding * 2, top: heroH + padding * 2 });
        }
        break;
      }

      case 'pyramid': {
        // 1 wide top (58% height) + up to 3 equal bottom panels.
        const topH = ensureValidDimension(height * 0.58 - padding * 1.5, 150);
        const btmH = ensureValidDimension(height - topH - padding * 3, 100);
        const topW = ensureValidDimension(width - padding * 2, 100);
        const bottomCount = Math.max(1, imageCount - 1);
        const btmCellW = ensureValidDimension((width - padding * (bottomCount + 1)) / bottomCount, 100);
        positions.push({ width: topW, height: topH, left: padding, top: padding });
        for (let i = 0; i < bottomCount && i + 1 < imageCount; i++) {
          positions.push({ width: btmCellW, height: btmH, left: padding + i * (btmCellW + padding), top: topH + padding * 2 });
        }
        break;
      }

      case 'filmstrip': {
        // Alternating tall/short columns for a contact-sheet look.
        const count = Math.min(imageCount, 6);
        const colW = ensureValidDimension((width - padding * (count + 1)) / count, 80);
        const tallH = ensureValidDimension(height - padding * 2, 100);
        const shortH = ensureValidDimension(height * 0.65 - padding, 100);
        const shortTop = Math.floor((height - shortH) / 2);
        for (let i = 0; i < count; i++) {
          const isShort = i % 2 === 1;
          positions.push({
            width: colW,
            height: isShort ? shortH : tallH,
            left: padding + i * (colW + padding),
            top: isShort ? shortTop : padding
          });
        }
        break;
      }

      case 'magazine-grid': {
        // Newspaper/magazine style: each row fills the full width; images per
        // row are distributed as evenly as possible (classic 3-4-3 look).
        const n = Math.min(imageCount, 12);

        let rowDist;
        if (n <= 2) {
          rowDist = [n];
        } else if (n === 3) {
          rowDist = [1, 2];
        } else if (n === 4) {
          rowDist = [2, 2];
        } else if (n === 5) {
          rowDist = [2, 3];
        } else if (n === 6) {
          rowDist = [2, 2, 2];
        } else if (n === 7) {
          rowDist = [2, 3, 2];
        } else if (n === 8) {
          rowDist = [3, 2, 3];
        } else if (n === 9) {
          rowDist = [3, 3, 3];
        } else if (n === 10) {
          rowDist = [3, 4, 3];
        } else if (n === 11) {
          rowDist = [3, 4, 4];
        } else {
          rowDist = [4, 4, 4];
        }

        const numRows = rowDist.length;
        const rowH = ensureValidDimension((height - padding * (numRows + 1)) / numRows, 80);
        let imgIdx = 0;

        for (let r = 0; r < numRows; r++) {
          const cols = rowDist[r];
          const cellW = ensureValidDimension((width - padding * (cols + 1)) / cols, 60);
          const rowTop = padding + r * (rowH + padding);
          for (let c = 0; c < cols && imgIdx < n; c++) {
            positions.push({
              width: cellW,
              height: rowH,
              left: padding + c * (cellW + padding),
              top: rowTop
            });
            imgIdx++;
          }
        }
        break;
      }

      default: {
        // Fallback to a basic square-ish grid.
        const cols = Math.max(1, Math.ceil(Math.sqrt(imageCount)));
        const rows = Math.max(1, Math.ceil(imageCount / cols));
        const cellWidth = ensureValidDimension(width / cols, 100);
        const cellHeight = ensureValidDimension(height / rows, 100);

        for (let i = 0; i < imageCount; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          positions.push({
            width: ensureValidDimension(cellWidth - padding * 2, 100),
            height: ensureValidDimension(cellHeight - padding * 2, 100),
            left: col * cellWidth + padding,
            top: row * cellHeight + padding
          });
        }
      }
    }

    return positions.map((pos) => ({
      width: ensureValidDimension(pos.width, 100),
      height: ensureValidDimension(pos.height, 100),
      left: Math.max(0, Math.floor(Number(pos.left) || 0)),
      top: Math.max(0, Math.floor(Number(pos.top) || 0))
    }));
  }

  /**
   * Compute pixel frames for a standard rows×cols grid. Matches the desktop
   * app exactly: an outer border and inter-tile gaps of `padding` (= half the
   * delimiter width) so every photo gets a visible frame.
   */
  function calculateGridPositions(layout, imageCount, width, height, padding) {
    const cellWidth = Math.floor(width / layout.cols);
    const cellHeight = Math.floor(height / layout.rows);
    const positions = [];

    for (let i = 0; i < imageCount; i++) {
      const row = Math.floor(i / layout.cols);
      const col = i % layout.cols;
      positions.push({
        left: col * cellWidth + padding,
        top: row * cellHeight + padding,
        width: Math.max(1, cellWidth - padding * 2),
        height: Math.max(1, cellHeight - padding * 2)
      });
    }

    return positions;
  }

  /** A sensible default layout based purely on image count (matches desktop). */
  function autoLayoutFor(count) {
    const n = Math.max(1, count);
    if (n === 1) return '1x1';
    if (n === 2) return '1x2';
    if (n === 3) return '1x3';
    if (n === 4) return '2x2';
    if (n <= 6) return '2x3';
    if (n <= 9) return '3x3';
    return 'magazine-grid';
  }

  /**
   * Resolve the effective layout + usable image count. Mirrors the desktop
   * app's "adapt down when fewer images" behaviour: standard grids fall back to
   * a grid that fits the count exactly, creative layouts adapt internally (and
   * drop to 1x1 / 1x2 for very small counts). Images are never repeated.
   *
   * @returns {{key:string, layout:object, count:number}}
   */
  function resolveLayout(layoutKey, providedCount) {
    if (layoutKey === 'auto') {
      layoutKey = autoLayoutFor(providedCount);
    }

    let layout = GRID_LAYOUTS[layoutKey] || GRID_LAYOUTS['1x1'];
    let count = Math.max(1, Math.min(providedCount, layout.maxImages));

    if (count < layout.maxImages) {
      if (layout.type === 'custom') {
        if (count <= 1) {
          layoutKey = '1x1';
        } else if (count === 2) {
          layoutKey = '1x2';
        }
        // 3+ keeps the creative layout, which adapts to the actual count.
      } else {
        // Standard grid: adapt down to a grid that fits the count exactly.
        layoutKey = autoLayoutFor(count);
      }
      layout = GRID_LAYOUTS[layoutKey] || GRID_LAYOUTS['1x1'];
      count = Math.max(1, Math.min(count, layout.maxImages));
    }

    return { key: layoutKey, layout, count };
  }

  /**
   * Draw `img` into the destination rectangle using object-fit: cover
   * semantics (fill the box, preserve aspect ratio, crop the overflow).
   */
  function drawCover(ctx, img, dx, dy, dw, dh) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    const scale = Math.max(dw / iw, dh / ih);
    const sw = dw / scale;
    const sh = dh / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  /** Subtle dark vignette to draw the eye toward the centre of each tile. */
  function paintVignette(ctx, x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const radius = Math.max(w, h) / 2;
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * Compose the final thumbnail.
   *
   * @param {Object} opts
   * @param {HTMLImageElement[]|HTMLCanvasElement[]} opts.images Loaded images.
   * @param {string} [opts.layout='auto'] Layout key (e.g. '2x2') or 'auto'.
   * @param {number} [opts.delimiterWidth=18] Gap between tiles, in px (output scale).
   * @param {string} [opts.delimiterColor='#ffffff'] Gap / background colour.
   * @param {boolean} [opts.enhance=false] Apply the light auto-enhance.
   * @returns {HTMLCanvasElement} The rendered 1280x720 canvas.
   */
  function compose(opts) {
    const images = (opts.images || []).filter(Boolean);
    if (images.length < 1) {
      throw new Error('At least 1 image is required to create a thumbnail');
    }

    const delimiterWidth = Math.max(0, Math.floor(Number(opts.delimiterWidth) || 0));
    const delimiterColor = opts.delimiterColor || '#ffffff';
    const enhance = Boolean(opts.enhance);

    // Desktop uses padding = half the delimiter width for both the outer border
    // and the inter-tile gaps, so every photo ends up inside a visible frame.
    const padding = Math.floor(delimiterWidth / 2);

    const { layout, count } = resolveLayout(opts.layout || 'auto', images.length);
    const usedImages = images.slice(0, count);

    const positions =
      layout.type === 'custom'
        ? calculateInnovativeLayoutPositions(
            layout.layout,
            usedImages.length,
            THUMBNAIL_WIDTH,
            THUMBNAIL_HEIGHT,
            padding
          )
        : calculateGridPositions(
            layout,
            usedImages.length,
            THUMBNAIL_WIDTH,
            THUMBNAIL_HEIGHT,
            padding
          );

    const canvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill background: this colour shows through as the frames / delimiter gaps.
    ctx.fillStyle = delimiterColor;
    ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

    usedImages.forEach((img, index) => {
      const pos = positions[index];
      if (!pos) return;

      const x = Math.floor(pos.left);
      const y = Math.floor(pos.top);
      const w = Math.floor(pos.width);
      const h = Math.floor(pos.height);
      if (w <= 0 || h <= 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();

      // Light, eye-catching enhancement using native canvas filters.
      if (enhance && typeof ctx.filter === 'string') {
        ctx.filter = 'saturate(1.18) contrast(1.08) brightness(1.04)';
      }
      drawCover(ctx, img, x, y, w, h);
      ctx.filter = 'none';

      if (enhance) {
        paintVignette(ctx, x, y, w, h);
      }
      ctx.restore();
    });

    return canvas;
  }

  /** Convert a composed canvas to a PNG Blob. */
  function toBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      const mime = type || 'image/png';
      if (canvas.convertToBlob) {
        // OffscreenCanvas
        canvas.convertToBlob({ type: mime, quality }).then(resolve, reject);
        return;
      }
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to export image'))),
        mime,
        quality
      );
    });
  }

  return {
    THUMBNAIL_WIDTH,
    THUMBNAIL_HEIGHT,
    GRID_LAYOUTS,
    LAYOUTS,
    autoLayoutFor,
    resolveLayout,
    calculateGridPositions,
    calculateInnovativeLayoutPositions,
    compose,
    toBlob
  };
});
