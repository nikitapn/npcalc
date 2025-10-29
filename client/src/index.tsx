// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import * as ReactDOM from 'react-dom';

import { set_user_data } from 'misc/login'
import * as NPRPC from 'nprpc';
import * as nscalc from 'rpc/nscalc'
import { store } from 'tables/store'
import * as che from 'calculation/datatypes'
import * as utils from 'misc/utils'
import { get_calculations } from 'tables/store_calculations'
import { calculator, authorizator, init_rpc, poa } from 'rpc/rpc'
import { connect_to_room } from 'misc/chat'
import { DataObserverImpl } from 'misc/data_observer'
import App from 'gui/App.svelte';
import { AppReact } from 'gui/AppReact'

const the_app = new App({
	target: document.getElementById('root')
});

ReactDOM.render(
	<AppReact menu_className="tab" dynamic={false} />,
	the_app.content
);

let body = document.getElementById("id_body") as HTMLBodyElement
body.style.display = 'block';

async function fetch_data() {
	let solutions = NPRPC.make_ref<NPRPC.Flat.Vector_Direct2<nscalc.Flat_nscalc.Solution_Direct>>();
	let fertilizers = NPRPC.make_ref<NPRPC.Flat.Vector_Direct2<nscalc.Flat_nscalc.Fertilizer_Direct>>();
	
	//let t0 = performance.now()
	try {
		await calculator.GetData(solutions, fertilizers);
		{
			const size = solutions.value.elements_size;
			let a = new Array<che.Solution>(size);
			let i = 0;
			for (let s of solutions.value) {
				a[i++] = che.Solution.create_from_data(s)
			}
			store.solutions.push_some(a);
		}

		{
			const size = fertilizers.value.elements_size;
			let a = new Array<che.Fertilizer>(size);
			let i = 0;
			for (let f of fertilizers.value) {
				a[i++] = che.Fertilizer.create_from_data(f);
			}
			store.fertilizers.push_some(a);
		}

		await get_calculations();

		await calculator.Subscribe(
			poa.activate_object(new DataObserverImpl())
		);

		connect_to_room();
	} catch (e) {
		console.log(e);
	}
	//let t1 = performance.now();
	//console.log("Call to RPC took " + (t1 - t0) + " milliseconds.");
}

async function auth() {
	await init_rpc();
	let session_id = utils.getCookie("sid");
	if (session_id != null) {
		try { set_user_data(await authorizator.LogInWithSessionId(session_id)); } catch(e) {}
	}
	fetch_data();
};

auth();
