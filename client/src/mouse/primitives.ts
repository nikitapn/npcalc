// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { gl } from 'mouse/gl';
import { mat4 } from "gl-matrix";

export var ndc_quad_vertex_buffer: WebGLBuffer = null;
export var quad_vertex_buffer: WebGLBuffer = null;
export var quad_index_buffer: WebGLBuffer = null;
export var quad_normal_buffer: WebGLBuffer = null;
export var quad_texture_coords_buffer: WebGLBuffer = null;

export var axis_vertex_buffer: WebGLBuffer = null;
export var axis_color_buffer: WebGLBuffer = null;

export var identity_matrix: mat4 = null;

/*
  0      1
  --------
  |      |
  |      |
  --------
  2      3
*/

const quad_vertices = [
  -0.5, +0.5, // 0
  +0.5, +0.5, // 1
  -0.5, -0.5, // 2
  +0.5, -0.5, // 3
];

const quad_indices = [
  0, 1, 2, 1, 3, 2
];

const quad_normals = [
  0.0, 0.0, 1.0,
  0.0, 0.0, 1.0,
  0.0, 0.0, 1.0,
  0.0, 0.0, 1.0,
];

const quad_texture_coords = [
  0.0, 0.0,
  1.0, 0.0,
  0.0, 1.0,
  1.0, 1.0,
];

// Y is inverted in NDC space
const ndc_quad_vertices = [
  -1.0, -1.0, // 0
  +1.0, -1.0, // 1
  -1.0, +1.0, // 2
  +1.0, +1.0, // 3
];


const origin_vertices = [
  0, 0, 0,
  2147483647.0, 0, 0,
  0, 0, 0,
  0, 2147483647.0, 0,
  0, 0, 0,
  0, 0, 2147483647.0,
];

const origin_color = [
  1, 0, 0,
  1, 0, 0,
  0, 1, 0,
  0, 1, 0,
  0, 0, 1,
  0, 0, 1,
];

export const init = (): void => {
  identity_matrix = mat4.create();

  // origin
  axis_vertex_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, axis_vertex_buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(origin_vertices), gl.STATIC_DRAW);

  axis_color_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, axis_color_buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(origin_color), gl.STATIC_DRAW);

  // ndc quad
  ndc_quad_vertex_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ndc_quad_vertex_buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ndc_quad_vertices), gl.STATIC_DRAW);
  
  // quad
  quad_vertex_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad_vertex_buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad_vertices), gl.STATIC_DRAW);

  quad_index_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad_index_buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(quad_indices), gl.STATIC_DRAW);

  quad_texture_coords_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad_texture_coords_buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad_texture_coords), gl.STATIC_DRAW);

  quad_normal_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad_normal_buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad_normals), gl.STATIC_DRAW);
}
