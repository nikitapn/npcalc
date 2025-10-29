// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'

export class View extends React.Component<{
	data?: any
},{

}> {
	constructor(props:any) {
		super(props);
		this.div_ref = React.createRef<HTMLDivElement>();
	}

	private div_ref: React.RefObject<HTMLDivElement>;
	private onKeyDownCallback: (event: KeyboardEvent) => void;
	
	protected onKeyDown: (event: KeyboardEvent) => void;
	protected onWindowShow() {};

	show_window(show: boolean) {
		this.div_ref.current.style.display = (show ? 'block' : 'none');
		if (this.onKeyDown) {
			if (!this.onKeyDownCallback) {
				this.onKeyDownCallback = this.onKeyDown.bind(this);
			}
			if (show) {
				document.addEventListener("keydown", this.onKeyDownCallback);
			} else {
				document.removeEventListener("keydown", this.onKeyDownCallback);
			}
		}
		if (show) this.onWindowShow();
 	}

	// final
	public readonly render = () => {
		const style = {
			display: 'none'
		};
		return (<div ref={this.div_ref} style={style}>{this.paint()}</div>);
	}

	paint() : JSX.Element { return (<div>not implemented</div>) }
};