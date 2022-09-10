// Copyright (c) 2022 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as Calculation from '../calculation/calculation'
import global from 'misc/global'
import * as NPRPC from 'nprpc';
import * as npkcalc from 'rpc/npkcalc'
import { TableModel } from 'tables/table_item'
import { calculator } from 'rpc/rpc'

class Table_Calculations extends TableModel(class {}, Calculation.Calculation) {
	constructor() {
		super();
	}

	private get_new_id() {
		let id = 0;
		for (let calc of this.items) {
			let calc_id = calc.get_id();
			if (calc_id >= id) id = calc_id + 1;
		}
		return id;
	}
	
	create_calculation(): Calculation.Calculation {
		let calc = new Calculation.Calculation(true, this.get_new_id());
		this.items.push(calc);
		return calc;
	}

	public save_calculation(calc: Calculation.Calculation) {
		global.user_data.reg_user.UpdateCalculation({	
				id: calc.get_id(),
				name: calc.get_name(),
				elements: calc.elements.map(x => { return {
						value: x.value,
						value_base: x.value_base,
						ratio: x.ratio
					}}),
				fertilizers_ids: calc.ferts.map( x => { return x.get_id() }),
				volume: calc.volume.mx_value,
				mode: calc.mode,
			}
		).then(id => calc.set_id(id))
		.catch(e => { console.log("save_calculation failed: " + e) });
	}

	public delete_calculation(calc: Calculation.Calculation) {
		const [id, is_new] = [calc.get_id(), calc.is_new];
		calculations.erase_by_id(id);
		if (global.user_data.reg_user) {
			if (!is_new) global.user_data.reg_user.DeleteCalculation(id);
		}
	}
}

export let calculations = new Table_Calculations();

export const get_calculations = async () => {
	let calculations_data = NPRPC.make_ref<NPRPC.Flat.Vector_Direct2<npkcalc.Flat_npkcalc.Calculation_Direct>>();
	if (global.user_data.reg_user) {
		await global.user_data.reg_user.GetMyCalculations(calculations_data);
	} else {
		await calculator.GetGuestCalculations(calculations_data);
	}

	calculations.clear();
	for (let calc_data of calculations_data.value) {
		calculations.push_one(Calculation.Calculation.create_from_data(calc_data));
	}

	document.dispatchEvent(new CustomEvent("update_my_calculations"));
}