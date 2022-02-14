// Copyright (c) 2022 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { MobXValue } from './modified'
import { TableItem } from './table_item'
import { observable, computed } from 'mobx'
import { UndoRedo } from './command'
import { store } from './store'
import { Fertilizer, Solution, ELEMENT, ELEMENTS_MAX, calc_solution_ec, calc_solution_ratio, to_name } from './calc'
import * as NPKCalc from './npkcalc'

export class TargetElement {
	private value_: MobXValue<number>;
	private value_base_: number;
	ratio: number;

	value_minus_water: number;
	k: number;
	zero: boolean;

	constructor() {
		this.value_ = new MobXValue<number>();
	}

	//	deserialize(ar: iarchive) {
	//		this.value_.mx_value = ar.get_double();
	//		this.value_base_ = ar.get_double();
	//		this.ratio = ar.get_double();
	//	}
	//
	//	serialize(ar: oarchive) {
	//		ar.set_double(this.value_.mx_value);
	//		ar.set_double(this.value_base_);
	//		ar.set_double(this.ratio);
	//	}

	get mx() {
		return this.value_;
	}


	set_value(x: number): void {
		this.value_.mx_value = this.value_base_ = x;
	}

	@computed
	get value() {
		return this.value_.mx_value;
	}

	public set_base_value() {
		this.value_base_ = this.value_.mx_value;
	}

	from_percent(x: number) {
		this.value_.mx_value = this.value_base_ * x;
	}
}

class Matrix {
	private m: number;
	private n: number;
	data: number[];

	static create(m: number, n: number): Matrix {
		let ret = new Matrix;
		ret.m = m;
		ret.n = n;
		ret.data = new Array<number>(m * n).fill(0.0);
		return ret;
	}

	static clone(a: Matrix): Matrix {
		let ret = new Matrix;
		ret.m = a.m; ret.n = a.n;
		ret.data = Object.assign([], a.data);
		return ret;
	}

	add_col(col: number[]): Matrix {
		if (this.m !== col.length) {
			console.log("m != v.length");
			return;
		}
		let data = new Array<number>(this.m * (this.n + 1));
		for (let i = 0; i < this.m; ++i) {
			data[i * this.m + this.n] = col[i];
			for (let j = 0; j < this.n; ++j) {
				let ix = i * this.m + j;
				data[ix] = this.data[ix];
			}
		}
		this.data = data;
		this.n++;
		return this;
	}

	swap_rows(row_ix1: number, row_ix2: number, col: number): Matrix {
		let row1_begin = row_ix1 * this.m, row2_begin = row_ix2 * this.m;

		for (let i = 0; i < col; ++i) {
			let temp = this.data[row1_begin + i];
			this.data[row1_begin + i] = this.data[row2_begin + i];
			this.data[row2_begin + i] = temp;
		}

		return this;
	}

	get rank(): number {
		const EPS = 1E-9;
		let A = Matrix.clone(this);
		let m = A.m, n = A.n;

		let rank = n;

		for (let row = 0; row < rank; row++) {
			// console.log(A.print());
			// Before we visit current row 'row', we make 
			// sure that mat[row][0],....mat[row][row-1] 
			// are 0. 

			// Diagonal element is not zero 
			if (Math.abs(A.g(row, row)) > EPS) {
				for (let col = 0; col < m; col++) {
					if (col !== row) {
						// This makes all entries of current 
						// column as 0 except entry 'mat[row][row]' 
						let mult = A.g(col, row) / A.g(row, row);
						for (let i = 0; i < rank; i++) A.s(col, i, A.g(col, i) - mult * A.g(row, i));
					}
				}
			}

			// Diagonal element is already zero. Two cases 
			// arise: 
			// 1) If there is a row below it with non-zero 
			//    entry, then swap this row with that row 
			//    and process that row 
			// 2) If all elements in current column below 
			//    mat[r][row] are 0, then remvoe this column 
			//    by swapping it with last column and 
			//    reducing number of columns by 1. 
			else {
				let reduce = true;

				/* Find the non-zero element in current 
					column  */
				for (let i = row + 1; i < m; i++) {
					// Swap the row with non-zero element 
					// with this row. 
					if (Math.abs(A.g(i, row)) > EPS) {
						A.swap_rows(row, i, rank);
						reduce = false;
						break;
					}
				}

				// If we did not find any row with non-zero 
				// element in current columnm, then all 
				// values in this column are 0. 
				if (reduce) {
					// Reduce number of columns 
					rank--;
					// Copy the last column here 
					for (let i = 0; i < m; i++) A.s(i, row, A.g(i, rank));
				}
				// Process this row again 
				row--;
			}
		}
		return rank;
	}


