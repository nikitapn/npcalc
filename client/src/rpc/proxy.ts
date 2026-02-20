import * as NPRPC from 'nprpc'

const u8enc = new TextEncoder();
const u8dec = new TextDecoder();

export type bytestream = Uint8Array;
export enum CloseReason { //u32
  Normal = 0,
  Error = 1,
  DnsError = 2,
  ConnectionRefused = 3,
  Timeout = 4
}

export class SessionCallbacks extends NPRPC.ObjectProxy {
  public static get servant_t(): new() => _ISessionCallbacks_Servant {
    return _ISessionCallbacks_Servant;
  }


  public async OnTunnelEstablished(session_id: /*in*/number): Promise<void> {
    let interface_idx = (arguments.length == 1 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(36);
    buf.commit(36);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 0);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M1(buf, 32, {_1: session_id});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != 0) {
      console.log("received an unusual reply for function with no output arguments");
    }
  }
  public async OnDataReceived(session_id: /*in*/number, data: /*in*/bytestream): Promise<void> {
    let interface_idx = (arguments.length == 2 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(172);
    buf.commit(44);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 1);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M2(buf, 32, {_1: session_id, _2: data});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != 0) {
      console.log("received an unusual reply for function with no output arguments");
    }
  }
  public async OnSessionClosed(session_id: /*in*/number, reason: /*in*/CloseReason): Promise<void> {
    let interface_idx = (arguments.length == 2 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(40);
    buf.commit(40);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 2);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M3(buf, 32, {_1: session_id, _2: reason});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != 0) {
      console.log("received an unusual reply for function with no output arguments");
    }
  }

  // HTTP Transport (alternative to WebSocket)
  public readonly http = {
    OnTunnelEstablished: async (session_id: /*in*/number): Promise<void> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(36);
      buf.commit(36);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 0);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M1(buf, 32, {_1: session_id});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != 0) throw new NPRPC.Exception("Unexpected reply");
    },
    OnDataReceived: async (session_id: /*in*/number, data: /*in*/bytestream): Promise<void> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(172);
      buf.commit(44);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 1);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M2(buf, 32, {_1: session_id, _2: data});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != 0) throw new NPRPC.Exception("Unexpected reply");
    },
    OnSessionClosed: async (session_id: /*in*/number, reason: /*in*/CloseReason): Promise<void> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(40);
      buf.commit(40);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 2);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M3(buf, 32, {_1: session_id, _2: reason});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != 0) throw new NPRPC.Exception("Unexpected reply");
    }
  };
}
export interface ISessionCallbacks_Servant
{
  OnTunnelEstablished(session_id: /*in*/number): void;
  OnDataReceived(session_id: /*in*/number, data: /*in*/bytestream): void;
  OnSessionClosed(session_id: /*in*/number, reason: /*in*/CloseReason): void;
}
export class _ISessionCallbacks_Servant extends NPRPC.ObjectServant {
  public static _get_class(): string { return "proxy/proxy.SessionCallbacks"; }
  public readonly get_class = () => { return _ISessionCallbacks_Servant._get_class(); }
  public readonly dispatch = (buf: NPRPC.FlatBuffer, remote_endpoint: NPRPC.EndPoint, from_parent: boolean) => {
    _ISessionCallbacks_Servant._dispatch(this, buf, remote_endpoint, from_parent);
  }
  static _dispatch(obj: _ISessionCallbacks_Servant, buf: NPRPC.FlatBuffer, remote_endpoint: NPRPC.EndPoint, from_parent: boolean): void {
    // Read CallHeader directly
    const function_idx = buf.dv.getUint8(16 + 3);
    switch(function_idx) {
      case 0: {
        const ia = unmarshal_proxy_M1(buf, 32);
        (obj as any).OnTunnelEstablished(ia._1);
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Success);
        break;
      }
      case 1: {
        const ia = unmarshal_proxy_M2(buf, 32);
        (obj as any).OnDataReceived(ia._1, ia._2);
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Success);
        break;
      }
      case 2: {
        const ia = unmarshal_proxy_M3(buf, 32);
        (obj as any).OnSessionClosed(ia._1, ia._2);
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Success);
        break;
      }
      default:
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Error_UnknownFunctionIdx);
    }
  }
}

