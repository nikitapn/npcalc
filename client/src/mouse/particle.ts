// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { vec2, vec4 } from 'gl-matrix';
import { Renderable } from 'mouse/renderer';
import { the_particle_renderer } from 'mouse/renderer';

export class Particle {
  renderable: Renderable;
  velocity: vec2;
  ttl: number;
  alpha: number;
  lifetime: number = 0; // Time since birth
  maxLifetime: number = 3.0; // Default max lifetime in seconds

  constructor(position: vec2, velocity: vec2, color: vec4, textureName: Renderable['textureName'], maxLifetime: number = 3.0) {
    this.renderable = {
      position: position,
      angle: 0,
      width: 12,
      height: 12,
      color: color,
      textureName: textureName,
      age: 0.0, // Start at birth
    };

    this.velocity = velocity;
    this.alpha = color[3];
    this.maxLifetime = maxLifetime;
  }

  update(dt: number, acceleration: vec2, k_alpha: number = 1.0) {
    let tmp = vec2.create();

    vec2.mul(tmp, acceleration, [dt, dt]);
    vec2.add(this.velocity, this.velocity, tmp);

    vec2.mul(tmp, this.velocity, [dt, dt]);
    vec2.add(this.renderable.position, this.renderable.position, tmp);

    this.renderable.color[3] = this.alpha * k_alpha;

    // Update age (0.0 to 1.0)
    this.lifetime += dt;
    this.renderable.age = Math.min(this.lifetime / this.maxLifetime, 1.0);

    the_particle_renderer.push_particle(this.renderable);
  }
}