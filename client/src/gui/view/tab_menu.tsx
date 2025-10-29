// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { View } from './view'
import { MobXInput } from 'misc/components'

interface MenuItem {
	name: string;
	ref: React.RefObject<MenuButton>;
	onclick?: () => void;
	oncloseclick?: () => void;
};

class MenuButton extends React.Component<{
	dynamic: boolean,
	editable: boolean,
	item: MenuItem,
	onclick: (self: MenuButton) => void,
}, {
	selected: boolean;
}> {
	mounted: boolean;
	constructor(props: any) {
		super(props);
		this.state = {
			selected: false
		};
	}

	componentDidMount() {
		this.mounted = true;
	}

	componentWillUnmount() {
		this.mounted = false;
	}

	set_select(selected: boolean) {
		this.setState({ selected: selected });
	}

	handle_onClickCapture(ev: Event) {
		if (ev.target instanceof HTMLButtonElement) {
			// let btn = ev.target as HTMLButtonElement;
			// console.log(btn);
			// do nothing
		} else {
			this.props.onclick(this);
		}
	}

	render() {
		const style = {
			display: 'flex',
		}
		return (<div style={style} className={this.state.selected ? "tab-btn tab-btn-selected" : "tab-btn"}
			onClickCapture={this.handle_onClickCapture.bind(this)}>
			<div>{this.props.item.name}</div>
			{
				this.props.dynamic ?
					<button id="idbtnclose" className="tab-btn-close" onClick={this.props.item.oncloseclick}>x</button> : ""
			}
		</div>);
	}
}

class Menu extends React.Component<{
	className: string,
	dynamic?: boolean,
	editable?: boolean,
	items: Array<MenuItem>,
	active_index?: number
}, {

}> {
	last_selected: MenuButton = null;

	constructor(props: any) {
		super(props);
	}

	on_button_click(btn: MenuButton, ev: Event) {
		if (this.last_selected === btn) return;
		btn.props.item.onclick();
		if (this.last_selected) this.last_selected.set_select(false);
		btn.set_select(true);
		this.last_selected = btn;
	}

	public set_selected(index: number) {
		let btn = this.props.items[index].ref.current;
		if (this.last_selected && this.last_selected.mounted === true) this.last_selected.set_select(false);
		btn.set_select(true);
		this.last_selected = btn;
	}

	componentDidMount() {
		if (this.props.active_index !== undefined) {
			this.set_selected(this.props.active_index);
		}
	}

	render() {
		const style = {
			overflow: 'hidden'
		}
		return (

			<div className={this.props.className} style={style}>
				{
					this.props.items.map(
						(item: MenuItem, key: number) => {
							return (<MenuButton ref={this.props.items[key].ref} key={key} dynamic={this.props.dynamic} editable={this.props.editable}
								item={item} onclick={this.on_button_click.bind(this)} />);
						})
				}
			</div>
		);
	}
}

