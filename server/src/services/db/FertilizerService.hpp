#pragma once

#include <memory>
#include <sqlite3.h>
#include "Database.hpp"
#include "nscalc.hpp"

class FertilizerService {
  std::shared_ptr<Database> db_;
  sqlite3_stmt* insert_stmt_;
  sqlite3_stmt* select_all_stmt_;
  sqlite3_stmt* update_name_stmt_;
  sqlite3_stmt* update_formula_stmt_;
  sqlite3_stmt* get_stmt_;
  sqlite3_stmt* delete_stmt_;
public:
  explicit FertilizerService(const std::shared_ptr<Database>& database)
    : db_(database) {
      insert_stmt_ = db_->prepareStatement("INSERT INTO Fertilizer (userId, name, formula) VALUES (?, ?, ?);");
      select_all_stmt_ = db_->prepareStatement("SELECT Fertilizer.*, User.name AS userName FROM Fertilizer JOIN User ON Fertilizer.userId = User.id ORDER BY Fertilizer.name ASC;");
      update_name_stmt_ = db_->prepareStatement("UPDATE Fertilizer SET name = ? WHERE id = ? AND userId = ?;");
      update_formula_stmt_ = db_->prepareStatement("UPDATE Fertilizer SET formula = ? WHERE id = ? AND userId = ?;");
      get_stmt_ = db_->prepareStatement("SELECT * FROM Fertilizer WHERE id = ?;");
      delete_stmt_ = db_->prepareStatement("DELETE FROM Solution WHERE id = ? AND userId = ?;");
    }

  std::vector<nscalc::Fertilizer> getAll() {
    std::vector<nscalc::Fertilizer> fertilizers;
    while (sqlite3_step(select_all_stmt_) == SQLITE_ROW) {
      fertilizers.emplace_back();
      auto &cur = fertilizers.back();
      cur.id = sqlite3_column_int(select_all_stmt_, 0);
      cur.userId = sqlite3_column_int(select_all_stmt_, 1);
      cur.name = reinterpret_cast<const char *>(sqlite3_column_text(select_all_stmt_, 2));
      cur.formula = reinterpret_cast<const char *>(sqlite3_column_text(select_all_stmt_, 3));
      cur.userName = reinterpret_cast<const char *>(sqlite3_column_text(select_all_stmt_, 4));
    }
    sqlite3_reset(select_all_stmt_);
    return fertilizers;
  }

  uint32_t addFertilizer(uint32_t userId, const std::string& name, const std::string& formula) {
    sqlite3_bind_int(insert_stmt_, 1, userId);
    sqlite3_bind_text(insert_stmt_, 2, name.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(insert_stmt_, 3, formula.c_str(), -1, SQLITE_STATIC);
    if (sqlite3_step(insert_stmt_) != SQLITE_DONE) {
      spdlog::warn("[FertilizedService] Failed to execute INSERT: {}", sqlite3_errmsg(db_->getConnection()));
    }
    auto insertedId = sqlite3_last_insert_rowid(db_->getConnection());
    sqlite3_reset(insert_stmt_);
    return static_cast<uint32_t>(insertedId);
  }

  void updateFertilizerName(uint32_t id, uint32_t userId, const std::string& name) {
    sqlite3_bind_text(update_name_stmt_, 1, name.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(update_name_stmt_, 1, id);
    sqlite3_bind_int(update_name_stmt_, 1, userId);
    if (sqlite3_step(update_name_stmt_) != SQLITE_DONE) {
      spdlog::warn("[FertizilerService] Failed to execute UPDATE: {}", sqlite3_errmsg(db_->getConnection()));
    }
    sqlite3_reset(update_name_stmt_);
  }

  void updateFertilizerFormula(uint32_t id, uint32_t userId, const std::string& formula) {
    sqlite3_bind_text(update_formula_stmt_, 1, formula.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(update_formula_stmt_, 1, id);
    sqlite3_bind_int(update_formula_stmt_, 1, userId);
    if (sqlite3_step(update_formula_stmt_) != SQLITE_DONE) {
      spdlog::warn("[FertilizedService] Failed to execute UPDATE: {}", sqlite3_errmsg(db_->getConnection()));
    }
    sqlite3_reset(update_formula_stmt_);
  }

  std::optional<nscalc::Fertilizer> getFertilizer(uint32_t id) {
    std::optional<nscalc::Fertilizer> result;
    sqlite3_bind_int(get_stmt_, 1, id);
    if (sqlite3_step(get_stmt_) == SQLITE_ROW) {
      nscalc::Fertilizer fertilizer;
      fertilizer.id = sqlite3_column_int(get_stmt_, 0);
      fertilizer.userId = sqlite3_column_int(get_stmt_, 1);
      fertilizer.name = reinterpret_cast<const char *>(sqlite3_column_text(get_stmt_, 2));
      fertilizer.formula = reinterpret_cast<const char *>(sqlite3_column_text(get_stmt_, 3));
      result = fertilizer;
    }
    return result;
  }

  bool deleteFertilizer(uint32_t id, uint32_t userId) noexcept {
    bool result = true;
    sqlite3_bind_int(delete_stmt_, 1, id);
    sqlite3_bind_int(delete_stmt_, 2, userId);
    if (sqlite3_step(delete_stmt_) != SQLITE_DONE) {
      spdlog::warn("[FertilizerService] Failed to execute DELETE: {}", sqlite3_errmsg(db_->getConnection()));
      result = false;
    }
    sqlite3_reset(delete_stmt_);
    return result;
  }

};
