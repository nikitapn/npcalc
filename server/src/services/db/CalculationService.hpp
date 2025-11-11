#pragma once

#include <memory>
#include <sqlite3.h>
#include "Database.hpp"
#include "nscalc.hpp"

class CalculationService {
  std::shared_ptr<Database> db_;
  sqlite3_stmt* insert_stmt_;
  sqlite3_stmt* select_all_for_user_;
  sqlite3_stmt* delete_stmt_;
  sqlite3_stmt* is_exist_stmt_;
  sqlite3_stmt* update_stmt_;
public:
  explicit CalculationService(const std::shared_ptr<Database>& database)
    : db_(database) {
      insert_stmt_ = db_->prepareStatement("INSERT INTO Calculation (userId, name, elements, fertilizersIds, volume, mode) VALUES (?, ?, ?, ?, ?, ?);");
      select_all_for_user_ = db_->prepareStatement("SELECT id, name, elements, fertilizersIds, volume, mode FROM Calculation WHERE userId == ?;");
      delete_stmt_ = db_->prepareStatement("DELETE FROM Calculation WHERE id = ? AND userId = ?;");
      is_exist_stmt_ = db_->prepareStatement("SELECT COUNT(*) FROM Calculation WHERE id = ?;");
      update_stmt_ = db_->prepareStatement("UPDATE Calculation SET name = ?, elements = ?, fertilizersIds = ?, volume = ?, mode = ? WHERE id = ? AND userId = ?;");
    }

  std::vector<nscalc::Calculation> getAll(sqlite3_int64 userId) {
    sqlite3_bind_int(select_all_for_user_, 1, userId);
    std::vector<nscalc::Calculation> calculations;
    while (sqlite3_step(select_all_for_user_) == SQLITE_ROW) {
      calculations.emplace_back();
      auto &cur = calculations.back();
      cur.id = sqlite3_column_int(select_all_for_user_, 0);
      cur.name = reinterpret_cast<const char *>(sqlite3_column_text(select_all_for_user_, 1));
      cur.elements = reinterpret_cast<const char *>(sqlite3_column_text(select_all_for_user_, 2));
      cur.fertilizersIds = reinterpret_cast<const char *>(sqlite3_column_text(select_all_for_user_, 3));
      cur.volume = sqlite3_column_double(select_all_for_user_, 4);
      cur.mode = sqlite3_column_int(select_all_for_user_, 5);
    }
    sqlite3_reset(select_all_for_user_);
    return calculations;
  }

  void deleteCalculation(uint32_t id, uint32_t userId) noexcept {
    sqlite3_bind_int(delete_stmt_, 1, id);
    sqlite3_bind_int(delete_stmt_, 2, userId);
    if (sqlite3_step(delete_stmt_) != SQLITE_DONE) {
      spdlog::warn("[CalculatorService] Failed to execute DELETE: {}", sqlite3_errmsg(db_->getConnection()));
    }
    sqlite3_reset(delete_stmt_);
  }

  bool hasCalculation(uint32_t id) {
    sqlite3_bind_int(is_exist_stmt_, 1, id);
    bool result = sqlite3_step(is_exist_stmt_) == SQLITE_ROW;
    sqlite3_reset(delete_stmt_);
    return result;
  }

  uint32_t insertCalculation(const nscalc::Calculation& calculation, uint32_t userId) {
    sqlite3_bind_int(insert_stmt_, 1, userId);
    sqlite3_bind_text(insert_stmt_, 2, calculation.name.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(insert_stmt_, 3, calculation.elements.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(insert_stmt_, 4, calculation.fertilizersIds.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(insert_stmt_, 5, calculation.volume);
    sqlite3_bind_int(insert_stmt_, 6, calculation.mode);
    if (sqlite3_step(insert_stmt_) != SQLITE_DONE) {
      spdlog::warn("[CalculatorService] Failed to execute INSERT: {}", sqlite3_errmsg(db_->getConnection()));
    }
    auto insertedId = sqlite3_last_insert_rowid(db_->getConnection());
    sqlite3_reset(insert_stmt_);
    return static_cast<uint32_t>(insertedId);
  }

  void updateCalculation(const nscalc::Calculation& calculation, uint32_t userId) {
    sqlite3_bind_text(update_stmt_, 1, calculation.name.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(update_stmt_, 2, calculation.elements.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(update_stmt_, 3, calculation.fertilizersIds.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(update_stmt_, 4, calculation.volume);
    sqlite3_bind_int(update_stmt_, 5, calculation.mode);
    sqlite3_bind_int(update_stmt_, 6, calculation.id);
    sqlite3_bind_int(update_stmt_, 7, userId);
    if (sqlite3_step(update_stmt_) != SQLITE_DONE) {
      spdlog::warn("[CalculatorService] Failed to execute UPDATE: {}", sqlite3_errmsg(db_->getConnection()));
    }
    sqlite3_reset(update_stmt_);
  }
};
