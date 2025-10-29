// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import * as nscalc from 'rpc/nscalc'
import { observer } from 'mobx-react'
import { alarms, Alarm } from 'misc/alarm'
import global from 'misc/global'


@observer
class AlarmEntry extends React.Component<{ alarm: Alarm }, {}> {
	alarm: Alarm;

	handle_onClick() {
		if (this.props.alarm.confirmed) return;
		this.props.alarm.confirmed = true;
		
		let idx = alarms.findIndex(x => this.props.alarm === x);
		alarms.splice(idx, 1);

		for (let i = 0; i < alarms.length; ++i) {
			if (alarms[i].confirmed) {
				if (i < 8) alarms.splice(i, 0, this.props.alarm);
				return
			}
		}

		alarms.push(this.props.alarm);
	}

	render() : JSX.Element {
		let style;
		switch(this.props.alarm.type) {
				case nscalc.AlarmType.Info: style = "alarm alarm_info"; break;
				case nscalc.AlarmType.Warning: style = "alarm alarm_warning"; break;
				case nscalc.AlarmType.Critical: style = "alarm alarm_critical"; break;
		}
		if (this.props.alarm.confirmed) style += " alarm_confirmed";
		return (
			<div className={style} onClick={this.handle_onClick.bind(this)}>
				<img className="alarm_bell" src={global.icons.bell}/>
				<div className="alarm_entry_text">{this.props.alarm.msg}</div>
			</div>
		);
	}
} 

@observer
export class Alarms extends React.Component {
	render() : JSX.Element {
		return (
			<div className="alarms_bar">
				{
					alarms.map((alarm: Alarm) => {
						return <AlarmEntry key={alarm.id} alarm={alarm}/>
					})
				}
			</div>
		);
	}
}