export class User extends NPRPC.ObjectProxy {
  public static get servant_t(): new() => _IUser_Servant {
    return _IUser_Servant;
  }


  public async RegisterCallbacks(callbacks: /*in*/NPRPC.ObjectId): Promise<void> {
    let interface_idx = (arguments.length == 1 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(208);
    buf.commit(80);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 0);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M4(buf, 32, {_1: callbacks});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != 0) {
      console.log("received an unusual reply for function with no output arguments");
    }
  }
  public async EstablishTunnel(target_host: /*in*/string, target_port: /*in*/number): Promise<number/*u32*/> {
    let interface_idx = (arguments.length == 2 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(172);
    buf.commit(44);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 1);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M5(buf, 32, {_1: target_host, _2: target_port});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != -1) {
      console.log("received an unusual reply for function with output arguments");
      throw new NPRPC.Exception("Unknown Error");
    }
    const out = unmarshal_proxy_M1(buf, 16);
    return out._1;
  }
  public async SendData(session_id: /*in*/number, data: /*in*/bytestream): Promise<boolean/*boolean*/> {
    let interface_idx = (arguments.length == 2 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(172);
    buf.commit(44);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 2);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M2(buf, 32, {_1: session_id, _2: data});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != -1) {
      console.log("received an unusual reply for function with output arguments");
      throw new NPRPC.Exception("Unknown Error");
    }
    const out = unmarshal_proxy_M6(buf, 16);
    return out._1;
  }
  public async CloseTunnel(session_id: /*in*/number): Promise<void> {
    let interface_idx = (arguments.length == 1 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(36);
    buf.commit(36);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 3);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M1(buf, 32, {_1: session_id});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply != 0) {
      console.log("received an unusual reply for function with no output arguments");
    }
  }

  // HTTP Transport (alternative to WebSocket)
  public readonly http = {
    RegisterCallbacks: async (callbacks: /*in*/NPRPC.ObjectId): Promise<void> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(208);
      buf.commit(80);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 0);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M4(buf, 32, {_1: callbacks});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != 0) throw new NPRPC.Exception("Unexpected reply");
    },
    EstablishTunnel: async (target_host: /*in*/string, target_port: /*in*/number): Promise<number/*u32*/> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(172);
      buf.commit(44);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 1);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M5(buf, 32, {_1: target_host, _2: target_port});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != -1) throw new NPRPC.Exception("Unexpected reply");
      const out = unmarshal_proxy_M1(buf, 16);
      return out._1;
    },
    SendData: async (session_id: /*in*/number, data: /*in*/bytestream): Promise<boolean/*boolean*/> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(172);
      buf.commit(44);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 2);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M2(buf, 32, {_1: session_id, _2: data});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != -1) throw new NPRPC.Exception("Unexpected reply");
      const out = unmarshal_proxy_M6(buf, 16);
      return out._1;
    },
    CloseTunnel: async (session_id: /*in*/number): Promise<void> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(36);
      buf.commit(36);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 3);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M1(buf, 32, {_1: session_id});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply != 0) throw new NPRPC.Exception("Unexpected reply");
    }
  };
}
export interface IUser_Servant
{
  RegisterCallbacks(callbacks: /*in*/NPRPC.ObjectProxy): void;
  EstablishTunnel(target_host: /*in*/string, target_port: /*in*/number): number/*u32*/;
  SendData(session_id: /*in*/number, data: /*in*/bytestream): boolean/*boolean*/;
  CloseTunnel(session_id: /*in*/number): void;
}
export class _IUser_Servant extends NPRPC.ObjectServant {
  public static _get_class(): string { return "proxy/proxy.User"; }
  public readonly get_class = () => { return _IUser_Servant._get_class(); }
  public readonly dispatch = (buf: NPRPC.FlatBuffer, remote_endpoint: NPRPC.EndPoint, from_parent: boolean) => {
    _IUser_Servant._dispatch(this, buf, remote_endpoint, from_parent);
  }
  static _dispatch(obj: _IUser_Servant, buf: NPRPC.FlatBuffer, remote_endpoint: NPRPC.EndPoint, from_parent: boolean): void {
    // Read CallHeader directly
    const function_idx = buf.dv.getUint8(16 + 3);
    switch(function_idx) {
      case 0: {
        const ia = unmarshal_proxy_M4(buf, 32);
        (obj as any).RegisterCallbacks(NPRPC.create_object_from_oid(ia._1, remote_endpoint));
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Success);
        break;
      }
      case 1: {
        const ia = unmarshal_proxy_M5(buf, 32);
        let __ret_val: number/*u32*/;
        __ret_val = (obj as any).EstablishTunnel(ia._1, ia._2);
        const obuf = buf;
        obuf.consume(obuf.size);
        obuf.prepare(20);
        obuf.commit(20);
        const out_data = {_1: __ret_val};
        marshal_proxy_M1(obuf, 16, out_data);
        obuf.write_len(obuf.size - 4);
        obuf.write_msg_id(NPRPC.impl.MessageId.BlockResponse);
        obuf.write_msg_type(NPRPC.impl.MessageType.Answer);
        break;
      }
      case 2: {
        const ia = unmarshal_proxy_M2(buf, 32);
        let __ret_val: boolean/*boolean*/;
        __ret_val = (obj as any).SendData(ia._1, ia._2);
        const obuf = buf;
        obuf.consume(obuf.size);
        obuf.prepare(17);
        obuf.commit(17);
        const out_data = {_1: __ret_val};
        marshal_proxy_M6(obuf, 16, out_data);
        obuf.write_len(obuf.size - 4);
        obuf.write_msg_id(NPRPC.impl.MessageId.BlockResponse);
        obuf.write_msg_type(NPRPC.impl.MessageType.Answer);
        break;
      }
      case 3: {
        const ia = unmarshal_proxy_M1(buf, 32);
        (obj as any).CloseTunnel(ia._1);
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Success);
        break;
      }
      default:
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Error_UnknownFunctionIdx);
    }
  }
}

