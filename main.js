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

// Apply auto-enhancement to an image buffer
async function autoEnhanceImage(buffer, enhanceLevel = 'medium') {
    try {
        let enhancedImage = sharp(buffer);
        
        // Apply different enhancement levels
        switch(enhanceLevel) {
            case 'light':
                enhancedImage = enhancedImage
                    .modulate({ brightness: 1.05, saturation: 1.1 })
                    .sharpen({ sigma: 0.5 });
                break;
            case 'medium':
                enhancedImage = enhancedImage
                    .modulate({ brightness: 1.1, saturation: 1.2 })
                    .sharpen({ sigma: 0.8 })
                    .gamma(0.9);
                break;
            case 'high':
                enhancedImage = enhancedImage
                    .modulate({ brightness: 1.15, saturation: 1.3 })
                    .sharpen({ sigma: 1.0 })
                    .gamma(0.85);
                break;
            default:
                // No enhancement
                break;
        }
        
        return await enhancedImage.toBuffer();
    } catch (error) {
        console.error('Error enhancing image:', error);
        // Return original buffer if enhancement fails
        return buffer;
    }
}

// Handle thumbnail creation with tilted delimiters
ipcMain.handle('create-thumbnail', async (event, data) => {
    const { imagePaths, delimiterWidth, delimiterTilt, outputName, enhanceLevel, delimiterColor } = data;

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

        // Parse delimiter color (default to white if invalid)
        let parsedColor = { r: 255, g: 255, b: 255 };
        if (delimiterColor && delimiterColor.startsWith('#')) {
            const hex = delimiterColor.substring(1);
            parsedColor = {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16)
            };
        }

        // Create SVG for the tilted delimiter mask
        const createDelimiterSVG = (position, tiltDisplacement, width) => {
            // Calculate the starting and ending x-positions based on tilt
            const halfTiltDisp = tiltDisplacement / 2;
            const x1 = position - halfTiltDisp - width / 2;
            const x2 = position + halfTiltDisp - width / 2;

            // Use the parsed color for the delimiter
            const colorString = `rgb(${parsedColor.r}, ${parsedColor.g}, ${parsedColor.b})`;

            return `
        <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}">
          <polygon 
            points="${x1},0 ${x1 + width},0 ${x2 + width},${THUMBNAIL_HEIGHT} ${x2},${THUMBNAIL_HEIGHT}" 
            fill="${colorString}" 
          />
        </svg>
      `;
        };

        // Calculate image positions and widths accounting for tilted delimiters
        // Fix the calculations to ensure no gaps or overlaps
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
                // Calculate width based on section and account for tilt
                let imageWidth;

                if (index === 0) {
                    // First image (adjust width based on first delimiter tilt)
                    imageWidth = firstDelimiterPos + (tiltDisplacement < 0 ? Math.min(0, tiltDisplacement) : 0);
                } else if (index === 1) {
                    // Middle image - ensure proper width between delimiters
                    imageWidth = secondDelimiterPos - firstDelimiterPos;
                } else {
                    // Last image - ensure it extends to the edge
                    imageWidth = THUMBNAIL_WIDTH - secondDelimiterPos;
                }

                // Ensure width is positive and reasonable
                imageWidth = Math.max(imageWidth, sectionWidth / 2);

                // Read image and apply auto-enhancement
                const imageBuffer = await sharp(imagePath)
                    .resize({
                        width: Math.ceil(imageWidth),
                        height: THUMBNAIL_HEIGHT,
                        fit: 'cover',
                        position: 'center'
                    })
                    .toBuffer();
                
                // Apply auto-enhancement if requested
                if (enhanceLevel && enhanceLevel !== 'none') {
                    return await autoEnhanceImage(imageBuffer, enhanceLevel);
                }
                
                return imageBuffer;
            })
        );

        // Calculate positions for each image - ensure integer values and no gaps
        const positions = [
            { left: 0, top: 0 },
            { left: Math.floor(firstDelimiterPos), top: 0 },
            { left: Math.floor(secondDelimiterPos), top: 0 }
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