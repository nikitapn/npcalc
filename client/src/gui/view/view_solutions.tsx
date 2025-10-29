// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { ContextMenu, MenuItem, showMenu } from "react-contextmenu";
import { View } from './view'
import * as che from 'calculation/datatypes'
import { store, Tables } from 'tables/store'
import { Command_ValueChanged } from 'tables/command'
import { observer } from 'mobx-react'
import { SearchBar, OutputManual, MobXInputTableFloat, MobXInputTableItemName, 
	SaveButton, UndoButton,RedoButton } from 'misc/components'
import global from 'misc/global'
import { Command_SolutionValueChanged } from 'tables/commands_custom'


class MobXInputSolutionElement extends MobXInputTableFloat<che.SolutionElement, che.Solution> { 
	constructor(props: any) {
		super(props);
	}

	record_changes(value: string) : void {
		if (this.is_pending_commands()) return;
		let new_value = parseFloat(value);
		this.props.storage.add_command(
			this.props.custom.is_new ?
			new Command_ValueChanged(this.props.object, new_value, this.old_value) :
			new Command_SolutionValueChanged(this.props.object, new_value, this.old_value, this.props.custom, this.props.object.e)
		);
	}
}

@observer
class Row extends React.Component<{
	item: che.Solution,
	onShowMenu: (row: Row) => void
},{

}> {
	elems: Array<React.RefObject<MobXInputSolutionElement>>;
	nh4: React.RefObject<OutputManual>;
	nk: React.RefObject<OutputManual>;
	kca: React.RefObject<OutputManual>;
	kmg: React.RefObject<OutputManual>;
	camg: React.RefObject<OutputManual>;
	delta: React.RefObject<OutputManual>;
	ec: React.RefObject<OutputManual>;
	edit_btn: React.RefObject<HTMLImageElement>;

	private static temp_elems: Array<number> = new Array<number> (che.ELEMENTS_MAX);

	constructor(props: any) {
		super(props);

		this.elems = [];
		for (let i = 0; i < che.ELEMENTS_MAX; ++i) {
			this.elems.push(React.createRef<MobXInputSolutionElement>());
		}
		this.nh4 = React.createRef();
		this.nk = React.createRef();
		this.kca = React.createRef();
		this.kmg = React.createRef();
		this.camg = React.createRef();
		this.delta = React.createRef();
		this.ec = React.createRef();
		this.edit_btn = React.createRef<HTMLImageElement>();
	}

	componentDidMount () {
		this.on_element_changed();
	}
	
	private on_element_changed() {
		for (let i = 0; i < che.ELEMENTS_MAX; ++i) {
			Row.temp_elems[i] = this.elems[i].current.get_value()
		}

		let ratio = che.calc_solution_ratio(Row.temp_elems);
		let ec = che.calc_solution_ec(Row.temp_elems);
		
		this.nh4.current.set_value(ratio.nh4_percent);
		this.nk.current.set_value(ratio.nk);
		this.kca.current.set_value(ratio.kca);
		this.kmg.current.set_value(ratio.kmg);
		this.camg.current.set_value(ratio.camg);
		this.delta.current.set_value(ec.delta_ca);
		this.ec.current.set_value(ec.ec);
	}

	private draw_element(e: che.ELEMENT, className?: string) {
		let read_only = !this.props.item.owned_by_me;
		let elem = this.props.item.get_element(e);
		return <MobXInputSolutionElement storage={store.solutions} ref={this.elems[e]} className={className} 
			object={elem} readOnly={read_only} 
			custom={this.props.item} notify_on_change={this.on_element_changed.bind(this)} />
	}

	on_action_button(event: MouseEvent) {
		this.props.onShowMenu(this);
		showMenu({id: "cm_0", position: {x:event.clientX, y: event.clientY }});
	}

	render() {
		return (			
		<tr className="tr-hover">
			<td className="img-gear">
                <img ref={this.edit_btn} src={global.icons.gear} onClick={this.on_action_button.bind(this)} />
            </td>
			<td><MobXInputTableItemName storage={store.solutions} className={"sln-elem-first-text"} object={this.props.item} readOnly={!this.props.item.owned_by_me} custom={Tables.Solutions} /></td>
			<td className="sln-elem-text"><input value={this.props.item.get_author()} readOnly={true} /></td>
			<td>{this.draw_element(che.ELEMENT.N_NO3)}</td>
			<td>{this.draw_element(che.ELEMENT.N_NH4)}</td>
			<td>{this.draw_element(che.ELEMENT.P)}</td>
			<td>{this.draw_element(che.ELEMENT.K)}</td>
			<td>{this.draw_element(che.ELEMENT.Ca)}</td>
			<td>{this.draw_element(che.ELEMENT.Mg)}</td>
			<td>{this.draw_element(che.ELEMENT.S)}</td>
			<td>{this.draw_element(che.ELEMENT.Cl)}</td>
			<td className="trl-left">{this.draw_element(che.ELEMENT.Fe)}</td>
			<td>{this.draw_element(che.ELEMENT.Zn)}</td>
			<td>{this.draw_element(che.ELEMENT.B)}</td>
			<td>{this.draw_element(che.ELEMENT.Mn)}</td>
			<td>{this.draw_element(che.ELEMENT.Cu)}</td>
			<td>{this.draw_element(che.ELEMENT.Mo)}</td>
			<td className="trl-left"><OutputManual ref={this.nh4 } digits={1} /></td>
			<td><OutputManual ref={this.nk } digits={2} /></td>
			<td><OutputManual ref={this.kca } digits={2} /></td>
			<td><OutputManual ref={this.kmg } digits={2} /></td>
			<td><OutputManual ref={this.camg } digits={2} /></td>
			<td className="trl-left"><OutputManual ref={this.delta } digits={2} alarm={true} /></td>
			<td className="trl-left"><OutputManual ref={this.ec } digits={2} /></td>
		</tr>
		);
	}
};

