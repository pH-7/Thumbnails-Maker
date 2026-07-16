const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createClassList(element) {
  const tokens = new Set();

  return {
    add: (...items) => items.forEach((item) => tokens.add(item)),
    remove: (...items) => items.forEach((item) => tokens.delete(item)),
    toggle: (item, force) => {
      if (force === true) {
        tokens.add(item);
        return true;
      }
      if (force === false) {
        tokens.delete(item);
        return false;
      }
      if (tokens.has(item)) {
        tokens.delete(item);
        return false;
      }
      tokens.add(item);
      return true;
    },
    contains: (item) => tokens.has(item) || element.className.split(/\s+/).includes(item)
  };
}

function createElement(tagName = 'div') {
  const listeners = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    disabled: false,
    attributes: {},
    parentNode: null,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    insertBefore(child, before) {
      child.parentNode = element;
      const index = element.children.indexOf(before);
      if (index === -1) {
        element.children.push(child);
      } else {
        element.children.splice(index, 0, child);
      }
      return child;
    },
    remove() {
      if (!element.parentNode) return;
      const index = element.parentNode.children.indexOf(element);
      if (index !== -1) element.parentNode.children.splice(index, 1);
      element.parentNode = null;
    },
    querySelectorAll(selector) {
      const classNames = selector
        .split('.')
        .filter(Boolean)
        .map((part) => part.trim());
      const results = [];

      function visit(node) {
        const nodeClasses = new Set((node.className || '').split(/\s+/).filter(Boolean));
        const hasAllClasses = classNames.every(
          (className) => nodeClasses.has(className) || node.classList.contains(className)
        );
        if (hasAllClasses) results.push(node);
        node.children.forEach(visit);
      }

      element.children.forEach(visit);
      return results;
    },
    closest(selector) {
      const className = selector.startsWith('.') ? selector.slice(1) : selector;
      let node = element;
      while (node) {
        if ((node.className || '').split(/\s+/).includes(className) || node.classList.contains(className)) {
          return node;
        }
        node = node.parentNode;
      }
      return null;
    },
    setAttribute(name, value) {
      element.attributes[name] = value;
    },
    getAttribute(name) {
      return element.attributes[name];
    },
    cloneNode() {
      const clone = createElement(tagName);
      clone.className = element.className;
      clone.dataset = { ...element.dataset };
      return clone;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    },
    scrollIntoView: jest.fn(),
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler({ target: element, currentTarget: element, ...event }));
    }
  };
  element.classList = createClassList(element);
  return element;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function loadMobileApp({ permissionResult = { photos: 'granted' } } = {}) {
  const ids = [
    'imagesGrid',
    'addTile',
    'fileInput',
    'cameraInput',
    'layoutChips',
    'delimiter',
    'delimiterValue',
    'delimiterColor',
    'delimiterTilt',
    'delimiterTiltValue',
    'enhance',
    'resultCard',
    'resultImg',
    'status',
    'createBtn',
    'saveBtn',
    'resetBtn'
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, createElement()]));
  elements.imagesGrid.appendChild(elements.addTile);
  elements.delimiter.value = '18';
  elements.delimiterTilt.value = '0';
  elements.delimiterColor.value = '#ffffff';
  elements.enhance.checked = false;

  const photoSaver = {
    requestPermissions: jest.fn().mockResolvedValue(permissionResult),
    saveImage: jest.fn().mockResolvedValue({ saved: true })
  };
  const context = {
    console,
    jest,
    document: {
      body: createElement('body'),
      createElement,
      getElementById: (id) => elements[id],
      elementFromPoint: jest.fn(() => null)
    },
    window: {
      ThumbnailEngine: {
        compose: jest.fn(() => ({})),
        toBlob: jest.fn().mockResolvedValue({ type: 'image/png' })
      },
      Capacitor: {
        getPlatform: jest.fn(() => 'ios'),
        registerPlugin: jest.fn(() => photoSaver)
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    },
    URL: {
      createObjectURL: jest.fn(() => 'blob:thumbnail'),
      revokeObjectURL: jest.fn()
    },
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
        Promise.resolve().then(() => this.onloadend());
      }
    },
    Image: class {
      set src(value) {
        this._src = value;
        Promise.resolve().then(() => this.onload());
      }
    },
    Math,
    Array,
    Number,
    Boolean,
    String,
    Date,
    Promise,
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;

  const source = fs.readFileSync(path.join(__dirname, '../mobile/app.js'), 'utf8');
  vm.runInNewContext(source, context);

  return { context, elements, photoSaver };
}

async function createGeneratedThumbnail(elements) {
  elements.fileInput.files = [{ type: 'image/png' }];
  elements.fileInput.dispatch('change');
  await flushPromises();

  elements.createBtn.dispatch('click');
  await flushPromises();
}

describe('mobile Photos saving', () => {
  test('Take Photo input adds a captured image without bypassing the native picker', async () => {
    const { context, elements } = loadMobileApp();

    elements.cameraInput.files = [{ type: 'image/jpeg' }];
    elements.cameraInput.dispatch('change');
    await flushPromises();

    expect(context.URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }));
    expect(elements.createBtn.disabled).toBe(false);
    expect(elements.cameraInput.value).toBe('');
  });

  test('Save button requests Photos access before saving to the native Photos bridge', async () => {
    const { elements, photoSaver } = loadMobileApp();
    await createGeneratedThumbnail(elements);

    elements.saveBtn.dispatch('click');
    await flushPromises();

    expect(photoSaver.requestPermissions).toHaveBeenCalledTimes(1);
    expect(photoSaver.saveImage).toHaveBeenCalledTimes(1);
    expect(photoSaver.requestPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      photoSaver.saveImage.mock.invocationCallOrder[0]
    );
    expect(photoSaver.saveImage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'ZmFrZS1pbWFnZQ==',
        mimeType: 'image/png'
      })
    );
    expect(elements.status.textContent).toBe('Saved to Photos.');
  });

  test('tapping the generated thumbnail saves through the same Photos path', async () => {
    const { elements, photoSaver } = loadMobileApp();
    await createGeneratedThumbnail(elements);

    elements.resultImg.dispatch('click');
    await flushPromises();

    expect(photoSaver.requestPermissions).toHaveBeenCalledTimes(1);
    expect(photoSaver.saveImage).toHaveBeenCalledTimes(1);
    expect(elements.status.textContent).toBe('Saved to Photos.');
  });

  test('denied Photos access stops before native save and shows a recoverable error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { elements, photoSaver } = loadMobileApp({ permissionResult: { photos: 'denied' } });
    try {
      await createGeneratedThumbnail(elements);

      elements.saveBtn.dispatch('click');
      await flushPromises();

      expect(photoSaver.requestPermissions).toHaveBeenCalledTimes(1);
      expect(photoSaver.saveImage).not.toHaveBeenCalled();
      expect(elements.status.textContent).toBe(
        'Photos access was denied. Please allow Photos access in Settings.'
      );
      expect(elements.saveBtn.disabled).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('iOS privacy metadata', () => {
  test('declares camera usage for the Take Photo capture input', () => {
    const infoPlist = fs.readFileSync(path.join(__dirname, '../ios/App/App/Info.plist'), 'utf8');

    expect(infoPlist).toContain('<key>NSCameraUsageDescription</key>');
    expect(infoPlist).toContain('Take Photo');
  });
});
