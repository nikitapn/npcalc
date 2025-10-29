// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as che from 'calculation/datatypes'
import { ITable } from 'tables/table_item'
import { TableModelWithCommands } from 'tables/table_model'

export enum Tables {
	Solutions,
	Fertilizers,
	Calculations
};

class Table_Solutions extends TableModelWithCommands(che.Solution) {
	constructor() {
		super(Tables.Solutions);
	}

	set_element(solution_id: number, element_index: number, value: number) {
		let sol = this.items.find((sol) => sol.get_id() == solution_id);
		if (!sol) {
			console.log("solution with id: " + solution_id + " was not found");
		} else {
			sol.set_element(element_index, value);
		}
	}
}

class Table_Fertilizers extends TableModelWithCommands(che.Fertilizer) {
	constructor() {
		super(Tables.Fertilizers);
	}
}



let tables: ITable[] = [
	new Table_Solutions, 
	new Table_Fertilizers, 
];

let store = {
	solutions: 		tables[0] as Table_Solutions,
	fertilizers: 	tables[1] as Table_Fertilizers,
	get_table: 		function(index: number) : ITable { return tables[index]; }
};

export { 
	store 
}