const search_patterns = (text: string, patterns: string[]) => {
	for (let s of patterns) if (text.indexOf(s) !== -1) return true;
	return false;
};

@observer
class Table extends React.Component<{
	data: Array<che.Solution>
},{
	filter_solution_name: string,
	filter_solution_author: string,
	deletion_disabled: boolean
}> {
	current_menu_row: Row;
	
	constructor(props: any) {
		super(props);

		this.state = {
			filter_solution_name: "",
			filter_solution_author: "",
			deletion_disabled: true
		};

		this.current_menu_row = null;
	}

	handleFilter_solution_name(filter: string) {
		this.setState({filter_solution_name: filter});
	}

	handleFilter_solution_author(filter: string) {
		this.setState({filter_solution_author: filter});
	}

	beforeShowMenu(row: Row) {
		this.current_menu_row = row;
		this.setState({deletion_disabled: !this.current_menu_row.props.item.owned_by_me});
	}

	// Menu Events
	handleMenu_CreateNewCalculation(event: any) {
		document.dispatchEvent(new CustomEvent("new_calculation", { detail: this.current_menu_row.props.item }));
	}

	handleMenu_Duplicate(event: any) {
		store.solutions.add_new_row(this.current_menu_row.props.item.clone());
	}

	handleMenu_DeleteRow(event: any) {
		store.solutions.erase(this.current_menu_row.props.item);
	}

	render() {
		let count = 0;
		const paddingLastRow = {
			paddingBottom: '25px'
		};
		function header(key: number) { 
			const left = key !== 0 ?  "trl-left" : undefined;
			return (<tr key={'h' + key.toString()}><th></th><th>Name</th><th>Added by</th><th>NO3</th><th>NH4</th>
			<th>P</th><th>K</th><th>Ca</th><th>Mg</th><th>S</th><th>Cl</th>
			<th className={left}>Fe</th><th>Zn</th><th>B</th><th>Mn</th><th>Cu</th><th>Mo</th>
			<th className={left}>NH4%</th><th>N:K</th><th>K:Ca</th><th>K:Mg</th><th>Ca:Mg</th>
			<th className={left}>Δ</th><th className={left}>EC</th></tr>);
		}

		const filter_solution_name = this.state.filter_solution_name.toLowerCase().split('|');
		const filter_solution_author = this.state.filter_solution_author.toLowerCase().split('|');
	
		return (<div>
			<ContextMenu id="cm_0">
				<MenuItem onClick={this.handleMenu_CreateNewCalculation.bind(this)}>Create new calculation</MenuItem>
				<MenuItem onClick={this.handleMenu_Duplicate.bind(this)} disabled={global.user_data.is_guest}>Duplicate</MenuItem>
				<MenuItem divider />
				<MenuItem onClick={this.handleMenu_DeleteRow.bind(this)} disabled={global.user_data.is_guest} /*disabled={this.state.deletion_disabled}*/>Delete</MenuItem>
			</ContextMenu>

			<div className="toolbar-pane"> 
				<div className="toolbar"> 
					<img src={global.icons.add} className={"toolbar-btn" + (global.user_data.is_guest ? " toolbar-btn-disabled" : "")}
					onClick={() => store.solutions.add_new_row<che.Solution>(che.Solution.create())} />
					<SaveButton storage={store.solutions} save={store.solutions.store.bind(store.solutions)}/>
					<UndoButton storage={store.solutions} />
					<RedoButton storage={store.solutions} />
				</div>
			</div>

			<div className="tab-c">
			<table className="sln-tab">
				<thead>
					<tr>
						<th/>
						<SearchBar className="sln-filter-text-first" filterText={this.state.filter_solution_name} placeholder={"Filter by name"} onUserInput={this.handleFilter_solution_name.bind(this)} />
						<SearchBar className="sln-filter-text" filterText={this.state.filter_solution_author} placeholder={"Filter by author"} onUserInput={this.handleFilter_solution_author.bind(this)} />
					</tr>
				</thead>
				<tbody>
			{
			this.props.data.map((item: che.Solution, key: number) => { 
				if ((this.state.filter_solution_name.length && !search_patterns(item.get_name().toLowerCase(), filter_solution_name)) ||
					(this.state.filter_solution_author.length && !search_patterns(item.get_author().toLowerCase(), filter_solution_author))) return; 
			
				let out = [];
				
				if (count % 15 === 0) out.push(header(key));
				count = count + 1;
				out.push(<Row key={item.get_id()} item={item} onShowMenu={this.beforeShowMenu.bind(this)} />);
				return out;
			})
			}
			{
				count === 0 ? header(0) : <tr/>
			}			
		<tr><td style={paddingLastRow}></td></tr></tbody></table></div>
		</div>);
	}
};

export class View_NutrientSolutions extends View {
	onKeyDown = function(event: KeyboardEvent) {
		if (event.keyCode == 90 && event.ctrlKey) {
			store.solutions.undo();	
		}
		if (event.keyCode == 89 && event.ctrlKey) {
			store.solutions.redo();	
		}
	}

	paint() : JSX.Element {
		return (<Table data={store.solutions.items} />);
	}
}