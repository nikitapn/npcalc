// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { TabPane } from './tab_menu'
import { View } from './view'
import * as che from 'calculation/datatypes'
import global from 'misc/global'
import { SaveButtonCustom, UndoButton,RedoButton, SearchBar, Slider, MobXInputTableFloat, MobXInputTableItemName, Output } from 'misc/components'
import { observe } from 'mobx'
import { observer } from 'mobx-react'
import { store, Tables } from 'tables/store'
import * as Calculation from 'calculation/calculation'
import {calculations} from 'tables/store_calculations'
import {Command_RemoveElementFromArray} from 'tables/command'
import { confirmAlert } from 'react-confirm-alert';
import 'react-confirm-alert/src/react-confirm-alert.css';

@observer
class Element extends React.Component<{
	calc: Calculation.Calculation,
	item: Calculation.TargetElement,
	index: number,
},{

}> {
	slider: React.RefObject<Slider>;
	input: React.RefObject<HTMLInputElement>;


	watch_value: any;

	constructor(props: any) {
		super(props);

		this.slider = React.createRef();
		this.input = React.createRef();

		let this_ = this;
		this_.watch_value = observe(this_.props.item.mx, change => {
			this.props.calc.calc();
		});
	}

	componentWillUnmount() {
		this.watch_value();
	}

	handle_balance() {
		this.slider.current.set_value(0.5);	
		this.props.item.ratio = 0.5;
		this.props.calc.calc();
	}

	handle_ration_changed(x: number) {
		this.props.item.ratio = x;
		this.props.calc.calc();
	}
	
	render() {
		return (<div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBottom: '10px'}}>
			<div style={{minWidth: '60px'}}>{che.to_name(this.props.index)}</div>
			<MobXInputTableFloat className="" storage={this.props.calc.commands} object={this.props.item.mx} readOnly={this.props.calc.mode} 
				notify_on_change={function(te: Calculation.TargetElement, user_input: boolean) { if (user_input) te.set_base_value(); }.bind(null, this.props.item)}/>
			<Slider ref={this.slider} className="slider slider-el" step="0.01" min_value={0} max_value={1} value={this.props.item.ratio} 
				notify_value_changed={this.handle_ration_changed.bind(this)} disabled={this.props.calc.mode}/>
			<button onClick={this.handle_balance.bind(this)} disabled={this.props.calc.mode}>B</button>
		</div>);
	}
}

@observer
class TargetElementsPane extends React.Component<{
	calc: Calculation.Calculation
},{
}> {
	slider_cost(position: number) {
		// position will be between 0 and 100
		var minp = 0;
		var maxp = 1;

		// The result should be between 100 an 10000000
		var minv = 0.0;
		var maxv = 0.00001;

		// calculate adjustment factor
		var scale = (maxv - minv) / (maxp - minp);

		return minv + scale * (position - minp);
	}


	handle_slider_cost_k_changed(x: number) {
		this.props.calc.cost_k = this.slider_cost(x);
		this.props.calc.calc();
	}

	handle_ec_changed(x: number) {
		this.props.calc.increase_ec(x);
	}
	
	render() {
		return (
		<div className="tab-c">
			{
				this.props.calc.elements.map((x, key) => {
					return <Element key={key} calc={this.props.calc} item={x} index={key} />
				})
			}
			<div className="tab-tsep"></div>
			<div style={{display: 'flex', paddingBottom: '10px'}}>
				<div className="tab_tin">Volume:</div><MobXInputTableFloat className="tab_tiv"
					storage={this.props.calc.commands} object={this.props.calc.volume} readOnly={this.props.calc.mode}/><div style={{textAlign: 'left'}}>L</div>
			</div>
			<div style={{display: 'flex', paddingBottom: '10px'}}>
				<div className="tab_tin">EC:</div>
				<Slider className="slider tab_tivs" step="0.005" min_value={0.0} max_value={1.8} value={1.0} disabled={this.props.calc.mode}
					notify_value_changed={this.handle_ec_changed.bind(this)}/>
			</div>
			<div style={{display: 'flex', paddingBottom: '10px'}}>
				<div className="tab_tin">Cost factor:</div>
				<Slider className="slider tab_tivs" step="0.01" min_value={0} max_value={1} value={0} disabled={this.props.calc.mode}
					notify_value_changed={this.handle_slider_cost_k_changed.bind(this)}/>
			</div>
		</div>);
	}
}

