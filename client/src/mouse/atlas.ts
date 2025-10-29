// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

/**
 * Texture Atlas Utility
 * 
 * Manages a single texture atlas containing multiple textures.
 * Use this to minimize texture switches and improve batching.
 */

export interface AtlasRegion {
  x: number;       // Pixel coordinates in atlas
  y: number;
  width: number;   // Cell size in atlas
  height: number;
  originalWidth?: number;   // Original image dimensions (before resize/padding)
  originalHeight?: number;
  uv: {           // Normalized UV coordinates [0, 1] for actual image content
    u1: number;   // Left
    v1: number;   // Top
    u2: number;   // Right
    v2: number;   // Bottom
  };
}

export interface AtlasData {
  atlas: string;
  width: number;
  height: number;
  textures: Record<string, AtlasRegion>;
}

export class TextureAtlas {
  private texture: WebGLTexture;
  private regions: Map<string, AtlasRegion>;
  
  constructor(
    private gl: WebGL2RenderingContext,
    private data: AtlasData
  ) {
    this.regions = new Map();
    for (const [name, region] of Object.entries(data.textures)) {
      this.regions.set(name, region);
    }
  }

  /**
   * Get UV coordinates for a specific texture in the atlas
   */
  getRegion(name: string): AtlasRegion | undefined {
    return this.regions.get(name);
  }

  /**
   * Get UV coordinates as Float32Array for shader upload
   */
  getUVs(name: string): Float32Array | null {
    const region = this.regions.get(name);
    if (!region) return null;

    // Return UVs for a quad: [bottom-left, bottom-right, top-left, top-right]
    return new Float32Array([
      region.uv.u1, region.uv.v2,  // Bottom-left
      region.uv.u2, region.uv.v2,  // Bottom-right
      region.uv.u1, region.uv.v1,  // Top-left
      region.uv.u2, region.uv.v1,  // Top-right
    ]);
  }

  /**
   * Get normalized texture ID for instanced rendering
   * Maps texture name to a number in [0, 1] range
   */
  getTextureId(name: string): number {
    const region = this.regions.get(name);
    if (!region) return 0;
    
    // For horizontal atlas: use U coordinate of left edge
    return region.uv.u1;
  }

  /**
   * Load the atlas texture from an image URL
   */
  async load(imageUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      
      image.onload = () => {
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        
        // Upload image
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          image
        );
        
        // Set filtering
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        
        resolve();
      };
      
      image.onerror = () => reject(new Error(`Failed to load atlas: ${imageUrl}`));
      image.src = imageUrl;
    });
  }

  /**
   * Bind the atlas texture
   */
  bind(unit: number = 0): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  /**
   * Get the WebGL texture object
   */
  getTexture(): WebGLTexture {
    return this.texture;
  }

  /**
   * Dispose of the texture
   */
  dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}

// Usage example:
/*
// 1. Load atlas data
const atlasData = await fetch('footsteps_atlas.json').then(r => r.json());

// 2. Create atlas
const atlas = new TextureAtlas(gl, atlasData);
await atlas.load('footsteps_atlas.png');

// 3. Use in renderer
atlas.bind(0); // Bind to texture unit 0

// 4. Get UV coordinates for a specific texture
const dotUVs = atlas.getUVs('dot');
const footstepsUVs = atlas.getUVs('footsteps');

// 5. For instanced rendering with texture ID
const textureId = atlas.getTextureId('footsteps1'); // Returns 0.0-1.0
*/
