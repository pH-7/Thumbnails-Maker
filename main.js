const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            webSecurity: true
        },
        title: 'YouTube Thumbnail Creator'
    });

    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => mainWindow = null);
}

// Disable login item features for Mac App Store
app.whenReady().then(() => {
    // Disable automatic login items
    if (process.platform === 'darwin') {
        app.setLoginItemSettings({
            openAtLogin: false,
            openAsHidden: false
        });
    }
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

// Handle image selection
ipcMain.handle('select-images', async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
        });

        console.log('Dialog result:', result);

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths;
        }
        return [];
    } catch (error) {
        console.error('Error in select-images:', error);
        throw error;
    }
});

// Handle invidual image selection
ipcMain.handle('select-single-image', async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    } catch (error) {
        console.error('Error in select-single-image:', error);
        throw error;
    }
});

// Apply intelligent auto-enhance to image
async function enhanceImage(buffer, enhanceOptions) {
    if (!sharp) {
        throw new Error('Image processing module is not available');
    }

    try {
        // Create a new Sharp instance
        let processedImage = sharp(buffer);

        // Get image metadata and statistics
        const metadata = await processedImage.metadata();
        const stats = await processedImage.stats();

        // Analyze image characteristics
        const analysis = await analyzeImage(stats, metadata);

        // Calculate adaptive enhancement parameters with more vibrant settings
        const adaptiveParams = calculateEnhancementParams(analysis, enhanceOptions);

        // For thumbnails, we want more vibrant, eye-catching images
        adaptiveParams.saturation = Math.min(adaptiveParams.saturation * 1.2, 1.8); // Boost saturation
        adaptiveParams.contrast.multiply = Math.min(adaptiveParams.contrast.multiply * 1.15, 1.3); // Boost contrast

        // Apply the enhancements in optimal order
        processedImage = processedImage
            .rotate() // Auto-rotate based on EXIF

            // 1. Normalize colors and exposure
            .normalise({
                lower: adaptiveParams.normalise.lower,
                upper: adaptiveParams.normalise.upper
            })

            // 2. Apply white balance correction if needed
            .modulate({
                brightness: adaptiveParams.brightness,
                saturation: adaptiveParams.saturation,
                hue: adaptiveParams.whiteBalance
            })

            // 3. Apply gamma correction for better midtones
            .gamma(adaptiveParams.gamma)

            // 4. Fine-tune contrast
            .linear(
                adaptiveParams.contrast.multiply,
                adaptiveParams.contrast.offset
            )

            // 5. Apply intelligent sharpening with higher values for thumbnails
            .sharpen({
                sigma: adaptiveParams.sharpen.sigma,
                m1: adaptiveParams.sharpen.m1 * 1.2, // Increase flat areas sharpness
                m2: adaptiveParams.sharpen.m2 * 1.1, // Slightly increase jagged areas
                x1: adaptiveParams.sharpen.x1,
                y2: adaptiveParams.sharpen.y2
            })

            // 6. Apply a subtle vignette effect to draw attention to the center
            .convolve({
                width: 3,
                height: 3,
                kernel: [1, 1, 1, 1, 1.1, 1, 1, 1, 1],
                scale: 1,
                offset: 0
            })

            // 7. Ensure proper color handling
            .removeAlpha()
            .ensureAlpha(1.0);

        return processedImage;
    } catch (error) {
        console.error('Error in enhanceImage:', error);
        // If enhancement fails, return original image
        return sharp(buffer);
    }
}

// Analyze image characteristics
async function analyzeImage(stats, metadata) {
    // Calculate brightness levels using new channels array structure
    const channels = stats.channels || [];
    if (channels.length < 3) {
        throw new Error('Invalid image statistics - insufficient channels');
    }

    const meanBrightness = channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
    const maxBrightness = Math.max(...channels.slice(0, 3).map(c => c.max));
    const minBrightness = Math.min(...channels.slice(0, 3).map(c => c.min));

    // Calculate contrast
    const stdDev = channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;

    // Detect color cast
    const channelMeans = channels.slice(0, 3).map(c => c.mean);
    const meanDifferences = channelMeans.map(mean => Math.abs(mean - meanBrightness));
    const colorCast = Math.max(...meanDifferences) > 0.1;

    // Calculate saturation
    const saturationLevel = calculateSaturation(stats);

    // Detect if image is underexposed or overexposed
    const isUnderexposed = meanBrightness < 0.3;
    const isOverexposed = meanBrightness > 0.7;

    // Calculate dynamic range
    const dynamicRange = maxBrightness - minBrightness;

    return {
        meanBrightness,
        maxBrightness,
        minBrightness,
        contrast: stdDev,
        colorCast,
        saturationLevel,
        isUnderexposed,
        isOverexposed,
        dynamicRange,
        metadata
    };
}

// Calculate saturation from RGB values
function calculateSaturation(stats) {
    const channels = stats.channels || [];
    if (channels.length < 3) {
        return 0;
    }

    const r = channels[0].mean;
    const g = channels[1].mean;
    const b = channels[2].mean;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
}

// Calculate enhancement parameters based on image analysis
function calculateEnhancementParams(analysis, baseOptions) {
    // Get base enhancement options
    const enhanceLevel = baseOptions.enhanceLevel || 'medium';

    // Set intensity multiplier based on enhance level
    let intensityMultiplier;
    switch (enhanceLevel) {
        case 'none':
            intensityMultiplier = 0;
            break;
        case 'light':
            intensityMultiplier = 0.7;
            break;
        case 'medium':
            intensityMultiplier = 1.0;
            break;
        case 'high':
            intensityMultiplier = 1.3;
            break;
        default:
            intensityMultiplier = 1.0;
    }

    // For thumbnails, boost certain parameters for a more eye-catching look
    const thumbnailMultiplier = 1.2; // Additional boost for thumbnail creation

    // Use intelligent adaptation based on image characteristics
    const isUnderexposed = analysis.meanBrightness < 0.4;
    const isOverexposed = analysis.meanBrightness > 0.7;
    const isLowContrast = analysis.contrast < 0.3;
    const isLowSaturation = analysis.saturationLevel < 0.25;
    const isDesaturated = analysis.saturationLevel < 0.15;

    // Construct parameters with intelligent, adaptive adjustments
    return {
        // Enhance normalization to improve dynamic range
        normalise: {
            lower: isUnderexposed ? 0.01 : 0.03,
            upper: isOverexposed ? 0.98 : 0.97
        },

        // Boost brightness for underexposed images
        brightness: isUnderexposed
            ? 1 + (0.2 * intensityMultiplier * thumbnailMultiplier)
            : isOverexposed
                ? 1 - (0.1 * intensityMultiplier)
                : 1 + (0.05 * intensityMultiplier),

        // Enhance saturation more aggressively for thumbnails
        saturation: isLowSaturation
            ? 1 + (0.5 * intensityMultiplier * thumbnailMultiplier)
            : isDesaturated
                ? 1 + (0.7 * intensityMultiplier * thumbnailMultiplier)
                : 1 + (0.2 * intensityMultiplier * thumbnailMultiplier),

        // Apply white balance correction
        whiteBalance: analysis.colorCast ? calculateWhiteBalance(analysis) : 0,

        // Adjust gamma for better midtones
        gamma: isUnderexposed
            ? 0.9 - (0.1 * intensityMultiplier)
            : 1.1 + (0.1 * intensityMultiplier),

        // Boost contrast for more visual pop in thumbnails
        contrast: {
            multiply: isLowContrast
                ? 1 + (0.25 * intensityMultiplier * thumbnailMultiplier)
                : 1 + (0.15 * intensityMultiplier * thumbnailMultiplier),
            offset: isUnderexposed
                ? 0.02 * intensityMultiplier
                : isOverexposed
                    ? -0.02 * intensityMultiplier
                    : 0
        },

        // Apply adaptive sharpening based on image characteristics
        sharpen: calculateAdaptiveSharpening(analysis, intensityMultiplier * thumbnailMultiplier)
    };
}

