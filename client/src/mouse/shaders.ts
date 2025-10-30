// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { gl } from 'mouse/gl'

export class CompiledProgram<T, U> {
  program: WebGLProgram;
  attr_loc: T;
  uniform_loc: U;

  constructor(vs_shader: WebGLShader, ps_shader: WebGLShader, atribute_loc: T, uniform_loc: U) {
    this.program = CompiledProgram.init_shader_program(vs_shader, ps_shader)
    this.attr_loc = atribute_loc;
    this.uniform_loc = uniform_loc;

    let program = this.program;

    Object.keys(atribute_loc).forEach((key: string) => {
      let loc = gl.getAttribLocation(program, key);
      if (loc == null) {
        console.error("attribute location not found: " + key);
      }
      (atribute_loc as any)[key] = loc;
    })

    Object.keys(uniform_loc).forEach((key: string) => {
      let loc = gl.getUniformLocation(program, key);
      if (loc == null) {
        console.error("uniform location not found: " + key);
      }
      (uniform_loc as any)[key] = loc;
    })
  }

  private static init_shader_program(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);

    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw 'Unable to initialize the shader program:\n' + gl.getProgramInfoLog(shaderProgram);
    }

    return shaderProgram;
  }
};

export class MyShader<T, U> {
  private program: CompiledProgram<T, U>;
  private shader_vs: WebGLShader = null;
  private shader_ps: WebGLShader = null;

  constructor(public src_vs: string, public src_ps: string, public input_attributes: T, public uniform_attributes: U) {}

  private static load_shader(type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      let info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw 'An error occurred compiling the shaders:\n' + info;
    }

    return shader;
  }

  public init() {
    this.compile(this.src_vs, this.src_ps);
  }

  public use(): CompiledProgram<T, U> {
    gl.useProgram(this.program.program);
    return this.program;
  }

  public compile(src_vs: string, src_ps: string): void {
    this.src_vs = src_vs;
    this.src_ps = src_ps;

    if (this.shader_vs) {
      gl.deleteShader(this.shader_ps);
      this.shader_vs = null;
    }

    if (this.shader_ps) {
      gl.deleteShader(this.shader_ps);
      this.shader_ps = null;
    }

    this.shader_vs = MyShader.load_shader(gl.VERTEX_SHADER, this.src_vs);
    this.shader_ps = MyShader.load_shader(gl.FRAGMENT_SHADER, this.src_ps);

    this.program = new CompiledProgram<T, U>(this.shader_vs, this.shader_ps,
      this.input_attributes, this.uniform_attributes);
  }
}

export let shaders = {
  particle_instanced: new MyShader(
    require('mouse/shaders/particle.vert'),
    require('mouse/shaders/particle.frag'),
    {
      // Per-vertex attributes
      in_position: -1,
      in_texture_coord: -1,
      // Per-instance attributes
      in_instance_position: -1,
      in_instance_angle: -1,
      in_instance_scale: -1,
      in_instance_color: -1,
      in_instance_uv_offset: -1,
      in_instance_age: -1,
      in_instance_glow_intensity: -1,
      in_instance_glow_radius: -1
    },
    {
      u_screen_size: -1,
      u_atlas_uv_scale: -1,
    }
  ),
  postprocess: new MyShader(
    require('mouse/shaders/postprocess.vert'),
    require('mouse/shaders/postprocess.frag'),
    {
      in_position: -1,
      in_texture_coord: -1
    },
    {
      u_screen_size: -1,
      u_particles: -1,
      u_time: -1,
      u_explosion_positions: -1,
      u_explosion_colors: -1,
      u_explosion_intensities: -1,
      u_explosion_count: -1
    }
  )
};

export const init = () => {
  Object.keys(shaders).forEach(key => (shaders as any)[key].init());
}