	get dim() {
		return [this.m, this.n];
	}

	g(i: number, j: number): number {
		return this.data[i * this.m + j];
	}

	s(i: number, j: number, x: number): void {
		this.data[i * this.m + j] = x;
	}

	transpose(): Matrix {
		for (let j = 0; j < this.n; ++j) {
			for (let i = j + 1; i < this.m; ++i) {
				let x = this.data[i * this.m + j];
				this.data[i * this.m + j] = this.data[j * this.m + i];
				this.data[j * this.m + i] = x;
			}
		}
		return this;
	}

	print() {
		let s = "";
		for (let i = 0; i < this.m; ++i) {
			s += "|";
			for (let j = 0; j < this.n; ++j) {
				let x = this.g(i, j).toFixed(6);
				if (j !== this.n - 1) x += ",";
				s += x.padEnd(12);
			}
			s += "|\n";
		}
		return s;
	}
}

export interface CalcFertilizerResult {
	fertilizer: Fertilizer;
	x: number;
}

export class Calculation extends TableItem {
	@observable public elements: Array<TargetElement>;
	@observable public ferts: Array<Fertilizer>;
	public volume: MobXValue<number>;
	@observable private mode_: boolean;



	commands: UndoRedo;
	@observable public result: string;
	public cost_k: number;
	@observable public result_ferts: Array<CalcFertilizerResult>;
	temp_X: Array<number>;
	temp_R: string;
	temp_PPM: string;

	constructor(is_new?: boolean, id?: number) {
		super(is_new);
		this.elements = new Array<TargetElement>(ELEMENTS_MAX);
		this.ferts = new Array<Fertilizer>();
		this.result_ferts = [];
		this.result = "";
		this.commands = new UndoRedo();

		if (is_new === false) return;

		this.set_id(id);
		this.mx_value = "New Calculation";
		this.volume = new MobXValue<number>();
		this.volume.mx_value = 1.0;
		this.cost_k = 0.0;
		this.mode_ = false;

		for (let i = 0; i < ELEMENTS_MAX; i++) {
			this.elements[i] = new TargetElement();
			this.elements[i].set_value(0.0);
			this.elements[i].ratio = 0.5;
		}
	}

	public static create_from_data(data: NPKCalc.Flat_npkcalc.Calculation_Direct): Calculation {
		let s = new Calculation(false);
		s.set_id(data.id);
		s.set_name(data.name);

		s.cost_k = 0.0;
		let ix = 0;

		for (let e of data.elements_vd()) {
			s.elements[ix] = new TargetElement();
			s.elements[ix].set_value(e.value_base);
			s.elements[ix].ratio = e.ratio;
			++ix;
		}

		for (let fert_id of data.fertilizers_ids_vd()) {
			let fert = store.fertilizers.get_by_id(fert_id);
			if (fert) s.ferts.push(fert);
		}

		s.volume = new MobXValue<number>();
		s.volume.mx_value = data.volume;
		s.mode_ = data.mode;
		
		s.calc();
		
		return s;
	}

	public async server_add() {
		
	}

	set_solution(based_on: Solution) {
		this.mx_value = based_on.get_name();
		for (let i = 0; i < ELEMENTS_MAX; i++) {
			this.elements[i].set_value(based_on.get_element(i).mx_value);
		}
	}

	increase_ec(percent: number): void {
		this.elements[ELEMENT.N_NO3].from_percent(percent);
		this.elements[ELEMENT.K].from_percent(percent);
		this.elements[ELEMENT.Ca].from_percent(percent);
		this.elements[ELEMENT.Mg].from_percent(percent);
		this.elements[ELEMENT.S].from_percent(percent);
		this.elements[ELEMENT.Cl].from_percent(percent);
	}

