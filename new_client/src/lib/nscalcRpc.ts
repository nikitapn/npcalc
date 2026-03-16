import * as NPRPC from "nprpc";
import * as nscalc from "@rpc/nscalc";

export type NscalcRpcContext = {
  rpc: NPRPC.Rpc;
  calculator: nscalc.Calculator;
};

let initPromise: Promise<NscalcRpcContext> | null = null;

function requireHostObject(rpc: NPRPC.Rpc, name: string): NPRPC.ObjectProxy {
  const objectRef = rpc.host_info.objects[name];
  if (!objectRef) {
    throw new Error(`host.json is missing the '${name}' object`);
  }
  return objectRef;
}

export async function getNscalcRpc(): Promise<NscalcRpcContext> {
  if (!initPromise) {
    initPromise = (async () => {
      const rpc = await NPRPC.init();
      return {
        rpc,
        calculator: NPRPC.narrow(requireHostObject(rpc, "calculator"), nscalc.Calculator),
      };
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}