// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { View } from './view'
import { store, Tables } from 'tables/store'
import { observe, observable } from 'mobx'
import { observer } from 'mobx-react'
import { ContextMenu, MenuItem, showMenu } from "react-contextmenu";
import { SearchBar, SaveButton, UndoButton, RedoButton, MobXInputTableItemName } from 'misc/components'
import { MobXValue } from 'tables/modified'
import global from 'misc/global'
import * as che from 'calculation/datatypes'
import { Command_ValueChangedUpdateDependValue } from 'tables/command'
import { Command_FertilizerFormulaChanged } from 'tables/commands_custom'

let parser = require('parser/parser_ctx');


export class MobXTextArea extends React.Component<{
	object: MobXValue<string>,
	readOnly: boolean,
	notify_on_change?: (text: string) => void;
}, {
	value: string,
}> {
	private watch: any;

	constructor(props: any) {
		super(props);
		this.state = {
			value: this.props.object.mx_value
		};
		let this_ = this;
		this_.watch = observe(this_.props.object, change => {
			this_.setState({value: this_.props.object.mx_value }, () => {
				if (this_.props.notify_on_change) this_.props.notify_on_change(this_.props.object.mx_value);
			});
		});
	}

	componentWillUnmount() {
		this.watch(); // dispose
	}
	
	private handleOnChange(e: any) { 
		let this_ = this;
		let value = e.target.value;
		this.setState({value: value}, () => {
			if (this_.props.notify_on_change) this_.props.notify_on_change(this.state.value);
		});
	}

	render() {
		return (
			<textarea style={{width: '98%', height: '100px'}} spellCheck={false} 
			value={this.state.value} readOnly={this.props.readOnly}
			onChange={this.handleOnChange.bind(this)}/>
		);
	}
}

@observer
class Row extends React.Component<{
	item: che.Fertilizer,
	onShowMenu: (row: Row) => void
},{
	edit_mode: boolean;
}> {
	edit_btn: React.RefObject<HTMLImageElement>;
	formula_text: React.RefObject<MobXTextArea>
	formula_text_old: string;
	@observable text_box_value: string;

	constructor(props: any) {
		super(props);
		
		this.formula_text = React.createRef<MobXTextArea>();
		this.edit_btn = React.createRef<HTMLImageElement>();
		this.formula_text_old = this.props.item.formula.mx_value;

		this.state = {
			edit_mode: false,
		};
	}

	public set_edit_mode(edit: boolean) {
		this.setState({edit_mode: edit});
	}

	on_action_button(event: MouseEvent) {
		this.props.onShowMenu(this);
		showMenu({id: "cm_1", position: {x:event.clientX, y: event.clientY }});
	}

	on_edit_finished() {
		let formula = this.formula_text.current.state.value;
		if (this.formula_text_old === formula) {
			this.set_edit_mode(false)
			return ;
		}
		let item = this.props.item;
		try {
			let sbs = parser.parse(formula).lst.stmts;
			item.accumulate(sbs);
			this.set_edit_mode(false);
			let fun =  (x: any) => item.parse_formula();
			store.fertilizers.add_command(
				item.is_new ?
				new Command_ValueChangedUpdateDependValue(item.formula, formula, this.formula_text_old, fun) :
				new Command_FertilizerFormulaChanged(item.formula, formula, this.formula_text_old, item, fun)
			);
			this.formula_text_old = formula;
		} catch(e) {
			console.log(e);
		}
	}
	
	handleFormulaChange(text: string) {
		try {
			let sbs = parser.parse(text).lst.stmts;
			this.props.item.accumulate(sbs);
			this.text_box_value = "";
		} catch(e) {
			this.text_box_value = e;
			this.props.item.clear();
		}
	}

	render() {
		let out: Array<JSX.Element> = [];
		let id = this.props.item.get_id();

		const flex = {
			display: 'flex',
			justifyContent: 'center',
    		alignItems: 'center'
		}

		const text_style = {
			width: 'auto',
			color: 'white'
		}



		out.push(<td key="g"  className="fert-img-gear"><img ref={this.edit_btn} src={global.icons.gear} onClick={this.on_action_button.bind(this)}/></td>);
		out.push(<td key="i" className="fert-elem-first-text"><MobXInputTableItemName storage={store.fertilizers} className={"fert-elem-first-text"} object={this.props.item} readOnly={!this.props.item.owned_by_me} custom={Tables.Fertilizers} /></td>);
		out.push(<td key="a" className="fert-elem-text"><input value={this.props.item.get_author()} readOnly={true} /></td>);
		out.push(<td key="c" className="fert-cost"><input value={this.props.item.cost} readOnly={true} /></td>);

		if (this.props.item.type === 1) {
			out.push(<td key = "d">
				<div style={flex}>
					<div style={{justifyContent: 'center', alignItems: 'center'}}>
						<div style={text_style}>density</div>
						<input className="sln-elem sln-elem-ro fert-elem" type="text" readOnly={true} value={this.props.item.density+" g/l"} />
					</div>
				</div>
			</td>);
		}

		if (this.props.item.type === 2) {
			out.push(<td key = "d">
				<div style={flex}>
					<div style={{justifyContent: 'center', alignItems: 'center'}}>
						<div style={text_style}>solution</div>
						<input className="sln-elem sln-elem-ro fert-elem" type="text" readOnly={true} value={(this.props.item.density * 100.0).toFixed(2) + " %"} />
					</div>
				</div>
			</td>);
		}
		
		let elems = this.props.item.elements;
		for(let i = 0; i < che.ELEMENTS_MAX; ++i) {
			if (elems[i] != 0.0) {
				out.push(<td key = {i}>
					<div style={flex}>
						<div style={{justifyContent: 'center', alignItems: 'center'}}>
							<div style={text_style}>{che.to_name(i)}</div>
							<input className="sln-elem sln-elem-ro fert-elem" type="text" readOnly={true} value={elems[i].toFixed(3)+'%'} />
						</div>
					</div>
				</td>);
			}
		}

		let text_area = null;

		if (this.state.edit_mode) {
			text_area = 
			<tr key={'t'+id}>
				<td colSpan={100} >
					<MobXTextArea ref={this.formula_text} object={this.props.item.formula} readOnly={false} notify_on_change={this.handleFormulaChange.bind(this)}/>
					<textarea style={{width: '98%', height: '80px', color: 'red'}} spellCheck={false} value={this.text_box_value} readOnly={true}/>
					<button style={{float: 'right', marginRight: '20px'}} onClick={this.on_edit_finished.bind(this)}>Ok</button>
				</td>
			</tr>;
		}
		if (text_area == null) {
			return <tr key={id} className="tr-hover">{out}</tr>;
		} else {
			const first = <tr key={id} className="tr-hover">{out}</tr>;
			let o: Array<JSX.Element> = [first, text_area];
			return o;
		}
	}
};