	@computed
	get ec() {
		let elements = new Array<number>(ELEMENTS_MAX);
		for (let i = 0; i < ELEMENTS_MAX; i++) {
			elements[i] = this.elements[i].value;
		}
		return calc_solution_ec(elements);
	}

	@computed
	get ratio() {
		let elements = new Array<number>(ELEMENTS_MAX);
		for (let i = 0; i < ELEMENTS_MAX; i++) {
			elements[i] = this.elements[i].value;
		}
		return calc_solution_ratio(elements);
	}

	get mode(): boolean {
		return this.mode_;
	}

	@computed
	set mode(value: boolean) {
		this.mode_ = value;
		if (value === true) {
			let selected_ferts = this.ferts;
			let result_ferts = new Array<CalcFertilizerResult>(selected_ferts.length);
			for (let i = 0; i < selected_ferts.length; ++i) {
				let founded = this.result_ferts.find((x) => x.fertilizer.get_id() === selected_ferts[i].get_id());
				if (founded) result_ferts[i] = founded;
				else result_ferts[i] = { fertilizer: selected_ferts[i], x: 0.0 };
			}
			this.result_ferts = result_ferts;
		} else {
			this.calc_mode_1(false);
		}
	}


	remove_fertilizer(fertilizer: Fertilizer) {
		this.ferts.splice(
			this.ferts.findIndex(x => x.get_id() == fertilizer.get_id()), 1);
		if (this.mode_ === true) {
			this.result_ferts.splice(
				this.result_ferts.findIndex(x => x.fertilizer.get_id() == fertilizer.get_id()), 1);
		}
		this.calc();
	}

	add_fertilizer(fertilizer: Fertilizer) {
		let inserted = false;
		for (let i = 0; i < this.ferts.length; ++i) {
			if (fertilizer.mx_value.localeCompare(this.ferts[i].mx_value) <= 0) {
				this.ferts.splice(i, 0, fertilizer);
				if (this.mode_ === true) this.result_ferts.splice(i, 0, { fertilizer: fertilizer, x: 0.0 });
				inserted = true;
				break;
			}
		}
		if (!inserted) {
			this.ferts.push(fertilizer);
			if (this.mode_ === true) this.result_ferts.push({ fertilizer: fertilizer, x: 0.0 });
		}
		this.calc();
	}

	has_fertilizer(fertilizer: Fertilizer): boolean {
		return this.ferts.findIndex(x => x.get_id() == fertilizer.get_id()) !== -1;
	}

	to_log(position: number) {
		// position will be between 0 and 100
		var minp = 0;
		var maxp = 1;

		// The result should be between 100 an 10000000
		var minv = Math.log(0.0001);
		var maxv = Math.log(10000);

		// calculate adjustment factor
		var scale = (maxv - minv) / (maxp - minp);

		return Math.exp(minv + scale * (position - minp));
	}

