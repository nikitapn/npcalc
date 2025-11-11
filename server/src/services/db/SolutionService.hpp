#pragma once

#include <memory>
#include <optional>
#include <sqlite3.h>
#include <string>
#include "Database.hpp"
#include "nscalc.hpp"

class SolutionService {
  std::shared_ptr<Database> db_;
  sqlite3_stmt* insert_stmt_;
  sqlite3_stmt* select_all_stmt_;
  sqlite3_stmt* update_name_stmt_;
  sqlite3_stmt* get_stmt_;
  sqlite3_stmt* delete_stmt_;
public:
  explicit SolutionService(const std::shared_ptr<Database>& database)
    : db_(database) 
    {
      insert_stmt_ = db_->prepareStatement("INSERT INTO Solution (userId, name, NO3, NH4, P, K, Ca, Mg, S, Cl, Fe, Zn, B, Mn, Cu, Mo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
      select_all_stmt_ = db_->prepareStatement("SELECT Solution.*, User.name AS user_name FROM Solution JOIN User ON Solution.userId = User.id ORDER BY Solution.name ASC;");
      update_name_stmt_ = db_->prepareStatement("UPDATE Solution SET name = ? WHERE id = ? AND userId = ?;");
      delete_stmt_ = db_->prepareStatement("DELETE FROM Solution WHERE id = ? AND userId = ?;");
      get_stmt_ = db_->prepareStatement("SELECT * FROM Solution WHERE id = ?;");
    }

  std::vector<nscalc::Solution> getAll() {
    std::vector<nscalc::Solution> solutions;
    while (sqlite3_step(select_all_stmt_) == SQLITE_ROW) {
      solutions.emplace_back();
      auto &cur = solutions.back();
      cur.id = sqlite3_column_int(select_all_stmt_, 0);
      cur.userId = sqlite3_column_int(select_all_stmt_, 1);
      cur.name = reinterpret_cast<const char *>(sqlite3_column_text(select_all_stmt_, 2));
      for (size_t i = 0; i < nscalc::TARGET_ELEMENT_COUNT; ++i) {
        cur.elements[i] = sqlite3_column_double(select_all_stmt_, 3 + i);
      }
      cur.userName = reinterpret_cast<const char *>(sqlite3_column_text(select_all_stmt_, 3 + nscalc::TARGET_ELEMENT_COUNT));
    }
    sqlite3_reset(select_all_stmt_);
    return solutions;
  }

  uint32_t addSolution(uint32_t userId, const std::string &name, ::nprpc::flat::Span<double> elements) {
    sqlite3_bind_int(insert_stmt_, 1, userId);
    sqlite3_bind_text(insert_stmt_, 2, name.c_str(), -1, SQLITE_STATIC);
    for (size_t i = 0; i < nscalc::TARGET_ELEMENT_COUNT; ++i) {
      sqlite3_bind_double(insert_stmt_, 3 + i, elements[i]);
    }
    if (sqlite3_step(insert_stmt_) != SQLITE_DONE) {
      spdlog::warn("[SolutionService] Failed to execute INSERT: {}", sqlite3_errmsg(db_->getConnection()));
    }
    auto insertedId = sqlite3_last_insert_rowid(db_->getConnection());
    sqlite3_reset(insert_stmt_);
    return static_cast<uint32_t>(insertedId);
  }

  void updateSolutionName(uint32_t id, uint32_t userId, const std::string &name) noexcept {
    sqlite3_bind_text(update_name_stmt_, 1, name.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(update_name_stmt_, 2, id);
    sqlite3_bind_int(update_name_stmt_, 3, userId);
    if (sqlite3_step(update_name_stmt_) != SQLITE_DONE) {
      spdlog::warn("[SolutionService] Failed to execute UPDATE: {}", sqlite3_errmsg(db_->getConnection()));
    }
    sqlite3_reset(update_name_stmt_);
  }

  void updateSolutionElements(uint32_t id, uint32_t userId, ::nprpc::flat::Span_ref<nscalc::flat::SolutionElement, nscalc::flat::SolutionElement_Direct> elementsToUpdate) {
    auto size = elementsToUpdate.size();
    if (size == 0) {
      throw nscalc::InvalidArgument{"elements.size() == 0"};
    }

    constexpr static std::array<std::string, nscalc::TARGET_ELEMENT_COUNT> indexToName {
      "NO3", "NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"
    };

    std::string query = "UPDATE Solution SET ";
    for (auto e : elementsToUpdate) {
      if (e.index() >= nscalc::TARGET_ELEMENT_COUNT) {
        throw nscalc::InvalidArgument{"element index out of range"};
      }
      query += indexToName[e.index()] + " = " + std::to_string(e.value()) + (size > 1 ? ", " : "");
      --size;
    }

    query += " WHERE id = " + std::to_string(id) + " AND userId = " + std::to_string(userId) + ";";
    db_->execute(query);
  }

  std::optional<nscalc::Solution> getSolution(uint32_t id) {
    std::optional<nscalc::Solution> result;
    sqlite3_bind_int(get_stmt_, 1, id);
    if (sqlite3_step(get_stmt_) == SQLITE_ROW) {
      nscalc::Solution solution;
      solution.id = sqlite3_column_int(get_stmt_, 0);
      solution.userId = sqlite3_column_int(get_stmt_, 1);
      solution.name = reinterpret_cast<const char *>(sqlite3_column_text(get_stmt_, 2));
      for (size_t i = 0; i < nscalc::TARGET_ELEMENT_COUNT; ++i) {
        solution.elements[i] = sqlite3_column_double(get_stmt_, 3 + i);
      }
      result = solution;
    }
    sqlite3_reset(get_stmt_);
    return result;
  }

  bool deleteSolution(uint32_t id, uint32_t userId) noexcept {
    bool result = true;
    sqlite3_bind_int(delete_stmt_, 1, id);
    sqlite3_bind_int(delete_stmt_, 2, userId);
    if (sqlite3_step(delete_stmt_) != SQLITE_DONE) {
      spdlog::warn("[SolutionService] Failed to execute DELETE: {}", sqlite3_errmsg(db_->getConnection()));
      result = false;
    }
    sqlite3_reset(delete_stmt_);
    return result;
  }
};



/*

template<typename T>
concept Iterable = requires(T& t) {
  std::begin(t);
  std::end(t);
};

template <typename T> requires (std::is_fundamental<T>::value)
std::string to_json (const T& obj) {
  return std::to_string(obj);
}

std::string to_json (const nscalc::TargetElement& obj) {
  return '[' + std::to_string(obj.value) + ',' + std::to_string(obj.valueBase) + ',' + std::to_string(obj.ratio) + ']';
}

template <Iterable T>
std::string to_json (const T &obj) {
  return "[" + std::accumulate(std::next(std::begin(obj)), std::end(obj), to_json(*std::begin(obj)),
    [](std::string acc, const auto& val) {
      return std::move(acc) + ',' + to_json(val);
  }) + "]";
};

*/