#pragma once

#include "proxy.hpp"
#include <boost/asio.hpp>
#include <boost/asio/ip/tcp.hpp>
// header only boost/json library
// library is not required to be linked
#include <boost/json/src.hpp>
#include <boost/exception/exception.hpp>
#include <spdlog/spdlog.h>
#include <spdlog/spdlog.h>

#include <memory>
#include <map>
#include <set>
#include <iostream>
#include <chrono>
#include <unordered_map>

#include "util/util.hpp"

#include <nplib/utils/trie.hpp>

// SOCKS5 Protocol Constants
namespace socks5 {
  enum class AUTH : uint8_t {
    NO_AUTH           = 0x00,
    GSSAPI            = 0x01,
    USERNAME_PASSWORD = 0x02,
    NO_ACCEPTABLE     = 0xFF
  };

  enum class CMD : uint8_t {
    CONNECT       = 0x01,
    BIND          = 0x02,
    UDP_ASSOCIATE = 0x03
  };

  enum class ATYP : uint8_t {
    IPV4          = 0x01,
    DOMAINNAME    = 0x03,
    IPV6          = 0x04
  };

  enum class REP : uint8_t {
    SUCCEEDED                  = 0x00,
    GENERAL_FAILURE            = 0x01,
    CONNECTION_NOT_ALLOWED     = 0x02,
    NETWORK_UNREACHABLE        = 0x03,
    HOST_UNREACHABLE           = 0x04,
    CONNECTION_REFUSED         = 0x05,
    TTL_EXPIRED                = 0x06,
    COMMAND_NOT_SUPPORTED      = 0x07,
    ADDRESS_TYPE_NOT_SUPPORTED = 0x08
  };
}

// DNS Cache for TTL-aware caching of resolved endpoints
class DnsCache {
private:
  struct CacheEntry {
    boost::asio::ip::tcp::resolver::results_type endpoints;
    std::chrono::steady_clock::time_point expiry_time;
    
    CacheEntry(const boost::asio::ip::tcp::resolver::results_type& eps, std::chrono::seconds ttl)
      : endpoints(eps), expiry_time(std::chrono::steady_clock::now() + ttl) {}
    
    bool is_expired() const {
      return std::chrono::steady_clock::now() > expiry_time;
    }
  };
  
  mutable std::mutex cache_mutex_;
  std::unordered_map<std::string, CacheEntry> cache_;
  
  // Default TTL for cached entries (can be made configurable)
  static constexpr std::chrono::seconds DEFAULT_TTL{300}; // 5 minutes
  
  std::string make_key(const std::string& host, const std::string& port) const {
    return host + ":" + port;
  }
  
public:
  // Try to get cached result, returns empty optional if not found or expired
  std::optional<boost::asio::ip::tcp::resolver::results_type> get(const std::string& host, const std::string& port) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    const std::string key = make_key(host, port);
    
    auto it = cache_.find(key);
    if (it != cache_.end()) {
      if (!it->second.is_expired()) {
        spdlog::debug("[Proxy] DNS cache hit for {}:{}", host, port);
        return it->second.endpoints;
      } else {
        // Remove expired entry
        spdlog::debug("[Proxy] DNS cache entry expired for {}:{}", host, port);
        cache_.erase(it);
      }
    }
    
    spdlog::debug("[Proxy] DNS cache miss for {}:{}", host, port);
    return std::nullopt;
  }
  
  // Store result in cache
  void put(const std::string& host, const std::string& port, 
           const boost::asio::ip::tcp::resolver::results_type& endpoints,
           std::chrono::seconds ttl = DEFAULT_TTL) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    const std::string key = make_key(host, port);
    
    cache_.emplace(key, CacheEntry(endpoints, ttl));
    spdlog::debug("[Proxy] DNS result cached for {}:{} with TTL {}s", host, port, ttl.count());
  }
  
  // Clear expired entries (could be called periodically)
  void cleanup_expired() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    auto it = cache_.begin();
    while (it != cache_.end()) {
      if (it->second.is_expired()) {
        spdlog::debug("[Proxy] Removing expired DNS cache entry for {}", it->first);
        it = cache_.erase(it);
      } else {
        ++it;
      }
    }
  }
  
  // Clear all cache entries
  void clear() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    cache_.clear();
    spdlog::debug("[Proxy] DNS cache cleared");
  }
  
  // Get cache statistics
  size_t size() const {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    return cache_.size();
  }
};

