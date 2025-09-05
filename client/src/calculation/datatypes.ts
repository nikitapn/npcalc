// Copyright (c) 2022 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { MobXValue } from 'tables/modified'
import { TableItemWithOwnership } from 'tables/table_item'
import { observable } from 'mobx'
import  global from 'misc/global'
import * as NSCalc from 'rpc/nscalc'

export const solution_id_bit 		= 0x10000000;  
export const fertilizer_id_bit 	= 0x20000000;  


let parser = require('parser/parser_ctx');
let el_tab = require('parser/elements.js');

/*import '../.exec/calc.js'

declare var Module: any;

Module['onRuntimeInitialized'] = function() { 
	//let int_sqrt = Module.cwrap('int_sqrt', 'number', ['number'])
	//console.log(int_sqrt(5));
};
*/

let _table = [undefined, undefined, undefined, undefined, 10, undefined, 0, undefined, undefined, undefined, undefined, 5, undefined, undefined, 2, 6, 7, undefined, 3, 4, undefined, undefined, undefined, undefined, 11, 8, undefined, undefined, 12, 9, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 13, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];
let _table1 = [6, 6, 14, 18, 19, 11, 15, 16, 25, 29, 4, 24, 28, 41];
let _index_to_name = ["N-NO3", "N-NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"];

export enum ELEMENT {
	N_NO3, N_NH4, P, K, Ca, Mg, S, Cl, Fe, Zn, B, Mn, Cu, Mo
};

export function to_name(index: ELEMENT) {
	return _index_to_name[index];
}

export const ELEMENTS_MAX = ELEMENT.Mo + 1;

export function to_mml(e: ELEMENT, ppm: number) {
	return ppm / el_tab[_table1[e]].mass;
}

export interface SolutionElementRatio {
	nh4_percent: number;
	nk: number;
	kca: number;
	kmg: number;
	camg: number;
}

export interface SolutionEC {
	cations: number;
	anions: number;
	delta_ca: number;
	ec: number;
}

export function calc_solution_ratio(elements: number[]): SolutionElementRatio {
	const nh4 = elements[ELEMENT.N_NH4];
	const no3 = elements[ELEMENT.N_NO3];
	const n = nh4 + no3;
	const k = elements[ELEMENT.K];
	const ca = elements[ELEMENT.Ca];
	const mg = elements[ELEMENT.Mg];

	return {
		nh4_percent: 100.0 * nh4 / n,
		nk: n / k,
		kca: k / ca,
		kmg: k / mg,
		camg: ca / mg
	};
}

export function calc_solution_ec(elements: number[]): SolutionEC {
	const cations =
		+to_mml(ELEMENT.N_NH4, elements[ELEMENT.N_NH4])
		+ to_mml(ELEMENT.K, elements[ELEMENT.K])
		+ 2.0 * to_mml(ELEMENT.Ca, elements[ELEMENT.Ca])
		+ 2.0 * to_mml(ELEMENT.Mg, elements[ELEMENT.Mg]);

	const anions =
		-to_mml(ELEMENT.N_NO3, elements[ELEMENT.N_NO3])
		- 2.0 * to_mml(ELEMENT.S, elements[ELEMENT.S])
		- to_mml(ELEMENT.P, elements[ELEMENT.P])
		- to_mml(ELEMENT.Cl, elements[ELEMENT.Cl]) /* - 2.0 * che::mmlconv::mmlCO3(CO3) */;

	//let ec = ((-anions + cations) / 20.0);
	//if (ec > 0.001) ec += 0.1;

	let ec = 0.095 * -anions + 0.19;

	return {
		cations: cations,
		anions: anions,
		delta_ca: anions + cations,
		ec: ec
	};
}

export class SolutionElement extends MobXValue<number> {
	e: ELEMENT;

	constructor(e?: ELEMENT, mass_part?: number) {
		super();
		this.e = e;
		this.mx_value = mass_part;
	}

	clone(): SolutionElement {
		let n = new SolutionElement();
		n.e = this.e;
		n.mx_value = this.mx_value;
		return n;
	}

	get name(): string {
		return _index_to_name[this.e];
	}
}

export class Solution extends TableItemWithOwnership {
	private elements: Array<SolutionElement>;
	constructor(is_new: boolean, owner?: string) { 
		super(is_new, owner); 
		this.elements = new Array<SolutionElement>(ELEMENTS_MAX);
	}

	public static create(): Solution {
		let s = new Solution(true);
		s.mx_value = "New Solution";
		for (let i = 0; i < ELEMENTS_MAX; ++i) {
			s.elements[i] = new SolutionElement(i, 0.0);
		}
		return s;
	}

	public static create_from_data(data: NSCalc.Flat_nscalc.Solution_Direct): Solution {
		let s = new Solution(false, data.userName);
		s.set_id(data.id);
		s.set_name(data.name);
		let vde = data.elements_d();
		for (let i = 0; i < ELEMENTS_MAX; ++i) {
			s.elements[i] = new SolutionElement(i, vde.at(i));
		}
		return s;
	}

