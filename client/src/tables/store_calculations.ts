// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as Calculation from '../calculation/calculation'
import global from 'misc/global'
import * as NPRPC from 'nprpc';
import * as nscalc from 'rpc/nscalc'
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
				elements: JSON.stringify(calc.elements.map(x => [x.value, x.value_base, x.ratio])),
				fertilizersIds: JSON.stringify(calc.ferts.map( x => { return x.get_id() })),
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
	let data = (global.user_data.reg_user)
		// FIXME:
		// Registered user might wanna use WebSocket transport here
		// Since here will probably already be an open connection
		? await global.user_data.reg_user.http.GetMyCalculations()
		: await calculator.http.GetGuestCalculations();

	calculations.clear();
	for (let c of data)
		calculations.push_one(Calculation.Calculation.create_from_data(c));

	document.dispatchEvent(new CustomEvent("update_my_calculations"));
}