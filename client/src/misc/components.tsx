// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { TableItem } from 'tables/table_item'
import { MobXValue } from 'tables/modified'
import {Command_ValueChanged, UndoRedo } from 'tables/command'
import {Command_TableItemNameChanged } from 'tables/table_model'
import { observe } from 'mobx'
import global from 'misc/global'
import { observer } from 'mobx-react'

export class SearchBar extends React.Component<{
	className: string,
	filterText: string;
	placeholder: string;
	onUserInput: (text: string) => void;
}, {}> {
	self: React.RefObject<HTMLInputElement>;

	constructor(props: any) {
		super(props);
		this.self = React.createRef<HTMLInputElement>();
	}

    handleChange() {
        this.props.onUserInput(this.self.current.value);
	}
	
    render() {
        return (
            <th>
                <input className={this.props.className}
                    type="text" 
                    placeholder={this.props.placeholder} 
                    value={this.props.filterText} 
                    ref={this.self} 
                    onChange={this.handleChange.bind(this)} />
            </th>
        );
    }
}

export class OutputManual extends React.Component<{
	className?: string,
	style?: any,
	digits: number,
	plus_sign?: boolean,
	alarm?: boolean,
	value?: number,
}, {
	value: number
}> {
	constructor(props: any) {
		super(props);
		this.state = {
			value: (props.value === undefined ? 0.0 : props.value)
		};
	}
	
	handleOnChange(e: any) { 
		let val = parseFloat(e.target.value);
		if (val === NaN) val = this.state.value;
		this.setState({value: val});
	}

	set_value(value: number) {
		this.setState({value: value});
	}

	render() {
		let inputClassName = "sln-elem sln-elem-ro ";
		let val = this.state.value.toFixed(this.props.digits);
		if (this.props.plus_sign && this.state.value > 0) val = '+' + val;  
		if (this.props.alarm && Math.abs(this.state.value) > 0.1) inputClassName += "sln-elem-alarm ";
		inputClassName += this.props.className;
		return (<input className={inputClassName} type="text" 
			readOnly={true} value={val} onChange={this.handleOnChange.bind(this)} />);
	}
}

export class Output extends React.Component<{
	className?: string,
	style?: any,
	digits: number,
	plus_sign?: boolean,
	alarm?: boolean,
	value?: number,
}, {
}> {
	render() {
		let inputClassName = "sln-elem sln-elem-ro ";
		let val = this.props.value.toFixed(this.props.digits);
		if (this.props.plus_sign && this.props.value > 0) val = '+' + val;  
		if (this.props.alarm && Math.abs(this.props.value) > 0.1) inputClassName += "sln-elem-alarm ";
		inputClassName += this.props.className;
		return (<input className={inputClassName} type="text" readOnly={true} value={val} />);
	}
}


export class MobXInput<T extends MobXValue<any>, CustomProp = any> extends React.Component<{
	className: string;
	storage: UndoRedo;
	object: T,
	readOnly: boolean,
	custom?: CustomProp;
	notify_on_change?: (user_input: boolean) => void;
}, {
	value: string,
}> {
	private watch: any;
	private tm_count: number;
	protected old_value: number;

	constructor(props: any) {
		super(props);
		this.state = {
			value: this.props.object.mx_value
		};
		this.tm_count = 0;
		let this_ = this;
		this_.watch = observe(this_.props.object, change => {
			this_.setState({value: this.props.object.mx_value.toString() }, () => {
				if (this_.props.notify_on_change) this_.props.notify_on_change(false);
			});
		});
	}

	componentWillUnmount() {
		this.watch(); // dispose
	}
	
	private handleOnChange(e: any) { 
		let new_value = e.target.value;
		let this_ = this;

		if (this_.tm_count === 0) this_.old_value = this_.props.object.mx_value;
		this_.tm_count++;
		this_.setState({value: new_value}, () => {
			setTimeout(() => {
				this_.record_changes(new_value);
				if (this_.props.notify_on_change) this_.props.notify_on_change(true);
			}, 500);
		});
	}

	protected is_pending_commands() : boolean {
		this.tm_count--;
		if (this.tm_count !== 0) return true;
		return false;
	}

	record_changes(value: string) : void {
		if (this.is_pending_commands()) return;
		let new_value = value;
		this.props.storage.add_command(
			new Command_ValueChanged(this.props.object, new_value, this.old_value) 
		);
	}

	render() {
		const style = {
			backgroundColor: this.props.readOnly ? '#bfbfbf' : this.props.object.isModified ? '#95bfe7' : 'white'
		};
		return (
		<div className={this.props.className}>
			<input className="sln-elem" style={style} type="text" readOnly={this.props.readOnly} spellCheck={false}
			value={this.state.value}
			onChange={this.handleOnChange.bind(this)} />
		</div>
		);
	}
}