class BlockList {
  std::filesystem::path config_path_;
  // TrieSet for blocked wildcarded hosts and exact matches
  nplib::trie::TrieSet blocked_hosts_;
  // TrieSet for allowed wildcarded hosts and exact matches
  nplib::trie::TrieSet allowed_hosts_;

  void loadFromConfig() {
    std::ifstream config(config_path_);
    if (!config.is_open()) {
      spdlog::warn("[BlockList] Failed to open blocklist configuration file");
      return;
    }
    try {
      auto json = boost::json::parse(config);
      auto blocked_hosts = json.at("blocked_hosts").as_array();
      auto allowed_hosts = json.at("allowed_hosts").as_array();

      for (const auto& item : blocked_hosts) {
        if (item.is_string()) {
          blocked_hosts_.insert(item.as_string().c_str());
        }
      }

      for (const auto& item : allowed_hosts) {
        if (item.is_string()) {
          allowed_hosts_.insert(item.as_string().c_str());
        }
      }

      spdlog::info("[BlockList] Loaded {} blocked hosts, {} allowed hosts",
                  blocked_hosts.size(), allowed_hosts.size());
    } catch (const boost::system::system_error& ex) {
      spdlog::error("[BlockList] JSON parsing error: {}", ex.what());
    } catch (const std::exception& e) {
      spdlog::error("[BlockList] Error loading blocklist configuration: {}", e.what());
    }
  }

public:
  // Check if the given host is blocked
  bool isBlocked(const std::string& host) const noexcept {
    if (allowed_hosts_.search(host)) {
      return false; // Host is allowed
    }

    if (blocked_hosts_.search(host)) {
      return true; // Host is explicitly blocked
    }

    return false; // Placeholder implementation
  }

  BlockList(const std::filesystem::path& config_path)
    : config_path_(config_path)
  {
    loadFromConfig();
  }
};

// TCP Connection management for SOCKS5 tunnels
class ProxyConnection : public std::enable_shared_from_this<ProxyConnection> {
private:
  boost::asio::ip::tcp::socket socket_;
  std::array<uint8_t, 8192> buffer_;
  std::function<void(const proxy::bytestream&)> data_callback_;

public:
  ProxyConnection(boost::asio::io_context& ioc) 
    : socket_(ioc) {}

  boost::asio::ip::tcp::socket& socket() { return socket_; }

  void set_data_callback(std::function<void(const proxy::bytestream&)> callback) {
    data_callback_ = callback;
  }

  void start_reading() {
    do_read();
  }

  void send_data(const nprpc::flat::Span<uint8_t>& data) {
    auto self = shared_from_this();
    // Make a copy of the data to keep it alive during the async operation
    auto data_copy = std::make_shared<std::vector<uint8_t>>(data.begin(), data.end());
    boost::asio::async_write(socket_, boost::asio::buffer(data_copy->data(), data_copy->size()),
      [self, data_copy](boost::system::error_code ec, std::size_t) {
        if (ec) {
          spdlog::warn("[Proxy] Error writing to target socket: {}", ec.message());
        }
        // data_copy will be automatically destroyed when lambda goes out of scope
      });
  }

private:
  void do_read() {
    auto self = shared_from_this();
    socket_.async_read_some(boost::asio::buffer(buffer_),
      [self](boost::system::error_code ec, std::size_t length) {
        if (!ec) {
          if (self->data_callback_) {
            proxy::bytestream data(self->buffer_.begin(), self->buffer_.begin() + length);
            self->data_callback_(data);
          }
          self->do_read();
        } else if (ec != boost::asio::error::eof) {
          spdlog::warn("[Proxy] Error reading from target socket: {}", ec.message());
        }
      });
  }
};