	set_element(index: ELEMENT, mass_part: number): void {
		this.elements[index].setModified(false);
		this.elements[index].mx_value = mass_part;
	}

	//	set_id(id: number) {
	//		super.set_id(id);
	//		for (let el of this.elements) el.setModified(false);
	//	}

	get_element(element: ELEMENT): SolutionElement {
		return this.elements[element];
	}

	clone(): Solution {
		let sol = new Solution(true);
		sol.mx_value = this.mx_value + " - Copy";
		Object.assign(sol.elements, this.elements.map(x => x.clone()));
		return sol;
	}

	delete_element(element: ELEMENT): void {
		let ix = this.elements.findIndex((e: SolutionElement) => e.e === element);
		if (ix === -1) return;
		this.elements.splice(ix);
	}

	public async server_add() {
		try {
			this.set_id(await global.user_data.reg_user.AddSolution(
				this.get_name(), 
				Float64Array.from(this.elements.map(x => x.mx_value)))
				);
		} catch (e) { console.log(e); }
	}
}


export class Fertilizer extends TableItemWithOwnership {
	@observable public elements: Array<number>;
	formula: MobXValue<string>;
	type: NSCalc.FertilizerType;
	@observable bottle: NSCalc.FertilizerBottle;
	@observable density: number;
	@observable cost: number;

	constructor(is_new: boolean, owner?: string) {
		super(is_new, owner);
		this.elements = new Array<number>(ELEMENTS_MAX);
		this.formula = new MobXValue<string>();
	}

	public static create(): Fertilizer {
		let f = new Fertilizer(true);
		f.mx_value = "New Fertilizer";
		f.formula.mx_value = "";
		f.clear();
		return f;
	}

	public async server_add() {
		try {
			this.set_id(await global.user_data.reg_user.AddFertilizer(
				this.get_name(), 
				this.formula.mx_value
			));
		} catch (e) { console.log(e); }
	}

	public static create_from_data(data: NSCalc.Flat_nscalc.Fertilizer_Direct): Fertilizer {
		let f = new Fertilizer(false, data.userName);
		f.set_id(data.id);
		f.mx_value = data.name;
		f.formula.mx_value = data.formula;
		f.parse_formula();
		return f;
	}

	clear() {
		for (let i = 0; i < ELEMENTS_MAX; ++i) this.elements[i] = 0.0;
		this.type = 0;
		this.bottle = 0;
		this.density = 0.0;
	}

	clone(): Fertilizer {
		let fert = new Fertilizer(true);
		fert.mx_value = this.mx_value + " - Copy";
		Object.assign(fert.elements, this.elements);
		fert.formula.mx_value = this.formula.mx_value;
		fert.type = this.type;
		fert.bottle = this.bottle;
		fert.density = this.density;
		fert.cost = this.cost;

		return fert;
	}

	parse_formula(): [boolean, any] {
		try {
			let sbs = parser.parse(this.formula.mx_value).lst.stmts;
			this.accumulate(sbs);
			return [true, null];
		} catch (e) {
			return [false, e];
		}
	}

	accumulate(sbs: any) {
		let elements = new Array<number>(ELEMENTS_MAX);
		elements.fill(0.0);

		let other: any = {
			bottle: undefined,
			density: undefined
		};

		function set_nh4_no3(no3_percent: number, nh4_percent: number) {
			if (elements[0] !== 0.0) {
				if (no3_percent !== 0.0) throw "N-NO3 redifinition...";
			} else {
				elements[0] = no3_percent;
			}
			if (elements[1] !== 0.0) {
				if (nh4_percent !== 0.0) throw "N-NH4 redifinition...";
			} else {
				elements[1] = nh4_percent;
			}
		}

		for (let sub of sbs) {
			let r = sub.eval(other);
			if (r === null) continue;
			if (r.directly !== undefined) {
				if (r.index < 2) {
					set_nh4_no3(r.index === 0 ? r.percent : 0.0, r.index === 1 ? r.percent : 0.0);
				} else {
					if (elements[r.index] !== 0.0) throw "element redifinition...";
					elements[r.index] = r.percent;
				}
				continue;
			}
			for (let e of r.elements) {
				let ix = _table[e.n];
				if (ix === undefined) continue;
				if (ix === 0) {
					if (e.nh2_count !== undefined) {
						set_nh4_no3(e.no3_percent, e.nh4_percent);
					}
				} else {
					if (elements[ix] !== 0.0) throw "element redifinition...";
					elements[ix] = e.percent;
				}
			}
		}

		for (let i = 0; i < ELEMENTS_MAX; ++i) {
			this.elements[i] = elements[i];
		}

		if (other.bottle) {
			this.bottle = other.bottle;
		} else {
			this.bottle = 0;
		}

		if (other.cost) {
			this.cost = other.cost;
		} else {
			this.cost = 1.0;
		}

		if (other.type) {
			this.type = other.type;
			this.density = other.density;
		} else {
			this.type = 0;
			this.density = 0.0;
		}
	}
}
