// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { vec2, vec3 } from 'gl-matrix'

export namespace math {
	export const X: [number, number, number] = [1, 0, 0];
	export const Y: [number, number, number] = [0, 1, 0];
	export const Z: [number, number, number] = [0, 0, -1];

	export const XY_NORMAL: [number, number, number] = [0, 0, -1];
	export const XZ_NORMAL: [number, number, number] = [0, 1, 0];
	export const YZ_NORMAL: [number, number, number] = [1, 0, 0];

	// calculate the projection of vector to the plane defined by a normal
	export const reject = (out: vec3, v: vec3, plane_normal: vec3): void => {
		let a = vec3.dot(v, plane_normal);
		let b = vec3.dot(plane_normal, plane_normal);
		let s = a / b;

		out[0] = s * plane_normal[0];
		out[1] = s * plane_normal[1];
		out[2] = s * plane_normal[2];

		out[0] = v[0] - out[0];
		out[1] = v[1] - out[1];
		out[2] = v[2] - out[2];
	}

	export const project = (out: vec3, v: vec3, n: vec3): void => {
		let a = vec3.dot(v, n);
		let b = vec3.dot(n, n);
		let s = a / b;

		out[0] = s * n[0];
		out[1] = s * n[1];
		out[2] = s * n[2];
	}

	export const rad_vec2 = (alpha: number): vec2 => {
		return [Math.sin(alpha), Math.cos(alpha)];
	}

	export const clamp = (value: number, limit: number): number => {
		return value > limit ? limit : value;
	}

	export const add_clamp1 = (a: number, value: number, limit: number): number => {
		let tmp = a + value;
		return tmp > limit ? limit : tmp;
	}

	export const add_clamp2 = (out: vec2, a: vec2, value: number, limit: number): vec2 => {
		let tmp = a[0] + value;
		out[0] = tmp > limit ? limit : tmp;
		tmp = a[1] + value;
		out[1] = tmp > limit ? limit : tmp;
		return out;
	}

	export const rand = (a: number, b: number): number => {
		return a + (b - a) * Math.random();
	}

	export const randi = (a: number, b: number): number => {
		return Math.round(rand(a, b));
	}
}

export class Ray {
	origin: vec3;
	direction: vec3;

	constructor(origin?: vec3, direction?: vec3) {
		this.origin = origin;
		this.direction = direction;
	}

	static intersect_sphere(point: vec3, sphere_pos: vec3, sphere_r: number, ray: Ray): boolean {
		let l = vec3.create();
		vec3.sub(l, ray.origin, sphere_pos);

		if (vec3.dot(l, ray.direction) < 0.0) return false;

		let a = vec3.squaredLength(ray.direction);
		let b = 2.0 * (vec3.dot(ray.direction, ray.origin) - vec3.dot(ray.direction, sphere_pos));
		let c = vec3.squaredLength(ray.origin) + vec3.squaredLength(sphere_pos) - 2.0 * vec3.dot(ray.origin, sphere_pos) - sphere_r * sphere_r;
		let D = b * b - 4.0 * a * c;

		if (D < 0) return false;

		let t = (-b - Math.sqrt(D)) / 2.0 / a;

		vec3.scaleAndAdd(point, ray.origin, ray.direction, t);

		return true;
	}

  intersection_XY(): vec2 {
    const t = -this.origin[2] / this.direction[2];
    return [this.direction[0] * t + this.origin[0], this.direction[1] * t + this.origin[1]];
  }
}