class ConnectionManager {
  std::mutex mutex_;
  std::map<uint32_t, std::shared_ptr<ProxyConnection>> connections_;
  std::atomic<uint32_t> next_connection_id_ = 1;
public:

  uint32_t getNextConnectionId() {
    return next_connection_id_.fetch_add(1, std::memory_order_relaxed);
  }

  std::shared_ptr<ProxyConnection> createConnection(boost::asio::io_context& ioc, uint32_t id) {
    auto connection = std::make_shared<ProxyConnection>(ioc);
    {
      std::lock_guard<std::mutex> lock(mutex_);
      connections_[id] = connection;
    }
    return connection;
  }

  std::shared_ptr<ProxyConnection> getConnection(uint32_t id) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = connections_.find(id);
    if (it != connections_.end()) {
      return it->second;
    }
    return nullptr;
  }

  void remove_connection(uint32_t id) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = connections_.find(id);
    if (it != connections_.end()) {
      boost::system::error_code ec;
      it->second->socket().close(ec);
      if (ec) {
        spdlog::warn("[Proxy] Error closing connection {}: {}", id, ec.message());
      }
      connections_.erase(it);
    }
  }

  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& [id, connection] : connections_) {
      boost::system::error_code ec;
      connection->socket().close(ec);
      if (ec) {
        spdlog::warn("[Proxy] Error closing connection {}: {}", id, ec.message());
      }
    }
    connections_.clear();
  }
};

class ProxyUser : public proxy::IUser_Servant {
private:
  boost::asio::io_context& ioc_;
  ConnectionManager connection_manager_;
  proxy::SessionCallbacks* session_callbacks_ = nullptr;
  static DnsCache dns_cache_; // Shared DNS cache across all ProxyUser instances
  const BlockList& block_list_; // Shared block list across all ProxyUser instances
public:
  ProxyUser(boost::asio::io_context& ioc, const BlockList& block_list) : ioc_{ioc}, block_list_{block_list} {}
  ~ProxyUser() {
    spdlog::info("[Proxy] ProxyUser destructor called");
    if (session_callbacks_) {
      session_callbacks_->release(); // Decrease reference count when ProxyUser is destroyed
      session_callbacks_ = nullptr;
    }
    connection_manager_.clear();
  }

  virtual void RegisterCallbacks(nprpc::Object* callbacks) override {
    session_callbacks_ = nprpc::narrow<proxy::SessionCallbacks>(callbacks);
    session_callbacks_->add_ref(); // Increase reference count to keep callbacks alive
  }

