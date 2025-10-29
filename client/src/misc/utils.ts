// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

export function getCookie(cookie_name: string): string | null {
	var name = cookie_name + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(';');
	for (var i = 0; i < ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return null;
}

export function setCookie(name: string, value: string, days: number, secure: boolean = false) {
	var expires = "";
	if (days) {
			var date = new Date();
			date.setTime(date.getTime() + (days*24*60*60*1000));
			expires = "; expires=" + date.toUTCString();
	}
	document.cookie = name + "=" + (value || "")  + expires + (secure ? "secure;" : ";") + " path=/";
}

export const array_fast_remove = <T> (index: number, ar: Array<T>): boolean => {
	let last_ix = ar.length - 1;
	if (last_ix === index) {
		ar.length = last_ix;
		return false;
	} else {
		let tmp = ar[last_ix];
		ar.length = last_ix;
		if (ar.length >= 1) {
			ar[index] = tmp;
			return true;
		} else {
			return false
		}
	}
}