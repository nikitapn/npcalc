// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { RouterTabPane, Menu, MenuButton } from 'gui/view/tab_menu'
import { View_NutrientSolutions } from 'gui/view/view_solutions'
import { View_Fertilizers } from 'gui/view/view_fertilizers'
import { View_Calculator } from 'gui/view/view_calculator'
import { View_Chat } from 'gui/view/view_chat'
import { View_About } from 'gui/view/view_about'
import { LoginPanel } from 'gui/misc/LoginPanel'
import { Alarms } from 'gui/misc/Alarms'

export class AppReact extends RouterTabPane {
	constructor(props:any) {
		super(props);
	}

	protected create() {
		this.add_view(View_Calculator, "CALCULATOR", true);
		this.add_view(View_NutrientSolutions, "SOLUTIONS", false);
		this.add_view(View_Fertilizers, "FERTILIZERS", false);
		this.add_view(View_Chat, "CHAT", false);
		this.add_view(View_About, "ABOUT", false);
	}

	componentDidMount() {
		super.componentDidMount();
		let this_ = this;
		document.addEventListener("new_calculation", () => {window.scrollTo(0, 0); this_.select_view(0)});
	}

	render() {
		let { view_builder } = this.state;
		if (view_builder.length === 0) return (<div key="nc"></div>);
		return (
			<div key="hc">
				<div style={{display: 'flex'}}>
				<Menu className={this.props.menu_className} ref={this.menu} active_index={this.active_index_after_adding} items=
				{
					view_builder.map((x, index) => {
					return {
						name: x.tab_name, 
						ref: React.createRef<MenuButton>(),
						onclick: () => { this.handle_select_view(this.views[index]) },
						oncloseclick: () => { this.remove_view(index) }
					};})
				}/>
				<LoginPanel className="wlogin"/>
			</div>
				<div className="main">
					{
						view_builder.map((x, index) => { return (x.create(index)) })
					}
				</div>
			<Alarms/>
			</div>
		);
	}
}