  // TODO: Remove code duplication
  virtual uint32_t EstablishTunnel(::nprpc::flat::Span<char> target_host, uint16_t target_port) override {
    std::string host = target_host;
    std::string port = std::to_string(target_port);
    auto this_ = this;

    if (block_list_.isBlocked(host)) {
      spdlog::trace("[Proxy] Attempt to connect to blocked host: {}:{}", host, port);
      return 0; // Blocked by block list
    }

    try {
      // Create new connection
      // Don't need strand for now as there is only one thread handling connections
      uint32_t connection_id = connection_manager_.getNextConnectionId();

      // Check DNS cache first
      if (auto cached_endpoints = dns_cache_.get(host, port)) {
        spdlog::debug("[Proxy] Using cached DNS result for {}:{}", host, port);
        
        auto connection = connection_manager_.createConnection(ioc_, connection_id);
        this->add_ref(); // Increase reference count to keep ProxyUser alive during async operations
        
        boost::asio::async_connect(connection->socket(), *cached_endpoints,
          [this_, connection_ptr = connection, connection_id](
            boost::system::error_code ec,
            const boost::asio::ip::tcp::endpoint&)
          {
            if (ec) {
              spdlog::warn("[Proxy] Failed to connect using cached DNS: {}", ec.message());
              // Handle connection failure
              if (this_->session_callbacks_) {
                this_->session_callbacks_->OnSessionClosed(std::nullopt, connection_id, proxy::CloseReason::ConnectionRefused);
              }
              this_->release(); // Decrease reference count
              return;
            }

            // Connection successful - set up data forwarding and start reading
            connection_ptr->set_data_callback([this_, connection_id](const proxy::bytestream& data) {
              if (this_->session_callbacks_) {
                this_->session_callbacks_->OnDataReceived(std::nullopt, connection_id, data);
              }
            });

            if (this_->session_callbacks_) {
              this_->session_callbacks_->OnTunnelEstablished(std::nullopt, connection_id);
            }

            connection_ptr->start_reading();
            this_->release(); // Decrease reference count
          });
      } else {
        // Cache miss - perform DNS resolution
        spdlog::trace("[Proxy] Performing DNS resolution for {}:{}", host, port);
        
        auto resolver = std::make_unique<boost::asio::ip::tcp::resolver>(ioc_);
        this->add_ref(); // Increase reference count to keep ProxyUser alive during async operations
        resolver->async_resolve(host, port, [resolver = std::move(resolver), connection_id, this_, host, port] (
          boost::system::error_code ec, 
          const boost::asio::ip::tcp::resolver::results_type& endpoints)
          {
            if (ec) {
              spdlog::warn("[Proxy] Resolver error: {}", ec.message());
              this_->release(); // Decrease reference count
              return;
            }

            spdlog::trace("[Proxy] DNS resolution completed for {}:{}", host, port);

            // Cache the DNS result
            dns_cache_.put(host, port, endpoints);

            auto connection = this_->connection_manager_.createConnection(this_->ioc_, connection_id);

            boost::asio::async_connect(connection->socket(), endpoints,
              [this_, connection_ptr = connection, connection_id](
                boost::system::error_code ec,
                const boost::asio::ip::tcp::endpoint&)
              {
                if (ec) {
                  spdlog::warn("[Proxy] Failed to connect: {}", ec.message());
                  // Handle connection failure
                  if (this_->session_callbacks_) {
                    this_->session_callbacks_->OnSessionClosed(std::nullopt, connection_id, proxy::CloseReason::ConnectionRefused);
                  }
                  this_->release(); // Decrease reference count
                  return;
                }

                // Connection successful - set up data forwarding and start reading
                connection_ptr->set_data_callback([this_, connection_id](const proxy::bytestream& data) {
                  if (this_->session_callbacks_) {
                    this_->session_callbacks_->OnDataReceived(std::nullopt, connection_id, data);
                  }
                });

                if (this_->session_callbacks_) {
                  this_->session_callbacks_->OnTunnelEstablished(std::nullopt, connection_id);
                }

                connection_ptr->start_reading();
                this_->release(); // Decrease reference count
              });
        });
      }

      spdlog::info("[Proxy] Begin establishing tunnel to {}:{}", host, port);

      return connection_id;
    } catch (const std::exception& e) {
      spdlog::warn("[Proxy] Exception during EstablishTunnel: {}", e.what());
      return 0; // Return 0 to indicate failure
    }
  }

  virtual bool SendData(uint32_t session_id, ::nprpc::flat::Span<uint8_t> data) override {
    auto con = connection_manager_.getConnection(session_id);
    if (!con) {
      spdlog::warn("[Proxy] Connection {} not found", session_id);
      return false;
    }

    try {
      con->send_data(data);
      return true;
    } catch (const std::exception& e) {
      spdlog::warn("[Proxy] Error sending data to connection {}: {}",session_id, e.what());
      return false;
    }
  }

  virtual void CloseTunnel(uint32_t session_id) override {
    connection_manager_.remove_connection(session_id);
    // Notify client that session is closed
    if (session_callbacks_) {
      session_callbacks_->OnSessionClosed(std::nullopt, session_id, proxy::CloseReason::Normal);
    }
  }
  
  // Public access to DNS cache for management
  static DnsCache& get_dns_cache() { return dns_cache_; }
};

