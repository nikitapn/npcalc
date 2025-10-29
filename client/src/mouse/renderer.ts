// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { gl } from 'mouse/gl';
import { quad_vertex_buffer, quad_index_buffer, quad_texture_coords_buffer } from './primitives';
import { vec2, vec4 } from 'gl-matrix';
import { shaders } from './shaders';
import { TextureAtlas } from './atlas';
import atlasData from 'mouse/assets/atlas.json';

export interface Renderable {
  position: vec2;
  angle: number;
  width: number;    // size instead of tex_coord
  height: number;
  color: vec4;
  textureName: 'dot' | 'footsteps' | 'footsteps1';  // which texture in atlas
}

export class ParticleRenderer {
  private objects: Array<Renderable> = [];
  private atlas: TextureAtlas;
  private instanceBuffer: WebGLBuffer;
  private maxInstances: number = 200000;  // Pre-allocate for this many

  // Instance data layout: [x, y, angle, scaleX, scaleY, r, g, b, a, uvOffsetX, uvOffsetY]
  // Total: 11 floats per instance
  private instanceData: Float32Array;

  constructor(private width: number, private height: number) {
    this.instanceBuffer = gl.createBuffer();
    this.instanceData = new Float32Array(this.maxInstances * 11);
  }

  async init() {
    // Load texture atlas
    this.atlas = new TextureAtlas(gl, atlasData);
    await this.atlas.load('/img/atlas.png');
    console.log('Atlas loaded successfully:', atlasData.width, 'x', atlasData.height);
  }

  private setupInstanceAttributes() {
    const pinfo = shaders.particle_instanced.use();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    const stride = 11 * 4; // 11 floats * 4 bytes

    // in_instance_position (vec2)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_position);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_position, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_position, 1);

    // in_instance_angle (float)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_angle);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_angle, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_angle, 1);

    // in_instance_scale (vec2)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_scale);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_scale, 2, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_scale, 1);

    // in_instance_color (vec4)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_color);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_color, 4, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_color, 1);

    // in_instance_uv_offset (vec2)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_uv_offset);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_uv_offset, 2, gl.FLOAT, false, stride, 36);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_uv_offset, 1);
  }

  public render() {
    gl.viewport(0, 0, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.clearDepth(1.0);
    // gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.objects.length === 0)
      return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // Use instanced shader
    const pinfo = shaders.particle_instanced.use();

    // Bind texture atlas
    this.atlas.bind(0);
    gl.uniform1i(pinfo.uniform_loc.u_sampler, 0);

    // Set uniforms
    gl.uniform2f(pinfo.uniform_loc.u_screen_size, this.width, this.height);
    gl.uniform2f(pinfo.uniform_loc.u_atlas_uv_scale, 1.0 / 3.0, 1.0); // 3 textures horizontally

    // Pack instance data
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      const offset = i * 11;

      // Get UV offset from atlas
      const region = this.atlas.getRegion(obj.textureName);
      const uvOffsetX = region ? region.uv.u1 : 0;
      const uvOffsetY = region ? region.uv.v1 : 0;

      this.instanceData[offset + 0] = obj.position[0];
      this.instanceData[offset + 1] = obj.position[1];
      this.instanceData[offset + 2] = obj.angle;
      this.instanceData[offset + 3] = obj.width;
      this.instanceData[offset + 4] = obj.height;
      this.instanceData[offset + 5] = obj.color[0];
      this.instanceData[offset + 6] = obj.color[1];
      this.instanceData[offset + 7] = obj.color[2];
      this.instanceData[offset + 8] = obj.color[3];
      this.instanceData[offset + 9] = uvOffsetX;
      this.instanceData[offset + 10] = uvOffsetY;
    }

    // Upload instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.subarray(0, this.objects.length * 11), gl.DYNAMIC_DRAW);

    // Setup instance attributes
    this.setupInstanceAttributes();

    // Setup vertex attributes (shared quad)
    gl.bindBuffer(gl.ARRAY_BUFFER, quad_vertex_buffer);
    gl.vertexAttribPointer(pinfo.attr_loc.in_position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pinfo.attr_loc.in_position);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_position, 0); // Not instanced

    gl.bindBuffer(gl.ARRAY_BUFFER, quad_texture_coords_buffer);
    gl.vertexAttribPointer(pinfo.attr_loc.in_texture_coord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pinfo.attr_loc.in_texture_coord);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_texture_coord, 0); // Not instanced

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad_index_buffer);

    // Draw all instances in ONE call!
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.objects.length);

    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('WebGL error after drawElementsInstanced:', error);
    }

    // Reset divisors
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_position, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_angle, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_scale, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_color, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_uv_offset, 0);

    // console.log('Rendered', this.objects.length, 'particles');

    // Clear for next frame
    this.objects = [];
  }

  public push_particle(p: Renderable) {
    if (this.objects.length < this.maxInstances) {
      this.objects.push(p);
    } else {
      // console.warn('Max instances reached:', this.maxInstances);
    }
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

export let the_particle_renderer: ParticleRenderer;

export const init_particle_renderer = async (width: number, height: number) => {
  console.log('Initializing particle renderer:', width, 'x', height);
  the_particle_renderer = new ParticleRenderer(width, height);
  await the_particle_renderer.init();
  console.log('Particle renderer initialized successfully');
}