import * as NPRPC from "nprpc";
import * as growJournal from "@rpc/grow_journal";

export type JournalRpcContext = {
  rpc: NPRPC.Rpc;
  journal: growJournal.JournalService;
  uploads: growJournal.UploadService;
  storyStream: growJournal.StoryStreamService;
  media: growJournal.MediaService;
};

let initPromise: Promise<JournalRpcContext> | null = null;

function requireHostObject(rpc: NPRPC.Rpc, name: string): NPRPC.ObjectProxy {
  const objectRef = rpc.host_info.objects[name];
  if (!objectRef) {
    throw new Error(`host.json is missing the '${name}' object`);
  }
  return objectRef;
}

export async function getJournalRpc(): Promise<JournalRpcContext> {
  if (!initPromise) {
    initPromise = (async () => {
      const rpc = await NPRPC.init();
      return {
        rpc,
        journal: NPRPC.narrow(requireHostObject(rpc, "journal"), growJournal.JournalService),
        uploads: NPRPC.narrow(requireHostObject(rpc, "journal_uploads"), growJournal.UploadService),
        storyStream: NPRPC.narrow(requireHostObject(rpc, "journal_stream"), growJournal.StoryStreamService),
        media: NPRPC.narrow(requireHostObject(rpc, "journal_media"), growJournal.MediaService),
      };
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}
