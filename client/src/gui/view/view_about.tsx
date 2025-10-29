// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import { View } from './view'
import About from 'gui/view/About.svelte'

export class View_About extends View {
  ref = React.createRef<any>();

  componentDidMount() {
    new About({
      target: this.ref.current
    });
  }
  
	paint(): JSX.Element {
    return (<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center'}} ref={this.ref} />);
  }
}

