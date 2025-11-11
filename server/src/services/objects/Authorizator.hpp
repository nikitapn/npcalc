#pragma once

#include <spdlog/spdlog.h>
#include <memory>
#include <unordered_map>
#include <set>
#include <random>
#include "nscalc.hpp"
#include "services/db/UserService.hpp"
#include "services/db/FertilizerService.hpp"
#include "services/db/SolutionService.hpp"
#include "services/db/CalculationService.hpp"
#include "services/client/DataObserver.hpp"

class AuthorizatorImpl : public nscalc::IAuthorizator_Servant {
  nprpc::Poa* user_poa;
  std::shared_ptr<UserService> userService_;
  std::shared_ptr<SolutionService> solutionService_;
  std::shared_ptr<FertilizerService> fertilizerService_;
  std::shared_ptr<CalculationService> calculationService_;
  std::shared_ptr<DataObservers> dataObservers_;

  struct Session {
    std::string sid;
    std::string email;

    template <class Archive>
    void serialize(Archive& ar, const int /* file_version */) {
      ar & sid;
      ar & email;
    }

    bool operator<(const Session& other) const noexcept {
      return sid < other.sid;
    }
  };

  std::mutex sessionsMutex_;
  std::set<Session> sessions_;

  struct NewUser {
    std::unique_ptr<UserService::User> user;
    std::uint32_t code;
  };

  std::mutex new_users_mut_;
  std::unordered_map<std::string, NewUser> new_users_db_;

  std::random_device rd_;

  nscalc::UserData tryLogIn(std::string_view user_email, std::string_view user_password);
public:
  virtual nscalc::UserData LogIn(::nprpc::flat::Span<char> login, ::nprpc::flat::Span<char> password);
  virtual nscalc::UserData LogInWithSessionId(::nprpc::flat::Span<char> session_id);
  virtual bool LogOut(::nprpc::flat::Span<char> session_id);
  bool CheckUsername(::nprpc::flat::Span<char> username);
  bool CheckEmail(::nprpc::flat::Span<char> email);
  virtual void RegisterStepOne(::nprpc::flat::Span<char> username, ::nprpc::flat::Span<char> email, ::nprpc::flat::Span<char> password);
  virtual void RegisterStepTwo(::nprpc::flat::Span<char> username, uint32_t code);

  AuthorizatorImpl(
    nprpc::Rpc& rpc,
    std::shared_ptr<UserService> userService,
    std::shared_ptr<SolutionService> solutionService,
    std::shared_ptr<FertilizerService> fertilizerService,
    std::shared_ptr<CalculationService> calculationService,
    std::shared_ptr<DataObservers> dataObservers
  );

  ~AuthorizatorImpl() {
    spdlog::info("AuthorizatorImpl destroyed");
  }
};