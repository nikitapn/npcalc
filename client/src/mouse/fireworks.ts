// Copyright (c) 2023-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { Timer } from 'mouse/timer'
import { Particle } from 'mouse/particle'
import { vec2, vec3 } from 'gl-matrix';
import { the_canvas } from 'mouse/gl'
import { math } from 'mouse/math'
import { array_fast_remove } from 'misc/utils';

export class Firework {
  ttl: number;
  is_root: boolean;
  particles: Array<Particle>;
  acceleration: vec2;
  t = 0;
  whenToExplode: number;

  public static calc_pos(p0: vec2, v0: vec2, accel: vec2, t: number): [vec2, vec2] {
    let p1 = vec2.create(), v1 = vec2.create();

    vec2.scaleAndAdd(p1, p0, v0, t);
    vec2.scaleAndAdd(p1, p1, accel, t * t / 2);
    vec2.scaleAndAdd(v1, v0, accel, t);

    return [p1, v1];
  }

  constructor(
    ttl: number,
    is_root: boolean,
    trail_count: number,
    position: vec2,
    velocity: vec2,
    color: vec3
  ) {
    this.ttl = ttl;
    this.is_root = is_root;
    this.particles = new Array<Particle>(trail_count);
    this.acceleration = [0, 100];
    this.whenToExplode = math.rand(1.3, 3.0);

    let t = (this.is_root ? -1.5 : -0.4);
    const dt = 0.015;

    for (let i = 0; i < trail_count; ++i, t += dt) {
      let k = i / trail_count;
      let pv = Firework.calc_pos(position, velocity, this.acceleration, t);
      this.particles[i] = new Particle(pv[0], pv[1], [color[0], color[1], color[2], k], "dot");
    }
  }

  get lead_particle(): Particle { return this.particles[this.particles.length - 1]; }

  update(dt: number): boolean {
    if (this.t > this.whenToExplode)
      return false;

    if (!this.is_root) {
      for (let particle of this.particles)
        particle.update(dt, this.acceleration);
    } else {
      for (let particle of this.particles) {
        if (this.t > 0.5) {
          particle.update(dt, this.acceleration);
        } else {
          let accel = vec2.clone(particle.velocity);
          vec2.normalize(accel, accel);
          vec2.scaleAndAdd(accel, this.acceleration, accel, 300.0);
          particle.update(dt, accel);
        }
      }
    }

    this.t += dt;

    return true;
  }
}

class FireworkLeaf extends Firework {
  life: number;
  life_cur: number;

  constructor(
    life: number,
    trail_count: number,
    position: vec2,
    velocity: vec2,
    color: vec3
  ) {
    super(0, false, trail_count, position, velocity, color);
    this.life = life;
    this.life_cur = life;
  }

  update(dt: number): boolean {
    this.life_cur -= dt;
    if (this.life_cur < 0) return false;

    for (let particle of this.particles) {
      particle.update(dt, this.acceleration, this.life_cur / this.life);
    }
    return true;
  }
}

class SoundManager {
  soundDiv: HTMLDivElement;
  freeSounds: Array<HTMLAudioElement> = new Array<HTMLAudioElement>();

  constructor(public soundAsset: string, public duration: number, initialCount: number) {
    this.soundDiv = document.getElementById('sounds') as HTMLDivElement;
    for (let i = 0; i < initialCount; ++i) {
      this.freeSounds.push(this.createAudio(soundAsset));
    }
  }

  createAudio(soundAsset: string): HTMLAudioElement {
    let audio = document.createElement('audio') as HTMLAudioElement;
    audio.src = soundAsset;
    audio.preload = 'auto';
    this.soundDiv.appendChild(audio);
    return audio;
  }

  play(): void {
    if (this.freeSounds.length === 0) {
      this.freeSounds.push(this.createAudio(this.soundAsset));
    }
    let audio = this.freeSounds.pop();
    audio.currentTime = 0;
    audio.play();
    setTimeout(() => {
      this.freeSounds.push(audio);
    }, this.duration * 1000);
  }
}

export class FireworkSystem {
  fireworks = new Array<Firework>();
  t: number = 100.0
  stop: boolean = false;
  soundManager = new SoundManager('sounds/single-firework-79814.mp3', 1.5, 10);
  //soundManager = new SoundManager('sounds/fireworkblast-106275.mp3', 1.5, 10);

  private launchSomeFireworks(): void {
    let middle = the_canvas.clientWidth / 2;
    for (let i = 0; i < math.rand(2, 10); ++i) {
      let pos = vec2.fromValues(
        math.rand(middle - 80, middle + 80),
        the_canvas.clientHeight
      );
      let vel = math.rad_vec2(-(180 + math.rand(-30, 30)) / 180 * Math.PI);
      vec2.scale(vel, vel, 300 + math.rand(-50, 150));
      this.fireworks.push(
        new Firework(
          math.randi(1, 2),
          true,
          20 + Math.floor(math.rand(-2, 2)),
          pos, vel,
          [0.7, 0.3, 0.0])
      );
    }
  }

   update(timer: Timer): void {
    if (!this.stop && this.t > math.rand(3.0, 8.0)) {
      this.launchSomeFireworks()
      this.t = 0;
    }

    for (let i = 0; i < this.fireworks.length;) {
      if (this.fireworks[i].update(timer.dt) === false) {
        let ttl = this.fireworks[i].ttl;
        let position = this.fireworks[i].lead_particle.renderable.position;

        if (!array_fast_remove(i, this.fireworks)) ++i;

        if (ttl == 0) continue;

        let color: vec3 = [
          math.rand(0, 1.0),
          math.rand(0, 1.0),
          math.rand(0, 1.0)
        ];

        // color[math.randi(0, 3)] = math.rand(0.8, 1.0);
        this.soundManager.play();

        const max = (ttl == 1 ? 20 : 6) + math.rand(-2, 2);
        for (let i = 0; i < max; ++i) {
          let vel = vec2.create();
          if (ttl === 1) {
            vec2.random(vel, 100 + math.rand(100, 200));
            this.fireworks.push(new FireworkLeaf(8, 20, position, vel, color));
          } else {
            vec2.random(vel, 60 + math.rand(10, 30));
            this.fireworks.push(new Firework(ttl - 1, false,
              20, position, vel, color));
          }
        }
        continue;
      }
      ++i;
    }
    this.t += timer.dt;
    this.stop = this.fireworks.length === 0;
  }
}

export let firework_system = new FireworkSystem();