@observer
class TargetOutputRatio extends React.Component<{
	calc: Calculation.Calculation
},{
}> {
	render() {
		let ratio = this.props.calc.ratio;
		return (
		<div className="tab-c">
			<div style={{display: 'flex'}}>
				<div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">NH4 %</div>
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ratio.nh4_percent}/>
				</div>
				<div style={{display: 'flex', marginLeft: "5px", justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">N:K</div> 
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ratio.nk}/>
				</div>
				<div style={{display: 'flex', marginLeft: "5px", justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">K:Ca</div> 
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ratio.kca}/>
				</div>
				<div style={{display: 'flex', marginLeft: "5px", justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">K:Mg</div> 
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ratio.kmg}/>
				</div>
				<div style={{display: 'flex', marginLeft: "5px", justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">Ca:Mg</div> 
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ratio.camg}/>
				</div>
			</div>
		</div>);
	}
}

@observer
class TargetOutputPane extends React.Component<{
	calc: Calculation.Calculation
},{
}> {
	render() {
		let ec = this.props.calc.ec;
		return (
		<div className="tab-c">
			<div style={{display: 'flex'}}>
				<div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">EC</div>
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ec.ec} />
				</div>
				<div style={{display: 'flex', marginLeft: "5px", justifyContent: 'center', alignItems: 'center'}}>
					<div className="font_big">Δ</div> 
					<Output className="out_big" style={{marginLeft: "10px"}} digits={2} value={ec.delta_ca} alarm={true} />
				</div>
			</div>
		</div>);
	}
}

@observer
class FertilizersDetailPane extends React.Component<{
	calc: Calculation.Calculation
},{
}> {
	constructor(props: any) {
		super(props)
	}

	static display(r: Calculation.CalcFertilizerResult, e: che.ELEMENT): string {
		let x = r.fertilizer.elements[e] * r.x * 0.01;
		if (x < 0.001) return "";
		return x.toFixed(2);
	}

	on_fertilizer_mass_changed(fertilizer_index: number, x: any) {
		let calc = this.props.calc;
		calc.result_ferts[fertilizer_index].x = x.target.value * 1000;
		calc.calc(false);
	}

	render() {
		let calc = this.props.calc;
		return (
		<div className="tab-c">
			<div style={{display: 'flex', paddingBottom: '10px'}}>
				<div style={{padding: '3px', marginRight: '10px', justifyContent: 'center', alignItems: 'center'}}>Edit:</div>
				<label className="tab_tiv cbox-c">
					<input type="checkbox" checked={calc.mode} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => calc.mode = ev.target.checked} />
					<span className="checkmark"></span>
				</label>
			</div>
			<table className="tab-result-detail">
			<thead><tr>
				<th>Fertilizer</th><th>N-NO3</th><th>N-NH4</th>
				<th>P</th><th>K</th><th>Ca</th><th>Mg</th><th>S</th><th>Cl</th>
				<th>Fe</th><th>Zn</th><th>B</th><th>Mn</th><th>Cu</th><th>Mo</th><th>Mass (g.)</th>
			</tr></thead>
			<tbody>
			{
				calc.result_ferts.map((r, index: number) => {
					 return <tr key={r.fertilizer.get_id()}>
						 <td className="fert-name">{r.fertilizer.get_name()}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.N_NO3)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.N_NH4)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.P)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.K)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Ca)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Mg)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.S)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Cl)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Fe)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Zn)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.B)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Mn)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Cu)}</td>
						 <td className="tab-result-element">{FertilizersDetailPane.display(r, che.ELEMENT.Mo)}</td>
						 <td className="tab-result-mass"><input type="number" step="0.01" value={r.x * 0.001} onChange={this.on_fertilizer_mass_changed.bind(this, index)} readOnly={!calc.mode}/></td>
					</tr> 
				})
			}
			</tbody>
			</table>
		</div>);
	}
}



