// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { computed, observable } from 'mobx';
import { MobXValue } from './modified';


export interface ICommand {
	execute(): void;
	unexecute(): void;
	commit(): void;
}

export interface IServerCommand {
	make(cc: any): void;
}

export class Command_RemoveElementFromArray implements ICommand {
	protected readonly index: number;
	private array: Array<any>;
	private removed: any;

	constructor(index: number, array: Array<any>) {
		this.index = index;
		this.array = array;
	}

	execute(): void {
		this.removed = this.array.splice(this.index, 1)[0];
	}

	unexecute(): void {
		this.array.splice(this.index, 0, this.removed);
	}

	commit(): void {}
}

export class Command_AddElementToArray implements ICommand {
	private array: Array<any>;
	private added: any;

	constructor(added: any, array: Array<any>) {
		this.added = added;
		this.array = array;
	}

	execute(): void {
		this.array.push(this.added);
	}

	unexecute(): void {
		this.array.splice(this.array.length - 1, 1);
	}
	commit(): void {

	}
}

export class Command_ValueChanged implements ICommand {
	private object: MobXValue<any>;
	protected new_value: any;
	protected old_value: any;
	private restore_modified: boolean;

	constructor(object: MobXValue<any>, new_value: any, old_value: any) {
		this.object = object;
		this.new_value = new_value;
		this.old_value = old_value;
		this.restore_modified = this.object.isModified === false;
	}

	execute(): void {
		this.object.mx_value = this.new_value;
		if (this.restore_modified) this.object.setModified(true);
	}

	unexecute(): void {
		this.object.mx_value = this.old_value;
		if (this.restore_modified) this.object.setModified(false);
	}

	commit(): void {
		this.object.setModified(false);	
	}

	get value() { return this.new_value;}
}

export class Command_ValueChangedUpdateDependValue extends Command_ValueChanged {
	after_exec_unexec: (value: any) => void;

	constructor(object: MobXValue<any>, new_value: any, old_value: any, after_exec_unexec: (value: any) => void) {
		super(object, new_value, old_value);
		this.after_exec_unexec = after_exec_unexec;
	}

	execute(): void {
		super.execute();
		this.after_exec_unexec(this.new_value); 
	}

	unexecute(): void {
		super.unexecute();
		this.after_exec_unexec(this.old_value); 
	}
}

export class UndoRedo {
	@observable private pos: number;
	private commands: Array<ICommand>;

	constructor(...args: any[]) {
		this.pos = -1;
		this.commands = new Array<ICommand>();
	}

	public add_command(command: ICommand): void {
		if (this.pos + 1 !== this.commands.length) {
			this.commands.splice(this.pos + 1, this.commands.length - this.pos - 1);
		}
		command.execute();
		this.commands.push(command);
		this.pos++;
	}

	public undo(): void {
		if (this.pos === -1) return;
		this.commands[this.pos--].unexecute();
	}
	
	public redo(): void {
		if (this.commands.length > 0 && this.pos < (this.commands.length - 1)) {
			this.commands[++this.pos].execute();
		}
	}

	public commands_clear() {
		this.commands = new Array<ICommand>();
		if (this.pos === -1) this.pos = 0;
		this.pos = -1;
	}

	@computed
	get undo_size() { return this.pos + 1; }

	@computed
	get redo_size() { return this.commands.length - (this.pos + 1); }

	@computed
	get undo_redo_size() { return (this.pos + 1) +  (this.commands.length - (this.pos + 1)); }

	public get_cmd(index: number): ICommand { return this.commands[index]; }
};