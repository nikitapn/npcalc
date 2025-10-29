// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { normalized_coordinates_to_screen } from 'mouse/gl';
import { vec2, vec3 } from 'gl-matrix';

export class Footstep {
  position: vec2;
  angle: number;
  color: vec3;
  ttl: number;
  idx: number;

  // Position is expected to be in normalized coordinates [0, 1]
  constructor(color: vec3, idx: number, position: vec2, dir: vec2) {
    this.position = normalized_coordinates_to_screen(position[0], position[1]);
    this.color = color;
    this.idx = idx;
    this.ttl = 128;

    let angle = Math.atan(dir[1] / dir[0]);

    if (dir[0] > 0 && dir[1] >= 0) {}
    else if (dir[0] > 0 && dir[1] < 0) angle += 2 * Math.PI;
    else if (dir[0] < 0) angle += Math.PI;

    this.angle = angle;
  }
}

export let footsteps = new Array<Footstep>();