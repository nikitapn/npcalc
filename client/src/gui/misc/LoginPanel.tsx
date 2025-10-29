// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import * as React from 'react'
import global from 'misc/global'
import * as nscalc from 'rpc/nscalc'
import * as utils from 'misc/utils'
import { authorizator } from 'rpc/rpc'
import { observer } from 'mobx-react'
import { set_user_data } from 'misc/login'
import Registration from 'gui/misc/Registration.svelte'

@observer
export class LoginPanel extends React.Component<{
	className: string;
},{
	email: string;
	pwd: string;
}> {
	constructor(props:any) {
		super(props)

		this.state = {
			email: "", pwd: ""
		};

		this.handleChangeEmail = this.handleChangeEmail.bind(this);
		this.handleChangePwd = this.handleChangePwd.bind(this);
    	this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleChangeEmail(event:any) {
		this.setState({email: event.target.value});
	}

	handleChangePwd(event:any) {
		this.setState({pwd: event.target.value});
	}

	handleSubmit(event: any) {
		event.preventDefault();
		let this_ = this;
		authorizator.LogIn(this.state.email, this.state.pwd).then((ud: nscalc.UserData) => {
			set_user_data(ud);
		}).catch((e: any) => {
			if (e instanceof nscalc.AuthorizationFailed) {
				console.log("Authorization failed: " + e.reason);
			} else {
				console.log(e);
			}
		});
	}

	handleRegister(event: any) {
		this.registration.activate();
	}

	handleLogOut(event: any) {
		let this_ = this;
		authorizator.LogOut(utils.getCookie("sid")).then( () => {
			set_user_data(null);
		 });
	}

	registration_ref = React.createRef<any>();
  registration: any;

  componentDidMount() {
    this.registration = new Registration({
      target: this.registration_ref.current,
      props: {}
    });
  }

	render() {
		let { className } = this.props;
		return (<div className={className}>
			{
			!global.user_data.is_logged_in 
			? <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
				<form style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }} onSubmit={this.handleSubmit}>
				<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
					<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
						<label>email:</label>
						<input type="email" name="email" autoComplete="username" value={this.state.email} onChange={this.handleChangeEmail}/>
					</div>
					<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
						<label>password:</label>
						<input type="input" name="pwd" minLength={1} autoComplete="current-password" value={this.state.pwd} onChange={this.handleChangePwd}/>
					</div>
				</div>
					<button style={{width:'100px', height:'28px', marginRight: '10px'}}>Log in</button>
			  </form> 
			  <button style={{width:'100px', height:'28px'}} onClick={this.handleRegister.bind(this)}>Register</button>
			  </div>
			: <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
					<label style={{width:'100px'}}>Hello {global.user_data.user}!</label>
					<button style={{width:'100px', height:'28px', marginRight:'10px', marginLeft: '10px'}} onClick={this.handleLogOut.bind(this)}>Log Out</button> 
			  </div> 
			}
			<div ref={this.registration_ref} />
		</div>
		);
	}
}