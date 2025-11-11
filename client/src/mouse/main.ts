// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { vec2 } from 'gl-matrix'
import { the_canvas, init as init_gl, reinit as reinit_gl, screen_to_normalized_coordinates, getCanvasSize } from 'mouse/gl';
import { init_particle_renderer, the_particle_renderer } from 'mouse/renderer';
import { Footstep, footsteps } from 'mouse/footstep';
import { fireworkSystem } from 'mouse/fireworks';
import { init as init_primitives } from 'mouse/primitives'
import { init as init_shaders} from 'mouse/shaders';
import { Timer } from 'mouse/timer'
import { calculator } from 'rpc/rpc';
import { flatParticleSystem } from 'mouse/particle_system';

interface Color {
  x: number;
  y: number;
  z: number;
}

let fireworksStarted = false;
let footstep_color: Color = null;
let timer: Timer;
let is_initialized = false;

export const init = async (canvas: HTMLCanvasElement) => {
  init_gl(canvas);
  init_shaders();
  init_primitives();
  await init_particle_renderer(the_canvas.width, the_canvas.height);

  footstep_color = { x: Math.random(), y: Math.random(), z: Math.random() };
  timer = new Timer();
  document.addEventListener("mousemove", on_mouse_move);

  // Handle WebGL context loss (browser can trigger this)
  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  is_initialized = true;
  the_loop();
}

export function startFireworks() {
  fireworkSystem.stop = false;
  fireworksStarted = true;
}

const handleContextLost = (event: Event) => {
  console.warn('WebGL context lost!');
  event.preventDefault(); // Prevent default behavior
  is_initialized = false;
};

const handleContextRestored = async (event: Event) => {
  console.log('WebGL context restored, reinitializing...');
  const size = getCanvasSize();
  await handleResize(size.width, size.height);
  is_initialized = true;
};

export const handleResize = async (width: number, height: number) => {
  if (!is_initialized) {
    console.warn('Cannot resize before initialization');
    return;
  }

  console.log(`Handling canvas resize: ${width}x${height}`);

  // Update canvas size
  the_canvas.width = width;
  the_canvas.height = height;

  // Reinitialize WebGL context (it's lost when canvas resizes)
  reinit_gl();

  // Reinitialize all WebGL resources
  init_shaders();
  init_primitives();
  await init_particle_renderer(width, height);

  console.log('Resize complete');
}

let t = 0;
const the_loop = (): void => {
  if (!is_initialized) {
    // Context lost, wait for restoration
    setTimeout(the_loop, 100);
    return;
  }

  timer.update();

  t += timer.dt;

  fireworkSystem.update(timer);
  flatParticleSystem.update(timer.dt);
  processFootsteps(timer.dt);

  the_particle_renderer.render(timer.dt);

  if (!fireworkSystem.stop) {
    requestAnimationFrame(the_loop);
  } else {
    setTimeout(the_loop, 100);
  }

  if (fireworkSystem.stop && fireworksStarted) {
    fireworkSystem.timePassed = 0;
    fireworksStarted = false;
    document.dispatchEvent(new Event('fireworksFinished'));
  }
}

let last_time = 0;
const processFootsteps = (dt: number): void => {
  last_time += dt;
  if (last_time < 0.028) return;
  last_time = 0;
  let k = footsteps.length;
  for (let i = 0; i < k; ++i) {
    if (--footsteps[i].ttl == 0) {
      if (k <= footsteps.length) {
        [ footsteps[i], footsteps[k - 1] ] =  [ footsteps[k - 1], footsteps[i] ];
      }
      k--;
    }
  }

  if (k != footsteps.length)
    footsteps.splice(k);
}

let cnt = 0;
let prev_pos: vec2 = [0, 0];
let footstep_cnt = 0;
let mouse_pos: vec2 = [0, 0];
const on_mouse_move = (ev: MouseEvent) => {
  mouse_pos = vec2.fromValues(ev.clientX, ev.clientY);

  if (cnt++ === 0) {
    prev_pos = mouse_pos;
    return;
  }

  if (cnt % 16 !== 0)
    return;

  let dir = vec2.fromValues(mouse_pos[0] - prev_pos[0], mouse_pos[1] - prev_pos[1]);
  let distance = vec2.distance(prev_pos, mouse_pos);

  if (distance >= 128) {
    vec2.normalize(dir, dir);
    dir[0] *= 64;
    dir[1] *= 64;
    while (distance - 64 > 0) {
      distance -= 64;
      vec2.add(prev_pos, prev_pos, dir);

      // Normalize prev_pos to [0, 1] range to screen coordinates to ensure consistency across different resolutions
      let npos = screen_to_normalized_coordinates(prev_pos[0], prev_pos[1]);

      footsteps.push(new Footstep([1, 0, 0], footstep_cnt++, prev_pos, dir));
      // calculator.SendFootstep({
      //   color: footstep_color,
      //   idx: footstep_cnt++,
      //   pos: {x: npos[0], y: npos[1]},
      //   dir: {x: dir[0], y: dir[1]}
      // });
    }
  } else{
    // Normalize prev_pos to [0, 1] range to screen coordinates to ensure consistency across different resolutions
    let npos = screen_to_normalized_coordinates(mouse_pos[0], mouse_pos[1]);

    footsteps.push(new Footstep([1, 0, 0], footstep_cnt++, npos, dir));
    // calculator.SendFootstep({
    //   color: footstep_color,
    //   idx: footstep_cnt++,
    //   pos: {x: npos[0], y: npos[1]},
    //   dir: {x: dir[0], y: dir[1]}
    // });
  }
  prev_pos = mouse_pos;
}