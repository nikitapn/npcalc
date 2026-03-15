import NPRPC
import NScalc

class ChatServantImpl: ChatServant, @unchecked Sendable {

  override func connect(obj: NPRPCObject) {
    guard let chat = narrow(obj, to: ChatParticipant.self) else {
      print("Failed to narrow object to ChatParticipant")
      return
    }
    print("Client connected: \(chat)")
  }

  override func send(msg: ChatMessage) -> Bool {
    print("Received message from client: \(msg)")
    return true
  }
}