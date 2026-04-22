function loadMainModule({ mas = false } = {}) {
  jest.resetModules();

  const windowInstance = {
    loadFile: jest.fn(),
    on: jest.fn(),
  };

  const handlers = new Map();
  const appEvents = new Map();

  const electronMock = {
    app: {
      commandLine: {
        appendSwitch: jest.fn(),
      },
      whenReady: jest.fn().mockResolvedValue(undefined),
      on: jest.fn((eventName, callback) => {
        appEvents.set(eventName, callback);
      }),
      setLoginItemSettings: jest.fn(),
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
  };

  jest.doMock('electron', () => electronMock);

  const previousMas = process.mas;
  Object.defineProperty(process, 'mas', {
    configurable: true,
    value: mas,
  });

  require('../main');

  return {
    electronMock,
    windowInstance,
    handlers,
    appEvents,
    restore() {
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
    expect(ctx.windowInstance.loadFile).toHaveBeenCalledWith('index.html');
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
});
