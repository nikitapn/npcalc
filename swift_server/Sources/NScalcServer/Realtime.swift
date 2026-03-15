import NPRPC
import NScalc

class RealtimeServantImpl: RealtimeServant, @unchecked Sendable {
  override func connect(session_id: String, stream: NPRPCBidiStream<RealtimeServerEvent, RealtimeClientEvent>) async {
    print("[Realtime] stream connected: \(session_id)")

    await stream.writer.write(
      RealtimeServerEvent(
        data_changed_idx: nil,
        alarm: Alarm(id: 0, type: .info, msg: "Realtime connected"),
        footstep: nil
      )
    )

    do {
      for try await event in stream.reader {
        if let footstep = event.footstep {
          await stream.writer.write(
            RealtimeServerEvent(
              data_changed_idx: nil,
              alarm: nil,
              footstep: footstep
            )
          )
        }
      }
    } catch {
      print("[Realtime] stream failed for \(session_id): \(error)")
    }

    stream.writer.close()
    print("[Realtime] stream closed: \(session_id)")
  }
}