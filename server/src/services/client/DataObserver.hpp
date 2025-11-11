#pragma once

#include "Observer.hpp"
#include "nscalc.hpp"

class DataObservers : public ObserversT<nscalc::DataObserver> {
  uint32_t alarm_id_ = 0;

  nscalc::Alarm make_alarm(nscalc::AlarmType type, std::string&& msg) {
    return { alarm_id_++, type, msg };
  }

  void alarm_impl(nscalc::AlarmType type, std::string msg) {
    broadcast(&nscalc::DataObserver::OnAlarm, no_condition, make_alarm(type, std::move(msg)));
  }

public:
  void alarm(nscalc::AlarmType type, std::string&& msg) {
    nplib::async<false>(executor(), &DataObservers::alarm_impl, this, type, std::move(msg));
  }

  void footstep(nscalc::Footstep&& footstep, const nprpc::EndPoint& endpoint) {
    nplib::async<false>(executor(), [this, footstep = std::move(footstep), endpoint] {
      broadcast(&nscalc::DataObserver::OnFootstep, not_equal_to_endpoint_t{ endpoint }, footstep);
    });
  }
};