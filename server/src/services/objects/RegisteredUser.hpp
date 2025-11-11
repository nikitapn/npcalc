#pragma once

#include <spdlog/spdlog.h>

#include "nscalc.hpp"
#include "services/client/DataObserver.hpp"
#include "services/db/UserService.hpp"
#include "services/db/FertilizerService.hpp"
#include "services/db/SolutionService.hpp"
#include "services/db/CalculationService.hpp"
#include "services/client/DataObserver.hpp"

class RegisteredUser
  : public nscalc::IRegisteredUser_Servant {
  const UserService::User& user_;
  std::shared_ptr<SolutionService> solutionService_;
  std::shared_ptr<FertilizerService> fertilizerService_;
  std::shared_ptr<CalculationService> calculationService_;
  std::shared_ptr<DataObservers> dataObservers_;
public:
  virtual void GetMyCalculations(
      /*out*/ ::nprpc::flat::Vector_Direct2<nscalc::flat::Calculation, nscalc::flat::Calculation_Direct> calculations) {
    auto data = calculationService_->getAll(user_.id);
    nscalc::helper::assign_from_cpp_GetMyCalculations_calculations(calculations, data);
  }

  // Solutions

  virtual uint32_t AddSolution(::nprpc::flat::Span<char> name, ::nprpc::flat::Span<double> elements) {
    if (elements.size() != nscalc::TARGET_ELEMENT_COUNT) {
      throw nscalc::InvalidArgument{"elements.size() != TARGET_ELEMENT_COUNT"};
    }
    std::string stname = (std::string)name;
    auto id = solutionService_->addSolution(user_.id, stname, elements);
    dataObservers_->alarm(nscalc::AlarmType::Info, user_.user_name + " added solution \"" + stname + "\"");
    return id;
  }

  virtual void SetSolutionName(uint32_t id, ::nprpc::flat::Span<char> name) {
    solutionService_->updateSolutionName(id, user_.id, (std::string)name);
  }

  virtual void SetSolutionElements(uint32_t id, ::nprpc::flat::Span_ref<nscalc::flat::SolutionElement, nscalc::flat::SolutionElement_Direct> elementsToUpdate) {
    solutionService_->updateSolutionElements(id, user_.id, elementsToUpdate);
  }

  virtual void DeleteSolution(uint32_t id) {
    auto solution = solutionService_->getSolution(id);
    if (!solution)
      return;

    if (solution->userId != user_.id) {
      dataObservers_->alarm(nscalc::AlarmType::Critical, user_.user_name + " is fiddeling with \"" + solution->name +
        "\": please report this incident to the authority");
      throw nscalc::PermissionViolation{"You don't have rights to fiddle with this solution."};
    }

    if (solutionService_->deleteSolution(id, user_.id)) {
      dataObservers_->alarm(nscalc::AlarmType::Info, user_.user_name + " has deleted solution \"" + solution->name + "\"");
    }
  }

  // Fertilizers

  virtual uint32_t AddFertilizer(::nprpc::flat::Span<char> name, ::nprpc::flat::Span<char> formula) {
    auto stName = (std::string)name;
    auto id = fertilizerService_->addFertilizer(user_.id, stName, (std::string)formula);
    dataObservers_->alarm(nscalc::AlarmType::Info, user_.user_name + " added fertilizer \"" + stName + "\"");
    return id;
  }

  virtual void SetFertilizerName(uint32_t id, ::nprpc::flat::Span<char> name) {
    fertilizerService_->updateFertilizerName(id, user_.id, (std::string)name);
  }

  virtual void SetFertilizerFormula(uint32_t id, ::nprpc::flat::Span<char> name) {
    fertilizerService_->updateFertilizerFormula(id, user_.id, (std::string)name);
  }

  virtual void DeleteFertilizer(uint32_t id) {
    auto fertilizer = fertilizerService_->getFertilizer(id);
    if (!fertilizer)
      return;

    if (fertilizer->userId != user_.id) {
      dataObservers_->alarm(nscalc::AlarmType::Critical, user_.user_name + " is fiddeling with \"" + fertilizer->name +
        "\": please report this incident to the authority");
      throw nscalc::PermissionViolation{"You don't have rights to fiddle with this fertilizer."};
    }

    if (fertilizerService_->deleteFertilizer(id, user_.id)) {
      dataObservers_->alarm(nscalc::AlarmType::Info, user_.user_name + " has deleted fertilizer \"" + fertilizer->name + "\"");
    }
  }

  // Calculations

  virtual uint32_t UpdateCalculation(nscalc::flat::Calculation_Direct calculationFlat) {
    nscalc::Calculation calculation;
    nscalc::helper::assign_from_flat_UpdateCalculation_calculation(calculationFlat, calculation);

    auto id = calculation.id;
    if (!calculationService_->hasCalculation(id)) {
      id = calculationService_->insertCalculation(calculation, user_.id);
    } else {
      calculationService_->updateCalculation(calculation, user_.id);
    }
    return id;
  }

  virtual void DeleteCalculation(uint32_t id) {
    calculationService_->deleteCalculation(id, user_.id);
  }

  RegisteredUser(
    const UserService::User& user,
    std::shared_ptr<SolutionService> solutionService,
    std::shared_ptr<FertilizerService> fertilizerService,
    std::shared_ptr<CalculationService> calculationService,
    std::shared_ptr<DataObservers> dataObservers)
      : user_{user}
      , solutionService_{solutionService}
      , fertilizerService_{fertilizerService}
      , calculationService_{calculationService}
      , dataObservers_{dataObservers}
  {
  }

  ~RegisteredUser() {
    spdlog::info("Registered user \"{}\" disconnected.", user_.user_name);
  }
};