// Calculate white balance adjustment
function calculateWhiteBalance(analysis) {
    const stats = analysis.stats || analysis;  // Handle different call patterns
    const channels = stats.channels || [];
    if (channels.length < 3) {
        return 0;
    }

    const targetMean = (channels[0].mean + channels[1].mean + channels[2].mean) / 3;
    const rOffset = channels[0].mean - targetMean;
    const bOffset = channels[2].mean - targetMean;

    // Calculate hue adjustment (in degrees)
    return Math.atan2(bOffset, rOffset) * (180 / Math.PI);
}

// Calculate adaptive sharpening parameters
function calculateAdaptiveSharpening(analysis, intensity) {
    // Base sharpening parameters
    const baseParams = {
        sigma: 0.8,
        m1: 1.0,
        m2: 2.0,
        x1: 2.0,
        y2: 10.0
    };

    // Adjust based on image characteristics
    if (analysis.contrast < 0.15) {
        // Low contrast images need more careful sharpening
        return {
            sigma: baseParams.sigma * (1 + 0.3 * intensity),
            m1: baseParams.m1 * (1 - 0.2 * intensity),
            m2: baseParams.m2 * (1 - 0.1 * intensity),
            x1: baseParams.x1 * (1 + 0.2 * intensity),
            y2: baseParams.y2 * (1 - 0.2 * intensity)
        };
    } else if (analysis.meanBrightness < 0.3) {
        // Dark images need different sharpening to avoid noise
        return {
            sigma: baseParams.sigma * (1 - 0.2 * intensity),
            m1: baseParams.m1 * (1 - 0.3 * intensity),
            m2: baseParams.m2,
            x1: baseParams.x1 * (1 + 0.3 * intensity),
            y2: baseParams.y2 * (1 - 0.1 * intensity)
        };
    } else {
        // Standard sharpening for well-exposed images
        return {
            sigma: baseParams.sigma * (1 + 0.2 * intensity),
            m1: baseParams.m1 * (1 + 0.1 * intensity),
            m2: baseParams.m2,
            x1: baseParams.x1,
            y2: baseParams.y2 * (1 + 0.1 * intensity)
        };
    }
}

// Enhanced grid layout configurations with innovative YouTube layouts
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

    // Creative YouTube-optimized layouts
    'hero-side': {
        type: 'custom',
        maxImages: 4,
        layout: 'hero-side',
        description: 'Large hero image with smaller side images'
    },
    'corner-grid': {
        type: 'custom',
        maxImages: 5,
        layout: 'corner-grid',
        description: 'Main center image with corner elements'
    },
    'banner-split': {
        type: 'custom',
        maxImages: 3,
        layout: 'banner-split',
        description: 'Wide banner with split content below'
    },
    'spotlight': {
        type: 'custom',
        maxImages: 4,
        layout: 'spotlight',
        description: 'Center spotlight with surrounding elements'
    },
    'l-shape': {
        type: 'custom',
        maxImages: 5,
        layout: 'l-shape',
        description: 'L-shaped dynamic arrangement'
    }
};

// Standard YouTube thumbnail dimensions
const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

// Enhanced image analysis for smart layout detection
async function analyzeImageForLayout(imagePath) {
    try {
        const imageBuffer = await fs.promises.readFile(imagePath);
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        const stats = await image.stats();

        // Calculate aspect ratio
        const aspectRatio = metadata.width / metadata.height;

        // Calculate image complexity using entropy
        const grayscaleBuffer = await image
            .grayscale()
            .raw()
            .toBuffer();

        const entropy = calculateEntropy(grayscaleBuffer);

        // Calculate color variance
        const colorVariance = calculateColorVariance(stats);

        // Determine if image has prominent subject (using edge detection approximation)
        const hasProminentSubject = await detectProminentSubject(image);

        // Calculate visual weight (combination of contrast and saturation)
        const visualWeight = calculateVisualWeight(stats);

        return {
            path: imagePath,
            aspectRatio,
            width: metadata.width,
            height: metadata.height,
            entropy,
            colorVariance,
            hasProminentSubject,
            visualWeight,
            isPortrait: aspectRatio < 0.9,
            isLandscape: aspectRatio > 1.1,
            isSquare: aspectRatio >= 0.9 && aspectRatio <= 1.1
        };
    } catch (error) {
        console.error(`Error analyzing image ${imagePath}:`, error);
        return null;
    }
}

// Calculate entropy for image complexity
function calculateEntropy(buffer) {
    const histogram = new Array(256).fill(0);

    for (let i = 0; i < buffer.length; i++) {
        histogram[buffer[i]]++;
    }

    let entropy = 0;
    const totalPixels = buffer.length;

    for (let i = 0; i < 256; i++) {
        if (histogram[i] > 0) {
            const probability = histogram[i] / totalPixels;
            entropy -= probability * Math.log2(probability);
        }
    }

    return entropy;
}

// Calculate color variance for vibrancy assessment
function calculateColorVariance(stats) {
    const channels = stats.channels || [];
    if (channels.length < 3) {
        return 0;
    }

    let totalVariance = 0;

    channels.slice(0, 3).forEach(channel => {
        totalVariance += Math.pow(channel.stdev, 2);
    });

    return totalVariance / 3;
}

// Detect if image has a prominent subject
async function detectProminentSubject(image) {
    try {
        // Use edge detection to find areas of interest
        const edgeBuffer = await image
            .resize(200, 200, { fit: 'inside' })
            .greyscale()
            .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
            })
            .raw()
            .toBuffer();

        // Calculate edge density in center vs edges
        const centerEdges = calculateRegionEdges(edgeBuffer, 200, 200, 0.25, 0.75);
        const edgeRegionEdges = calculateRegionEdges(edgeBuffer, 200, 200, 0, 1) - centerEdges;

        return centerEdges > edgeRegionEdges * 1.5;
    } catch (error) {
        return false;
    }
}

