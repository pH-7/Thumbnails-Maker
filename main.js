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
    console.log('Selecting images...');
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

// Handle thumbnail creation with tilted delimiters
ipcMain.handle('create-thumbnail', async (event, data) => {
    const { imagePaths, delimiterWidth, delimiterTilt, outputName } = data;

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
            const x1 = position + (tiltDisplacement < 0 ? Math.abs(tiltDisplacement) : 0);
            const x2 = position + (tiltDisplacement > 0 ? tiltDisplacement : 0);

            return `
        <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}">
          <polygon 
            points="${x1},0 ${x1 + width},0 ${x2 + width},${THUMBNAIL_HEIGHT} ${x2},${THUMBNAIL_HEIGHT}" 
            fill="white" 
          />
        </svg>
      `;
        };

        // Calculate image positions and widths accounting for tilted delimiters
        const sectionWidth = THUMBNAIL_WIDTH / 3;
        const firstDelimiterPos = sectionWidth;
        const secondDelimiterPos = sectionWidth * 2;

        // Create delimiter masks
        const firstDelimiterMask = Buffer.from(
            createDelimiterSVG(firstDelimiterPos - delimiterWidth / 2, tiltDisplacement, delimiterWidth)
        );

        const secondDelimiterMask = Buffer.from(
            createDelimiterSVG(secondDelimiterPos - delimiterWidth / 2, tiltDisplacement, delimiterWidth)
        );

        // Process images - resize each one to fit in the thumbnail
        const processedImages = await Promise.all(
            imagePaths.map(async (imagePath, index) => {
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

                // Ensure width is positive
                imageWidth = Math.max(imageWidth, sectionWidth - delimiterWidth);

                return await sharp(imagePath)
                    .resize({
                        width: Math.floor(imageWidth + delimiterWidth),  // Add some extra width for cropping
                        height: THUMBNAIL_HEIGHT,
                        fit: 'cover',
                        position: 'center'
                    })
                    .toBuffer();
            })
        );

        // Calculate positions for each image
        const positions = [
            { left: 0, top: 0 },
            { left: firstDelimiterPos + delimiterWidth / 2, top: 0 },
            { left: secondDelimiterPos + delimiterWidth / 2, top: 0 }
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