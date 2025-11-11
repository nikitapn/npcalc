// Copyright (c) 2023-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { Timer } from 'mouse/timer'
import { vec2, vec3, vec4 } from 'gl-matrix';
import { the_canvas } from 'mouse/gl'
import { math } from 'mouse/math'
import { array_fast_remove } from 'misc/utils';
import { flatParticleSystem } from 'mouse/particle_system';
import { soundManager } from 'mouse/sound_manager';

export class Firework {
  position: vec2;
  velocity: vec2;
  acceleration: vec2 = [0, 100];
  color: vec3;
  ttl: number;
  is_root: boolean;
  t = 0;
  whenToExplode: number;

  constructor(
    position: vec2,
    velocity: vec2,
    color: vec3,
    ttl: number,
    is_root: boolean = false
  ) {
    this.position = vec2.clone(position);
    this.velocity = vec2.clone(velocity);
    this.color = color;
    this.ttl = ttl;
    this.is_root = is_root;
    this.whenToExplode = math.rand(1.3, 3.0);
  }

  update(dt: number): boolean {
    // Update physics
    vec2.scaleAndAdd(this.velocity, this.velocity, this.acceleration, dt);
    vec2.scaleAndAdd(this.position, this.position, this.velocity, dt);

    // Spawn trail particle
    flatParticleSystem.spawn({
      position: vec2.clone(this.position),
      velocity: [
        this.velocity[0] * -0.05 + math.rand(-5, 5),
        this.velocity[1] * -0.05 + math.rand(-5, 5)
      ],
      color: [...this.color, 0.6] as vec4,
      maxLifetime: this.is_root ? 1.0 : 0.5,
      size: this.is_root ? 12 : 8,
      glowIntensity: 0.85,
      glowRadius: 0.9
    });

    this.t += dt;

    // Time to explode?
    return this.t < this.whenToExplode;
  }

  explode(): vec2 {
    return vec2.clone(this.position);
  }
}

export class FireworkSystem {
  fireworks = new Array<Firework>();
  t: number = 100.0
  timePassed: number = 0;
  stop: boolean = true;

  private launchSomeFireworks(): void {
    let middle = the_canvas.clientWidth / 2;
    const count = math.randi(3, 6); // More fireworks!

    for (let i = 0; i < count; ++i) {
      // Spread launches across the screen
      let pos = vec2.fromValues(
        math.rand(middle - 200, middle + 200), // Wider spread
        the_canvas.clientHeight
      );

      // More varied launch angles
      let vel = math.rad_vec2(-(180 + math.rand(-45, 45)) / 180 * Math.PI);
      // vec2.scale(vel, vel, 250 + math.rand(-100, 200)); // More speed variation
      vec2.scale(vel, vel, 300 + math.rand(-50, 150));

      // Vary trail color (orange/yellow/red)
      const launchColor: vec3 = [
        math.rand(0.6, 1.0),
        math.rand(0.2, 0.6),
        math.rand(0, 0.2)
      ];

      this.fireworks.push(
        new Firework(
          pos,
          vel,
          launchColor,
          math.randi(1, 2), // Allow 2-3 stage fireworks!
          true // is_root
        )
      );
    }
  }

   update(timer: Timer): void {
    this.timePassed += timer.dt;
    if (!this.stop && this.t > math.rand(3.0, 8.0) && this.timePassed < 10.0) {
      this.launchSomeFireworks()
      this.t = 0;
    }

    for (let i = 0; i < this.fireworks.length;) {
      const fw = this.fireworks[i];

      if (!fw.update(timer.dt)) {
        // Time to explode!
        const explodePos = fw.explode();
        const ttl = fw.ttl;

        if (!array_fast_remove(i, this.fireworks)) ++i;

        if (ttl === 0) continue;

        // Choose color scheme
        let color: vec3;
        const colorScheme = math.randi(0, 5);

        if (colorScheme === 0) {
          // Bright primary
          color = [math.rand(0.8, 1.0), math.rand(0.8, 1.0), math.rand(0.8, 1.0)];
        } else if (colorScheme === 1) {
          // Red/orange (classic)
          color = [1.0, math.rand(0.3, 0.7), math.rand(0, 0.3)];
        } else if (colorScheme === 2) {
          // Blue/cyan
          color = [math.rand(0, 0.4), math.rand(0.6, 1.0), math.rand(0.8, 1.0)];
        } else if (colorScheme === 3) {
          // Green/yellow
          color = [math.rand(0.6, 1.0), math.rand(0.8, 1.0), math.rand(0, 0.4)];
        } else {
          // Purple/magenta
          color = [math.rand(0.7, 1.0), math.rand(0, 0.5), math.rand(0.7, 1.0)];
        }

        soundManager.play();

        // Choose explosion pattern
        const pattern = math.randi(0, 4);
        const count = (ttl === 1 ? 50 : 20) + math.randi(-10, 10);
        const speed = ttl === 1 ? 150 : 80;

        // Spawn the burst (includes flash particle automatically!)
        flatParticleSystem.spawnBurst(explodePos, count, speed, color, pattern);

        // For multi-stage fireworks, spawn child fireworks
        if (ttl > 1) {
          const childCount = 8 + math.randi(-2, 2);
          for (let j = 0; j < childCount; j++) {
            const vel = vec2.create();
            vec2.random(vel, 1.0);
            vec2.scale(vel, vel, 60 + math.rand(-20, 20));

            this.fireworks.push(
              new Firework(explodePos, vel, color, ttl - 1, false)
            );
          }
        }

        // 30% chance to add glitter
        if (ttl === 1 && Math.random() < 0.3) {
          const glitterCount = 20;
          for (let j = 0; j < glitterCount; j++) {
            const vel = vec2.create();
            vec2.random(vel, 1.0);
            vec2.scale(vel, vel, 50);

            flatParticleSystem.spawn({
              position: vec2.clone(explodePos),
              velocity: vel,
              color: [1.0, 1.0, 0.8, 1.0], // Gold
              maxLifetime: math.rand(1.0, 3.0),
              size: 6,
              glowIntensity: 2.0,
              glowRadius: 0.65
            });
          }
        }
        continue;
      }
      ++i;
    }

    // Update flat particle system
    flatParticleSystem.update(timer.dt);

    this.t += timer.dt;
    this.stop = this.fireworks.length === 0;
  }
}

export let fireworkSystem = new FireworkSystem();
