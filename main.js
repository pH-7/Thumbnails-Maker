const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
    const { brightness, contrast, saturation, sharpness } = enhanceOptions;

    // Apply image enhancements
    let processedImage = sharp(buffer);

    if (brightness !== 1.0 || contrast !== 1.0 || saturation !== 1.0) {
        // Apply modulate for brightness and saturation
        processedImage = processedImage.modulate({
            brightness: brightness,
            saturation: saturation
        });

        // Apply contrast adjustment
        if (contrast !== 1.0) {
            // Convert contrast value to linear contrast parameters
            processedImage = processedImage.linear(
                contrast, // Multiply by contrast value
                (1 - contrast) * 128 // Adjust offset
            );
        }
    }

    // Apply sharpening if needed
    if (sharpness > 1.0) {
        const sharpenSigma = 0.5 + ((sharpness - 1.0) * 0.75);
        processedImage = processedImage.sharpen({
            sigma: sharpenSigma,
            m1: 0.0,
            m2: 15
        });
    }

    return processedImage;
}

// Calculate image entropy (complexity) to determine optimal split count
async function calculateImageComplexity(buffer) {
    try {
        // Get image metadata and stats
        const metadata = await sharp(buffer).metadata();
        const stats = await sharp(buffer).stats();

        // Simple entropy calculation based on standard deviation of channels
        const channelEntropy = stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) / stats.channels.length;

        // Factor in resolution
        const resolution = metadata.width * metadata.height;
        const resolutionFactor = Math.log10(resolution) / 6; // Normalize for typical resolutions

        return channelEntropy * resolutionFactor;
    } catch (error) {
        console.error('Error calculating image complexity:', error);
        return 50; // Return a default middle value on error
    }
}

