// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { observable, computed } from 'mobx'

export interface IModified {
	isModified(): boolean;
	setModified(modified: boolean): void;
}

export class Modified {
	@observable private modified: boolean;
	constructor() {
		this.modified = false;
	}
	@computed get isModified(): boolean { 
		return this.modified
	};
	setModified(modified: boolean): void { 
		this.modified = modified;
	};
}

export class MobXValue<T> extends Modified {
	@observable public mx_value: T;
}