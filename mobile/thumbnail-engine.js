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
   * Build an evenly divided grid of normalized rectangles in row-major order.
   * `rows`/`cols` follow the desktop app's naming, e.g. '1x2' = 1 row, 2 cols.
   */
  function grid(rows, cols) {
    const rects = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rects.push({ x: c / cols, y: r / rows, w: 1 / cols, h: 1 / rows });
      }
    }
    return rects;
  }

  // Layout catalogue. Each entry: { maxImages, rects(count) -> rectangles[] }.
  const LAYOUTS = {
    '1x1': { maxImages: 1, rects: () => grid(1, 1) },
    '1x2': { maxImages: 2, rects: () => grid(1, 2) },
    '2x1': { maxImages: 2, rects: () => grid(2, 1) },
    '1x3': { maxImages: 3, rects: () => grid(1, 3) },
    '3x1': { maxImages: 3, rects: () => grid(3, 1) },
    '2x2': { maxImages: 4, rects: () => grid(2, 2) },
    '2x3': { maxImages: 6, rects: () => grid(2, 3) },
    '3x2': { maxImages: 6, rects: () => grid(3, 2) },
    '3x3': { maxImages: 9, rects: () => grid(3, 3) }
  };

  /**
   * Pick the best layout for a given number of images. Mirrors the desktop
   * app's "adapt down when fewer images" behaviour so the experience matches.
   */
  function resolveLayout(layoutKey, imageCount) {
    if (layoutKey === 'auto') {
      layoutKey = autoLayoutFor(imageCount);
    }

    let layout = LAYOUTS[layoutKey] || LAYOUTS['1x1'];

    // If the chosen layout needs more images than provided, fall back to a
    // simpler layout that fits exactly, so we never repeat or leave gaps.
    if (imageCount < layout.maxImages) {
      layoutKey = autoLayoutFor(imageCount);
      layout = LAYOUTS[layoutKey] || LAYOUTS['1x1'];
    }

    return { key: layoutKey, layout };
  }

  /** A sensible default grid based purely on image count. */
  function autoLayoutFor(count) {
    switch (Math.max(1, Math.min(9, count))) {
      case 1: return '1x1';
      case 2: return '1x2';
      case 3: return '1x3';
      case 4: return '2x2';
      case 5: return '2x3';
      case 6: return '2x3';
      default: return '3x3';
    }
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

    const { layout } = resolveLayout(opts.layout || 'auto', images.length);
    const rects = layout.rects(images.length);

    const canvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill background (shows through as the delimiter gaps).
    ctx.fillStyle = delimiterColor;
    ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

    const half = delimiterWidth / 2;

    images.forEach((img, index) => {
      const rect = rects[index];
      if (!rect) return;

      // Convert normalized rect -> pixels, then inset by half a delimiter so
      // adjacent tiles leave a full-width gap between them.
      let x = Math.round(rect.x * THUMBNAIL_WIDTH);
      let y = Math.round(rect.y * THUMBNAIL_HEIGHT);
      let w = Math.round(rect.w * THUMBNAIL_WIDTH);
      let h = Math.round(rect.h * THUMBNAIL_HEIGHT);

      const insetLeft = rect.x > 0 ? half : 0;
      const insetTop = rect.y > 0 ? half : 0;
      const insetRight = rect.x + rect.w < 0.999 ? half : 0;
      const insetBottom = rect.y + rect.h < 0.999 ? half : 0;

      x += insetLeft;
      y += insetTop;
      w -= insetLeft + insetRight;
      h -= insetTop + insetBottom;
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
    LAYOUTS,
    resolveLayout,
    compose,
    toBlob
  };
});
