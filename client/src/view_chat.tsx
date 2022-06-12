import * as React from 'react'
import { View } from './view'

import Chat from './gui/chat/Chat.svelte'

export class View_Chat extends View {
  ref = React.createRef<any>();
  chat: any;

  componentDidMount() {
    this.chat = new Chat({
      target: this.ref.current,
      props: {}
    });
  }

  onKeyDown = function(event: KeyboardEvent) {
		if (event.keyCode == 13) {
      this.chat.onSend();
    }
	}

  protected onWindowShow() {
    this.chat.set_focus();
  }
  
  paint(): JSX.Element {
    return (<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center'}} ref={this.ref}></div>);
  }
}

