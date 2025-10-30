// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

// A simple flat particle system for effects like explosions, smoke, etc.

import { vec2, vec3, vec4 } from 'gl-matrix';
import { the_particle_renderer } from './renderer';
import { math } from 'mouse/math'

interface ParticleData {
  position: vec2;
  velocity: vec2;
  acceleration: vec2;
  color: vec4;
  lifetime: number;      // Current age
  maxLifetime: number;   // When to die
  size: number;          // Width/height
  textureName: 'dot' | 'footsteps' | 'footsteps1';
  alphaCurve?: (t: number) => number; // Optional custom fade
  glowIntensity?: number; // Glow strength (default: 1.0)
  glowRadius?: number;    // Glow radius multiplier (default: 1.0)
}

class FlatParticleSystem {
  particles: ParticleData[] = [];
  
  update(dt: number) {
    // Single tight loop - cache friendly!
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Physics update
      p.velocity[0] += p.acceleration[0] * dt;
      p.velocity[1] += p.acceleration[1] * dt;
      p.position[0] += p.velocity[0] * dt;
      p.position[1] += p.velocity[1] * dt;
      
      // Age & alpha
      p.lifetime += dt;
      const age = p.lifetime / p.maxLifetime;
      
      if (age >= 1.0) {
        // Remove dead particle (swap with last)
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      
      // Update alpha
      p.color[3] = p.alphaCurve ? p.alphaCurve(age) : (1.0 - age);
      
      // Push to renderer
      the_particle_renderer.push_particle({
        position: p.position,
        angle: 0,
        width: p.size,
        height: p.size,
        color: p.color,
        textureName: p.textureName,
        age: age,
        glowIntensity: p.glowIntensity,
        glowRadius: p.glowRadius
      });
    }
  }
  
  // Easy to spawn any particle!
  spawn(data: Partial<ParticleData>) {
    this.particles.push({
      position: data.position || [0, 0],
      velocity: data.velocity || [0, 0],
      acceleration: data.acceleration || [0, 100],
      color: data.color || [1, 1, 1, 1],
      lifetime: 0,
      maxLifetime: data.maxLifetime || 1.0,
      size: data.size || 12,
      textureName: data.textureName || 'dot',
      alphaCurve: data.alphaCurve,
      glowIntensity: data.glowIntensity,
      glowRadius: data.glowRadius
    });
  }
  
  // Easy to spawn burst!
  spawnBurst(center: vec2, count: number, speed: number, color: vec3, pattern: number) {
    // Register explosion for global screen illumination
    the_particle_renderer.add_explosion(center, color, 1.0, 0.8); // 0.8s fade
    
    // Spawn smaller flash particle (no need for huge size anymore!)
    this.spawn({
      position: vec2.clone(center),
      velocity: [0, 0],
      acceleration: [0, 0],
      color: [color[0] * 5, color[1] * 5, color[2] * 5, 1.0], // Very bright
      maxLifetime: 0.5,
      size: 160, // Much smaller! Global illumination handles the rest
      alphaCurve: (t) => 1.0 / (0.01 + t), // Intense flash curve
      glowIntensity: 0.3,
      glowRadius: 0.5
    });
    
    // Then: spawn burst particles
    for (let i = 0; i < count; i++) {
      let vel = this.getPatternVelocity(i, count, pattern);
      vec2.scale(vel, vel, speed);
      
      const offset = vec2.fromValues(math.rand(-20.0, 20.0), math.rand(-20.0, 20.0));
      let pos = vec2.clone(center);
      vec2.add(pos, pos, offset);

      this.spawn({
        position: pos,
        velocity: vel,
        color: [...color, 1.0] as vec4,
        maxLifetime: math.rand(2, 4),
        // acceleration: [0, 0],
        size: 12
      });
    }
  }

  // Generate velocity based on burst pattern
  private getPatternVelocity(index: number, total: number, pattern: number): vec2 {
    const vel = vec2.create();
    
    if (pattern === 0) {
      // Sphere burst (random in all directions)
      vec2.random(vel, 1.0);
    } else if (pattern === 1) {
      // Ring burst (evenly distributed circle)
      const angle = (index / total) * Math.PI * 2;
      vel[0] = Math.cos(angle);
      vel[1] = Math.sin(angle) * 0.5; // Flatten vertically
    } else if (pattern === 2) {
      // Spiral burst
      const angle = (index / total) * Math.PI * 4; // Two full rotations
      const radius = index / total;
      vel[0] = Math.cos(angle) * radius;
      vel[1] = Math.sin(angle) * radius;
    } else {
      // Willow burst (droopy, falls downward)
      const angle = (index / total) * Math.PI * 2;
      vel[0] = Math.cos(angle) * 0.8;
      vel[1] = Math.sin(angle) * 0.3 - 0.5; // Bias downward
    }
    
    return vel;
  }
}

// Export singleton instance
export const flatParticleSystem = new FlatParticleSystem();