// Analyze images to decide optimal split count (2 or 3)
async function determineOptimalSplitCount(imagePaths) {
    try {
        // If we have fewer than 3 images, use that number
        if (imagePaths.length < 3) {
            return imagePaths.length;
        }

        // Load and analyze each image
        const complexities = await Promise.all(
            imagePaths.map(async (path) => {
                const buffer = await fs.promises.readFile(path);
                return await calculateImageComplexity(buffer);
            })
        );

        // Calculate the average complexity
        const avgComplexity = complexities.reduce((sum, val) => sum + val, 0) / complexities.length;

        // Calculate standard deviation of complexities
        const squaredDiffs = complexities.map(val => Math.pow(val - avgComplexity, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / complexities.length;
        const stdDev = Math.sqrt(variance);

        // Calculate variance coefficient (normalized standard deviation)
        const varianceCoefficient = stdDev / avgComplexity;

        // Determine if images are similar or diverse
        // High variance suggests more diverse images that might benefit from more splits
        const useThreeSplits = varianceCoefficient > 0.3 || avgComplexity > 70;

        console.log(`Image analysis - Avg Complexity: ${avgComplexity.toFixed(2)}, Variance Coef: ${varianceCoefficient.toFixed(2)}`);
        console.log(`Optimal split count: ${useThreeSplits ? 3 : 2}`);

        return useThreeSplits ? 3 : 2;
    } catch (error) {
        console.error('Error determining optimal split count:', error);
        return 3; // Default to 3 splits on error
    }
}

// Handle thumbnail creation with smart split selection
ipcMain.handle('create-thumbnail', async (event, data) => {
    const {
        imagePaths,
        delimiterWidth,
        delimiterTilt,
        outputName,
        enhanceOptions = { brightness: 1.0, contrast: 1.0, saturation: 1.0 },
        applyEnhance = false,
        forceSplitCount = 0 // 0 means auto-determine, otherwise use the specified count
    } = data;

    // Extract color information from delimiterColor
    const delimiterColor = data.delimiterColor || '#ffffff';
    const fillColor = delimiterColor;

    try {
        if (imagePaths.length < 2) {
            throw new Error('At least 2 images are required for the thumbnail');
        }

        // Determine split count (2 or 3) if not forced
        let splitCount = forceSplitCount;
        if (splitCount === 0) {
            splitCount = await determineOptimalSplitCount(imagePaths);
        }

        // Use only the first 'splitCount' images
        const selectedImages = imagePaths.slice(0, splitCount);

        // YouTube thumbnail dimensions
        const THUMBNAIL_WIDTH = 1280;
        const THUMBNAIL_HEIGHT = 720;

        // Calculate tilt displacement (how many pixels the delimiter shifts from top to bottom)
        const tiltRadians = (delimiterTilt * Math.PI) / 180; // Convert degrees to radians
        const tiltDisplacement = Math.tan(tiltRadians) * THUMBNAIL_HEIGHT;

        // Create a blank canvas with white background
        const canvas = sharp({
            create: {
                width: THUMBNAIL_WIDTH,
                height: THUMBNAIL_HEIGHT,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        });

        // Create SVG for the tilted delimiter mask
        const createDelimiterSVG = (position, tiltDisplacement, width) => {
            // Calculate the starting and ending x-positions based on tilt
            const halfTiltDisp = tiltDisplacement / 2;
            const x1 = position - halfTiltDisp - width / 2;
            const x2 = position + halfTiltDisp - width / 2;
            
            // Make sure fillColor is properly passed from delimiterColor
            // fillColor is already defined in the parent scope

            return `
        <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}">
          <polygon 
            points="${x1},0 ${x1 + width},0 ${x2 + width},${THUMBNAIL_HEIGHT} ${x2},${THUMBNAIL_HEIGHT}" 
            fill="${fillColor}"
          />
        </svg>
      `;
        };

        // Calculate image positions and widths accounting for tilted delimiters and split count
        const sectionWidth = THUMBNAIL_WIDTH / splitCount;

        // Create delimiter masks for each split
        const delimiterMasks = [];
        for (let i = 1; i < splitCount; i++) {
            const delimiterPos = Math.floor(sectionWidth * i);
            const delimiterMask = Buffer.from(
                createDelimiterSVG(delimiterPos, tiltDisplacement, delimiterWidth)
            );
            delimiterMasks.push(delimiterMask);
        }

        // Process images - resize each one to fit in the thumbnail
        const processedImages = await Promise.all(
            selectedImages.map(async (imagePath, index) => {
                try {
                    // Calculate position and width based on section and account for tilt
                    let imageWidth;
                    let imagePosition;

                    if (index === 0) {
                        // First image
                        imageWidth = Math.floor(sectionWidth) + (tiltDisplacement < 0 ? tiltDisplacement : 0);
                        imagePosition = 0;
                    } else if (index === splitCount - 1) {
                        // Last image
                        imageWidth = THUMBNAIL_WIDTH - Math.floor(sectionWidth * (splitCount - 1)) - delimiterWidth * (splitCount - 1);
                        imagePosition = Math.floor(sectionWidth * (splitCount - 1)) + delimiterWidth * (splitCount - 1);
                    } else {
                        // Middle image(s)
                        imageWidth = Math.floor(sectionWidth) - delimiterWidth;
                        imagePosition = Math.floor(sectionWidth * index) + delimiterWidth * index;
                    }

                    // Use Math.max to ensure width is positive and reasonable
                    imageWidth = Math.max(imageWidth, sectionWidth - delimiterWidth * 2);

                    // Load the image
                    let imageBuffer = await fs.promises.readFile(imagePath);
                    let processedImage = sharp(imageBuffer);

                    // Apply auto-enhance if enabled
                    if (applyEnhance) {
                        processedImage = await enhanceImage(imageBuffer, enhanceOptions);
                    }

                    // Resize image
                    const resizedImage = await processedImage
                        .resize({
                            width: Math.floor(imageWidth + delimiterWidth * 2),  // Add some extra width for cropping
                            height: THUMBNAIL_HEIGHT,
                            fit: 'cover',
                            position: 'center'
                        })
                        .toBuffer();

                    return {
                        buffer: resizedImage,
                        position: imagePosition
                    };
                } catch (error) {
                    console.error(`Error processing image ${index}:`, error);
                    throw new Error(`Failed to process image ${index + 1}: ${error.message}`);
                }
            })
        );

        // Create composite operations
        const composites = processedImages.map((image) => {
            return {
                input: image.buffer,
                left: image.position,
                top: 0
            };
        });

        // Add delimiter overlays
        delimiterMasks.forEach(mask => {
            composites.push({
                input: mask,
                left: 0,
                top: 0
            });
        });

        // Create output directory if it doesn't exist
        const outputDir = path.join(app.getPath('pictures'), 'YouTube-Thumbnails');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate output filename with date if none provided
        const outputFilename = outputName ||
            `youtube-thumbnail-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}`;
        const outputPath = path.join(outputDir, `${outputFilename}.png`);

        // Create the composite image
        await canvas
            .composite(composites)
            .png()
            .toFile(outputPath);

        console.log('Thumbnail created successfully:', outputPath);
        console.log(`Used ${splitCount} splits for optimal layout`);

        return {
            success: true,
            outputPath,
            outputDir,
            splitCount
        };
    } catch (error) {
        console.error('Error creating thumbnail:', error);
        return {
            success: false,
            error: error.message
        };
    }
});