// Calculate edge density in a region
function calculateRegionEdges(buffer, width, height, startRatio, endRatio) {
    const startX = Math.floor(width * startRatio);
    const endX = Math.floor(width * endRatio);
    const startY = Math.floor(height * startRatio);
    const endY = Math.floor(height * endRatio);

    let edgeCount = 0;
    let totalPixels = 0;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = y * width + x;
            if (buffer[index] > 50) edgeCount++; // Threshold for edge detection
            totalPixels++;
        }
    }

    return totalPixels > 0 ? edgeCount / totalPixels : 0;
}

// Calculate visual weight of an image
function calculateVisualWeight(stats) {
    const channels = stats.channels || [];
    if (channels.length < 3) {
        return 0;
    }

    let totalContrast = 0;
    let totalSaturation = 0;

    channels.slice(0, 3).forEach(channel => {
        totalContrast += channel.stdev;
        totalSaturation += channel.max - channel.min;
    });

    return (totalContrast + totalSaturation) / (3 * 2);
}

// Smart layout determination based on enhanced image analysis
// Prioritize true side-by-side layouts (1x2) for 2 images in Auto Smart mode
async function determineOptimalLayout(imagePaths) {
    try {
        if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
            return { recommendedLayout: '1x3', confidence: 0 };
        }

        // Analyze all images
        const analyses = await Promise.all(
            imagePaths.map(path => analyzeImageForLayout(path))
        );

        const validAnalyses = analyses.filter(analysis => analysis !== null);

        if (validAnalyses.length === 0) {
            return { recommendedLayout: '1x3', confidence: 0 };
        }

        const imageCount = validAnalyses.length;

        // Calculate aggregate metrics
        const avgAspectRatio = validAnalyses.reduce((sum, img) => sum + img.aspectRatio, 0) / imageCount;
        const aspectRatioVariance = calculateVariance(validAnalyses.map(img => img.aspectRatio));
        const avgEntropy = validAnalyses.reduce((sum, img) => sum + img.entropy, 0) / imageCount;
        const avgVisualWeight = validAnalyses.reduce((sum, img) => sum + img.visualWeight, 0) / imageCount;

        // Count orientation types
        const portraitCount = validAnalyses.filter(img => img.isPortrait).length;
        const landscapeCount = validAnalyses.filter(img => img.isLandscape).length;
        const squareCount = validAnalyses.filter(img => img.isSquare).length;
        const prominentSubjectCount = validAnalyses.filter(img => img.hasProminentSubject).length;

        let recommendedLayout;
        let confidence = 0;

        // Smart layout decision algorithm
        if (imageCount === 1) {
            recommendedLayout = '1x1';
            confidence = 1.0;
        } else if (imageCount === 2) {
            // Always prioritize side-by-side (1x2) for 2 images in Auto Smart mode
            // This creates proper side-by-side positioning, not a strip
            recommendedLayout = '1x2'; // Side by side layout - 2 images with equal width
            confidence = 0.9;

            // Only use vertical stacking (2x1) for very specific cases
            if (landscapeCount === 2 && avgVisualWeight > 120 && avgAspectRatio > 2.0) {
                recommendedLayout = '2x1'; // Vertical stack for very wide, complex landscapes
                confidence = 0.8;
            }
        } else if (imageCount === 3) {
            if (portraitCount >= 2) {
                recommendedLayout = '1x3'; // Horizontal strip for portraits
                confidence = 0.85;
            } else if (aspectRatioVariance > 0.5) {
                recommendedLayout = '3x1'; // Vertical stack for varied aspects
                confidence = 0.8;
            } else {
                recommendedLayout = '1x3'; // Default horizontal
                confidence = 0.75;
            }
        } else if (imageCount === 4) {
            if (squareCount >= 2 || (avgAspectRatio >= 0.8 && avgAspectRatio <= 1.2)) {
                recommendedLayout = '2x2'; // Grid for square-ish images
                confidence = 0.9;
            } else if (portraitCount >= 3) {
                recommendedLayout = '1x3'; // Horizontal strip (use available layout)
                confidence = 0.8;
            } else {
                recommendedLayout = '2x2'; // Default grid
                confidence = 0.7;
            }
        } else if (imageCount <= 6) {
            if (prominentSubjectCount >= imageCount * 0.6) {
                recommendedLayout = '2x3'; // Grid for subject-focused images
                confidence = 0.8;
            } else if (aspectRatioVariance > 0.5) {
                recommendedLayout = '3x2'; // Alternative grid for varied content
                confidence = 0.75;
            } else {
                recommendedLayout = '2x3'; // Default for 5-6 images
                confidence = 0.7;
            }
        } else {
            // For more than 6 images, use the largest available grid
            recommendedLayout = '3x2';
            confidence = 0.6;
        }

        // Apply confidence boost for high-quality analysis
        if (avgEntropy > 6.5 && avgVisualWeight > 80) {
            confidence = Math.min(confidence + 0.1, 1.0);
        }

        // Consider innovative layouts for higher engagement potential
        if (imageCount >= 3 && confidence < 0.9) {
            let innovativeRecommendation = null;
            let innovativeConfidence = 0;

            if (imageCount === 3 && prominentSubjectCount >= 1) {
                // Banner-split is great for storytelling with 3 images
                innovativeRecommendation = 'banner-split';
                innovativeConfidence = 0.85;
            } else if (imageCount === 4 && prominentSubjectCount >= 2) {
                // Hero-side or spotlight for 4 images with prominent subjects
                if (avgAspectRatio > 1.2) {
                    innovativeRecommendation = 'hero-side';
                    innovativeConfidence = 0.9;
                } else {
                    innovativeRecommendation = 'spotlight';
                    innovativeConfidence = 0.85;
                }
            } else if (imageCount === 5) {
                // Corner-grid or L-shape for 5 images
                if (aspectRatioVariance < 0.3) {
                    innovativeRecommendation = 'corner-grid';
                    innovativeConfidence = 0.8;
                } else {
                    innovativeRecommendation = 'l-shape';
                    innovativeConfidence = 0.85;
                }
            }

            // Use innovative layout if it has higher confidence
            if (innovativeRecommendation && innovativeConfidence > confidence) {
                recommendedLayout = innovativeRecommendation;
                confidence = innovativeConfidence;
            }
        }

        // Ensure we have a valid layout
        if (!GRID_LAYOUTS[recommendedLayout]) {
            console.warn(`Invalid layout ${recommendedLayout}, falling back to default`);
            recommendedLayout = imageCount <= 3 ? '1x3' : '2x2';
            confidence = 0.5;
        }

        return {
            recommendedLayout,
            confidence,
            analysis: {
                imageCount,
                avgAspectRatio,
                aspectRatioVariance,
                avgEntropy,
                avgVisualWeight,
                orientationDistribution: {
                    portrait: portraitCount,
                    landscape: landscapeCount,
                    square: squareCount
                },
                prominentSubjectCount,
                details: validAnalyses
            }
        };
    } catch (error) {
        console.error('Error in smart layout analysis:', error);

        // Provide better fallback based on image count
        let fallbackLayout = '1x3'; // Default fallback
        if (imagePaths.length === 1) fallbackLayout = '1x1';
        else if (imagePaths.length === 2) fallbackLayout = '1x2';
        else if (imagePaths.length === 4) fallbackLayout = '2x2';
        else if (imagePaths.length >= 5) fallbackLayout = '2x3';

        return {
            recommendedLayout: fallbackLayout,
            confidence: 0,
            error: error.message,
            fallback: true
        };
    }
}

