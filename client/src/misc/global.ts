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
/*
	static get_image_jpg(abuf: ArrayBuffer) : string {
		return this.get_image('application/octet-binary', abuf);
	}
	
	static get_image_svg(abuf: ArrayBuffer) : string {
		return this.get_image('image/svg+xml', abuf);
	}
	
	static get_image(type: string, abuf: ArrayBuffer) {
		return URL.createObjectURL(new Blob([abuf], {type: type}));
	}


	public async fetch(obj: nscalc.Calculator) {
		let db: IDBDatabase;
		let request = window.indexedDB.open("Cache", 1);
		let promise = new NPRPC.MyPromise<boolean>();

		request.onerror = event => {
			promise.set_exception(new NPRPC.Exception("Why didn't you allow my web app to use IndexedDB?!"));
		};

		request.onsuccess = event => {
			db = (event.target as any).result;
			promise.set_promise(true);
		};

		request.onupgradeneeded = event => {
			db = (event.target as any).result;
			db.createObjectStore("images");
		};

		try {
			await promise.$;

			promise = new NPRPC.MyPromise<boolean>();
			var transaction = db.transaction(["images"]);
			var objectStore = transaction.objectStore("images");
			let c = objectStore.openCursor();
			
			let images = this as any;

			c.onsuccess = (event) => {
				let cursor: IDBCursorWithValue = (event.target as any).result;
				let has_images = false;
				if(cursor) {
					has_images = true;
					images[cursor.key.toString()] = MyIcons.get_image_svg(cursor.value); 
					cursor.continue();
				}
				promise.set_promise(has_images);
			}
			c.onerror = event => {
				promise.set_promise(false);
			}

			if (await promise.$ === true) return;
		} catch (e) {
			console.log(e);
		}
		
		let images = NPRPC.make_ref<NPRPC.Flat.Vector_Direct2<nscalc.Flat_nscalc.Media_Direct>>();
		await obj.GetImages(images);
		for (let img of images.value) {
			(this as any)[img.name] = MyIcons.get_image_svg(img.data_d().array_buffer);
		}

		if (db) {
			var transaction = db.transaction(["images"], "readwrite");
			transaction.oncomplete = event => {};
			transaction.onerror = event => {};

			var objectStore = transaction.objectStore("images");
			for (let img of images.value) {
				objectStore.add(img.data_d().array_buffer, img.name);
			}
		}
	}
	*/
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


