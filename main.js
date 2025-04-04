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
            enableRemoteModule: true
        },
        title: 'YouTube Thumbnail Combiner'
    });

    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(createWindow);

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
    // Calculate brightness levels
    const channels = ['r', 'g', 'b'];
    const meanBrightness = channels.reduce((sum, channel) => sum + stats[channel].mean, 0) / 3;
    const maxBrightness = Math.max(...channels.map(c => stats[c].max));
    const minBrightness = Math.min(...channels.map(c => stats[c].min));

    // Calculate contrast
    const stdDev = channels.reduce((sum, channel) => sum + stats[channel].stdev, 0) / 3;

    // Detect color cast
    const channelMeans = channels.map(c => stats[c].mean);
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
    const r = stats.r.mean;
    const g = stats.g.mean;
    const b = stats.b.mean;
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
    const targetMean = (analysis.stats.r.mean + analysis.stats.g.mean + analysis.stats.b.mean) / 3;
    const rOffset = analysis.stats.r.mean - targetMean;
    const bOffset = analysis.stats.b.mean - targetMean;

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

// Add this function to analyze images and determine optimal layout
async function determineOptimalLayout(imagePaths) {
    try {
        if (!sharp) {
            throw new Error('Image processing module is not available');
        }

        // Calculate image complexity and determine optimal layout
        const imageAnalysis = await Promise.all(imagePaths.map(async (path) => {
            const imageBuffer = await fs.promises.readFile(path);
            const metadata = await sharp(imageBuffer).metadata();

            // Calculate entropy as a measure of image complexity
            const stats = await sharp(imageBuffer)
                .grayscale()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const pixels = new Uint8Array(stats.data);
            let histogram = new Array(256).fill(0);

            // Create histogram
            for (let i = 0; i < pixels.length; i++) {
                histogram[pixels[i]]++;
            }

            // Calculate entropy
            let entropy = 0;
            const totalPixels = pixels.length;

            for (let i = 0; i < 256; i++) {
                if (histogram[i] > 0) {
                    const probability = histogram[i] / totalPixels;
                    entropy -= probability * Math.log2(probability);
                }
            }

            return {
                path,
                entropy,
                aspectRatio: metadata.width / metadata.height,
                width: metadata.width,
                height: metadata.height
            };
        }));

        // Determine if 2 or 3 splits would be better
        const avgComplexity = imageAnalysis.reduce((sum, img) => sum + img.entropy, 0) / imageAnalysis.length;
        const aspectRatioVariance = calculateVariance(imageAnalysis.map(img => img.aspectRatio));

        // Use 2 splits if:
        // 1. High complexity images (lots of detail)
        // 2. Very different aspect ratios
        const useThreeSplits = avgComplexity < 4.5 && aspectRatioVariance < 0.5;

        return {
            recommendedLayout: useThreeSplits ? 3 : 2,
            analysis: imageAnalysis
        };
    } catch (error) {
        console.error("Error analyzing images:", error);
        // Default to 3 splits if analysis fails
        return { recommendedLayout: 3 };
    }
}

function calculateVariance(array) {
    const mean = array.reduce((a, b) => a + b, 0) / array.length;
    return array.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / array.length;
}

