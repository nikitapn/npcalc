# Texture Atlas Generator

## Overview
Automatically creates a texture atlas from all PNG files in the current directory.

## Requirements
- ImageMagick (v6 or v7)
  - Ubuntu/Debian: `sudo apt install imagemagick`
  - macOS: `brew install imagemagick`
  - Arch: `sudo pacman -S imagemagick`

## Usage

```bash
# Place all your PNG files in this directory, then run:
./create_atlas.sh

# The script will analyze dimensions and offer options if images differ in size
```

### Modes
1. **Resize (Recommended)** - Resizes all images to a uniform size, padding with transparency
2. **Horizontal** - Packs as-is (may waste space if sizes differ)
3. **Grid** - Pack in grid layout (experimental)

The script auto-detects if all images are the same size and chooses the optimal mode.

## Output Files
- `footsteps_atlas.png` - Combined texture atlas image
- `footsteps_atlas.json` - JSON metadata with UV coordinates

## Features
- **Automatic**: Finds all PNG files automatically
- **Generic**: Add/remove PNGs and just re-run the script
- **Sorted**: Processes files alphabetically for consistent results
- **UV Coordinates**: Calculates normalized texture coordinates
- **JSON Format**: Standard JSON for easy parsing

## JSON Structure
```json
{
  "atlas": "footsteps_atlas.png",
  "width": 720,
  "height": 240,
  "textures": {
    "texture_name": {
      "x": 0,
      "y": 0,
      "width": 240,
      "height": 240,
      "originalWidth": 240,    // ← Original dimensions before resize
      "originalHeight": 240,
      "uv": {
        "u1": 0.0,             // ← UV coords for actual image content
        "v1": 0.0,
        "u2": 0.333333,
        "v2": 1.0
      }
    }
  }
}
```

**Note:** When using resize mode, UV coordinates account for centering/padding within each cell.

## Adding New Textures
1. Copy new PNG files to this directory
2. Run `./create_atlas.sh` again
3. The atlas will automatically include all PNGs

## TypeScript Integration
Use with the `TextureAtlas` class:

```typescript
import { TextureAtlas } from '../atlas';
import atlasData from './assets/footsteps_atlas.json';

const atlas = new TextureAtlas(gl, atlasData);
await atlas.load('assets/footsteps_atlas.png');

// Get UV coordinates for a texture
const uvs = atlas.getUVs('dot');
```

## Notes
- Files are packed horizontally (left to right)
- **Resize mode** creates uniform-sized cells (recommended for different-sized images)
  - Maintains aspect ratio
  - Centers images in cells
  - Pads with transparency
  - UV coords adjusted for actual image area
- **Horizontal mode** packs as-is (best for same-sized images)
- Texture names are PNG filenames without extension
- The atlas file itself is excluded from packing
- Images are sorted alphabetically for consistent ordering