export interface AuthorizationFailed_Data {
  __ex_id: number/*u32*/;
}

export class AuthorizationFailed extends NPRPC.Exception {
  constructor() { super("AuthorizationFailed"); }
}

export function marshal_AuthorizationFailed(buf: NPRPC.FlatBuffer, offset: number, data: AuthorizationFailed_Data): void {
buf.dv.setUint32(offset + 0, data.__ex_id, true);
}
export function unmarshal_AuthorizationFailed(buf: NPRPC.FlatBuffer, offset: number): AuthorizationFailed {
const result = {} as AuthorizationFailed;
return result;
}

export class Server extends NPRPC.ObjectProxy {
  public static get servant_t(): new() => _IServer_Servant {
    return _IServer_Servant;
  }


  public async LogIn(login: /*in*/string, password: /*in*/string, user: /*out*/NPRPC.ref<NPRPC.ObjectProxy>): Promise<void> {
    let interface_idx = (arguments.length == 3 ? 0 : arguments[arguments.length - 1]);
    const buf = NPRPC.FlatBuffer.create();
    buf.prepare(176);
    buf.commit(48);
    buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
    buf.write_msg_type(NPRPC.impl.MessageType.Request);
    // Write CallHeader directly
    buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
    buf.dv.setUint8(16 + 2, interface_idx);
    buf.dv.setUint8(16 + 3, 0);
    buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
    marshal_proxy_M7(buf, 32, {_1: login, _2: password});
    buf.write_len(buf.size - 4);
    await NPRPC.rpc.call(this.endpoint, buf, this.timeout);
    let std_reply = NPRPC.handle_standart_reply(buf);
    if (std_reply == 1)    {
      proxy_throw_exception(buf);
    }
    if (std_reply != -1) {
      console.log("received an unusual reply for function with output arguments");
      throw new NPRPC.Exception("Unknown Error");
    }
    const out = unmarshal_proxy_M4(buf, 16);
    user.value = NPRPC.create_object_from_oid(out._1, this.endpoint);
  }

