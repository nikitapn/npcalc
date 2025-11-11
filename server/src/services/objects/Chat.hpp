#pragma once

#include <spdlog/spdlog.h>

#include "nscalc.hpp"
#include "services/client/Observer.hpp"

class ChatImpl
  : public nscalc::IChat_Servant
  , public ObserversT<nscalc::ChatParticipant> 
{
  void send_to_all_impl(nscalc::ChatMessage msg, nprpc::EndPoint endpoint) {
    broadcast(&nscalc::ChatParticipant::OnMessage, not_equal_to_endpoint_t{ endpoint }, std::ref(msg));
  }

  void send_to_all(nscalc::ChatMessage&& msg, nprpc::EndPoint endpoint) {
    nplib::async<false>(executor(), &ChatImpl::send_to_all_impl, this, std::move(msg), std::move(endpoint));
  }
public:
  virtual void Connect(nprpc::Object *obj) {
    if (auto participant = nprpc::narrow<nscalc::ChatParticipant>(obj); participant) {
      participant->add_ref();
      participant->set_timeout(250);
      add(participant);
    }
  }

  virtual bool Send(nscalc::flat::ChatMessage_Direct msg) {
    auto timestamp = static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::minutes>(
      std::chrono::system_clock::now().time_since_epoch()).count());
    send_to_all(nscalc::ChatMessage{timestamp, (std::string)msg.str()}, nprpc::get_context().remote_endpoint);
    return true;
  }

  ~ChatImpl() {
    spdlog::info("ChatImpl destroyed");
  }
};
