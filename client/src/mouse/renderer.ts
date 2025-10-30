// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { gl } from 'mouse/gl';
import { ndc_quad_vertex_buffer, quad_vertex_buffer, quad_index_buffer, quad_texture_coords_buffer } from './primitives';
import { vec2, vec3, vec4 } from 'gl-matrix';
import { shaders } from './shaders';
import { TextureAtlas } from './atlas';
import atlasData from 'mouse/assets/atlas.json';

export interface Renderable {
  position: vec2;
  angle: number;
  width: number;
  height: number;
  color: vec4;
  textureName: 'dot' | 'footsteps' | 'footsteps1';
  age: number;           // 0.0 (birth) to 1.0 (death) for shader effects
  glowIntensity?: number; // Glow strength (default: 1.0)
  glowRadius?: number;    // Glow radius multiplier (default: 1.0)
}

export interface ExplosionLight {
  position: vec2;
  color: vec3;
  intensity: number;  // 0-1, fades over time
  lifetime: number;   // Current age
  maxLifetime: number; // When to remove
}

export class ParticleRenderer {
  private objects: Array<Renderable> = [];
  private explosions: Array<ExplosionLight> = [];
  private atlas: TextureAtlas;
  private instanceBuffer: WebGLBuffer;
  private maxInstances: number = 200000;  // Pre-allocate for this many
  private framebuffer: WebGLFramebuffer = null;
  private framebufferTexture: WebGLTexture = null;
  private time: number = 0; // Accumulated time for animations

  // Instance data layout: [x, y, angle, scaleX, scaleY, r, g, b, a, uvOffsetX, uvOffsetY, age, glowIntensity, glowRadius]
  // Total: 14 floats per instance
  private instanceData: Float32Array;

  constructor(private width: number, private height: number) {
    this.instanceBuffer = gl.createBuffer();
    this.instanceData = new Float32Array(this.maxInstances * 14);
  }

  async init() {
    // Load texture atlas
    this.atlas = new TextureAtlas(gl, atlasData);
    await this.atlas.load('/img/atlas.png');
    console.log('Atlas loaded successfully:', atlasData.width, 'x', atlasData.height);

    this.framebufferTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.framebufferTexture, 0);
  }

  private setupInstanceAttributes() {
    const pinfo = shaders.particle_instanced.use();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    const stride = 14 * 4; // 14 floats * 4 bytes

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

    // in_instance_age (float)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_age);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_age, 1, gl.FLOAT, false, stride, 44);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_age, 1);

    // in_instance_glow_intensity (float)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_glow_intensity);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_glow_intensity, 1, gl.FLOAT, false, stride, 48);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_glow_intensity, 1);

    // in_instance_glow_radius (float)
    gl.enableVertexAttribArray(pinfo.attr_loc.in_instance_glow_radius);
    gl.vertexAttribPointer(pinfo.attr_loc.in_instance_glow_radius, 1, gl.FLOAT, false, stride, 52);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_glow_radius, 1);
  }

  private main_pass() {

    if (this.objects.length === 0)
      return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // Use instanced shader
    const pinfo = shaders.particle_instanced.use();

    // Bind texture atlas
    // this.atlas.bind(0);
    // gl.uniform1i(pinfo.uniform_loc.u_sampler, 0);

    // Set uniforms
    gl.uniform2f(pinfo.uniform_loc.u_screen_size, this.width, this.height);
    gl.uniform2f(pinfo.uniform_loc.u_atlas_uv_scale, 1.0 / 3.0, 1.0); // 3 textures horizontally

    // Pack instance data
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      const offset = i * 14;

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
      this.instanceData[offset + 11] = obj.age;
      this.instanceData[offset + 12] = obj.glowIntensity ?? 1.0;
      this.instanceData[offset + 13] = obj.glowRadius ?? 1.0;
    }

    // Upload instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.subarray(0, this.objects.length * 14), gl.DYNAMIC_DRAW);

    // Setup instance attributes
    this.setupInstanceAttributes();

    // Setup vertex attributes (shared quad)
    gl.bindBuffer(gl.ARRAY_BUFFER, quad_vertex_buffer);
    gl.vertexAttribPointer(pinfo.attr_loc.in_position, 2, gl.FLOAT, false, 0, 0);
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
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_age, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_glow_intensity, 0);
    gl.vertexAttribDivisor(pinfo.attr_loc.in_instance_glow_radius, 0);

    // Clear for next frame
    this.objects = [];
  }

  private postprocess_pass() {
    const pinfo = shaders.postprocess.use();

    // Bind framebuffer texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.uniform1i(pinfo.uniform_loc.u_particles, 0);

    // Set screen size uniform
    gl.uniform2f(pinfo.uniform_loc.u_screen_size, this.width, this.height);
    
    // Set time uniform for star twinkling
    gl.uniform1f(pinfo.uniform_loc.u_time, this.time);

    // Set explosion data uniforms
    gl.uniform1i(pinfo.uniform_loc.u_explosion_count, this.explosions.length);
    
    const positions = new Float32Array(20); // 10 * vec2
    const colors = new Float32Array(30);    // 10 * vec3
    const intensities = new Float32Array(10);
    
    for (let i = 0; i < Math.min(this.explosions.length, 10); i++) {
      const exp = this.explosions[i];
      positions[i * 2 + 0] = exp.position[0];
      positions[i * 2 + 1] = exp.position[1];
      colors[i * 3 + 0] = exp.color[0];
      colors[i * 3 + 1] = exp.color[1];
      colors[i * 3 + 2] = exp.color[2];
      intensities[i] = exp.intensity;
    }
    
    gl.uniform2fv(pinfo.uniform_loc.u_explosion_positions, positions);
    gl.uniform3fv(pinfo.uniform_loc.u_explosion_colors, colors);
    gl.uniform1fv(pinfo.uniform_loc.u_explosion_intensities, intensities);

    // Setup vertex attributes (ndc quad)
    gl.bindBuffer(gl.ARRAY_BUFFER, ndc_quad_vertex_buffer);
    gl.vertexAttribPointer(pinfo.attr_loc.in_position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pinfo.attr_loc.in_position);

    // Setup texture coords
    gl.bindBuffer(gl.ARRAY_BUFFER, quad_texture_coords_buffer);
    gl.vertexAttribPointer(pinfo.attr_loc.in_texture_coord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pinfo.attr_loc.in_texture_coord);

    // Draw full-screen quad
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  public render(dt: number = 0.016) {
    // Update time and explosions
    this.time += dt;
    this.update_explosions(dt);
    
    gl.viewport(0, 0, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    gl.clearDepth(1.0);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.main_pass();
    this.postprocess_pass();
  }

  public push_particle(p: Renderable) {
    if (this.objects.length < this.maxInstances) {
      this.objects.push(p);
    } else {
      // console.warn('Max instances reached:', this.maxInstances);
    }
  }

  public add_explosion(position: vec2, color: vec3, intensity: number = 1.0, lifetime: number = 0.5) {
    this.explosions.push({
      position: vec2.clone(position),
      color: vec3.clone(color),
      intensity: intensity,
      lifetime: 0,
      maxLifetime: lifetime
    });
    
    // Limit to 10 explosions max
    if (this.explosions.length > 10) {
      this.explosions.shift();
    }
  }

  private update_explosions(dt: number) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.lifetime += dt;
      
      // Fade intensity over time
      const age = exp.lifetime / exp.maxLifetime;
      exp.intensity = 1.0 - age; // Linear fade
      
      // Remove dead explosions
      if (age >= 1.0) {
        this.explosions.splice(i, 1);
      }
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