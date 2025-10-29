// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { TableItem, TableModel } from 'tables/table_item'
import { MobXValue } from 'tables/modified';
import {
	UndoRedo, Command_RemoveElementFromArray, Command_AddElementToArray, Command_ValueChanged,
	IServerCommand
} from './command'
import global from 'misc/global'
import { CommandComposer } from 'tables/commands_custom';
import * as che from 'calculation/datatypes'

class Command_RemoveTableItem extends Command_RemoveElementFromArray implements IServerCommand {
	private table_index: number;
	private id: number;

	constructor(index: number, array: Array<any>, table_index: number, id: number) {
		super(index, array);
		this.table_index = table_index;
		this.id = id;
	}

	make(cc: CommandComposer): void {
		if (this.table_index == 0) {
			global.user_data.reg_user.DeleteSolution(this.id);
		} else if (this.table_index == 1) {
			global.user_data.reg_user.DeleteFertilizer(this.id);
		}
	}
}

class Command_AddTableItem<T extends TableItem> extends Command_AddElementToArray implements IServerCommand {
	table_index: number;
	item: T;
	constructor(added: any, array: Array<any>, table_index: number, item: T) {
		super(added, array);
		this.table_index = table_index;
		this.item = item;
	}

	make(cc: CommandComposer): boolean {
		this.item.server_add();
		return true;
	}
}

export class Command_TableItemNameChanged extends Command_ValueChanged implements IServerCommand {
	private table_index: number;
	private item_id: number;
	constructor(object: MobXValue<any>, new_value: any, old_value: any, table_index: number, item_id: number) {
		super(object, new_value, old_value);
		this.table_index = table_index;
		this.item_id = item_id;
	}

	make(cc: CommandComposer): void {
		if (this.table_index == 0) {
			cc.commands.set(che.solution_id_bit | this.item_id, () => { global.user_data.reg_user.SetSolutionName(this.item_id, this.value) });
		} else if (this.table_index == 1) {
			cc.commands.set(che.fertilizer_id_bit | this.item_id, () => { global.user_data.reg_user.SetFertilizerName(this.item_id, this.value) });
		}
	}
}


export function TableModelWithCommands<T extends TableItem>(unused: { new(is_new: boolean): T }) {
	return class extends TableModel(UndoRedo, unused) {

		add_new_row<U extends TableItem>(item: U): void {
			this.add_command(
				new Command_AddTableItem(item, this.items, this.table_index, item)
			);
		}

		erase(item: T): void {
			let index = this.items.indexOf(item);
			this.add_command(
				new Command_RemoveTableItem(index, this.items, this.table_index, item.get_id())
			);
		}

		store() {
			let cc = new CommandComposer();

			for (let i = 0; i < this.undo_size; ++i) {
				let cmd = this.get_cmd(i);
				if ("make" in (cmd as any)) {
					let c = (cmd as any) as IServerCommand;
					c.make(cc);
				}
			}

			cc.server_execute();
			
			for (let i = 0; i < this.undo_size; ++i) {
				let cmd = this.get_cmd(i);
				cmd.commit();
			}

			this.commands_clear();
			this.sort();

			// global.user_data.reg_user.SaveData();
		}
	}
}