	private calc_mode_1(volume_changed: boolean) {
		let total_cost = 0.0;
		let mixs = new Array<Fertilizer>();
		this.ferts.forEach(x => { total_cost += x.cost; mixs.push(x) });

		let cost_k = this.cost_k;

		if (!volume_changed) {
			let mixs_size = this.ferts.length;

			let A = Matrix.create(mixs_size, mixs_size);
			let B = new Array<number>(mixs_size); B.fill(0.0);

			let elems_not_zero_count = 0;
			for (let k = 0; k < ELEMENTS_MAX; ++k) {
				let e = this.elements[k];
				if (Math.abs(e.value) < 0.001) {
					e.zero = true;
					continue;
				} else {
					elems_not_zero_count++;
					e.zero = false;
				}
				//			if (water_) {
				//				e.mass_part_minus_water = e.mass_part - water_->elements[e.element];
				//			} else {
				e.value_minus_water = e.value;
				//			}
				e.k = (this.to_log(e.ratio) / e.value);
			}

			if (elems_not_zero_count === 0) {
				this.result = "no elements..."
				this.result_ferts = [];
				return;
			}

			for (let j = 0; j < mixs_size; ++j) {
				for (let k = 0; k < ELEMENTS_MAX; ++k) {
					let e = this.elements[k];
					if (e.zero) continue;
					B[j] += e.value_minus_water * e.k * mixs[j].elements[k] * 0.01 - mixs[j].cost * cost_k;
				}
			}

			for (let i = 0; i < mixs_size; ++i) {
				for (let j = 0; j < mixs_size; ++j) {
					if (i == j) {
						let sum = 0.0;
						for (let k = 0; k < ELEMENTS_MAX; ++k) {
							let e = this.elements[k];
							if (e.zero) continue;
							let a = mixs[i].elements[k] * 0.01;
							sum += a * a * e.k;
						}
						A.s(i, j, sum);
					} else {
						let sum = 0.0;
						for (let k = 0; k < ELEMENTS_MAX; ++k) {
							let e = this.elements[k];
							if (e.zero) continue;
							let a = mixs[i].elements[k] * 0.01;
							let b = mixs[j].elements[k] * 0.01;
							sum += a * b * e.k;
						}
						A.s(i, j, sum);
					}
				}
			}

			let x_n = B.length;
			let rank_A = A.rank, rank_AExt = Matrix.clone(A).add_col(B).rank;

			if (rank_A === rank_AExt) {
				if (rank_A === x_n) {
					this.temp_X = this.solve_cholesky(A, B);
				} else {
					this.result = "infinite number of results...";
					this.result_ferts = [];
					return;
				}
			} else {
				this.result = "no solution for this configuration...";
				this.result_ferts = [];
				return;
			}
		}

		let X = this.temp_X;
		let r = "", tank = ["", "", ""]

		for (let i = 0; i < mixs.length; ++i) {
			let s = "";
			if (mixs[i].type == NPKCalc.FertilizerType.DRY) {
				s = ((X[i] / 1000.0) * this.volume.mx_value).toFixed(2) + " g";
			} else if (mixs[i].type == NPKCalc.FertilizerType.LIQUID) {
				s = (X[i] * this.volume.mx_value / mixs[i].density).toFixed(2) + " ml";
			} else {
				let k = 1.0 / mixs[i].density;
				s = ((X[i] / 1000.0) * this.volume.mx_value * k).toFixed(2) + " ml";
			}
			tank[mixs[i].bottle] += s.padEnd(12) + " - " + mixs[i].get_name() + "\n";
		}

		if (tank[0].length) { r += "Bottle A:\n" + tank[0]; }
		if (tank[1].length) { r += "Bottle B:\n" + tank[1]; }
		if (tank[2].length) { r += "Bottle C:\n" + tank[2]; }

		if (!volume_changed) {
			let total_ppm_target = 0.0, total_ppm_calc = 0.0;
			for (let i = 0; i < ELEMENTS_MAX; ++i) total_ppm_target += this.elements[i].value;

			let r2 = "\nSolution:\n";

			let result_ferts = new Array<CalcFertilizerResult>(mixs.length);
			let r_elements = new Array<number>(ELEMENTS_MAX).fill(0.0);
			for (let i = 0; i < mixs.length; ++i) {
				result_ferts[i] = { fertilizer: mixs[i], x: X[i] };
				for (let j = 0; j < ELEMENTS_MAX; ++j) {
					r_elements[j] += mixs[i].elements[j] * 0.01 * X[i];
				}
			}
			this.result_ferts = result_ferts;

			for (let i = 0; i < ELEMENTS_MAX; ++i) {
				//if (water_) result[i] += water_->elements[element];
				let ppm = r_elements[i];
				total_ppm_calc += ppm;

				if (Math.abs(ppm) > 0.001) {
					let s = to_name(i);
					s = s.padEnd(7) + " : " + ppm.toFixed(2).padEnd(7);
					if (Math.abs(this.elements[i].value) > 0.001) {
						let diff = ppm - this.elements[i].value;
						let percent = 100.0 * (diff / this.elements[i].value);
						if (Math.abs(percent) < 0.001) percent = 0.0;
						s += ((percent >= 0 ? " : +" : " : ") + percent.toFixed(2)).padEnd(10) + "%\n";
					} else {
						s += "\n";
					}
					r2 += s;
				}
			}
			this.temp_R = r2;
			this.temp_PPM = "PPM     : " + total_ppm_calc.toFixed(2).padEnd(7) + " : " + (100.0 * (total_ppm_target - total_ppm_calc) / total_ppm_target).toFixed(2).padEnd(7) + "%\n\n";

			const ratio = calc_solution_ratio(r_elements)
			this.temp_PPM += "N-NH4 % : " + ratio.nh4_percent.toFixed(2) + "\n";
			this.temp_PPM += "N:K     : " + ratio.nk.toFixed(2) + "\n";
			this.temp_PPM += "K:Ca    : " + ratio.kca.toFixed(2) + "\n";
			this.temp_PPM += "K:Mg    : " + ratio.kmg.toFixed(2) + "\n";
			this.temp_PPM += "Ca:Mg   : " + ratio.camg.toFixed(2) + "\n\n";
		}


		let cost = 0.0;
		for (let i = 0; i < mixs.length; ++i) {
			cost += mixs[i].cost * X[i] / 1000000.0;
		}
		cost *= this.volume.mx_value;
		const cost_str = "Cost    : " + cost.toFixed(2) + "\n";

		this.result = r + this.temp_R + "\n" + this.temp_PPM + cost_str;
	}

