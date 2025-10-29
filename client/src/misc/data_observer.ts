// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as NPRPC from 'nprpc';
import * as nscalc from 'rpc/nscalc'

import { alarms, Alarm } from 'misc/alarm'
import { Footstep, footsteps } from 'mouse/footstep';

import { the_particle_renderer } from 'mouse/renderer';

export class DataObserverImpl extends nscalc._IDataObserver_Servant implements nscalc.IDataObserver_Servant {
	DataChanged(idx: number): void {
		// console.log("DataObserverImpl(): " + idx.toString());
	}

	OnAlarm(alarm: nscalc.Flat_nscalc.Alarm_Direct) {
		for (let i = 0; i < alarms.length; ++i) {
			if (alarms[i].confirmed) {
				alarms.splice(i, 0, new Alarm(alarm.id, alarm.type, alarm.msg));
				return;
			}
		}
		alarms.push(new Alarm(alarm.id, alarm.type, alarm.msg));
	}

	OnFootstep(footstep: nscalc.Flat_nscalc.Footstep_Direct): void {
		let color = footstep.color;
		let pos = footstep.pos;
		let dir = footstep.dir;
		footsteps.push(new Footstep([color.x, color.y, color.z], footstep.idx, [pos.x, pos.y], [dir.x, dir.y]));
		requestAnimationFrame(() => the_particle_renderer.render());
	}
}