class TabPane extends React.Component<{
	dynamic: boolean,
	editable?: boolean,
	menu_className: string,
	notify_tab_selected?: (data: any) => void,
	notify_before_closing?: (view: View, index: number) => boolean
}, {
	view_builder: Array<{ create: (key: number) => JSX.Element, tab_name: string }>
}> {
	protected menu: React.RefObject<Menu>;
	protected views: Array<React.RefObject<View>>;
	private active_view: View;
	protected active_index_after_adding: number;

	constructor(props: any) {
		super(props);
		this.menu = React.createRef<Menu>();
		this.views = [];
		this.active_view = null;
		this.active_index_after_adding = 0;

		this.state = {
			view_builder: []
		};
	}

	clear() {
		this.views = [];
		this.active_view = null;
		this.active_index_after_adding = 0;
		this.setState({ view_builder: [] });
	}

	componentDidMount() {
		if (this.views.length > 0) {
			this.select_view(this.active_index_after_adding);
		}
	}

	public add_view<P extends {}, T extends React.Component<P, React.ComponentState>, C extends React.ComponentClass<P>>(
		type: React.ClassType<P, T, C>,
		tab_name: string,
		activate: boolean,
		update_dom?: boolean,
		data?: any,
		key?: number): void {
		this.insert_view(this.state.view_builder.length, type, tab_name, activate, update_dom, data, key);
	}

	public insert_view<P extends {}, T extends React.Component<P, React.ComponentState>, C extends React.ComponentClass<P>>(
		index_to_insert: number,
		type: React.ClassType<P, T, C>,
		tab_name: string,
		activate: boolean,
		update_dom?: boolean,
		data?: any,
		key?: number): void {
			
		let view_builder = this.state.view_builder;

		view_builder.splice(index_to_insert, 0, {
			create:
				function (data: any, index: number) {
					if (!data) data = {};
					data.key = key ? key : index;
					data.ref = this.views[index];
					return React.createElement(type, data);
				}.bind(this, data), tab_name: tab_name
		}
		);

		this.views.push(React.createRef<View>());

		if (activate === true) this.active_index_after_adding = this.views.length - 1;
		if (update_dom === true) this.setState({ view_builder: view_builder }, activate ? function () {
			this.select_view(this.active_index_after_adding);
		}.bind(this) : undefined);
	}

	public remove_view(index: number) {
		let active_index = this.views.findIndex((x) => x.current === this.active_view);
		if (active_index >= index && active_index !== 0) {
			active_index--;
		}
		this.active_index_after_adding = active_index;
		let view_builder = this.state.view_builder;
		view_builder.splice(index, 1);
		this.views.splice(index, 1);
		this.active_view.show_window(false);
		this.active_view = null;
		this.setState({ view_builder: view_builder }, function () {
			this.select_view(active_index)
		}.bind(this));

		if (this.views.length === 0 && this.props.notify_tab_selected)
			this.props.notify_tab_selected(-1);
	}

	protected handle_select_view(view: React.RefObject<View>) {
		if (this.active_view) 
			this.active_view.show_window(false);
		
		view.current.show_window(true);
		this.active_view = view.current;

		if (this.props.notify_tab_selected)
			this.props.notify_tab_selected(view.current.props.data);
	}

	public select_view(view_index: number): boolean {
		if (view_index >= this.views.length) return false;

		this.handle_select_view(this.views[view_index]);
		this.menu.current.set_selected(view_index);

		return true;
	}

	render() {
		let { view_builder } = this.state;
		if (view_builder.length === 0) return (<div key="nc"></div>);
		return (
			<div key="hc">
				<Menu className={this.props.menu_className} ref={this.menu} dynamic={this.props.dynamic} editable={this.props.editable} active_index={this.active_index_after_adding} items=
					{
						view_builder.map((x, index) => {
							return {
								name: x.tab_name,
								ref: React.createRef<MenuButton>(),
								onclick: () => { this.handle_select_view(this.views[index]) },
								oncloseclick: () => {
									if (this.props.notify_before_closing && this.props.notify_before_closing(this.views[index].current, index) == true) {
										this.remove_view(index)
									}
								}
							};
						})
					} />
				<div className="main">
					{
						view_builder.map((x, index) => { return (x.create(index)) })
					}
				</div>
			</div>
		);
	}
}

abstract class RouterTabPane extends TabPane {
	urls: string[];

	protected abstract create();

	private set_url(idx: number) {
		window.history.pushState("", "", this.urls[idx]);
	}

	public select_view(view_index: number): boolean {
		if (!super.select_view(view_index)) return false
		this.set_url(view_index);
		return true;
	}
	
	protected handle_select_view(view: React.RefObject<View>) {
		super.handle_select_view(view);
		const idx = this.views.findIndex( x => x == view);
		console.assert(idx != -1);
		this.set_url(idx);
	}

	constructor(props:any) {
		super(props);

		this.create();

		const size = this.state.view_builder.length;
		this.urls = new Array<string>(size);

		for (let i = 0; i < size; ++i) {
			this.urls[i] = '/' + this.state.view_builder[i].tab_name.toLowerCase()
		}

		for (let i = 0; i < size; ++i) {
			if (this.urls[i] == window.location.pathname) {
				this.active_index_after_adding = i;
				break;
			}
		}
	}
}

export {
	Menu, MenuButton, TabPane, RouterTabPane
}