function calculateVariance(array) {
    const mean = array.reduce((a, b) => a + b, 0) / array.length;
    return array.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / array.length;
}

// Calculate positions for innovative YouTube layouts
function calculateInnovativeLayoutPositions(layoutType, imageCount, width, height, padding) {
    const positions = [];

    // Validate inputs to prevent NaN
    if (!width || !height || width <= 0 || height <= 0 || imageCount <= 0) {
        console.error('Invalid parameters for layout calculation:', { layoutType, imageCount, width, height, padding });
        return positions;
    }

    // Ensure all parameters are valid numbers
    width = Math.max(100, Math.floor(Number(width) || 1280));
    height = Math.max(100, Math.floor(Number(height) || 720));
    padding = Math.max(0, Math.floor(Number(padding) || 0));
    imageCount = Math.max(1, Math.floor(Number(imageCount) || 1));

    // Helper function to validate and ensure minimum dimensions
    const ensureValidDimension = (value, minimum = 100) => {
        const num = Math.floor(Number(value) || minimum);
        return Math.max(minimum, num);
    };

    switch (layoutType) {
        case 'hero-side':
            // Improved: Adaptive hero + stacked side images (no gaps)
            const heroWidth = ensureValidDimension(width * 0.65 - padding, 200);
            const sideWidth = ensureValidDimension(width - heroWidth - padding * 3, 100);
            const sideImageCount = Math.max(1, imageCount - 1);
            const sideHeight = ensureValidDimension((height - padding * (sideImageCount + 1)) / sideImageCount, 100);

            // Hero image (left side)
            positions.push({
                width: heroWidth,
                height: ensureValidDimension(height - padding * 2, 100),
                left: padding,
                top: padding
            });

            // Side images (right side, stacked vertically with no gaps)
            for (let i = 1; i < imageCount; i++) {
                positions.push({
                    width: sideWidth,
                    height: sideHeight,
                    left: heroWidth + padding * 2,
                    top: padding + (i - 1) * (sideHeight + padding)
                });
            }
            break;

        case 'corner-grid':
            // Improved: Mosaic-style with better space utilization
            if (imageCount === 3) {
                // Vertical split: large left + 2 stacked right
                const leftWidth = ensureValidDimension(width * 0.6 - padding, 200);
                const rightWidth = ensureValidDimension(width - leftWidth - padding * 3, 100);
                const rightHeight = ensureValidDimension((height - padding * 3) / 2, 100);

                positions.push({
                    width: leftWidth,
                    height: ensureValidDimension(height - padding * 2, 100),
                    left: padding,
                    top: padding
                });

                positions.push({
                    width: rightWidth,
                    height: rightHeight,
                    left: leftWidth + padding * 2,
                    top: padding
                });

                positions.push({
                    width: rightWidth,
                    height: rightHeight,
                    left: leftWidth + padding * 2,
                    top: padding * 2 + rightHeight
                });
            } else if (imageCount === 4) {
                // 2x2 grid with equal sizes
                const cellWidth = ensureValidDimension((width - padding * 3) / 2, 100);
                const cellHeight = ensureValidDimension((height - padding * 3) / 2, 100);

                for (let i = 0; i < 4; i++) {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    positions.push({
                        width: cellWidth,
                        height: cellHeight,
                        left: padding + col * (cellWidth + padding),
                        top: padding + row * (cellHeight + padding)
                    });
                }
            } else {
                // 5+ images: center + corners layout
                const centerSize = ensureValidDimension(Math.min(width, height) * 0.5, 200);
                const cornerSize = ensureValidDimension(Math.min(width, height) * 0.22, 100);
                const centerX = Math.max(0, Math.floor((width - centerSize) / 2));
                const centerY = Math.max(0, Math.floor((height - centerSize) / 2));

                positions.push({
                    width: centerSize,
                    height: centerSize,
                    left: centerX,
                    top: centerY
                });

                // Corner positions
                const corners = [
                    { left: padding, top: padding }, // Top-left
                    { left: Math.max(0, width - cornerSize - padding), top: padding }, // Top-right
                    { left: padding, top: Math.max(0, height - cornerSize - padding) }, // Bottom-left
                    { left: Math.max(0, width - cornerSize - padding), top: Math.max(0, height - cornerSize - padding) } // Bottom-right
                ];

                for (let i = 1; i < Math.min(imageCount, 5); i++) {
                    const corner = corners[i - 1];
                    if (corner) {
                        positions.push({
                            width: cornerSize,
                            height: cornerSize,
                            left: corner.left,
                            top: corner.top
                        });
                    }
                }
            }
            break;

        case 'banner-split':
            // Improved: Better proportions and no gaps
            const bannerHeight = ensureValidDimension(height * 0.55, 150);
            const bottomHeight = ensureValidDimension(height - bannerHeight - padding * 3, 100);
            const splitImageCount = Math.max(1, imageCount - 1);
            const splitWidth = ensureValidDimension((width - padding * (splitImageCount + 1)) / splitImageCount, 100);

            // Banner image (top, full width)
            positions.push({
                width: ensureValidDimension(width - padding * 2, 100),
                height: bannerHeight,
                left: padding,
                top: padding
            });

            // Split images below (no gaps between them)
            for (let i = 1; i < imageCount; i++) {
                positions.push({
                    width: splitWidth,
                    height: bottomHeight,
                    left: padding + (i - 1) * (splitWidth + padding),
                    top: bannerHeight + padding * 2
                });
            }
            break;

        case 'spotlight':
            // Improved: Magazine-style layout with better proportions
            if (imageCount <= 3) {
                // Horizontal layout for fewer images
                const mainWidth = ensureValidDimension(width * 0.6 - padding, 250);
                const sideWidth = ensureValidDimension((width - mainWidth - padding * 3) / Math.max(1, imageCount - 1), 100);
                const imageHeight = ensureValidDimension(height - padding * 2, 100);

                positions.push({
                    width: mainWidth,
                    height: imageHeight,
                    left: padding,
                    top: padding
                });

                for (let i = 1; i < imageCount; i++) {
                    positions.push({
                        width: sideWidth,
                        height: imageHeight,
                        left: mainWidth + padding + (i - 1) * (sideWidth + padding),
                        top: padding
                    });
                }
            } else {
                // Grid layout for 4+ images
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

        case 'l-shape':
            // Improved: True L-shape with better space utilization
            if (imageCount === 3) {
                // Perfect L-shape for 3 images
                const topWidth = ensureValidDimension(width * 0.7 - padding, 250);
                const topHeight = ensureValidDimension(height * 0.6 - padding, 200);
                const bottomLeftWidth = topWidth;
                const bottomLeftHeight = ensureValidDimension(height - topHeight - padding * 3, 100);
                const rightWidth = ensureValidDimension(width - topWidth - padding * 3, 100);
                const rightHeight = topHeight;

                // Top horizontal
                positions.push({
                    width: topWidth,
                    height: topHeight,
                    left: padding,
                    top: padding
                });

                // Bottom left
                positions.push({
                    width: bottomLeftWidth,
                    height: bottomLeftHeight,
                    left: padding,
                    top: topHeight + padding * 2
                });

                // Right vertical
                positions.push({
                    width: rightWidth,
                    height: rightHeight,
                    left: topWidth + padding * 2,
                    top: padding
                });
            } else {
                // Adaptive L-shape for other counts
                const mainWidth = ensureValidDimension(width * 0.6, 300);
                const mainHeight = ensureValidDimension(height * 0.6, 200);
                const remainingWidth = ensureValidDimension(width - mainWidth - padding * 3, 100);
                const remainingHeight = ensureValidDimension(height - mainHeight - padding * 3, 100);

                // Main image (top-left)
                positions.push({
                    width: mainWidth,
                    height: mainHeight,
                    left: padding,
                    top: padding
                });

                // Distribute remaining images
                let imageIndex = 1;

                // Right side images
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

                // Bottom images
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

        default:
            // Fallback to basic grid
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

    // Final validation to ensure all positions have valid dimensions
    return positions.map(pos => ({
        width: ensureValidDimension(pos.width, 100),
        height: ensureValidDimension(pos.height, 100),
        left: Math.max(0, Math.floor(Number(pos.left) || 0)),
        top: Math.max(0, Math.floor(Number(pos.top) || 0))
    }));
}

// Handle thumbnail creation with tilted delimiters and auto-enhance
ipcMain.handle('create-thumbnail', async (event, data) => {
    // Performance monitoring - define startTime early for error handling
    const startTime = Date.now();

    if (!sharp) {
        return {
            success: false,
            error: 'Image processing module is not available. Please restart the application.'
        };
    }

    const {
        imagePaths,
        delimiterWidth: rawDelimiterWidth,
        delimiterTilt,
        outputName,
        enhanceOptions = { brightness: 1.0, contrast: 1.0, saturation: 1.0, sharpness: 1.0 },
        applyEnhance = false,
        layoutMode = 'auto', // Can be 'auto', '2-split', or '3-split'
        youtubeOptimize = true, // Set to true by default
        textOverlay = null // Text overlay settings
    } = data;

    // Validate and sanitize delimiterWidth to prevent NaN
    const delimiterWidth = Math.max(0, Math.floor(Number(rawDelimiterWidth) || 18));

    // Extract color information from delimiterColor
    const delimiterColor = data.delimiterColor || '#ffffff';
    const fillColor = delimiterColor;

    // Convert hex color to RGB for Sharp.js background
    const hexToRgb = (hex) => {
        // Remove # if present
        hex = hex.replace('#', '');
        // Ensure it's 6 characters
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            alpha: 1
        } : { r: 255, g: 255, b: 255, alpha: 1 }; // fallback to white
    };

    const backgroundColor = hexToRgb(delimiterColor);
    console.log(`Using delimiter color: ${delimiterColor}, RGB: ${JSON.stringify(backgroundColor)}`);

    try {
        console.log(`Starting thumbnail creation with ${imagePaths.length} images using ${layoutMode} mode`);

        if (imagePaths.length < 1) {
            throw new Error('At least 1 image is required for the thumbnail');
        }

        // Ensure delimiterTilt is always a number
        let parsedDelimiterTilt = 0;
        if (typeof data.delimiterTilt === 'string') {
            parsedDelimiterTilt = parseInt(data.delimiterTilt) || 0;
        } else {
            parsedDelimiterTilt = Number(data.delimiterTilt) || 0;
        }

        // Determine layout based on mode
        let gridLayout = '1x3'; // Default layout
        let selectedImages = imagePaths;

        if (layoutMode === 'auto') {
            const layoutStart = Date.now();
            const layoutAnalysis = await determineOptimalLayout(imagePaths);
            gridLayout = layoutAnalysis.recommendedLayout;
            console.log(`Smart layout analysis completed in ${Date.now() - layoutStart}ms, recommended: ${gridLayout} (confidence: ${layoutAnalysis.confidence.toFixed(2)})`);

        } else if (layoutMode.includes('x')) {
            // Direct grid layout specification (e.g., '2x2', '3x1', etc.)
            gridLayout = layoutMode;
        } else {
            // Handle innovative custom layouts
            gridLayout = layoutMode;
        }

        // Get layout configuration
        const layout = GRID_LAYOUTS[gridLayout];
        if (!layout) {
            throw new Error(`Invalid grid layout: ${gridLayout}`);
        }

        // Use only the required number of images for the layout
        selectedImages = imagePaths.slice(0, layout.maxImages);

        // Allow thumbnail creation with any number of images (minimum 1)
        if (selectedImages.length < 1) {
            throw new Error(`At least 1 image is required to create a thumbnail`);
        }

        // If we have fewer images than the layout requires, fill empty slots by repeating images
        // or adjust to a smaller layout that fits the available images
        if (selectedImages.length < layout.maxImages) {
            console.log(`Layout ${gridLayout} requires ${layout.maxImages} images but only ${selectedImages.length} provided. Adjusting...`);

            if (selectedImages.length === 1) {
                // Use single image layout for 1 image
                gridLayout = '1x1';
            } else if (selectedImages.length === 2) {
                // Use 2-image layout for 2 images
                gridLayout = '1x2';
            } else if (selectedImages.length === 3) {
                // Use 3-image layout for 3 images
                gridLayout = '1x3';
            }
            // For 4+ images, keep the original layout and fill missing slots by repeating images
            else {
                // Fill missing slots by cycling through available images
                const originalLength = selectedImages.length;
                while (selectedImages.length < layout.maxImages) {
                    const nextImageIndex = selectedImages.length % originalLength;
                    selectedImages.push(selectedImages[nextImageIndex]);
                }
                console.log(`Filled ${layout.maxImages - originalLength} empty slots by repeating images`);
            }

            // Update layout configuration after potential layout change
            const updatedLayout = GRID_LAYOUTS[gridLayout];
            if (updatedLayout) {
                selectedImages = selectedImages.slice(0, updatedLayout.maxImages);
            }
        }

        // YouTube thumbnail dimensions
        const THUMBNAIL_WIDTH = 1280;
        const THUMBNAIL_HEIGHT = 720;

        // Create blank canvas with user-selected delimiter color
        const canvas = sharp({
            create: {
                width: THUMBNAIL_WIDTH,
                height: THUMBNAIL_HEIGHT,
                channels: 4,
                background: backgroundColor
            }
        });

        // Calculate grid cell dimensions with optimization for large grids
        // For custom layouts, use default values since they don't use grid cells
        const cellWidth = layout.cols ? Math.floor(THUMBNAIL_WIDTH / layout.cols) : THUMBNAIL_WIDTH;
        const cellHeight = layout.rows ? Math.floor(THUMBNAIL_HEIGHT / layout.rows) : THUMBNAIL_HEIGHT;
        const padding = Math.max(0, Math.floor((delimiterWidth || 0) / 2)); // Padding between cells

        // Performance optimization: use progressive loading for large grids
        const isLargeGrid = layout.maxImages > 4;
        const processingQuality = isLargeGrid ? 90 : 95; // Slightly lower quality for large grids

        // Process images for grid layout
        const processedImages = await Promise.all(
            selectedImages.map(async (imagePath, index) => {
                try {
                    let imageBuffer = await fs.promises.readFile(imagePath);
                    let processedImage = sharp(imageBuffer);

                    if (applyEnhance) {
                        processedImage = await enhanceImage(imageBuffer, enhanceOptions);
                    }

                    // Calculate actual cell dimensions with padding and validate
                    const actualCellWidth = Math.max(100, Math.floor(Number(cellWidth - padding * 2) || 100));
                    const actualCellHeight = Math.max(100, Math.floor(Number(cellHeight - padding * 2) || 100));

                    // Add visual enhancements for thumbnails
                    processedImage = processedImage
                        // Apply subtle vignette
                        .composite([{
                            input: Buffer.from(`
                                <svg width="${actualCellWidth}" height="${actualCellHeight}">
                                    <defs>
                                        <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
                                            <stop offset="0%" stop-color="black" stop-opacity="0" />
                                            <stop offset="100%" stop-color="black" stop-opacity="0.15" />
                                        </radialGradient>
                                    </defs>
                                    <rect width="100%" height="100%" fill="url(#vignette)" />
                                </svg>
                            `),
                            blend: 'overlay'
                        }])
                        // Add subtle sharpening
                        .sharpen({
                            sigma: 1.2,
                            m1: 1.0,
                            m2: 2.0,
                            x1: 2.0,
                            y2: 10.0
                        })
                        // Boost contrast and colors
                        .linear(1.1, 0)
                        .modulate({
                            brightness: 1.05,
                            saturation: 1.1
                        });

                    return await processedImage
                        .resize({
                            width: Math.max(100, Math.floor(Number(actualCellWidth) || 100)),
                            height: Math.max(100, Math.floor(Number(actualCellHeight) || 100)),
                            fit: 'cover',
                            position: 'center'
                        })
                        .toBuffer();
                } catch (error) {
                    console.error(`Error processing image ${index}:`, error);
                    throw new Error(`Failed to process image ${index + 1}: ${error.message}`);
                }
            })
        );

        // Calculate positions for grid layout or innovative layouts
        let composites;

        if (layout.type === 'custom') {
            // Use innovative layout positioning
            console.log(`Using innovative layout: ${layout.layout} with ${selectedImages.length} images`);
            console.log(`Dimensions: ${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT}, padding: ${padding}`);

            const positions = calculateInnovativeLayoutPositions(
                layout.layout,
                selectedImages.length,
                THUMBNAIL_WIDTH,
                THUMBNAIL_HEIGHT,
                padding
            );

            console.log(`Generated ${positions.length} positions:`, positions);

            // Process images with custom sizing for innovative layouts
            const customProcessedImages = await Promise.all(
                selectedImages.map(async (imagePath, index) => {
                    try {
                        let imageBuffer = await fs.promises.readFile(imagePath);
                        let processedImage = sharp(imageBuffer);

                        if (applyEnhance) {
                            processedImage = await enhanceImage(imageBuffer, enhanceOptions);
                        }

                        const pos = positions[index];
                        if (pos) {
                            // Validate position dimensions before using them
                            if (isNaN(pos.width) || isNaN(pos.height) || pos.width <= 0 || pos.height <= 0) {
                                console.error(`Invalid position dimensions for image ${index}:`, pos);
                                console.error(`Layout: ${layout.layout}, Image count: ${selectedImages.length}`);
                                return null;
                            }

                            console.log(`Processing image ${index} with dimensions: ${pos.width}x${pos.height}`);

                            // Add visual enhancements for thumbnails
                            processedImage = processedImage
                                // Apply subtle vignette
                                .composite([{
                                    input: Buffer.from(`
                                        <svg width="${pos.width}" height="${pos.height}">
                                            <defs>
                                                <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
                                                    <stop offset="0%" stop-color="black" stop-opacity="0" />
                                                    <stop offset="100%" stop-color="black" stop-opacity="0.15" />
                                                </radialGradient>
                                            </defs>
                                            <rect width="100%" height="100%" fill="url(#vignette)" />
                                        </svg>
                                    `),
                                    blend: 'overlay'
                                }])
                                // Add subtle sharpening
                                .sharpen({
                                    sigma: 1.2,
                                    m1: 1.0,
                                    m2: 2.0,
                                    x1: 2.0,
                                    y2: 10.0
                                })
                                // Boost contrast and colors
                                .linear(1.1, 0)
                                .modulate({
                                    brightness: 1.05,
                                    saturation: 1.1
                                });

                            return await processedImage
                                .resize({
                                    width: Math.max(100, Math.floor(Number(pos.width) || 100)),
                                    height: Math.max(100, Math.floor(Number(pos.height) || 100)),
                                    fit: 'cover',
                                    position: 'center'
                                })
                                .toBuffer();
                        }
                        return null;
                    } catch (error) {
                        console.error(`Error processing custom layout image ${index}:`, error);
                        throw new Error(`Failed to process image ${index + 1}: ${error.message}`);
                    }
                })
            );

            composites = customProcessedImages.map((buffer, index) => {
                const pos = positions[index];
                if (pos && buffer) {
                    return {
                        input: buffer,
                        left: Math.floor(pos.left),
                        top: Math.floor(pos.top)
                    };
                }
                return null;
            }).filter(comp => comp !== null);

        } else {
            // Standard grid layout positioning
            composites = processedImages.map((buffer, index) => {
                const row = Math.floor(index / layout.cols);
                const col = index % layout.cols;

                const left = col * cellWidth + padding;
                const top = row * cellHeight + padding;

                return {
                    input: buffer,
                    left: Math.floor(left),
                    top: Math.floor(top)
                };
            });
        }

        // Add grid delimiters if needed (only for standard grid layouts)
        if (layout.type !== 'custom' && (layout.cols > 1 || layout.rows > 1)) {
            // Add vertical delimiters
            for (let col = 1; col < layout.cols; col++) {
                const x = col * cellWidth;
                const delimiterSVG = Buffer.from(`
                    <svg width="${delimiterWidth}" height="${THUMBNAIL_HEIGHT}">
                        <rect x="0" y="0" width="${delimiterWidth}" height="${THUMBNAIL_HEIGHT}" 
                              fill="${fillColor}" transform="skewX(${-parsedDelimiterTilt})"/>
                    </svg>
                `);
                composites.push({
                    input: delimiterSVG,
                    left: Math.floor(x - delimiterWidth / 2),
                    top: 0
                });
            }

            // Add horizontal delimiters
            for (let row = 1; row < layout.rows; row++) {
                const y = row * cellHeight;
                const delimiterSVG = Buffer.from(`
                    <svg width="${THUMBNAIL_WIDTH}" height="${delimiterWidth}">
                        <rect x="0" y="0" width="${THUMBNAIL_WIDTH}" height="${delimiterWidth}" 
                              fill="${fillColor}"/>
                    </svg>
                `);

                composites.push({
                    input: delimiterSVG,
                    left: 0,
                    top: Math.floor(y - delimiterWidth / 2)
                });
            }
        }

        // Create text overlay if enabled
        if (textOverlay && textOverlay.enabled && textOverlay.text) {
            await addTextOverlay(composites, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, textOverlay);
        }

        // Create final image with optimizations for YouTube
        const finalImage = canvas
            .composite(composites)
            .png({
                compressionLevel: 8,
                progressive: true,
                palette: false,
                effort: 8,
                adaptiveFiltering: true,
                colors: 256
            });

        // Save the final image with enhanced error handling
        const outputDir = path.join(app.getPath('pictures'), 'YouTube-Thumbnails');

        try {
            await fs.promises.mkdir(outputDir, { recursive: true });
        } catch (dirError) {
            throw new Error(`Cannot create output directory: ${dirError.message}`);
        }

        const finalOutputName = data.outputName ||
            `youtube-thumbnail-${gridLayout}-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}`;

        const outputPath = path.join(outputDir, `${finalOutputName}.png`);

        // Validate output path
        if (outputPath.length > 260) { // Windows path limit consideration
            throw new Error('Output filename is too long. Please use a shorter name.');
        }

        // Apply YouTube-specific optimizations
        if (youtubeOptimize) {
            const optimizeStart = Date.now();
            console.log('Applying YouTube optimizations...');

            // First save with metadata stripped
            await finalImage
                .withMetadata({
                    // Keep only essential metadata
                    orientation: undefined,
                    icc: undefined,
                    exif: undefined,
                    iptc: undefined,
                    xmp: undefined
                })
                .toFile(outputPath);

            // Get original size
            const originalStats = await fs.promises.stat(outputPath);
            const originalSize = originalStats.size;

            // Create an optimized version with quality preservation
            const optimizedBuffer = await sharp(outputPath)
                .png({
                    compressionLevel: 8,      // Compression Level
                    progressive: true,        // Progressive rendering
                    palette: false,           // Keep full color range
                    effort: 8,                // High compression effort but not maximum
                    adaptiveFiltering: true,  // Better filtering
                    colors: 256               // Maximum colors for PNG
                })
                .toBuffer();

            // Write optimized version
            await fs.promises.writeFile(outputPath, optimizedBuffer);

            // Get new size
            const newStats = await fs.promises.stat(outputPath);
            const newSize = newStats.size;
            const savings = ((originalSize - newSize) / originalSize * 100).toFixed(2);
            const optimizeTime = Date.now() - optimizeStart;
            const totalTime = Date.now() - startTime;

            console.log(`YouTube optimization completed in ${optimizeTime}ms. Total processing time: ${totalTime}ms`);
            console.log(`File size: ${formatBytes(originalSize)} → ${formatBytes(newSize)} (${savings}% reduction)`);

            return {
                success: true,
                outputPath,
                outputDir,
                processingTime: `${totalTime}ms`,
                optimizationTime: `${optimizeTime}ms`,
                layout: gridLayout,
                imagesUsed: selectedImages.length,
                optimizationResult: {
                    path: outputPath,
                    originalSize: formatBytes(originalSize),
                    newSize: formatBytes(newSize),
                    savings: `${savings}%`,
                    qualityPreserved: true
                }
            };
        } else {
            // Standard output without optimization
            await finalImage
                .withMetadata()  // Keep original metadata
                .toFile(outputPath);

            const stats = await fs.promises.stat(outputPath);
            const totalTime = Date.now() - startTime;
            console.log(`Thumbnail created successfully with ${gridLayout} layout in ${totalTime}ms:`, outputPath);

            return {
                success: true,
                outputPath,
                outputDir,
                processingTime: `${totalTime}ms`,
                layout: gridLayout,
                imagesUsed: selectedImages.length,
                optimizationResult: {
                    path: outputPath,
                    originalSize: formatBytes(stats.size),
                    newSize: formatBytes(stats.size),
                    savings: '0%',
                    qualityPreserved: true
                }
            };
        }
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`Error creating thumbnail after ${totalTime}ms:`, error);
        return {
            success: false,
            error: error.message || 'An unknown error occurred while creating the thumbnail',
            processingTime: `${totalTime}ms`
        };
    }
});

async function optimizeThumbnail(outputPath, quality = 95) {
    try {
        const originalSize = (await fs.promises.stat(outputPath)).size;
        const imageBuffer = await fs.promises.readFile(outputPath);

        // Create quality-preserving optimization
        let optimizedBuffer;

        // Use high-quality optimization that preserves details
        optimizedBuffer = await sharp(imageBuffer)
            .png({
                compressionLevel: 7,      // Slightly reduced from max (9) to preserve quality
                progressive: true,        // Progressive rendering
                palette: false,           // Disable palette to preserve full color range
                quality: quality,         // Higher quality setting (95%)
                effort: 8,                // High compression effort but not maximum
                adaptiveFiltering: true,  // Better filtering
                colors: 256               // Maximum colors for PNG
            })
            .toBuffer();

        const extension = '.png';

        // Create optimized file path
        const optimizedPath = outputPath.replace(/\.[^.]+$/, `_optimized${extension}`);

        // Write optimized file
        await fs.promises.writeFile(optimizedPath, optimizedBuffer);

        // Get optimized file stats
        const newSize = (await fs.promises.stat(optimizedPath)).size;
        const savings = ((originalSize - newSize) / originalSize * 100).toFixed(2);

        console.log(`Thumbnail optimized: ${formatBytes(originalSize)} → ${formatBytes(newSize)} (${savings}% reduction)`);

        // Keep optimized version if size reduced by >10%
        if (newSize < originalSize * 0.9) {
            await fs.promises.unlink(outputPath);
            await fs.promises.rename(optimizedPath, outputPath);
            return {
                path: outputPath,
                originalSize: formatBytes(originalSize),
                newSize: formatBytes(newSize),
                savings: `${savings}%`,
                qualityPreserved: true
            };
        }

        // Otherwise keep original
        await fs.promises.unlink(optimizedPath);
        return {
            path: outputPath,
            originalSize: formatBytes(originalSize),
            newSize: formatBytes(originalSize),
            savings: '0%',
            qualityPreserved: true
        };
    } catch (error) {
        console.error('Error optimizing thumbnail:', error);
        return { path: outputPath, error: error.message };
    }
}

// Helper to format file sizes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Create text overlay
async function addTextOverlay(composites, canvasWidth, canvasHeight, textOverlay) {
    const {
        text,
        font = 'Arial Black',
        size = 60,
        color = '#ffffff',
        opacity = 0.9,
        position = 'center',
        effect = 'shadow',
        layer = 'overlay'
    } = textOverlay;

    try {
        // Calculate text position
        const fontSize = Math.max(20, Math.min(200, size));
        const textColor = color.replace('#', '');

        // Create text dimensions estimate (rough calculation)
        const textLength = text.length;
        const estimatedWidth = textLength * fontSize * 0.6;
        const estimatedHeight = fontSize * 1.2;

        let x, y;

        // Calculate position based on settings
        switch (position) {
            case 'top':
                x = Math.floor(canvasWidth / 2 - estimatedWidth / 2);
                y = Math.floor(estimatedHeight + 20);
                break;
            case 'bottom':
                x = Math.floor(canvasWidth / 2 - estimatedWidth / 2);
                y = Math.floor(canvasHeight - 20);
                break;
            case 'left':
                x = 20;
                y = Math.floor(canvasHeight / 2);
                break;
            case 'right':
                x = Math.floor(canvasWidth - estimatedWidth - 20);
                y = Math.floor(canvasHeight / 2);
                break;
            case 'top-left':
                x = 20;
                y = Math.floor(estimatedHeight + 20);
                break;
            case 'top-right':
                x = Math.floor(canvasWidth - estimatedWidth - 20);
                y = Math.floor(estimatedHeight + 20);
                break;
            case 'bottom-left':
                x = 20;
                y = Math.floor(canvasHeight - 20);
                break;
            case 'bottom-right':
                x = Math.floor(canvasWidth - estimatedWidth - 20);
                y = Math.floor(canvasHeight - 20);
                break;
            default: // center
                x = Math.floor(canvasWidth / 2 - estimatedWidth / 2);
                y = Math.floor(canvasHeight / 2);
        }

        // Ensure text stays within bounds
        x = Math.max(10, Math.min(x, canvasWidth - 10));
        y = Math.max(estimatedHeight, Math.min(y, canvasHeight - 10));

        // Create SVG for text with effects
        let textSVG = '';
        const textOpacity = Math.max(0, Math.min(1, opacity));
        const safeText = text.replace(/[<>&"']/g, (match) => {
            const escape = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
            return escape[match];
        });

        // Apply text effects
        let textElement = '';
        const fillColor = `#${textColor}`;

        switch (effect) {
            case 'shadow':
                textElement = `
                    <text x="${x + 3}" y="${y + 3}" font-family="${font}" font-size="${fontSize}" 
                          fill="rgba(0,0,0,0.7)" font-weight="bold" text-anchor="start">${safeText}</text>
                    <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}" 
                          fill="${fillColor}" opacity="${textOpacity}" font-weight="bold" text-anchor="start">${safeText}</text>
                `;
                break;
            case 'outline':
                textElement = `
                    <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}" 
                          fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="3" font-weight="bold" text-anchor="start">${safeText}</text>
                    <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}" 
                          fill="${fillColor}" opacity="${textOpacity}" font-weight="bold" text-anchor="start">${safeText}</text>
                `;
                break;
            case 'glow':
                textElement = `
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                            <feMerge> 
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}" 
                          fill="${fillColor}" opacity="${textOpacity}" font-weight="bold" text-anchor="start" filter="url(#glow)">${safeText}</text>
                `;
                break;
            case 'background':
                const bgPadding = 20;
                const bgWidth = estimatedWidth + bgPadding * 2;
                const bgHeight = estimatedHeight + bgPadding;
                const bgX = x - bgPadding;
                const bgY = y - estimatedHeight;
                textElement = `
                    <rect x="${bgX}" y="${bgY}" width="${bgWidth}" height="${bgHeight}" 
                          fill="rgba(0,0,0,0.7)" rx="8" ry="8"/>
                    <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}" 
                          fill="${fillColor}" opacity="${textOpacity}" font-weight="bold" text-anchor="start">${safeText}</text>
                `;
                break;
            default: // none
                textElement = `
                    <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}" 
                          fill="${fillColor}" opacity="${textOpacity}" font-weight="bold" text-anchor="start">${safeText}</text>
                `;
        }

        textSVG = `
            <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
                ${textElement}
            </svg>
        `;

        // Convert SVG to buffer
        const textBuffer = Buffer.from(textSVG);

        // Add text to composites based on layer setting
        let blendMode = 'over';
        let smartBlend = false;
        if (layer === 'behind' || layer === 'smart-blend') {
            // Smart Blend: place text between image layers with strong shadow, outline, and background
            smartBlend = true;
            blendMode = 'over';
        } else if (layer === 'between') {
            blendMode = 'over';
        } else {
            blendMode = 'over';
        }
        // If Smart Blend, enhance text SVG for visibility
        let textCompositeObj = textComposite;
        if (smartBlend) {
            // Add a semi-transparent background box, strong shadow, and outline
            const bgPadding = 30;
            const bgWidth = estimatedWidth + bgPadding * 2;
            const bgHeight = estimatedHeight + bgPadding;
            const bgX = x - bgPadding;
            const bgY = y - estimatedHeight;
            textElement = `
                <rect x="${bgX}" y="${bgY}" width="${bgWidth}" height="${bgHeight}"
                      fill="rgba(0,0,0,0.55)" rx="12" ry="12"/>
                <text x="${x + 4}" y="${y + 4}" font-family="${font}" font-size="${fontSize}"
                      fill="rgba(0,0,0,0.85)" font-weight="bold" text-anchor="start">${safeText}</text>
                <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}"
                      fill="none" stroke="#fff" stroke-width="4" font-weight="bold" text-anchor="start">${safeText}</text>
                <text x="${x}" y="${y}" font-family="${font}" font-size="${fontSize}"
                      fill="${fillColor}" opacity="${textOpacity}" font-weight="bold" text-anchor="start">${safeText}</text>
            `;
            textSVG = `
                <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
                    ${textElement}
                </svg>
            `;
            const smartTextBuffer = Buffer.from(textSVG);
            textCompositeObj = {
                input: smartTextBuffer,
                left: 0,
                top: 0,
                blend: blendMode
            };
        }
        if (smartBlend) {
            // Place text between image layers for best visibility
            const middleIndex = Math.floor(composites.length / 2);
            composites.splice(middleIndex, 0, textCompositeObj);
        } else if (layer === 'between') {
            const middleIndex = Math.floor(composites.length / 2);
            composites.splice(middleIndex, 0, textComposite);
        } else {
            // Add at the end for overlay effect (default)
            composites.push(textComposite);
        }

        console.log(`Text overlay added: "${text}" at position ${position} with ${effect} effect`);
    } catch (error) {
        console.error('Error creating text overlay:', error);
        // Don't throw - allow thumbnail creation to continue without text
    }
}
