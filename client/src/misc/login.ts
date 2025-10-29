// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as nscalc from 'rpc/nscalc'
import { narrow, ObjectProxy } from 'nprpc'
import global from 'misc/global'
import { setCookie } from 'misc/utils'
import { get_calculations } from 'tables/store_calculations'

export function set_user_data(ud: nscalc.UserData | null): void {
	if (ud === null) {
		global.user_data.is_logged_in = false;
		global.user_data.user = "Guest";
		global.user_data.email = "";
		if (global.user_data.reg_user) {
			global.user_data.reg_user.release();
		}
		global.user_data.reg_user = null;
		setCookie("sid", undefined, 31, false);
		get_calculations();
		return;
	}
	
	global.user_data.user = ud.name;
	global.user_data.reg_user = narrow(ud.db, nscalc.RegisteredUser);
	
	if (global.user_data.reg_user === null) {
		console.log("narrowing failed");
	}

	get_calculations();
	setCookie("sid", ud.sessionId, 31, false);

	global.user_data.is_logged_in = true;
}