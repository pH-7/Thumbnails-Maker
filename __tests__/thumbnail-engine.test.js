const engine = require('../mobile/thumbnail-engine');

describe('mobile thumbnail engine layout parity', () => {
  test('cycles 4+ photos into empty desktop layout frames', () => {
    const resolved = engine.resolveLayout('2x3', 5);
    const images = ['a', 'b', 'c', 'd', 'e'];

    expect(resolved.key).toBe('2x3');
    expect(resolved.count).toBe(6);
    expect(resolved.cycleImages).toBe(true);
    expect(engine.selectImagesForLayout(images, resolved)).toEqual(['a', 'b', 'c', 'd', 'e', 'a']);
  });

  test('uses desktop three-photo fallback for custom layouts', () => {
    const resolved = engine.resolveLayout('hero-side', 3);

    expect(resolved.key).toBe('triptych');
    expect(resolved.count).toBe(3);
    expect(resolved.cycleImages).toBe(false);
  });

  test('keeps exact three-photo custom layouts when desktop does', () => {
    const resolved = engine.resolveLayout('banner-split', 3);

    expect(resolved.key).toBe('banner-split');
    expect(resolved.count).toBe(3);
    expect(resolved.cycleImages).toBe(false);
  });

  test('keeps visible standard grid frame geometry', () => {
    expect(
      engine.calculateGridPositions(
        { rows: 1, cols: 2 },
        2,
        engine.THUMBNAIL_WIDTH,
        engine.THUMBNAIL_HEIGHT,
        9
      )
    ).toEqual([
      { left: 9, top: 9, width: 622, height: 702 },
      { left: 649, top: 9, width: 622, height: 702 }
    ]);
  });

  test('passes delimiter tilt through standard grid composition', () => {
    const calls = [];
    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillStyle: null,
      filter: 'none',
      save: jest.fn(() => calls.push(['save'])),
      restore: jest.fn(() => calls.push(['restore'])),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(),
      fillRect: jest.fn((...args) => calls.push(['fillRect', ...args])),
      drawImage: jest.fn(),
      translate: jest.fn((...args) => calls.push(['translate', ...args])),
      rotate: jest.fn((angle) => calls.push(['rotate', angle]))
    };
    const previousDocument = global.document;
    global.document = {
      createElement: jest.fn(() => ({
        width: 0,
        height: 0,
        getContext: jest.fn(() => context)
      }))
    };

    try {
      engine.compose({
        images: [
          { width: 640, height: 360 },
          { width: 640, height: 360 }
        ],
        layout: '1x2',
        delimiterWidth: 18,
        delimiterColor: '#ffffff',
        delimiterTilt: 12
      });
    } finally {
      global.document = previousDocument;
    }

    const rotateCall = calls.find((call) => call[0] === 'rotate');
    expect(rotateCall[1]).toBeCloseTo((-12 * Math.PI) / 180);
  });
});