export class MobXInputTableFloat<T extends MobXValue<number>, CustomProp> extends MobXInput<T, CustomProp> { 
	constructor(props: any) {
		super(props);
	}

	record_changes(value: string) : void {
		if (this.is_pending_commands()) return;
		
		let result: any;
		result = parseFloat(value);
		
		if (value === "." || value === "0." || isNaN(result)) result = value;
	
		this.props.storage.add_command(
			new Command_ValueChanged(this.props.object, result, this.old_value) 
		);
	}

	get_value() : number {
		let val = parseFloat(this.state.value);
		return val;
	}
}

export class MobXInputTableItemName extends MobXInput<TableItem> { 
	constructor(props: any) {
		super(props);
	}
	record_changes(new_value: string) : void {
		if (this.is_pending_commands()) return;
		this.props.storage.add_command(
			this.props.object.is_new ?
			new Command_ValueChanged(this.props.object, new_value, this.old_value) :
			new Command_TableItemNameChanged(this.props.object, new_value, this.old_value, this.props.custom, this.props.object.get_id())
		);
	}
}

@observer
export class SaveButton extends React.Component<{
	storage?: UndoRedo;
	save: () => void;
}, {
	storage: UndoRedo;
}> {
	constructor(props:any) {
		super(props);
		this.state = {
			storage: this.props.storage
		};
	}
	render() {
		let s = this.state.storage;
		const className = (s !== undefined && s.undo_redo_size ? "toolbar-btn" : "toolbar-btn toolbar-btn-disabled");
		return (
			<img className={className} src={global.icons.save} onClick={this.props.save} />
		);
	}
}

export class SaveButtonCustom extends React.Component<{
	save: () => void;
}, {
}> {
	render() {
		return (<img className="toolbar-btn" src={global.icons.save} onClick={this.props.save} />);
	}
}


@observer
export class UndoButton extends React.Component<{
	storage?: UndoRedo;
}, {
	storage: UndoRedo;
}> {
	constructor(props:any) {
		super(props);
		this.state = {
			storage: this.props.storage
		};
	}
	render() {
		let s = this.state.storage;
		const className = (s !== undefined && s.undo_size ? "toolbar-btn" : "toolbar-btn toolbar-btn-disabled");
		return (
			<img className={className} src={global.icons.undo} onClick={s !== undefined ? s.undo.bind(s) : undefined} />
		);
	}
}

@observer
export class RedoButton extends React.Component<{
	storage?: UndoRedo;
}, {
	storage: UndoRedo;
}> {
	constructor(props:any) {
		super(props);
		this.state = {
			storage: this.props.storage
		};
	}
	render() {
		let s = this.state.storage;
		const className = (s !== undefined && s.redo_size ? "toolbar-btn" : "toolbar-btn toolbar-btn-disabled");
		return (
			<img className={className} src={global.icons.redo} onClick={s !== undefined ? s.redo.bind(s) : undefined} />
		);
	}
}

export class Slider extends React.Component <{
	className: string;
	value: number;
	min_value: number;
	max_value: number;
	notify_value_changed?: (x: number)=>void
	step: string;
	disabled?: boolean
}, {
	value: number;
}> {
	constructor(props: any) {
		super(props);
		this.state = {
			value: props.value,
		};
	}

	handle_onSlide(event: any) {
		let flt = parseFloat(event.target.value);
		if( this.props.notify_value_changed) this.props.notify_value_changed(flt);
		this.setState({ value: flt });
	}

	set_value(value: number) {
		if( this.props.notify_value_changed) this.props.notify_value_changed(value);
		this.setState({ value: value });
	}

	render() {
		return (
			<div className="slidecontainer">
				<input type="range" className={this.props.className} min={this.props.min_value} max={this.props.max_value} step={this.props.step}
					value={this.state.value} disabled={this.props.disabled}
					onChange={this.handle_onSlide.bind(this)} />
			</div>
		);
	}
}

/*
class Login extends React.Component <{
	className: string;
	value: number;
	min_value: number;
	max_value: number;
	notify_value_changed?: (x: number)=>void
}, {
	value: number;
}> {
	constructor(props: any) {
		super(props);
		this.state = {
			value: props.value
		};
	}

	handle_onSlide(event: any) {
		let flt = parseFloat(event.target.value);
		if( this.props.notify_value_changed) this.props.notify_value_changed(flt);
		this.setState({ value: flt });
	}

	set_value(value: number) {
		if( this.props.notify_value_changed) this.props.notify_value_changed(value);
		this.setState({ value: value });
	}

	render() {
		return (
			<div className="slidecontainer">
				<input type="range" className={this.props.className} min={this.props.min_value} max={this.props.max_value}  step="0.01"
					value={this.state.value}
					onChange={this.handle_onSlide.bind(this)} />
			</div>
		);
	}
}
*/