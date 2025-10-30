// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as nscalc from 'rpc/nscalc'
import * as NPRPC from 'nprpc';
import { observable, computed } from 'mobx'

export class UserData {
	@observable is_logged_in: boolean;
	@observable user: string;
	@computed get is_guest() { return this.user == "Guest" }
	
	email: string;
	
	reg_user: nscalc.RegisteredUser;
	
	constructor() {
		this.is_logged_in = false;
		this.user = "Guest";
		this.email = "";
	}
}

export class MyIcons {
	add = 'img/add.svg';
	bell = 'img/bell.svg';
	gear = 'img/gear.svg';
	redo = 'img/redo.svg';
	undo = 'img/undo.svg';
	save = 'img/save.svg';
}

class Global {
	user_data: UserData;
	icons: any;
	
	constructor() {
		this.user_data = new UserData();
		this.icons = new MyIcons();
	}
}


export default new Global;


