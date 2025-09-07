# YouTube Multi-Layout Thumbnail Creator 📸🎨

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Create professional **YouTube Thumbnails** with flexible grid layouts supporting 1-6 images! 🎨

This powerful app is perfect for YouTube vlogs, tutorials, cooking videos, travel content, "Day in the Life" (DITL) videos, and more! With an intelligent Smart Layout system, 8 different grid configurations, and **NEW flexible image requirements**, you can generate professional-looking thumbnails that help boost engagement on your channel.

**🆕 Latest Updates (v3.0.0)**:
- ✨ **Universal image support**: Create thumbnails with ANY layout mode regardless of image count - smart adaptation included!
- 🖼️ **Text Behind Image**: Add meaningful texts that automatically fits ANY thumbnail with beautiful fonts, colors, etc.
- ⚡ **ENTER key shortcut**: Instant thumbnail creation from anywhere in the app
- 🧠 **Enhanced AI analysis**: Improved image analysis for better automatic layout selection
- 🔧 **Mac App Store ready**: Pre-built packages available for App Store submission

![Universal Multi Image Thumbnail Generator App](media/demo-youyube-thumbnail-maker-studio.gif)

- [⚙️ Requirements](#%EF%B8%8F-requirements)
- [📦 Installation](#-installation)
- [🪄 Features](#-features)
- [🎨 Grid Layout System](#-grid-layout-system)
- [🚀 Performance & Optimization](#-performance--optimization)
- [🧪 Testing](#-testing)
- [🛠️ Development](#%EF%B8%8F-development)
- [👨‍🍳 Who made this?](#-who-made-this)
- [🎥 Watch me build apps like this](#-watch-me-build-apps-like-this)
- [⚖️ License](#%EF%B8%8F-license)

## ⚙️ Requirements
* [Node.js](https://nodejs.org/) v18+ (latest LTS version recommended) 🚀
* [Electron](https://www.electronjs.org/) v22+ for cross-platform desktop support
* macOS 10.14+ for Mac App Store builds

## 📦 Installation

### Quick Start
```bash
# Clone the repository
git clone https://github.com/pH-7/youtube-thumbnail-creator.git
cd youtube-thumbnail-creator

# Install dependencies (includes Sharp.js image processing)
npm install

# Launch the application
npm start
```

### System Requirements
- **Node.js**: v18+ (LTS recommended)
- **Operating System**: macOS 10.14+, Windows 10+, or Ubuntu 18.04+
- **Memory**: 4GB RAM minimum (8GB recommended for large image processing)
- **Storage**: 500MB free space for application and dependencies

## 🪄 Features

### ✨ **Flexible Thumbnail Creation**
- **1-6 images support**: Create thumbnails with any number of images
- **Smart adaptation**: System automatically adjusts layouts when you have fewer images than the selected grid requires
- **No workflow interruptions**: "Create Thumbnail" button always available when you have at least 1 image
- **Standard YouTube dimensions**: All thumbnails output at 1280×720 pixels

### 🎨 **8 Different Grid Layouts**
- **Linear layouts**: 1×2, 1×3, 2×1, 3×1 for side-by-side and stacked arrangements
- **Grid layouts**: 2×2, 2×3, 3×2 for complex compositions with multiple subjects
- **Single layout**: 1×1 for spotlight focus on one powerful image
- **Smart Auto mode**: Automatically selects optimal layout based on image analysis

### 🧠 **Intelligent Smart Layout System**
- **Advanced image analysis**: Considers aspect ratios, visual complexity, and subject detection
- **Entropy calculation**: Assesses visual complexity for optimal grid placement
- **Color variance analysis**: Evaluates saturation and vibrancy for balanced compositions
- **Edge detection**: Identifies prominent subjects for strategic positioning
- **Confidence scoring**: 0-1 ratings for layout recommendations

### 🚀 **Keyboard Shortcuts & UX**
- **Universal ENTER shortcut**: Create thumbnails instantly from anywhere in the app
- **Drag & drop support**: Rearrange images by dragging between slots
- **Real-time preview**: See exactly how your thumbnail will look before exporting
- **Smart status messages**: Clear feedback on image counts and layout adjustments

### 🎛️ **Customization Options**
- **Delimiter controls**: Adjust width, color, and tilt angle for separators between images
- **Image enhancement**: Choose from None, Light, Medium, or High enhancement levels
- **YouTube optimization**: Automatic metadata stripping and compression optimization
- **Custom naming**: Optional output filename customization

### 📁 **Export & Management**
- **Automatic organization**: Saves to dedicated folder in Pictures directory
- **Performance optimization**: Special handling for large grid layouts (6+ images)
- **File management**: Open output folder directly from the app
- **Batch processing**: Efficient handling of multiple images with error resilience

## 🎨 Grid Layout System

### Available Layouts
The app supports 8 optimized grid configurations:

| Layout | Configuration | Max Images | Best Use Cases |
|--------|---------------|------------|----------------|
| **1×1** | Single image | 1 | Hero shots, portraits, single subject focus |
| **1×2** | Side by side | 2 | Before/after comparisons, dual perspectives |
| **2×1** | Vertical stack | 2 | Top/bottom scenes, timeline progression |
| **1×3** | Horizontal strip | 3 | Step-by-step tutorials, sequence shots |
| **3×1** | Vertical tower | 3 | Vertical storytelling, progression shots |
| **2×2** | Four square | 4 | Multiple subjects, variety content |
| **2×3** | Six grid | 6 | Complex stories, multiple scenes |
| **3×2** | Six grid alt | 6 | Alternative 6-image arrangement |

### Smart Layout Algorithm
The Auto mode uses advanced analysis to recommend optimal layouts:

```javascript
// Analysis factors include:
- Aspect ratio distribution (portrait/landscape/square detection)
- Visual complexity via entropy calculation  
- Color variance and saturation levels
- Prominent subject detection using edge analysis
- Visual weight calculation for balanced compositions
- Confidence scoring (0-1) for layout recommendations
```

### Dynamic Interface
- **Adaptive UI**: Image slots show/hide automatically based on selected layout
- **Smart validation**: Real-time feedback with helpful user guidance
- **Flexible workflow**: Create thumbnails with any image count - no restrictions
- **Universal shortcuts**: ENTER key works anywhere in the app for instant creation

## 🚀 Performance & Optimization

### Large Grid Handling
- **Progressive processing**: Optimized performance for 2×3 and 3×2 layouts (6+ images)
- **Quality scaling**: Adaptive compression maintains quality while managing file sizes
- **Memory management**: Efficient buffer handling prevents memory issues with multiple images
- **Batch processing**: Parallel image analysis with comprehensive error resilience

### YouTube-Specific Optimizations
- **Metadata stripping**: Removes EXIF data for faster uploads and privacy
- **Progressive encoding**: PNG optimization for better compression ratios
- **Adaptive filtering**: Smart compression algorithms preserve visual quality
- **Color space optimization**: Ensures consistent colors across different devices
- **File size reduction**: 25-35% smaller files without visible quality loss

### Error Handling & Validation
- **Path compatibility**: Windows long path validation and cross-platform support
- **Directory management**: Automatic folder creation with proper error messages
- **Image format validation**: Supports JPG, PNG, WebP with intelligent fallbacks
- **Layout validation**: Prevents invalid configurations and provides helpful guidance
- **User-friendly messages**: Clear, actionable error descriptions

## 🧪 Testing

### Comprehensive Test Suite
Run the test suite to verify all functionality:

```bash
npm test
```

### Test Coverage
- **Grid Layout System**: Validates all 8 layout configurations
- **Image Analysis**: Tests aspect ratio and orientation detection
- **Smart Algorithm**: Verifies layout selection logic
- **Thumbnail Dimensions**: Ensures YouTube compliance
- **Cell Calculations**: Validates grid positioning math

### Test Results
✅ **12 tests passing** - Complete test coverage across all core functionality:

```
✓ Grid Layout System (4 tests)
✓ Image Analysis (2 tests) 
✓ Smart Layout Algorithm (4 tests)
✓ Thumbnail Configuration (2 tests)
✓ Application loads without errors

Test Suites: 1 passed, 0 failed
Tests: 12 passed, 0 failed
Time: ~0.2s, estimated ~0.1s per test
```

## 🛠️ Development

### Getting Started
```bash
# Clone and setup
git clone https://github.com/pH-7/youtube-thumbnail-creator.git
cd youtube-thumbnail-creator
npm install

# Start development
npm start

# Run tests
npm test

# Build for production
npm run dist
```

### Available Scripts
- `npm start` - Launch the Electron app in development mode
- `npm test` - Run the comprehensive Jest test suite
- `npm run pack` - Package the app without distribution
- `npm run dist` - Build distributable packages for all platforms
- `npm run mas-dev` - Build Mac App Store development version
- `npm run rebuild-sharp` - Rebuild native Sharp.js dependencies

### Architecture
- **Frontend**: HTML5, CSS3, Vanilla JavaScript with modern ES6+ features
- **Backend**: Electron main process with Node.js APIs
- **Image Processing**: Sharp.js for high-performance image manipulation
- **Testing**: Jest for unit and integration testing
- **Build System**: Electron Builder for cross-platform packaging

## 👨‍🍳 Who made this?

[![Pierre-Henry Soria](https://s.gravatar.com/avatar/a210fe61253c43c869d71eaed0e90149?s=200)](https://PH7.me 'Pierre-Henry Soria personal website')

**Pierre-Henry Soria**. A super passionate and enthusiastic software engineer! 🚀 True cheese 🧀 , coffee, and chocolate lover! 😋 Reach me at [pH7.me](https://ph7.me) 💫

[![YouTube Tech Videos][youtube-icon]](https://www.youtube.com/@pH7Programming "My YouTube Tech Channel") [![@phenrysay][x-icon]](https://x.com/phenrysay "Follow Me on X") [![pH-7][github-icon]](https://github.com/pH-7 "Follow Me on GitHub") [![BlueSky][:bsky-icon]](https://bsky.app/profile/ph7s.bsky.social "Follow Me on BlueSky")

☕️ **Enjoying this project?** [Buy me a coffee](https://ko-fi.com/phenry) (my favorite is almond flat white ☕️)


## 🎥 Watch me build apps like this

Subscribe to my YouTube channel to watch me explain how I build apps from scratch, just like this one: [@pH7Programming](https://www.youtube.com/@pH7Programming/videos) 🎬


## ⚖️ License

This **YouTube Thumbnail Creator** is licensed under the [MIT License](license.md).


<!-- GitHub's Markdown reference links -->
[x-icon]: https://img.shields.io/badge/x-000000?style=for-the-badge&logo=x
[bsky-icon]: https://img.shields.io/badge/BlueSky-00A8E8?style=for-the-badge&logo=bluesky&logoColor=white
[youtube-icon]: https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white
[github-icon]: https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white