	private calc_mode_2(volume_changed: boolean) {
		this.result = "manual mode";

		for (let i = 0; i < ELEMENTS_MAX; ++i) {
			let ppm = 0;
			for (let j = 0; j < this.result_ferts.length; ++j) {
				ppm += this.result_ferts[j].fertilizer.elements[i] * 0.01 * this.result_ferts[j].x;
			}
			this.elements[i].set_value(ppm);
		}
	}

	calc(volume_changed: boolean = false) {
		if (this.mode_ === false) this.calc_mode_1(volume_changed);
		else this.calc_mode_2(volume_changed);
	}

	/*
	private solve_givens(A: Matrix, B: number[]): number[] {
		let [m, n] = A.dim; m;
		let X = new Array<number>(n);
 
		for (let k = 0; k < n; ++k) {
			for (let i = k + 1; i < n; ++i) {
				let den = Math.sqrt(A.g(k, k) * A.g(k, k) + A.g(i, k) * A.g(i, k));
				let c = A.g(k, k) / den, s = A.g(i, k) / den;
 
				for (let j = k; j < n; ++j) {
					let old_value_a_ij = A.g(i, j), old_value_a_kj = A.g(k, j);
 
					A.s(k, j, c * old_value_a_kj + s * old_value_a_ij);
					A.s(i, j, c * old_value_a_ij - s * old_value_a_kj)
				}
 
				let old_value_a_kb = B[k], old_value_a_ib = B[i];
 
				B[k] = c * old_value_a_kb + s * old_value_a_ib;
				B[i] = c * old_value_a_ib - s * old_value_a_kb;
			}
		}
 
		X[n - 1] = B[n - 1] / A.g(n - 1, n - 1);
		for (let i = n - 1; i >= 0; --i) {
			let sum = 0;
			for (let j = n - 1; j > i; --j) sum += X[j] * A.g(i, j);
			X[i] = (B[i] - sum) / A.g(i, i);
		}
 
		return X;
	}
	*/

	private solve_cholesky(A: Matrix, B: number[]): number[] {
		let [m, n] = A.dim; m;

		let L = Matrix.create(m, n);
		let X = new Array<number>(n);
		let Y = new Array<number>(n);

		for (let i = 0; i < n; ++i) {
			for (let j = 0; j <= i; ++j) {
				let sum = 0.0;
				if (j == i) {
					for (let k = 0; k < j; k++) sum += L.g(j, k) * L.g(j, k);
					L.s(j, j, Math.sqrt(A.g(j, j) - sum));
				} else {
					for (let k = 0; k < j; k++) sum += L.g(i, k) * L.g(j, k);
					L.s(i, j, (A.g(i, j) - sum) / L.g(j, j));
				}
			}
		}

		Y[0] = B[0] / L.g(0, 0);
		for (let i = 1; i < m; ++i) {
			let sum = 0;
			for (let j = 0; j < i; j++) sum += Y[j] * L.g(i, j);
			Y[i] = (B[i] - sum) / L.g(i, i);
		}

		L.transpose();

		X[n - 1] = Y[n - 1] / L.g(n - 1, n - 1);
		for (let i = n - 1; i >= 0; --i) {
			let sum = 0;
			for (let j = n - 1; j > i; --j) sum += X[j] * L.g(i, j);
			X[i] = (Y[i] - sum) / L.g(i, i);
		}

		return X;
	}

}