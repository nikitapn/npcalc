// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { gl } from 'mouse/gl'

function isPowerOf2(value: number) {
  return (value & (value - 1)) == 0;
}

export interface Texture {
  texture_id: number;
  texture: WebGLTexture;
}

let texture_list = new Map<string, Texture>();
let current_texture: number = -1;
let texture_count = 0;

class TextureImpl implements Texture {
  texture_id: number;
  texture: WebGLTexture;

  constructor(texture_id: number, texture: WebGLTexture) {
    this.texture_id = texture_id;
    this.texture = texture;
  }
}

export class GLResourses {
  static loadTexture(url: string): Texture {
    if (!url.length) {
      console.log("error in loadTexture() : url is empty");
      return undefined;
    }

    {
      let texture = texture_list.get(url);
      if (texture)
        return texture;
    }

    current_texture = -1;

    const texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Because images have to be download over the internet
    // they might take a moment until they are ready.
    // Until then put a single pixel in the texture so we can
    // use it immediately. When the image has finished downloading
    // we'll update the texture with the contents of the image.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([255, 0, 255, 255]);  // opaque blue

    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);

    const image = new Image();

    image.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);

      // WebGL1 has different requirements for power of 2 images
      // vs non power of 2 images so check if the image is a
      // power of 2 in both dimensions.
      if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
        // Yes, it's a power of 2. Generate mips.
        gl.generateMipmap(gl.TEXTURE_2D);
      } else {
        // No, it's not a power of 2. Turn of mips and set
        // wrapping to clamp to edge
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    };

    image.src = url;

    let t = new TextureImpl(texture_count++, texture);
    texture_list.set(url, t);

    return t;
  }

  static bindTexture(texture: Texture) {
    if (texture.texture_id == current_texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    current_texture = texture.texture_id;
  }

  static bindTexture2D(texture: WebGLTexture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    current_texture = -1;
  }

  static bindTextureCube(texture: WebGLTexture) {
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    current_texture = -1;
  }

  static loadCubemap(faces: string[]) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    const level = 0;
    const internalFormat = gl.RGB;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGB;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([220, 220, 220, 255]);

    for (let i: number = 0; i < faces.length; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, level, internalFormat, width, height, border, srcFormat, srcType, pixel);

      const image = new Image();

      image.onload = function () {
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, level, internalFormat, srcFormat, srcType, image);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      };

      image.src = faces[i];
    }
    return texture;
  }
}