// Static member definition for DNS cache
DnsCache ProxyUser::dns_cache_;

class ProxyImpl : public proxy::IServer_Servant {
  nprpc::Rpc& rpc_;
  std::shared_ptr<UserService> userService_;
  nprpc::Poa* poa_ = nullptr;
  boost::asio::io_context ioc_;
  boost::asio::executor_work_guard<boost::asio::io_context::executor_type> work_guard_ = 
    boost::asio::make_work_guard(ioc_);
  std::thread ioc_thread_;
  std::shared_ptr<BlockList> block_list_;
public:
  void LogIn (::nprpc::flat::Span<char> login, ::nprpc::flat::Span<char> password, nprpc::detail::flat::ObjectId_Direct user) override
  {
    if (password.size() == 0 || login.size() == 0)
      throw proxy::AuthorizationFailed();
    {
      std::lock_guard lk(*userService_);
      if (auto user = userService_->getUserByName(login); user) {
        if (UserService::checkPassword(*user, password) == false)
          throw proxy::AuthorizationFailed();
        if (UserService::isUserAllowedToUseProxy(*user) == false)
          throw proxy::AuthorizationFailed();
        // User exists and password is correct and user is allowed to use proxy
        spdlog::info("[Proxy] User \"{}\" logged in successfully", user->user_name);
      } else {
        throw proxy::AuthorizationFailed();
      }
    }

    // Create a new ProxyUser object and activate it in the POA
    auto oid = poa_->activate_object(
      new ProxyUser(ioc_, *block_list_.get()), // create a new ProxyUser object
      nprpc::ObjectActivationFlags::SESSION_SPECIFIC, // activation_flags
      &nprpc::get_context() // session context
    );
    nprpc::Object::assign_to_direct(oid, user);
  }

  ProxyImpl(nprpc::Rpc& rpc, std::shared_ptr<UserService> userService,
            std::shared_ptr<BlockList> block_list)
    : rpc_(rpc)
    , userService_{userService}
    , block_list_{block_list}
  {
    poa_ = nprpc::PoaBuilder(&rpc_)
      .with_lifespan(nprpc::PoaPolicy::Lifespan::Transient)
      .with_max_objects(32)
      .build();

    ioc_thread_ = std::thread([this]() { 
      // In case of any communication failure triggered by NPRPC, we will retry running the IO context
      // which handles non-NPRPC related tasks with socks5 connections.
      while(true) {
        try {
          ioc_.run();
          break; // Exit the loop if run() completes normally
        } catch (nprpc::ExceptionCommFailure& e) {
          spdlog::warn("[Proxy] Communication failure in IO context thread: {}", e.what);
        } catch (nprpc::Exception& e) {
          spdlog::warn("[Proxy] NPRPC exception in IO context thread: {}", e.what());
        } catch (const std::exception& e) {
          spdlog::warn("[Proxy] Error in IO context thread: {}", e.what());
          break; // Exit on other exceptions
        } catch (...) {
          spdlog::error("[Proxy] Unknown error in IO context thread.");
          break; // Exit on unknown errors
        }
      }
    });
    
    // Schedule periodic DNS cache cleanup (every 10 minutes)
    schedule_dns_cache_cleanup();
  }
  
  ~ProxyImpl() {
    // Clean shutdown
    work_guard_.reset();
    if (ioc_thread_.joinable()) {
      ioc_thread_.join();
    }
  }

private:
  void schedule_dns_cache_cleanup() {
    auto timer = std::make_shared<boost::asio::steady_timer>(ioc_, std::chrono::minutes(10));
    timer->async_wait([this, timer](boost::system::error_code ec) {
      if (!ec) {
        ProxyUser::get_dns_cache().cleanup_expired();
        spdlog::debug("[Proxy] DNS cache cleanup completed. Current cache size: {}", 
                     ProxyUser::get_dns_cache().size());
        // Schedule next cleanup
        schedule_dns_cache_cleanup();
      }
    });
  }
};