  // HTTP Transport (alternative to WebSocket)
  public readonly http = {
    LogIn: async (login: /*in*/string, password: /*in*/string): Promise<NPRPC.ObjectProxy> => {
      const buf = NPRPC.FlatBuffer.create();
      buf.prepare(176);
      buf.commit(48);
      buf.write_msg_id(NPRPC.impl.MessageId.FunctionCall);
      buf.write_msg_type(NPRPC.impl.MessageType.Request);
      buf.dv.setUint16(16 + 0, this.data.poa_idx, true);
      buf.dv.setUint8(16 + 2, 0);
      buf.dv.setUint8(16 + 3, 0);
      buf.dv.setBigUint64(16 + 8, this.data.object_id, true);
      marshal_proxy_M7(buf, 32, {_1: login, _2: password});
      buf.write_len(buf.size - 4);

      const url = `http${this.endpoint.is_ssl() ? 's' : ''}://${this.endpoint.hostname}:${this.endpoint.port}/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf.array_buffer
      }
);

      if (!response.ok) throw new NPRPC.Exception(`HTTP error: ${response.status}`);
      const response_data = await response.arrayBuffer();
      buf.set_buffer(response_data);

      let std_reply = NPRPC.handle_standart_reply(buf);
      if (std_reply == 1) proxy_throw_exception(buf);
      if (std_reply != -1) throw new NPRPC.Exception("Unexpected reply");
      const out = unmarshal_proxy_M4(buf, 16);
      return NPRPC.create_object_from_oid(out._1, this.endpoint);
    }
  };
}
export interface IServer_Servant
{
  LogIn(login: /*in*/string, password: /*in*/string, user: /*out*/NPRPC.ref<NPRPC.ObjectId>): void;
}
export class _IServer_Servant extends NPRPC.ObjectServant {
  public static _get_class(): string { return "proxy/proxy.Server"; }
  public readonly get_class = () => { return _IServer_Servant._get_class(); }
  public readonly dispatch = (buf: NPRPC.FlatBuffer, remote_endpoint: NPRPC.EndPoint, from_parent: boolean) => {
    _IServer_Servant._dispatch(this, buf, remote_endpoint, from_parent);
  }
  static _dispatch(obj: _IServer_Servant, buf: NPRPC.FlatBuffer, remote_endpoint: NPRPC.EndPoint, from_parent: boolean): void {
    // Read CallHeader directly
    const function_idx = buf.dv.getUint8(16 + 3);
    switch(function_idx) {
      case 0: {
        let _out_1: NPRPC.ObjectId;
        const ia = unmarshal_proxy_M7(buf, 32);
        const obuf = buf;
        obuf.consume(obuf.size);
        obuf.prepare(192);
        obuf.commit(64);
        try {
          (obj as any).LogIn(ia._1, ia._2,           _out_1);
        }
        catch(e) {
          if (!(e instanceof AuthorizationFailed)) throw e;
          const obuf = buf;
          obuf.consume(obuf.size);
          obuf.prepare(20);
          obuf.commit(20);
          const ex_data = {__ex_id: 0};
          marshal_AuthorizationFailed(obuf, 16, ex_data);
          obuf.write_len(obuf.size - 4);
          obuf.write_msg_id(NPRPC.impl.MessageId.Exception);
          obuf.write_msg_type(NPRPC.impl.MessageType.Answer);
          return;
        }
        const out_data = {_1: _out_1};
        marshal_proxy_M4(obuf, 16, out_data);
        obuf.write_len(obuf.size - 4);
        obuf.write_msg_id(NPRPC.impl.MessageId.BlockResponse);
        obuf.write_msg_type(NPRPC.impl.MessageType.Answer);
        break;
      }
      default:
        NPRPC.make_simple_answer(buf, NPRPC.impl.MessageId.Error_UnknownFunctionIdx);
    }
  }
}


function proxy_throw_exception(buf: NPRPC.FlatBuffer): void { 
  switch( buf.read_exception_number() ) {
    case 0:
    {
      throw new AuthorizationFailed();
    }
    default:
      throw "unknown rpc exception";
  }
}
export interface proxy_M1 {
  _1: number/*u32*/;
}

export function marshal_proxy_M1(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M1): void {
buf.dv.setUint32(offset + 0, data._1, true);
}

export function unmarshal_proxy_M1(buf: NPRPC.FlatBuffer, offset: number): proxy_M1 {
const result = {} as proxy_M1;
result._1 = buf.dv.getUint32(offset + 0, true);
return result;
}

export interface proxy_M2 {
  _1: number/*u32*/;
  _2: bytestream;
}

export function marshal_proxy_M2(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M2): void {
buf.dv.setUint32(offset + 0, data._1, true);
const temp__2 = new Uint8Array(data._2);
NPRPC.marshal_typed_array(buf, offset + 4, temp__2, 1, 1);
}

export function unmarshal_proxy_M2(buf: NPRPC.FlatBuffer, offset: number): proxy_M2 {
const result = {} as proxy_M2;
result._1 = buf.dv.getUint32(offset + 0, true);
const temp__2 = NPRPC.unmarshal_typed_array(buf, offset + 4, 1) as Uint8Array;
result._2 = Array.from(temp__2);
return result;
}

export interface proxy_M3 {
  _1: number/*u32*/;
  _2: CloseReason;
}

export function marshal_proxy_M3(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M3): void {
buf.dv.setUint32(offset + 0, data._1, true);
buf.dv.setInt32(offset + 4, data._2, true);
}

export function unmarshal_proxy_M3(buf: NPRPC.FlatBuffer, offset: number): proxy_M3 {
const result = {} as proxy_M3;
result._1 = buf.dv.getUint32(offset + 0, true);
result._2 = buf.dv.getInt32(offset + 4, true);
return result;
}

export interface proxy_M4 {
  _1: NPRPC.ObjectId;
}

export function marshal_proxy_M4(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M4): void {
NPRPC.detail.marshal_ObjectId(buf, offset + 0, data._1);
}

export function unmarshal_proxy_M4(buf: NPRPC.FlatBuffer, offset: number): proxy_M4 {
const result = {} as proxy_M4;
result._1 = NPRPC.detail.unmarshal_ObjectId(buf, offset + 0);
return result;
}

export interface proxy_M5 {
  _1: string;
  _2: number/*u16*/;
}

export function marshal_proxy_M5(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M5): void {
NPRPC.marshal_string(buf, offset + 0, data._1);
buf.dv.setUint16(offset + 8, data._2, true);
}

export function unmarshal_proxy_M5(buf: NPRPC.FlatBuffer, offset: number): proxy_M5 {
const result = {} as proxy_M5;
result._1 = NPRPC.unmarshal_string(buf, offset + 0);
result._2 = buf.dv.getUint16(offset + 8, true);
return result;
}

export interface proxy_M6 {
  _1: boolean/*boolean*/;
}

export function marshal_proxy_M6(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M6): void {
buf.dv.setUint8(offset + 0, data._1 ? 1 : 0);
}

export function unmarshal_proxy_M6(buf: NPRPC.FlatBuffer, offset: number): proxy_M6 {
const result = {} as proxy_M6;
result._1 = buf.dv.getUint8(offset + 0) !== 0;
return result;
}

export interface proxy_M7 {
  _1: string;
  _2: string;
}

export function marshal_proxy_M7(buf: NPRPC.FlatBuffer, offset: number, data: proxy_M7): void {
NPRPC.marshal_string(buf, offset + 0, data._1);
NPRPC.marshal_string(buf, offset + 8, data._2);
}

export function unmarshal_proxy_M7(buf: NPRPC.FlatBuffer, offset: number): proxy_M7 {
const result = {} as proxy_M7;
result._1 = NPRPC.unmarshal_string(buf, offset + 0);
result._2 = NPRPC.unmarshal_string(buf, offset + 8);
return result;
}

