function loadMainModule({ mas = false } = {}) {
  jest.resetModules();
  const existingUncaughtListeners = new Set(process.listeners('uncaughtException'));
  const existingRejectionListeners = new Set(process.listeners('unhandledRejection'));

  const windowInstance = {
    loadFile: jest.fn(),
    on: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    isMinimized: jest.fn().mockReturnValue(false),
    restore: jest.fn(),
    show: jest.fn(),
    focus: jest.fn(),
  };

  const handlers = new Map();
  const appEvents = new Map();
  let menuTemplate = null;

  const electronMock = {
    app: {
      commandLine: {
        appendSwitch: jest.fn(),
      },
      whenReady: jest.fn().mockResolvedValue(undefined),
      setName: jest.fn(),
      setAboutPanelOptions: jest.fn(),
      on: jest.fn((eventName, callback) => {
        appEvents.set(eventName, callback);
      }),
      quit: jest.fn(),
    },
    BrowserWindow: jest.fn(() => windowInstance),
    ipcMain: {
      handle: jest.fn((channel, callback) => {
        handlers.set(channel, callback);
      }),
      on: jest.fn(),
    },
    dialog: {
      showOpenDialog: jest.fn(),
      showSaveDialog: jest.fn(),
    },
    shell: {
      openExternal: jest.fn(),
    },
    Menu: {
      buildFromTemplate: jest.fn((template) => {
        menuTemplate = template;
        return { template };
      }),
      setApplicationMenu: jest.fn(),
    },
  };

  jest.doMock('electron', () => electronMock);

  const previousMas = process.mas;
  Object.defineProperty(process, 'mas', {
    configurable: true,
    value: mas,
  });

  const mainModule = require('../main');

  return {
    mainModule,
    electronMock,
    windowInstance,
    handlers,
    appEvents,
    get menuTemplate() {
      return menuTemplate;
    },
    restore() {
      process.listeners('uncaughtException')
        .filter((listener) => !existingUncaughtListeners.has(listener))
        .forEach((listener) => process.removeListener('uncaughtException', listener));
      process.listeners('unhandledRejection')
        .filter((listener) => !existingRejectionListeners.has(listener))
        .forEach((listener) => process.removeListener('unhandledRejection', listener));
      Object.defineProperty(process, 'mas', {
        configurable: true,
        value: previousMas,
      });
    },
  };
}

