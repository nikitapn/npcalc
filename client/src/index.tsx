// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import * as ReactDOM from 'react-dom';

import { set_user_data } from 'misc/login'
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
	try {
		const {solutions, fertilizers} = await calculator.http.GetData();
		store.solutions.push_some(solutions.map( s => che.Solution.create_from_data(s) ));
		store.fertilizers.push_some(fertilizers.map( f => che.Fertilizer.create_from_data(f) ));
		await get_calculations();
		await calculator.Subscribe(
			poa.activate_object(new DataObserverImpl())
		);
		connect_to_room();
	} catch (e) {
		console.log(e);
	}
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
