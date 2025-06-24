# YouTube Multi-Layout Thumbnail Creator 📸🎨

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Create professional **YouTube Thumbnails** with flexible grid layouts supporting 1-6 images! 🎨

This powerful app is perfect for YouTube vlogs, tutorials, cooking videos, travel content, "Day in the Life" (DITL) videos, and more! With an intelligent Smart Layout system, 8 different grid configurations, and **NEW flexible image requirements**, you can generate professional-looking thumbnails that help boost engagement on your channel.

**🆕 Latest Updates**:
- Create thumbnails with ANY layout mode regardless of image count - the system now adapts intelligently to your available images!
- **ENTER key shortcut** for instant thumbnail creation - streamlined workflow for faster content creation!

![Universal Multi Image Thumbnail Generator App](universal-vlog-thumbnail-generator.gif)

- [⚙️ Requirement](#%EF%B8%8F-requirement)
- [📦 Installation](#-installation)
- [🪄 Features](#-features)
  - [Flexible Image Requirements](#flexible-image-requirements)
  - [Enhanced Smart Layout System](#enhanced-smart-layout-system)
  - [Dynamic UI Management](#dynamic-ui-management)
- [🎨 New Grid System](#-new-grid-system)
- [🚀 Performance Optimizations](#-performance-optimizations)
- [🧪 Testing](#-testing)
- [👨‍🍳 Who is the baker?](#-who-baked-this)
- [🎥 Me building apps like this one](#-me-building-apps-like-this-one)
- [⚖️ License](#%EF%B8%8F-license)

## ⚙️ Requirement
* [Node.js](https://nodejs.org/) - latest LTS version recommended 🚀
* [Electron](https://www.electronjs.org/) - for cross-platform desktop app support

## 📦 Installation
The simplest way to add this application to your system:

```console
git clone https://github.com/pH-7/youtube-thumbnail-creator.git
cd youtube-thumbnail-creator
npm install # install dependencies
npm start # start the Electron app
```

## 🪄 Features
### Flexible Image Selection
```
Choose 1-6 images from your computer to combine into professional YouTube thumbnails.
Create thumbnails with ANY layout mode regardless of image count - system adapts intelligently.
Smart Layout automatically analyzes your images to recommend the optimal arrangement.
Images are automatically resized to fit standard YouTube thumbnail dimensions (1280×720 pixels).
Advanced image analysis considers aspect ratios, visual complexity, and subject detection.
```

### 8 Different Grid Layouts
```
Linear Layouts: 1×2, 1×3, 2×1, 3×1 (side-by-side and stacked arrangements)
Grid Layouts: 2×2, 2×3, 3×2 (perfect for multiple subjects or scenes)
Single Layout: 1×1 (spotlight a single powerful image)
Legacy Modes: Classic 2-split and 3-split options for backward compatibility
```

### Enhanced Smart Layout System
```
Automatic layout recommendation based on comprehensive image analysis:
- Aspect ratio analysis (portrait, landscape, square detection)
- Visual complexity assessment using entropy calculations
- Color variance and saturation analysis
- Prominent subject detection using edge analysis
- Visual weight calculation for optimal balance
- Confidence scoring for layout recommendations
```

### Flexible Image Requirements
```
NEW! Create thumbnails with any number of images regardless of selected layout:
- Works with 1-6 images for any layout mode
- Smart layout adjustment when fewer images than required
- Automatic image repetition to fill empty slots
- No workflow interruptions - always clickable "Create Thumbnail" button
```

### Customizable Delimiters
```
Adjust delimiter width, color, and tilt angle to create unique separators between images.
Add optional shadows with customizable blur and opacity for professional touch.
Grid-aware delimiter system that adapts to your chosen layout.
```

### Easy Export & Optimization
```
Save thumbnails directly to a dedicated folder in your Pictures directory.
YouTube-optimized compression with metadata stripping for faster uploads.
Custom naming with auto-generated timestamps and layout identifiers.
Performance optimization for large grid layouts (6+ images).
```

### Real-Time Preview
```
See exactly how your thumbnail will look before exporting.
Make adjustments with immediate visual feedback.
```

### **🚀 Keyboard Shortcuts**
```
Speed up your workflow with convenient keyboard shortcuts:
- ENTER key: Instantly create thumbnails (works anywhere in the app when button is enabled)
- Universal trigger: No restrictions - works regardless of cursor position or active element
- System shortcut compatibility: Works alongside Cmd/Ctrl shortcuts without conflicts
```

### Multi-Image Combination
- Combine 2 or 3 images horizontally with clean white delimiters.
- Perfect for creating YouTube thumbnails that showcase multiple scenes or perspectives.

### Automatic Layout Detection
- Smart mode analyzes your images to determine the optimal number of splits.
- Manual mode lets you choose between 2 or 3 image layouts.

### Image Enhancement
- Auto-enhance your images with optimized settings for YouTube thumbnails.
- Choose from None, Light, Medium, or Strong enhancement levels.

### YouTube Optimization
- NEW! Optimize thumbnails specifically for YouTube with WebP format
- Reduces file size by 25-35% while maintaining high quality
- Perfect for faster uploads and better viewer experience

### Customization Options
- Adjust delimiter width and color.
- Apply tilt angles to delimiters for a dynamic look.
- Control enhancement levels to make your thumbnails pop.

## 🎨 New Grid System

### Grid Layout Configurations
The app now supports 8 different grid layouts optimized for various content types:

| Layout | Dimensions | Max Images | Best For |
|--------|------------|------------|----------|
| **1×1** | Single | 1 | Hero shots, portraits, single subject focus |
| **1×2** | Side by side | 2 | Before/after, comparisons, dual perspectives |
| **2×1** | Vertical stack | 2 | Top/bottom scenes, timeline progression |
| **1×3** | Horizontal strip | 3 | Step-by-step tutorials, sequence shots |
| **3×1** | Vertical tower | 3 | Vertical storytelling, progression shots |
| **2×2** | Four square | 4 | Multiple subjects, variety content |
| **2×3** | Six grid | 6 | Complex stories, multiple scenes |
| **3×2** | Six grid (alt) | 6 | Alternative arrangement for 6 images |

### Smart Layout Algorithm
The enhanced Smart Layout system uses advanced image analysis:

```javascript
// Analysis includes:
- Aspect ratio distribution (portrait/landscape/square)
- Visual complexity via entropy calculation
- Color variance and saturation levels
- Prominent subject detection using edge analysis
- Visual weight for balanced compositions
- Confidence scoring (0-1) for layout recommendations
```

### Dynamic UI Management
- Image slots show/hide automatically based on selected layout
- Real-time validation with helpful user feedback
- Smart button states that enable creation with any image count
- Flexible workflow - no layout restrictions or blocked buttons
- Progressive enhancement for large grid layouts
- **Universal ENTER shortcut** - Create thumbnails instantly from anywhere in the app

## 🚀 Performance Optimizations

### Large Grid Handling
- **Progressive Loading**: Optimized processing for 2×3 and 3×2 layouts
- **Quality Scaling**: Slightly reduced compression for grids with 5+ images
- **Memory Management**: Efficient buffer handling for multiple images
- **Batch Processing**: Parallel image analysis with error resilience

### YouTube-Specific Optimizations
```javascript
// Automatic optimizations include:
- Metadata stripping for faster uploads
- Progressive PNG encoding
- Adaptive filtering for better compression
- Color space optimization
- File size reduction while preserving quality
```

### Error Handling & Validation
- Path length validation (Windows compatibility)
- Directory creation with proper error messages
- Image format validation and fallbacks
- Layout compatibility checks
- User-friendly error messages

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
```
✓ Grid Layout System (4 tests)
✓ Image Analysis (2 tests) 
✓ Smart Layout Algorithm (4 tests)
✓ Thumbnail Configuration (2 tests)
✓ Application loads without errors

Test Suites: 1 passed
Tests: 12 passed
Time: ~0.2s
```


## 🧑‍🍳 Who baked this?

[![Pierre-Henry Soria](https://s.gravatar.com/avatar/a210fe61253c43c869d71eaed0e90149?s=200)](https://PH7.me 'Pierre-Henry Soria personal website')

**Pierre-Henry Soria**. A super passionate and enthusiastic software engineer! 🚀 True cheese 🧀 , coffee, and chocolate lover! 😋 Reach me at [PH7.me](https://PH7.me) 💫

☕️ Are you enjoying it? **[Offer me a coffee](https://ko-fi.com/phenry)** (my favorite coffee to start the day is almond flat white 😋)


[![@phenrysay][x-icon]](https://x.com/phenrysay "Follow Me on X") [![YouTube Tech Videos][youtube-icon]](https://www.youtube.com/@pH7Programming "My YouTube Tech Channel") [![pH-7][github-icon]](https://github.com/pH-7 "Follow Me on GitHub")

## 🎥 Me building apps like this one!

Subscribe to my YouTube channel and watch me explain how I build apps from scratch, just like this one. [@pH7Programming](https://www.youtube.com/@pH7Programming/videos).


## ⚖️ License

This YouTube Thumbnail Creator is licensed under the [MIT License](license.md).


<!-- GitHub's Markdown reference links -->
[x-icon]: https://img.shields.io/badge/x-000000?style=for-the-badge&logo=x
[youtube-icon]: https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white
[github-icon]: https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white