@observer
class Table extends React.Component<{
	data: Array<che.Fertilizer>
},{
	filter_name: string,
	filter_author: string,
	deletion_disabled: boolean
}> {
	current_menu_row: Row;
	
	constructor(props: any) {
		super(props);

		this.state = {
			filter_name: "",
			filter_author: "",
			deletion_disabled: true
		};

		this.current_menu_row = null;
	}

	handleFilter_name(filter: string) {
		this.setState({filter_name: filter});
	}

	handleFilter_author(filter: string) {
		this.setState({filter_author: filter});
	}

	beforeShowMenu(row: Row) {
		this.current_menu_row = row;
		this.setState({deletion_disabled: !this.current_menu_row.props.item.owned_by_me});
	}

	// Menu Events
	handleMenu_Edit(event: any) {
		this.current_menu_row.set_edit_mode(true);
	}
	handleMenu_Duplicate(event: any) {
		store.fertilizers.add_new_row(this.current_menu_row.props.item.clone());
	}
	handleMenu_DeleteRow(event: any) {
		store.fertilizers.erase(this.current_menu_row.props.item);
	}

	render() {
		const paddingLastRow = { paddingBottom: '25px' };
		let count = 0;
		
		return (<div>
			<ContextMenu id="cm_1">
				<MenuItem onClick={this.handleMenu_Edit.bind(this)}>Edit</MenuItem>
				<MenuItem onClick={this.handleMenu_Duplicate.bind(this)} disabled={global.user_data.is_guest}>Duplicate</MenuItem>
				<MenuItem divider />
				<MenuItem onClick={this.handleMenu_DeleteRow.bind(this)} disabled={global.user_data.is_guest} /*disabled={this.state.deletion_disabled}*/>Delete</MenuItem>
			</ContextMenu>

			<div className="toolbar-pane"> 
				<div className="toolbar"> 
					<img src={global.icons.add} className={"toolbar-btn" + (global.user_data.is_guest ? " toolbar-btn-disabled" : "")}
					onClick={() => store.fertilizers.add_new_row<che.Fertilizer>(che.Fertilizer.create())} />
					<SaveButton storage={store.fertilizers} save={store.fertilizers.store.bind(store.fertilizers)}/>
					<UndoButton storage={store.fertilizers} />
					<RedoButton storage={store.fertilizers} />
				</div>
			</div>

			<div className="tab-c">
			<table className="sln-tab">
				<thead>
					<tr>
						<th/>
						<SearchBar className="sln-filter-text-first" filterText={this.state.filter_name} 
							placeholder={"Filter by name"} onUserInput={this.handleFilter_name.bind(this)} />
						<SearchBar className="sln-filter-text" filterText={this.state.filter_author} 
							placeholder={"Filter by author"} onUserInput={this.handleFilter_author.bind(this)} />
					</tr>
					<tr><th/><th>Name</th><th>Added by</th><th>Cost</th><th colSpan={100}>Elements</th></tr>
				</thead>
				<tbody>
				
				{
					this.props.data.map((item: che.Fertilizer, key: number) => { 
						if (item.get_name().toLowerCase().indexOf(this.state.filter_name) === -1 || 
						item.get_author().toLowerCase().indexOf(this.state.filter_author) === -1)  return;
						return <Row key={item.get_id()} item={item} onShowMenu={this.beforeShowMenu.bind(this)} />;
					})
				}

				<tr><td style={paddingLastRow}></td></tr>
				</tbody>
			</table>
			</div>
		</div>);
	}
};

export class View_Fertilizers extends View {
	onKeyDown = function(event: KeyboardEvent) {
		
		if (event.keyCode == 90 && event.ctrlKey) {
			store.fertilizers.undo();	
		}
		if (event.keyCode == 89 && event.ctrlKey) {
			store.fertilizers.redo();	
		}
	}
	paint() : JSX.Element {
		return (<Table data={store.fertilizers.items} />);
	}
}


