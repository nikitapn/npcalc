// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { MobXValue } from 'tables/modified';
import { IServerCommand, Command_ValueChanged, Command_ValueChangedUpdateDependValue } from './command'
import global from 'misc/global'
import * as che from 'calculation/datatypes'
import * as nscalc from 'rpc/nscalc'

export class CommandComposer {
	commands: Map<number, any>
	constructor() {
		this.commands = new Map<number, any>();
	}

	server_execute(): void {
		let elements = new Map<number, nscalc.SolutionElement[]>();
		this.commands.forEach((x, key) => {
			if ((key & che.solution_id_bit) && (key & 0x00FF0000)) {
				let solution_id = key & 0xFFFF;
				let a = elements.get(solution_id);
				if (!a) { 
					a = new Array<nscalc.SolutionElement>();
					elements.set(solution_id, a);
				}
				a.push({index: ((key >> 16) & 0xFF) - 1, value: x});
			} else {
				x();
			}
		});
	
		elements.forEach((elements, solution_id) => {
			global.user_data.reg_user.SetSolutionElements(solution_id, elements);
		});
	}
}

export class Command_SolutionValueChanged extends Command_ValueChanged implements IServerCommand {
	private solution: che.Solution
	private element_index: number;
	constructor(object: MobXValue<any>, new_value: any, old_value: any, solution: che.Solution, element_index: number) {
		super(object, new_value, old_value);
		this.solution = solution;
		this.element_index = element_index;
	}

	make(cc: CommandComposer): void {
		if (this.solution.is_new == true) return;
		
		cc.commands.set(
			che.solution_id_bit | this.solution.get_id() | ((this.element_index + 1) << 16),
			this.new_value);		
	}
}

export class Command_FertilizerFormulaChanged extends Command_ValueChangedUpdateDependValue implements IServerCommand {
	fertilizer: che.Fertilizer;

	constructor(object: MobXValue<any>, new_value: any, old_value: any, fertilizer: che.Fertilizer, after_exec_unexec: (value: any) => void) {
		super(object, new_value, old_value, after_exec_unexec);
		this.fertilizer = fertilizer;
	}

	make(cc: CommandComposer): void {
		if (this.fertilizer.is_new == true) return;

		cc.commands.set(
			che.fertilizer_id_bit | this.fertilizer.get_id() | (1 << 16),
			() => { global.user_data.reg_user.SetFertilizerFormula(this.fertilizer.get_id(), this.new_value) });
	}
}