// Handle thumbnail creation with tilted delimiters and auto-enhance
ipcMain.handle('create-thumbnail', async (event, data) => {
    if (!sharp) {
        return {
            success: false,
            error: 'Image processing module is not available. Please restart the application.'
        };
    }

    const {
        imagePaths,
        delimiterWidth,
        delimiterTilt,
        outputName,
        enhanceOptions = { brightness: 1.0, contrast: 1.0, saturation: 1.0, sharpness: 1.0 },
        applyEnhance = false,
        layoutMode = 'auto', // Can be 'auto', '2-split', or '3-split'
        youtubeOptimize = true // Set to true by default
    } = data;

    // Extract color information from delimiterColor
    const delimiterColor = data.delimiterColor || '#ffffff';
    const fillColor = delimiterColor;

    try {
        if (imagePaths.length < 2) {
            throw new Error('At least 2 images are required for the thumbnail');
        }

        // Determine layout if auto mode is selected
        let splitCount = 3; // Default to 3 splits
        if (layoutMode === 'auto') {
            const layoutAnalysis = await determineOptimalLayout(imagePaths);
            splitCount = layoutAnalysis.recommendedLayout;
        } else if (layoutMode === '2-split') {
            splitCount = 2;
        }

        // Use only the first 2 or 3 images based on split count
        const selectedImages = imagePaths.slice(0, splitCount);

        // YouTube thumbnail dimensions
        const THUMBNAIL_WIDTH = 1280;
        const THUMBNAIL_HEIGHT = 720;

        // Use the user's tilt setting as a base but add variation for visual interest
        const baseTiltRadians = (delimiterTilt * Math.PI) / 180;

        // Create dynamic tilt variations (between 70-130% of base tilt) for visual interest
        const tiltVariations = [];
        for (let i = 1; i < splitCount; i++) {
            // Add some randomness to the tilt for visual interest
            // Use a pseudorandom approach based on the image paths to keep it consistent
            const seed = imagePaths.reduce((acc, path, index) => acc + path.length * (index + 1), 0);
            const variation = 0.7 + ((seed * i) % 1000) / 1666; // Between 0.7 and 1.3

            const dynamicTiltRadians = baseTiltRadians * variation;
            tiltVariations.push(dynamicTiltRadians);
        }

        // Calculate tilt displacements
        const tiltDisplacements = tiltVariations.map(tiltRadian =>
            Math.tan(tiltRadian) * THUMBNAIL_HEIGHT
        );

        // Create blank canvas
        const canvas = sharp({
            create: {
                width: THUMBNAIL_WIDTH,
                height: THUMBNAIL_HEIGHT,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        });

        // Create delimiter positions based on split count
        const sectionWidth = THUMBNAIL_WIDTH / splitCount;
        const delimiterPositions = [];

        for (let i = 1; i < splitCount; i++) {
            delimiterPositions.push(Math.floor(sectionWidth * i));
        }

        // Create delimiter masks with different tilts
        const delimiterMasks = delimiterPositions.map((position, index) =>
            Buffer.from(createDelimiterSVG(
                position,
                tiltDisplacements[index],
                delimiterWidth,
                THUMBNAIL_WIDTH,
                THUMBNAIL_HEIGHT,
                fillColor
            ))
        );

        // Process images with enhanced effects
        const processedImages = await Promise.all(
            selectedImages.map(async (imagePath, index) => {
                try {
                    // Calculate image width based on section
                    let imageWidth;

                    if (index === 0) {
                        imageWidth = delimiterPositions[0] + (tiltDisplacements[0] < 0 ? tiltDisplacements[0] : 0);
                    } else if (index === selectedImages.length - 1) {
                        imageWidth = THUMBNAIL_WIDTH - delimiterPositions[delimiterPositions.length - 1] - delimiterWidth;
                    } else {
                        imageWidth = delimiterPositions[index] - delimiterPositions[index - 1] - delimiterWidth;
                    }

                    imageWidth = Math.max(imageWidth, sectionWidth - delimiterWidth * 2);

                    // Process image with enhancements if enabled
                    let imageBuffer = await fs.promises.readFile(imagePath);
                    let processedImage = sharp(imageBuffer);

                    if (applyEnhance) {
                        processedImage = await enhanceImage(imageBuffer, enhanceOptions);
                    }

                    // Add additional visual enhancements for thumbnails
                    processedImage = processedImage
                        // Apply subtle vignette to draw attention to center
                        .composite([{
                            input: Buffer.from(`
                                <svg width="${imageWidth}" height="${THUMBNAIL_HEIGHT}">
                                    <defs>
                                        <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
                                            <stop offset="0%" stop-color="black" stop-opacity="0" />
                                            <stop offset="100%" stop-color="black" stop-opacity="0.2" />
                                        </radialGradient>
                                    </defs>
                                    <rect width="100%" height="100%" fill="url(#vignette)" />
                                </svg>
                            `),
                            blend: 'overlay'
                        }])
                        // Add subtle sharpening for better detail
                        .sharpen({
                            sigma: 1.2,
                            m1: 1.0,
                            m2: 2.0,
                            x1: 2.0,
                            y2: 10.0
                        })
                        // Boost contrast slightly
                        .linear(1.1, 0)
                        // Enhance colors
                        .modulate({
                            brightness: 1.05,
                            saturation: 1.1
                        });

                    return await processedImage
                        .resize({
                            width: Math.floor(imageWidth + delimiterWidth * 2),
                            height: THUMBNAIL_HEIGHT,
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

        // Calculate positions for composite
        const positions = [];
        let currentPos = 0;

        for (let i = 0; i < selectedImages.length; i++) {
            if (i === 0) {
                positions.push({ left: 0, top: 0 });
            } else {
                currentPos = delimiterPositions[i - 1] + delimiterWidth / 2;
                positions.push({
                    left: Math.floor(currentPos + (tiltDisplacements[i] < 0 ? Math.min(0, tiltDisplacements[i] / 2 * i) : 0)),
                    top: 0
                });
            }
        }

        // Create composite operations
        const composites = processedImages.map((buffer, index) => {
            return {
                input: buffer,
                left: positions[index].left,
                top: positions[index].top
            };
        });

        // Add delimiter masks to composites
        delimiterMasks.forEach(mask => {
            composites.push({
                input: mask,
                left: 0,
                top: 0
            });
        });

        // Create final image with optimizations for YouTube
        const finalImage = await canvas
            .composite(composites)
            .png({
                compressionLevel: 8,      // Slightly reduced from max to preserve quality
                progressive: true,        // Progressive rendering
                palette: false,           // Keep full color range
                effort: 8,                // High compression effort but not maximum
                adaptiveFiltering: true,  // Better filtering
                colors: 256               // Maximum colors for PNG
            });

        // Save the final image
        const outputDir = path.join(app.getPath('pictures'), 'YouTube-Thumbnails');
        await fs.promises.mkdir(outputDir, { recursive: true });

        const finalOutputName = data.outputName ||
            `youtube-thumbnail-${splitCount}split-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}`;

        const outputPath = path.join(outputDir, `${finalOutputName}.png`);

        // Apply YouTube-specific optimizations
        if (youtubeOptimize) {
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
                    compressionLevel: 7,      // Slightly reduced from max to preserve quality
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

            console.log(`Thumbnail created and optimized for YouTube:`, outputPath);
            return {
                success: true,
                outputPath,
                outputDir,
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
            console.log(`Thumbnail created successfully with ${splitCount} splits:`, outputPath);

            return {
                success: true,
                outputPath,
                outputDir,
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
        console.error('Error creating thumbnail:', error);
        return {
            success: false,
            error: error.message || 'An unknown error occurred while creating the thumbnail'
        };
    }
});

// Helper function to create delimiter SVG
function createDelimiterSVG(position, tiltDisplacement, width, totalWidth, totalHeight, fillColor) {
    const halfTiltDisp = tiltDisplacement / 2;
    const x1 = position - halfTiltDisp - width / 2;
    const x2 = position + halfTiltDisp - width / 2;

    // Extract and enhance color components
    let r, g, b;
    const colorRegex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
    const colorMatch = colorRegex.exec(fillColor);

    if (colorMatch) {
        r = parseInt(colorMatch[1], 16);
        g = parseInt(colorMatch[2], 16);
        b = parseInt(colorMatch[3], 16);
    } else {
        r = g = b = 255;
    }

    // Create enhanced color variations for gradient
    const baseColor = `rgba(${r}, ${g}, ${b}, 1)`;
    const highlightColor = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 1)`;
    const shadowColor = `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.95)`;
    const glowColor = `rgba(${r}, ${g}, ${b}, 0.3)`;

    return `
        <svg width="${totalWidth}" height="${totalHeight}">
          <defs>
            <!-- Main gradient -->
            <linearGradient id="dividerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${highlightColor}" />
              <stop offset="50%" stop-color="${baseColor}" />
              <stop offset="100%" stop-color="${shadowColor}" />
            </linearGradient>
            
            <!-- Glow effect -->
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
              <feComposite in="blur" in2="SourceAlpha" operator="in" result="glow" />
              <feFlood flood-color="${glowColor}" result="glowColor" />
              <feComposite in="glowColor" in2="glow" operator="in" result="coloredGlow" />
              <feMerge>
                <feMergeNode in="coloredGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <!-- Soft shadow -->
            <filter id="softShadow" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feOffset dx="2" dy="2" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="offsetblur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <!-- Lighting effect -->
            <filter id="lighting" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
              <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="white" result="specOut">
                <fePointLight x="0" y="0" z="200" />
              </feSpecularLighting>
              <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
            </filter>
          </defs>
          
          <!-- Main delimiter with enhanced effects -->
          <polygon 
            points="${x1},0 ${x1 + width},0 ${x2 + width},${totalHeight} ${x2},${totalHeight}" 
            fill="url(#dividerGradient)"
            filter="url(#glow) url(#softShadow) url(#lighting)"
            stroke="${baseColor}"
            stroke-width="0.5"
            stroke-opacity="0.3"
          />
        </svg>
      `;
}

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