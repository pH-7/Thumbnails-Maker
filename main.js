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

// Apply auto-enhance to image
async function enhanceImage(buffer, enhanceOptions) {
    const { brightness, contrast, saturation } = enhanceOptions;

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

    return processedImage;
}

// Handle thumbnail creation with tilted delimiters and auto-enhance
ipcMain.handle('create-thumbnail', async (event, data) => {
    const {
        imagePaths,
        delimiterWidth,
        delimiterTilt,
        outputName,
        enhanceOptions = { brightness: 1.0, contrast: 1.0, saturation: 1.0 },
        applyEnhance = false
    } = data;

    try {
        if (imagePaths.length !== 3) {
            throw new Error('Exactly 3 images are required for the thumbnail');
        }

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
            const fillColor = 'white';

            return `
        <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}">
          <polygon 
            points="${x1},0 ${x1 + width},0 ${x2 + width},${THUMBNAIL_HEIGHT} ${x2},${THUMBNAIL_HEIGHT}" 
            fill="${fillColor}"
          />
        </svg>
      `;
        };

        // Calculate image positions and widths accounting for tilted delimiters
        const sectionWidth = THUMBNAIL_WIDTH / 3;
        const firstDelimiterPos = Math.floor(sectionWidth);
        const secondDelimiterPos = Math.floor(sectionWidth * 2);

        // Create delimiter masks
        const firstDelimiterMask = Buffer.from(
            createDelimiterSVG(firstDelimiterPos, tiltDisplacement, delimiterWidth)
        );

        const secondDelimiterMask = Buffer.from(
            createDelimiterSVG(secondDelimiterPos, tiltDisplacement, delimiterWidth)
        );

        // Process images - resize each one to fit in the thumbnail
        const processedImages = await Promise.all(
            imagePaths.map(async (imagePath, index) => {
                try {
                    // Calculate width based on section and account for tilt
                    let imageWidth;

                    if (index === 0) {
                        // First image (adjust width based on first delimiter tilt)
                        imageWidth = firstDelimiterPos + (tiltDisplacement < 0 ? tiltDisplacement : 0);
                    } else if (index === 1) {
                        // Middle image
                        imageWidth = secondDelimiterPos - firstDelimiterPos - delimiterWidth;
                    } else {
                        // Last image
                        imageWidth = THUMBNAIL_WIDTH - secondDelimiterPos - delimiterWidth;
                    }

                    // Use  Math.max to ensure width is positive and reasonable
                    imageWidth = Math.max(imageWidth, sectionWidth - delimiterWidth * 2);

                    // Load the image
                    let imageBuffer = await fs.promises.readFile(imagePath);
                    let processedImage = sharp(imageBuffer);

                    // Apply auto-enhance if enabled
                    if (applyEnhance) {
                        processedImage = await enhanceImage(imageBuffer, enhanceOptions);
                    }

                    // Resize image
                    return await processedImage
                        .resize({
                            width: Math.floor(imageWidth + delimiterWidth * 2),  // Add some extra width for cropping
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

        // Calculate positions for each image to account for tilted delimiters
        const positions = [
            { left: 0, top: 0 },
            {
                left: Math.floor(firstDelimiterPos + delimiterWidth / 2 +
                    (tiltDisplacement < 0 ? Math.min(0, tiltDisplacement / 2) : 0)),
                top: 0
            },
            {
                left: Math.floor(secondDelimiterPos + delimiterWidth / 2 +
                    (tiltDisplacement < 0 ? Math.min(0, tiltDisplacement) : 0)),
                top: 0
            }
        ];

        // Create composite operations
        const composites = processedImages.map((buffer, index) => {
            return {
                input: buffer,
                left: positions[index].left,
                top: positions[index].top
            };
        });

        // Add delimiter overlays
        composites.push(
            {
                input: firstDelimiterMask,
                left: 0,
                top: 0
            },
            {
                input: secondDelimiterMask,
                left: 0,
                top: 0
            }
        );

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

        return {
            success: true,
            outputPath,
            outputDir
        };
    } catch (error) {
        console.error('Error creating thumbnail:', error);
        return {
            success: false,
            error: error.message
        };
    }
});