@observer
class Row extends React.Component<{
	calc: Calculation.Calculation,
	item: che.Fertilizer,
},{
}> {
	constructor(props: any) {
		super(props);
	}

	on_change_checked(ev: React.ChangeEvent<HTMLInputElement>) {
		if (ev.target.checked) this.props.calc.add_fertilizer(this.props.item);
		else this.props.calc.remove_fertilizer(this.props.item);
	}

	render() {
		return (
		<tr>
			<td className="td-t">
				<label className="cbox-c">
					<input type="checkbox" checked={this.props.calc.has_fertilizer(this.props.item)} onChange={this.on_change_checked.bind(this)}/>
					<span className="checkmark"></span>
				</label>
			</td>
			<td key="a"><MobXInputTableItemName storage={store.fertilizers} className={"fert-elem-first-text"} 
				object={this.props.item} readOnly={true} custom={Tables.Fertilizers} /></td>
			<td key="b" className="fert-elem-text"><input value={this.props.item.get_author()} readOnly={true} /></td>
		</tr>);
	}
};

@observer
class Table extends React.Component<{
	calc: Calculation.Calculation
},{
	filter_name: string,
	filter_author: string,
}> {
	constructor(props: any) {
		super(props);

		this.state = {
			filter_name: "",
			filter_author: "",
		};
	}

	handleFilter_name(filter: string) {
		this.setState({filter_name: filter});
	}

	handleFilter_author(filter: string) {
		this.setState({filter_author: filter});
	}

	render() {
		return (<div>
			<div className="tab-c"><div className="tab-cs">
			<table className="tab-fert-short">
				<thead>
					<tr>
						<th/>
						<SearchBar className="sln-filter-text-first" filterText={this.state.filter_name} 
							placeholder={"Filter by name"} onUserInput={this.handleFilter_name.bind(this)} />
						<SearchBar className="sln-filter-text" filterText={this.state.filter_author} 
							placeholder={"Filter by author"} onUserInput={this.handleFilter_author.bind(this)} />
					</tr>
					
				</thead>
				<tbody>
					{
						store.fertilizers.items.map((item: che.Fertilizer, key: number) => { 
							if (item.get_name().toLowerCase().indexOf(this.state.filter_name) === -1 || 
							item.get_author().toLowerCase().indexOf(this.state.filter_author) === -1)  return;
							return <Row key={item.get_id()} calc={this.props.calc} item={item}  />;
						})
					}
				</tbody>
			</table>
			</div></div>
		</div>);
	}
};

class View_Calculation extends View {
	private watch: any;
	private watch_volume: any;

	constructor(props: any) {
		super(props);

		let this_ = this;
		this_.watch = observe(this_.props.data, "result", change => {
			this_.forceUpdate();
		});

		this_.watch_volume = observe(this_.props.data.volume, change => {
			this_.props.data.calc(true);
		});
	}
	
	componentWillUnmount() {
		this.watch();
		this.watch_volume();
	}

	onKeyDown = function(event: KeyboardEvent) {
		if (event.keyCode == 90 && event.ctrlKey) {
			this.props.data.commands.undo();	
		}
		if (event.keyCode == 89 && event.ctrlKey) {
			this.props.data.commands.redo();	
		}
	}

