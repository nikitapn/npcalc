// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

export class Timer {
  public time: number;
  public dt: number;

  constructor() {
    this.time = Date.now();
    this.dt = 0.0;
  }

  public update(): void {
    let old = this.time;
    this.time = Date.now();
    this.dt = (this.time - old) / 1000.0;
  }
}