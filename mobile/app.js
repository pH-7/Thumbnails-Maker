/**
 * app.js — mobile UI controller.
 *
 * Browser-first UI controller: picks photos via a native file input, composes
 * them with the shared ThumbnailEngine (Canvas), and uses a small Capacitor
 * bridge on iOS to save the generated thumbnail straight to Photos.
 */
(function () {
  'use strict';

  const engine = window.ThumbnailEngine;
  const capacitor = window.Capacitor;

  // Register the native save bridge defensively: a failure here must never
  // abort initialisation (which would leave every control unwired/"frozen").
  let photoSaver = null;
  try {
    if (
      capacitor &&
      typeof capacitor.getPlatform === 'function' &&
      capacitor.getPlatform() === 'ios' &&
      typeof capacitor.registerPlugin === 'function'
    ) {
      photoSaver = capacitor.registerPlugin('PhotoSaver');
    }
  } catch (error) {
    console.error('PhotoSaver plugin registration failed:', error);
    photoSaver = null;
  }

  // Available layouts shown as chips. 'auto' picks a sensible grid by count.
  // Mirrors the desktop (Electron) app so both offer the same frames.
  const LAYOUT_OPTIONS = [
    { key: 'auto', label: 'Auto' },
    { key: '1x2', label: 'Side by side' },
    { key: '2x1', label: 'Stacked' },
    { key: '1x3', label: '3 across' },
    { key: '3x1', label: '3 tall' },
    { key: '2x2', label: '2×2' },
    { key: '2x3', label: '2×3' },
    { key: '3x2', label: '3×2' },
    { key: '3x3', label: '3×3' },
    { key: '1x1', label: 'Single' },
    // Creative YouTube-optimised layouts
    { key: 'hero-side', label: 'Hero + Side' },
    { key: 'corner-grid', label: 'Mosaic' },
    { key: 'banner-split', label: 'Banner Split' },
    { key: 'spotlight', label: 'Spotlight' },
    { key: 'l-shape', label: 'L-Shape' },
    { key: 'triptych', label: 'Triptych' },
    { key: 'trio-hero', label: 'Trio Hero' },
    { key: 'pyramid', label: 'Pyramid' },
    { key: 'filmstrip', label: 'Filmstrip' },
    { key: 'magazine-grid', label: 'Magazine' }
  ];

  const state = {
    images: [], // { id, src, img: HTMLImageElement }
    layout: 'auto',
    delimiterWidth: 18,
    delimiterColor: '#ffffff',
    delimiterTilt: 0,
    enhance: false,
    resultBlob: null,
    isSaving: false
  };

  const el = {
    grid: document.getElementById('imagesGrid'),
    addTile: document.getElementById('addTile'),
    fileInput: document.getElementById('fileInput'),
    cameraInput: document.getElementById('cameraInput'),
    chips: document.getElementById('layoutChips'),
    delimiter: document.getElementById('delimiter'),
    delimiterValue: document.getElementById('delimiterValue'),
    delimiterColor: document.getElementById('delimiterColor'),
    delimiterTilt: document.getElementById('delimiterTilt'),
    delimiterTiltValue: document.getElementById('delimiterTiltValue'),
    enhance: document.getElementById('enhance'),
    resultCard: document.getElementById('resultCard'),
    resultImg: document.getElementById('resultImg'),
    status: document.getElementById('status'),
    createBtn: document.getElementById('createBtn'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn')
  };

  let nextId = 1;

  function setStatus(message) {
    el.status.textContent = message || '';
  }

  function setSavingState(isSaving) {
    state.isSaving = isSaving;
    el.saveBtn.disabled = isSaving || !state.resultBlob;
    el.resultImg.classList.toggle('saving', isSaving);
    el.resultImg.setAttribute('aria-disabled', isSaving ? 'true' : 'false');
  }

  function canSaveFromImageTap() {
    return Boolean(state.resultBlob) && !state.isSaving;
  }

  function hasPhotosWriteAccess(permissionResult) {
    if (!permissionResult || typeof permissionResult !== 'object') {
      return true;
    }

    const status = permissionResult.photos || permissionResult.photoLibrary || permissionResult.status;
    return status === 'granted' || status === 'limited' || status === 'authorized';
  }

  async function requestPhotosWriteAccess() {
    if (!photoSaver || typeof photoSaver.requestPermissions !== 'function') {
      return;
    }

    const permissions = await photoSaver.requestPermissions();
    if (!hasPhotosWriteAccess(permissions)) {
      throw new Error('Photos access was denied. Please allow Photos access in Settings.');
    }
  }

  function blobToBase64Data(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Could not encode image for saving.'));
          return;
        }

        const commaIndex = result.indexOf(',');
        resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(new Error('Could not encode image for saving.'));
      reader.readAsDataURL(blob);
    });
  }

  /** Load a File into an HTMLImageElement, resolving once decoded. */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, src: url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load image'));
      };
      img.src = url;
    });
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    setStatus('Loading photos…');
    for (const file of files) {
      try {
        const { img, src } = await loadImage(file);
        state.images.push({ id: nextId++, img, src });
      } catch (error) {
        console.error(error);
      }
    }
    setStatus('');
    renderImages();
    invalidateResult();
  }

  function removeImage(id) {
    const index = state.images.findIndex((i) => i.id === id);
    if (index === -1) return;
    URL.revokeObjectURL(state.images[index].src);
    state.images.splice(index, 1);
    renderImages();
    invalidateResult();
  }

  function renderImages() {
    // Clear everything except the add tile.
    Array.from(el.grid.querySelectorAll('.thumb')).forEach((n) => n.remove());

    state.images.forEach((item, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      wrap.dataset.id = String(item.id);

      const img = document.createElement('img');
      img.src = item.src;
      img.draggable = false;
      wrap.appendChild(img);

      const order = document.createElement('span');
      order.className = 'order';
      order.textContent = String(index + 1);
      wrap.appendChild(order);

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove photo');
      remove.textContent = '×';
      remove.addEventListener('click', () => removeImage(item.id));
      wrap.appendChild(remove);

      wrap.addEventListener('pointerdown', onThumbPointerDown);

      el.grid.insertBefore(wrap, el.addTile);
    });

    el.createBtn.disabled = state.images.length < 1;
  }

  // --- Drag to reorder (pointer-based, works in iOS WKWebView) -----------------
  const DRAG_THRESHOLD = 6; // px before a press becomes a drag

  const drag = {
    active: false,
    started: false,
    pointerId: null,
    sourceId: null,
    sourceEl: null,
    floating: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    targetId: null
  };

  function indexById(id) {
    return state.images.findIndex((i) => i.id === id);
  }

  function onThumbPointerDown(event) {
    if (drag.active) return;
    if (event.target.closest('.remove')) return; // let delete work
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    drag.active = true;
    drag.started = false;
    drag.pointerId = event.pointerId;
    drag.sourceEl = event.currentTarget;
    drag.sourceId = Number(drag.sourceEl.dataset.id);
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.targetId = null;

    window.addEventListener('pointermove', onDragPointerMove, { passive: false });
    window.addEventListener('pointerup', onDragPointerUp);
    window.addEventListener('pointercancel', onDragPointerUp);
  }

  function beginDrag(event) {
    drag.started = true;

    const rect = drag.sourceEl.getBoundingClientRect();
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;

    const clone = drag.sourceEl.cloneNode(true);
    clone.classList.add('drag-floating');
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    document.body.appendChild(clone);

    drag.floating = clone;
    drag.sourceEl.classList.add('drag-source');
    setStatus('Drag to reorder…');
  }

  function clearDragOver() {
    Array.from(el.grid.querySelectorAll('.thumb.drag-over')).forEach((n) =>
      n.classList.remove('drag-over')
    );
  }

  function onDragPointerMove(event) {
    if (!drag.active) return;

    if (!drag.started) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      beginDrag(event);
    }

    event.preventDefault();

    drag.floating.style.left = `${event.clientX - drag.offsetX}px`;
    drag.floating.style.top = `${event.clientY - drag.offsetY}px`;

    const under = document.elementFromPoint(event.clientX, event.clientY);
    const targetWrap = under && under.closest('.thumb');

    clearDragOver();
    if (targetWrap && targetWrap.dataset.id) {
      const targetId = Number(targetWrap.dataset.id);
      drag.targetId = targetId;
      if (targetId !== drag.sourceId) targetWrap.classList.add('drag-over');
    } else {
      drag.targetId = null;
    }
  }

  function onDragPointerUp() {
    window.removeEventListener('pointermove', onDragPointerMove);
    window.removeEventListener('pointerup', onDragPointerUp);
    window.removeEventListener('pointercancel', onDragPointerUp);

    const didDrag = drag.started;
    const sourceId = drag.sourceId;
    const targetId = drag.targetId;

    if (drag.floating) drag.floating.remove();
    if (drag.sourceEl) drag.sourceEl.classList.remove('drag-source');
    clearDragOver();

    drag.active = false;
    drag.started = false;
    drag.pointerId = null;
    drag.sourceEl = null;
    drag.sourceId = null;
    drag.targetId = null;
    drag.floating = null;

    if (didDrag) {
      setStatus('');
      if (targetId != null && targetId !== sourceId) {
        reorderImages(sourceId, targetId);
      }
    }
  }

  function reorderImages(sourceId, targetId) {
    const from = indexById(sourceId);
    const to = indexById(targetId);
    if (from === -1 || to === -1 || from === to) return;

    const [moved] = state.images.splice(from, 1);
    const newTo = indexById(targetId);
    const insertAt = from < to ? newTo + 1 : newTo;
    state.images.splice(insertAt, 0, moved);

    renderImages();
    invalidateResult();
  }

  function renderChips() {
    LAYOUT_OPTIONS.forEach((opt) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (opt.key === state.layout ? ' active' : '');
      chip.type = 'button';
      chip.textContent = opt.label;
      chip.dataset.key = opt.key;
      chip.addEventListener('click', () => {
        state.layout = opt.key;
        Array.from(el.chips.children).forEach((c) =>
          c.classList.toggle('active', c.dataset.key === opt.key)
        );
        invalidateResult();
      });
      el.chips.appendChild(chip);
    });
  }

  function invalidateResult() {
    state.resultBlob = null;
    setSavingState(false);
    el.resultCard.style.display = 'none';
    el.saveBtn.classList.add('hidden');
    el.createBtn.classList.remove('hidden');
  }

  async function createThumbnail() {
    if (state.images.length < 1) return;
    setStatus('Creating thumbnail…');
    el.createBtn.disabled = true;

    try {
      const canvas = engine.compose({
        images: state.images.map((i) => i.img),
        layout: state.layout,
        delimiterWidth: state.delimiterWidth,
        delimiterColor: state.delimiterColor,
        delimiterTilt: state.delimiterTilt,
        enhance: state.enhance
      });

      const blob = await engine.toBlob(canvas, 'image/png');
      state.resultBlob = blob;

      if (el.resultImg.dataset.url) URL.revokeObjectURL(el.resultImg.dataset.url);
      const url = URL.createObjectURL(blob);
      el.resultImg.dataset.url = url;
      el.resultImg.src = url;

      el.resultCard.style.display = 'block';
      el.createBtn.classList.add('hidden');
      el.saveBtn.classList.remove('hidden');
      setSavingState(false);
      setStatus('Ready! Tap the image or Save to add it to Photos.');
      el.resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Something went wrong.');
    } finally {
      el.createBtn.disabled = state.images.length < 1;
    }
  }

  async function saveThumbnail() {
    if (!state.resultBlob || state.isSaving) return;

    const fileName = `thumbnail-${Date.now()}.png`;
    setSavingState(true);
    setStatus('Saving to Photos…');

    if (photoSaver) {
      try {
        await requestPhotosWriteAccess();
        const base64Data = await blobToBase64Data(state.resultBlob);
        await photoSaver.saveImage({
          data: base64Data,
          fileName,
          mimeType: 'image/png'
        });
        setStatus('Saved to Photos.');
        return;
      } catch (error) {
        console.error(error);
        setStatus(error && error.message ? error.message : 'Could not save the image.');
        return;
      } finally {
        setSavingState(false);
      }
    }

    try {
      const file = new File([state.resultBlob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'YouTube Thumbnail' });
        setStatus('Saved / shared.');
        return;
      }

      const url = URL.createObjectURL(state.resultBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Downloaded.');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus('Save cancelled.');
        return;
      }
      console.error(error);
      setStatus('Could not save the image.');
    } finally {
      setSavingState(false);
    }
  }

  function reset() {
    state.images.forEach((i) => URL.revokeObjectURL(i.src));
    state.images = [];
    state.resultBlob = null;
    renderImages();
    invalidateResult();
    setStatus('');
  }

  // --- Wire up events ---------------------------------------------------------
  // The "Add photos" tile is a <label for="fileInput">, so tapping it opens the
  // native picker directly — this is the only reliable way on iOS WKWebView.
  // (A synthetic fileInput.click() on a display:none input is ignored there.)
  el.fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    el.fileInput.value = ''; // allow re-picking the same file
  });

  el.cameraInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    el.cameraInput.value = ''; // allow taking another photo immediately
  });

  el.delimiter.addEventListener('input', (e) => {
    state.delimiterWidth = Number(e.target.value);
    el.delimiterValue.textContent = `${state.delimiterWidth}px`;
    invalidateResult();
  });

  el.delimiterColor.addEventListener('input', (e) => {
    state.delimiterColor = e.target.value;
    invalidateResult();
  });

  el.delimiterTilt.addEventListener('input', (e) => {
    state.delimiterTilt = Number(e.target.value) || 0;
    el.delimiterTiltValue.textContent = `${state.delimiterTilt}°`;
    invalidateResult();
  });

  el.enhance.addEventListener('change', (e) => {
    state.enhance = e.target.checked;
    invalidateResult();
  });

  el.createBtn.addEventListener('click', createThumbnail);
  el.saveBtn.addEventListener('click', saveThumbnail);
  el.resultImg.addEventListener('click', saveThumbnail);
  el.resultImg.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      saveThumbnail();
    }
  });
  el.resetBtn.addEventListener('click', reset);

  renderChips();
  renderImages();
})();
