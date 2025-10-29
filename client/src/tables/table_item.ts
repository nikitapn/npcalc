// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

//import { Polymorphic, iarchive, oarchive } from './archive'
import { MobXValue } from 'tables/modified'
import { observable, IObservableArray, computed } from 'mobx'
import global from 'misc/global'

export abstract class TableItem extends MobXValue<string> {
	private static last_new_id_: number = 100000;

	private id_: number;

	constructor(private is_new_: boolean) {
		super();
		if (is_new_ === true) this.id_ = TableItem.last_new_id_++;
	}

	get_id() : number {
		return this.id_;
	}

	set_id(id: number) {
		this.id_ = id;
		this.is_new_ = false;
		this.setModified(false);
	}

	get_name () : string {
		return this.mx_value;
	}

	set_name(new_name: string) {
		this.mx_value = new_name;
		this.setModified(false);
	}

	get is_new() : boolean {
		return this.is_new_;
	}

	public abstract server_add(): any;
}

export abstract class TableItemWithOwnership extends TableItem {
	private owner_: string;
	
	constructor(is_new: boolean, owner?: string) {
		super(is_new);

		if (this.is_new === true) {
			this.owner_ = global.user_data.user
		} else {
			this.owner_ = owner;
		}
	}	

	get_author() : string {
		return this.owner_;
	}

	@computed
	public get owned_by_me(): boolean {
		return (global.user_data.user == this.owner_)
	}

}


type Constructor<T> = new(...args: any[]) => T;

export interface ITable {
	push_some(items: TableItem[]) : void;
	push_one(item: TableItem) : void;
	get_by_id(item_id: number) : TableItem;
	erase_by_id(item_id: number) : void;
	set_name(item_id: number, name: string) : void;
	set_item_id(old_id: number, new_id: number) : void;
	sort() : void;
}

export function TableModel<T extends Constructor<{}>, U extends TableItem>(TBase: T, TElement: { new(is_new: boolean) : U }){ 
	return class extends TBase implements ITable {
		items: IObservableArray<U>;
		table_index: number;

		constructor(...args: any[]) {
			super(...args);
			this.table_index = args.shift();
			this.items = observable.array<U>();
		}

		push_some(items: U[]) {
			this.items.push(...items.sort((a, b) => a.get_name().localeCompare(b.get_name())));
		}
	
		push_one(item: U) {
			this.items.push(item);
		}

		clear() {
			this.items.clear();
		}

		get_by_id(item_id: number) : U | undefined {
			return this.items.find(value => {return value.get_id() == item_id});
		}

		erase_by_id(item_id: number) : void {
			let ix = this.items.findIndex(value => {return value.get_id() == item_id});
			if (ix != -1) this.items.splice(ix, 1);
		}
	
		set_name(item_id: number, name: string) : void {
			let item = this.items.find((item) => item.get_id() == item_id);
			if (!item) {
				console.log("item_id id: " + item_id + " was not found");
			} else {
				item.set_name(name);
			}
		}

		set_item_id(old_id: number, new_id: number) {
			let item = this.items.find((item) => item.get_id() == old_id);
			if (!item) {
				console.log("item_id id: " + old_id + " was not found");
			} else {
				item.set_id(new_id);
			}
		}

		sort() {
			this.items.replace(this.items.slice().sort((a, b) => a.get_name().localeCompare(b.get_name())));
		}
	}
}