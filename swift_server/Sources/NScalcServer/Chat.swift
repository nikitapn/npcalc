import NPRPC
import NScalc

class ChatServantImpl: ChatServant, @unchecked Sendable {
  override func connect(session_id: String, stream: NPRPCBidiStream<ChatMessage, ChatMessage>) async {
    print("[Chat] stream connected: \(session_id)")

    do {
      for try await message in stream.reader {
        print("[Chat] \(session_id): \(message.str)")
        await stream.writer.write(message)
      }
    } catch {
      print("[Chat] stream failed for \(session_id): \(error)")
    }

    stream.writer.close()
    print("[Chat] stream closed: \(session_id)")
  }
}