	paint() : JSX.Element {
		return (
		<div style={{paddingTop: '25px'}}>
			<div className="calc-c">
				<TargetOutputRatio calc={this.props.data} />
			</div>
			<div className="calc-c">
				<div>
					<TargetOutputPane calc={this.props.data} />
					<TargetElementsPane calc={this.props.data} />
				</div>
				<div style={{paddingRight: '25px'}}/>
				<Table calc={this.props.data} />
				<div style={{paddingRight: '25px'}}/>
				<div className="tab-c">
					<textarea className="text-result" spellCheck={false} 
						value={(this.props.data as Calculation.Calculation).result} readOnly={true} />
				</div>
			</div>
			<div className="calc-c">
				<FertilizersDetailPane calc={this.props.data} />
			</div>
		</div>);
	}
}

export class View_Calculator extends View {
	tab_pane: React.RefObject<TabPane>;
	undo_btn: React.RefObject<UndoButton>;
	redo_btn: React.RefObject<RedoButton>;
	current_calc: Calculation.Calculation;

	constructor(props: any) {
		super(props);
		this.tab_pane = React.createRef<TabPane>();
		this.undo_btn = React.createRef<UndoButton>();
		this.redo_btn = React.createRef<RedoButton>();
	}

	componentDidMount() {
		document.addEventListener("new_calculation", this.handle_create_new_calculation.bind(this));
		document.addEventListener("update_my_calculations", this.handle_update.bind(this));
	}

	populate() {
		for (let calc of calculations.items) {
			this.tab_pane.current.add_view(View_Calculation, calc.get_name(), true, true, {data: calc}, calc.get_id());
		}
	}

	handle_update(ev: CustomEvent) : void {
		this.tab_pane.current.clear();
		this.populate();
	}

	handle_create_new_calculation(ev: CustomEvent) : void {
		let calc = calculations.create_calculation();
		calc.set_solution(ev.detail as che.Solution);
		this.tab_pane.current.add_view(View_Calculation, calc.get_name(), true, true, {data: calc}, calc.get_id());
	}

	create_new_calculation() : void {
		let calc = calculations.create_calculation();
		this.tab_pane.current.add_view(View_Calculation, calc.get_name(), true, true, {data: calc}, calc.get_id());
	}

	handle_tab_selected(data: any) {
		if (data === -1) {
			this.undo_btn.current.setState({storage: undefined});
			this.redo_btn.current.setState({storage: undefined});
			this.current_calc = null;
		} else {
			this.current_calc = data as Calculation.Calculation;
			this.undo_btn.current.setState({storage: this.current_calc.commands});
			this.redo_btn.current.setState({storage: this.current_calc.commands});
		}
	}

	handle_tab_closed(view: View, idx: number) {
		confirmAlert({
			title: "Confirm to submit",
			message: "Are you sure want to delete this calculation \"" + view.props.data.get_name() + "\"?",
			buttons: [
				{
					label: "Yes",
					onClick: () => {
						calculations.delete_calculation(view.props.data);
						this.tab_pane.current.remove_view(idx);
					}
				},
				{
					label: "No",
					onClick: null
				}
			],
			childrenElement: () => <div />,
			closeOnEscape: true,
			closeOnClickOutside: true,
			overlayClassName: "overlay-custom-class-name"
		});

		return false;
	}

	handle_save_calculation() {
		if (!this.current_calc) return;
		calculations.save_calculation(this.current_calc);
	}

	paint() {
		return (
		<div>
			<div className="toolbar-pane"> 
				<div className="toolbar"> 
					<img src={global.icons.add} className="toolbar-btn" onClick={this.create_new_calculation.bind(this)} />
					<SaveButtonCustom save={this.handle_save_calculation.bind(this)}/>
					<UndoButton ref={this.undo_btn}/>
					<RedoButton ref={this.redo_btn}/>
				</div>
			</div>
			<TabPane menu_className="tab-calc" ref={this.tab_pane} dynamic={true} editable={true} 
				notify_tab_selected={this.handle_tab_selected.bind(this)} 
				notify_before_closing={this.handle_tab_closed.bind(this)}
				/>
		</div>);
	}
}