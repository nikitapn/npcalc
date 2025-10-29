// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as nscalc from 'rpc/nscalc'
import { observable, computed } from 'mobx'

export class Alarm implements nscalc.Alarm {
  @observable confirmed: boolean;
  constructor(public id: number, public type: nscalc.AlarmType, public  msg: string) {
    this.confirmed = false;
  }
}

export let alarms = observable(new Array<Alarm>());