describe('Main process bootstrap', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('applies MAS js flags on startup for App Store builds', async () => {
    const ctx = loadMainModule({ mas: true });

    await Promise.resolve();

    expect(ctx.electronMock.app.commandLine.appendSwitch).toHaveBeenCalledWith(
      'js-flags',
      '--jitless --no-expose-wasm'
    );
    ctx.restore();
  });

  test('creates BrowserWindow once app is ready', async () => {
    const ctx = loadMainModule({ mas: false });

    await Promise.resolve();

    expect(ctx.electronMock.BrowserWindow).toHaveBeenCalledTimes(1);
    expect(ctx.electronMock.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Video Thumbnail Maker' })
    );
    expect(ctx.windowInstance.loadFile).toHaveBeenCalledWith('index.html');
    expect(ctx.electronMock.app.setName).toHaveBeenCalledWith('Video Thumbnail Maker');
    expect(ctx.electronMock.app.setAboutPanelOptions).toHaveBeenCalledWith({
      applicationName: 'Video Thumbnail Maker',
    });
    ctx.restore();
  });

  test('installs a Window menu that recreates the closed main window', async () => {
    const ctx = loadMainModule({ mas: false });

    await Promise.resolve();

    const windowMenu = ctx.menuTemplate.find((item) => item.label === 'Window');
    const mainWindowItem = windowMenu.submenu.find((item) => item.label === 'Main Window');
    const closedListener = ctx.windowInstance.on.mock.calls.find(([event]) => event === 'closed')[1];

    expect(mainWindowItem.accelerator).toBe('CmdOrCtrl+0');
    closedListener();
    mainWindowItem.click();

    expect(ctx.electronMock.BrowserWindow).toHaveBeenCalledTimes(2);
    ctx.restore();
  });

  test('Dock activation restores and focuses the existing main window', async () => {
    const ctx = loadMainModule({ mas: false });

    await Promise.resolve();
    ctx.windowInstance.isMinimized.mockReturnValue(true);
    ctx.appEvents.get('activate')();

    expect(ctx.windowInstance.restore).toHaveBeenCalledTimes(1);
    expect(ctx.windowInstance.show).toHaveBeenCalledTimes(1);
    expect(ctx.windowInstance.focus).toHaveBeenCalledTimes(1);
    ctx.restore();
  });

  test('registers critical ipc handlers', () => {
    const ctx = loadMainModule({ mas: false });

    expect(ctx.handlers.has('select-images')).toBe(true);
    expect(ctx.handlers.has('select-single-image')).toBe(true);
    expect(ctx.handlers.has('create-thumbnail')).toBe(true);
    ctx.restore();
  });

  test('select-images returns selected paths', async () => {
    const ctx = loadMainModule({ mas: false });
    const handler = ctx.handlers.get('select-images');

    ctx.electronMock.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/a.jpg', '/tmp/b.png'],
    });

    await expect(handler()).resolves.toEqual(['/tmp/a.jpg', '/tmp/b.png']);
    ctx.restore();
  });

  test('select-images returns empty array on cancel', async () => {
    const ctx = loadMainModule({ mas: false });
    const handler = ctx.handlers.get('select-images');

    ctx.electronMock.dialog.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    await expect(handler()).resolves.toEqual([]);
    ctx.restore();
  });

  test('select-single-image returns first selected path', async () => {
    const ctx = loadMainModule({ mas: false });
    const handler = ctx.handlers.get('select-single-image');

    ctx.electronMock.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/one.webp'],
    });

    await expect(handler()).resolves.toBe('/tmp/one.webp');
    ctx.restore();
  });

  test('select-single-image returns null on cancel', async () => {
    const ctx = loadMainModule({ mas: false });
    const handler = ctx.handlers.get('select-single-image');

    ctx.electronMock.dialog.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    await expect(handler()).resolves.toBeNull();
    ctx.restore();
  });

  test('uses the resolved three-photo layout geometry', () => {
    const ctx = loadMainModule({ mas: false });
    const resolved = ctx.mainModule.resolveLayoutSelection('hero-side', ['a', 'b', 'c']);

    expect(resolved.gridLayout).toBe('triptych');
    expect(resolved.layout.layout).toBe('triptych');
    expect(resolved.selectedImages).toEqual(['a', 'b', 'c']);
    ctx.restore();
  });

  test('sanitizes output names before joining them to the output directory', () => {
    const ctx = loadMainModule({ mas: false });

    expect(ctx.mainModule.sanitizeOutputName('../unsafe/name', 'fallback')).toBe('unsafe-name');
    expect(ctx.mainModule.sanitizeOutputName('nested\\name:*?', 'fallback')).toBe('nested-name');
    expect(ctx.mainModule.sanitizeOutputName('...', 'fallback')).toBe('fallback');
    ctx.restore();
  });

  test('limits concurrent image work while preserving result order', async () => {
    const ctx = loadMainModule({ mas: false });
    let active = 0;
    let maxActive = 0;

    const results = await ctx.mainModule.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxActive).toBe(2);
    ctx.restore();
  });

  test('auto enhance uses Sharp percentile ranges without falling back', async () => {
    const ctx = loadMainModule({ mas: false });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#3273dc"/></svg>'
    );

    const enhanced = await ctx.mainModule.enhanceImage(source, { enhanceLevel: 'medium' });
    const output = await enhanced.png().toBuffer();

    expect(output.length).toBeGreaterThan(0);
    expect(errorSpy).not.toHaveBeenCalledWith('Error in enhanceImage:', expect.anything());
    ctx.restore();
  });
});
