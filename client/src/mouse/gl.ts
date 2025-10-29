// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { vec2 } from 'gl-matrix';

let gl: WebGL2RenderingContext = null;
let the_canvas: HTMLCanvasElement = null;

export const init = (canvas: HTMLCanvasElement): void => {
	the_canvas = canvas;
  gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: false
  });
	if (gl === null) {
		throw "Unable to initialize WebGL. Your browser or machine may not support it.";
	}
}

export const reinit = (): void => {
  if (!the_canvas) {
    console.warn('Canvas not initialized, cannot reinit WebGL context');
    return;
  }

  console.log('Reinitializing WebGL context...');

  // Get new context (old one is lost)
  gl = the_canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: false
  });

  if (gl === null) {
    throw "Unable to reinitialize WebGL. Your browser or machine may not support it.";
  }

  console.log('WebGL context reinitialized');
}

// These functions are used to send footstep positions across different screen resolutions
// Converts screen coordinates to normalized coordinates in range [0, 1]
export function screen_to_normalized_coordinates(x: number, y: number): vec2 {
  return vec2.fromValues(x / the_canvas.width, y / the_canvas.height);
}
// Converts normalized coordinates in range [0, 1] to screen coordinates
export function normalized_coordinates_to_screen(x: number, y: number): vec2 {
	return vec2.fromValues(x * the_canvas.width, y * the_canvas.height);
}

export const getCanvasSize = (): { width: number; height: number } => {
  return {
    width: the_canvas.width,
    height: the_canvas.height
  };
}

export { the_canvas, gl }
