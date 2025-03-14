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

// Apply auto-enhance to image
async function enhanceImage(buffer, enhanceOptions) {
    if (!sharp) {
        throw new Error('Image processing module is not available');
    }
    
    const { brightness, contrast, saturation, sharpness } = enhanceOptions;

    // Create a new Sharp instance
    let processedImage = sharp(buffer);

    try {
        // Get image metadata
        const metadata = await processedImage.metadata();
        
        // Apply image enhancements in a single pipeline
        processedImage = processedImage
            .rotate() // Auto-rotate based on EXIF
            .modulate({
                brightness: brightness,
                saturation: saturation
            });

        // Apply contrast adjustment if needed
        if (contrast !== 1.0) {
            processedImage = processedImage.linear(
                contrast,                    // Multiply by contrast value
                (1 - contrast) * 128        // Adjust offset for better contrast
            );
        }

        // Apply sharpening if needed
        if (sharpness > 1.0) {
            const sharpenSigma = Math.max(0.5, Math.min(2.0, 0.5 + ((sharpness - 1.0) * 0.75)));
            processedImage = processedImage.sharpen({
                sigma: sharpenSigma,         // Gaussian sigma
                m1: 1.0,                     // Sharpening strength
                m2: 2.0,                     // Details preservation
                x1: 2.0,                     // Threshold edges
                y2: 10.0                     // Max sharpening
            });
        }

        // Ensure proper color handling
        processedImage = processedImage
            .normalise()                     // Normalize color range
            .removeAlpha()                   // Remove alpha channel if present
            .ensureAlpha(1.0);              // Add back alpha channel with full opacity

        return processedImage;
    } catch (error) {
        console.error('Error in enhanceImage:', error);
        // If enhancement fails, return original image
        return sharp(buffer);
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

        // Calculate tilt displacement
        const tiltRadians = (delimiterTilt * Math.PI) / 180;
        const tiltDisplacement = Math.tan(tiltRadians) * THUMBNAIL_HEIGHT;

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

        // Create delimiter masks
        const delimiterMasks = delimiterPositions.map(position =>
            Buffer.from(createDelimiterSVG(position, tiltDisplacement, delimiterWidth, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, fillColor))
        );

        // Process images
        const processedImages = await Promise.all(
            selectedImages.map(async (imagePath, index) => {
                try {
                    // Calculate image width based on section
                    let imageWidth;

                    if (index === 0) {
                        // First image
                        imageWidth = delimiterPositions[0] + (tiltDisplacement < 0 ? tiltDisplacement : 0);
                    } else if (index === selectedImages.length - 1) {
                        // Last image
                        imageWidth = THUMBNAIL_WIDTH - delimiterPositions[delimiterPositions.length - 1] - delimiterWidth;
                    } else {
                        // Middle image(s)
                        imageWidth = delimiterPositions[index] - delimiterPositions[index - 1] - delimiterWidth;
                    }

                    imageWidth = Math.max(imageWidth, sectionWidth - delimiterWidth * 2);

                    // Process image with enhancements if enabled
                    let imageBuffer = await fs.promises.readFile(imagePath);
                    let processedImage = sharp(imageBuffer);

                    if (applyEnhance) {
                        processedImage = await enhanceImage(imageBuffer, enhanceOptions);
                    }

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
                    left: Math.floor(currentPos + (tiltDisplacement < 0 ? Math.min(0, tiltDisplacement / 2 * i) : 0)),
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
                compressionLevel: 9,      // Maximum compression
                adaptiveFiltering: true,  // Optimize filtering
                palette: false,           // Keep full color range
                effort: 10,              // Maximum optimization effort
                colors: 256,             // Maximum colors for PNG
                dither: 1.0             // Apply dithering for better quality
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

            // Create an optimized version
            const optimizedBuffer = await sharp(outputPath)
                .png({
                    compressionLevel: 9,
                    adaptiveFiltering: true,
                    palette: false,
                    effort: 10,
                    colors: 256,
                    dither: 1.0
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

    return `
        <svg width="${totalWidth}" height="${totalHeight}">
          <polygon 
            points="${x1},0 ${x1 + width},0 ${x2 + width},${totalHeight} ${x2},${totalHeight}" 
            fill="${fillColor}"
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