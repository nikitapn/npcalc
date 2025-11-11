#include <memory>
#include <deque>
#include <array>
#include <stdexcept>
#include <optional>
#include <unordered_map>
#include <mutex>

#include "socks5.hpp"
#include "util.hpp"

#include <spdlog/spdlog.h>
#include <boost/asio.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/beast/core.hpp>
#include <nprpc/nprpc.hpp>

#include "proxy.hpp"

// SOCKS5 Protocol Constants
enum class SOCKS5_AUTH : uint8_t {
  NO_AUTH           = 0x00,
  GSSAPI            = 0x01,
  USERNAME_PASSWORD = 0x02,
  NO_ACCEPTABLE     = 0xFF
};

enum class SOCKS5_CMD : uint8_t {
  CONNECT       = 0x01,
  BIND          = 0x02,
  UDP_ASSOCIATE = 0x03
};

enum class SOCKS5_ATYP : uint8_t {
  IPV4       = 0x01,
  DOMAINNAME = 0x03,
  IPV6       = 0x04
};

enum class SOCKS5_REP : uint8_t {
  SUCCEEDED                   = 0x00,
  GENERAL_FAILURE             = 0x01,
  CONNECTION_NOT_ALLOWED      = 0x02,
  NETWORK_UNREACHABLE         = 0x03,
  HOST_UNREACHABLE            = 0x04,
  CONNECTION_REFUSED          = 0x05,
  TTL_EXPIRED                 = 0x06,
  COMMAND_NOT_SUPPORTED       = 0x07,
  ADDRESS_TYPE_NOT_SUPPORTED  = 0x08
};

namespace {

void fail(boost::system::error_code ec, char const* what) {
  spdlog::info("{}: {}", what, ec.message());
}

// Forward declaration
class SOCKS5Session;
// Session manager to map session IDs to SOCKS5Session objects
class SessionManager {
private:
  static SessionManager* instance_;
  std::unordered_map<uint32_t, std::weak_ptr<SOCKS5Session>> sessions_;
  mutable std::mutex mutex_;

public:
  static SessionManager& getInstance() {
    if (!instance_) {
      instance_ = new SessionManager();
    }
    return *instance_;
  }

  void registerSession(uint32_t session_id, std::shared_ptr<SOCKS5Session> session);

  void unregisterSession(uint32_t session_id); 

  std::shared_ptr<SOCKS5Session> getSession(uint32_t session_id);
};

SessionManager* SessionManager::instance_ = nullptr;

class SOCKS5Session : public std::enable_shared_from_this<SOCKS5Session> {
private:
  boost::asio::ip::tcp::socket client_socket_;
  nprpc::ObjectPtr<proxy::User> proxy_user_;
  std::array<uint8_t, 8192> buffer_;
  std::string target_host_;
  uint16_t target_port_;
  uint32_t session_id_;
  bool tunnel_established_;
  boost::asio::system_timer timeout_timer_;

public:
  SOCKS5Session(
    boost::asio::io_context& ioc,
    boost::asio::ip::tcp::socket socket,
    nprpc::ObjectPtr<proxy::User> proxy_user)
    : client_socket_(std::move(socket))
    , proxy_user_(proxy_user)
    , session_id_(0)
    , tunnel_established_(false) 
    , timeout_timer_(ioc)
  {
  }

  void start() {
    do_read_auth_request();
  }

  void onTunnelEstablished() {
    timeout_timer_.cancel(); // Cancel timeout
    continue_establish_tunnel();
  }

  // Called when data is received from the proxy server
  void onDataFromServer(::nprpc::flat::Span<uint8_t> data) {
    if (!tunnel_established_) {
      spdlog::warn("[SOCKS5Session] Received data but tunnel not established");
      return;
    }

    // Forward data to client
    auto self = shared_from_this();
    auto data_copy = std::make_shared<std::vector<uint8_t>>(data.begin(), data.end());
    boost::asio::async_write(client_socket_, boost::asio::buffer(data_copy->data(), data_copy->size()),
      [self, data_copy](boost::system::error_code ec, std::size_t) {
        if (ec) {
          spdlog::warn("[SOCKS5Session] Error writing to client: {}", ec.message());
        }
      });
  }

  // Called when the server closes the session
  void onServerClosed(proxy::CloseReason reason) {
    if (!tunnel_established_) {
      fail_tunnel_establishment("Tunnel not established, cannot close session");
      return;
    }
    spdlog::info("Server closed session, reason: {}", static_cast<uint32_t>(reason));
    client_socket_.close();
  }

private:
  void do_read_auth_request() {
    auto self = shared_from_this();
    client_socket_.async_read_some(
      boost::asio::buffer(buffer_.data(), 2),
      [self](boost::system::error_code ec, std::size_t length) {
        if (ec) {
          fail(ec, "[SOCKS5Session] auth request read");
          return;
        }

        if (length < 2 || self->buffer_[0] != 0x05) {
          spdlog::warn("[SOCKS5Session] Invalid SOCKS5 version");
          return;
        }

        uint8_t nmethods = self->buffer_[1];
        if (nmethods == 0) {
          spdlog::warn("[SOCKS5Session] No authentication methods");
          return;
        }

        self->do_read_auth_methods(nmethods);
      });
  }

  void do_read_auth_methods(uint8_t nmethods) {
    auto self = shared_from_this();
    client_socket_.async_read_some(
      boost::asio::buffer(buffer_.data(), nmethods),
      [self, nmethods](boost::system::error_code ec, std::size_t length) {
        if (ec) {
          fail(ec, "[SOCKS5Session] auth methods read");
          return;
        }

        // For simplicity, we accept NO_AUTH (0x00)
        bool no_auth_found = false;
        for (size_t i = 0; i < length; ++i) {
          if (self->buffer_[i] == static_cast<uint8_t>(SOCKS5_AUTH::NO_AUTH)) {
            no_auth_found = true;
            break;
          }
        }

        // Send auth response
        self->buffer_[0] = 0x05; // SOCKS5 version
        self->buffer_[1] = no_auth_found ? 
          static_cast<uint8_t>(SOCKS5_AUTH::NO_AUTH) : 
          static_cast<uint8_t>(SOCKS5_AUTH::NO_ACCEPTABLE);

        self->do_write_auth_response();
      });
  }

  void do_write_auth_response() {
    auto self = shared_from_this();
    boost::asio::async_write(client_socket_, boost::asio::buffer(buffer_.data(), 2),
      [self](boost::system::error_code ec, std::size_t) {
        if (ec) {
          fail(ec, "[SOCKS5Session] auth response write");
          return;
        }

        if (self->buffer_[1] == static_cast<uint8_t>(SOCKS5_AUTH::NO_ACCEPTABLE)) {
          spdlog::warn("[SOCKS5Session] No acceptable authentication method");
          return;
        }

        self->do_read_connect_request();
      });
  }

  void do_read_connect_request() {
    auto self = shared_from_this();
    client_socket_.async_read_some(
      boost::asio::buffer(buffer_.data(), 4),
      [self](boost::system::error_code ec, std::size_t length) {
        if (ec) {
          fail(ec, "[SOCKS5Session] connect request read");
          return;
        }

        if (length < 4 || self->buffer_[0] != 0x05) {
          spdlog::warn("[SOCKS5Session] Invalid SOCKS5 connect request");
          return;
        }

        uint8_t cmd = self->buffer_[1];
        uint8_t atyp = self->buffer_[3];

        if (cmd != static_cast<uint8_t>(SOCKS5_CMD::CONNECT)) {
          self->send_connect_response(SOCKS5_REP::COMMAND_NOT_SUPPORTED);
          return;
        }

        self->do_read_target_address(static_cast<SOCKS5_ATYP>(atyp));
      });
  }

  void do_read_target_address(SOCKS5_ATYP atyp) {
    auto self = shared_from_this();

    if (atyp == SOCKS5_ATYP::IPV4) {
      client_socket_.async_read_some(
        boost::asio::buffer(buffer_.data(), 6), // 4 bytes IP + 2 bytes port
        [self](boost::system::error_code ec, std::size_t length) {
          if (ec || length < 6) {
            fail(ec, "[SOCKS5Session] IPv4 address read");
            return;
          }

          // Convert IPv4 to string
          self->target_host_ = std::to_string(self->buffer_[0]) + "." +
                              std::to_string(self->buffer_[1]) + "." +
                              std::to_string(self->buffer_[2]) + "." +
                              std::to_string(self->buffer_[3]);
          
          self->target_port_ = (self->buffer_[4] << 8) | self->buffer_[5];
          self->start_establish_tunnel();
        });
    } else if (atyp == SOCKS5_ATYP::DOMAINNAME) {
      client_socket_.async_read_some(
        boost::asio::buffer(buffer_.data(), 1), // domain length
        [self](boost::system::error_code ec, std::size_t length) {
          if (ec || length < 1ul) {
            fail(ec, "[SOCKS5Session] domain length read");
            return;
          }

          uint8_t domain_len = self->buffer_[0];
          self->client_socket_.async_read_some(
            boost::asio::buffer(self->buffer_.data(), domain_len + 2), // domain + port
            [self, domain_len](boost::system::error_code ec, std::size_t length) {
              if (ec || length < domain_len + 2ul) {
                fail(ec, "[SOCKS5Session] domain address read");
                return;
              }

              self->target_host_ = std::string(
                reinterpret_cast<char*>(self->buffer_.data()), domain_len);
              self->target_port_ = (self->buffer_[domain_len] << 8) | 
                                  self->buffer_[domain_len + 1];
              self->start_establish_tunnel();
            });
        });
    } else {
      self->send_connect_response(SOCKS5_REP::ADDRESS_TYPE_NOT_SUPPORTED);
    }
  }

  void start_establish_tunnel() {
    try {
      // Use the new EstablishTunnel method
      session_id_ = proxy_user_->EstablishTunnel(target_host_, target_port_);
      if (session_id_ == 0) {
        spdlog::warn("[SOCKS5Session] Failed to establish tunnel. Session id: {}", session_id_);
        send_connect_response(SOCKS5_REP::GENERAL_FAILURE);
        return;
      }
      // Register this session with the session manager
      SessionManager::getInstance().registerSession(session_id_, shared_from_this());
      
      // Keep this session alive for a while to allow for tunnel establishment
      timeout_timer_.expires_after(std::chrono::seconds(5));
      timeout_timer_.async_wait([self = shared_from_this()](const boost::system::error_code& ec) {
        if (ec == boost::asio::error::operation_aborted) {
          // Timer was cancelled - this is normal when tunnel establishes successfully
          spdlog::info("[SOCKS5Session] Tunnel establishment timer cancelled (tunnel established), id = {}", self->session_id_);
          return;
        }
        if (ec) {
          spdlog::warn("[SOCKS5Session] Timer error: {}", ec.message());
          return;
        }
        // Only timeout if no error and not cancelled
        SessionManager::getInstance().unregisterSession(self->session_id_);
        self->fail_tunnel_establishment("Tunnel establishment timed out");
      });
    } catch (const std::exception& e) {
      spdlog::warn("[SOCKS5Session] Tunnel establishment failed: {}", e.what());
      send_connect_response(SOCKS5_REP::GENERAL_FAILURE);
    }
  }

  void continue_establish_tunnel() {
      tunnel_established_ = true;
      send_connect_response(SOCKS5_REP::SUCCEEDED);
  }

  void fail_tunnel_establishment(const std::string& reason) {
    spdlog::warn("[SOCKS5Session] Tunnel establishment for session {} failed: {}", session_id_, reason);
    send_connect_response(SOCKS5_REP::GENERAL_FAILURE);
  }

  void send_connect_response(SOCKS5_REP rep) {
    // Build SOCKS5 response
    buffer_[0] = 0x05; // SOCKS5 version
    buffer_[1] = static_cast<uint8_t>(rep);
    buffer_[2] = 0x00; // Reserved
    buffer_[3] = static_cast<uint8_t>(SOCKS5_ATYP::IPV4); // Address type

    // Bound address and port (we can use 0.0.0.0:0 for success)
    buffer_[4] = 0x00; // 0.0.0.0
    buffer_[5] = 0x00;
    buffer_[6] = 0x00;
    buffer_[7] = 0x00;
    buffer_[8] = 0x00; // Port 0
    buffer_[9] = 0x00;

    auto self = shared_from_this();
    boost::asio::async_write(client_socket_, boost::asio::buffer(buffer_.data(), 10),
      [self, rep](boost::system::error_code ec, std::size_t) {
        if (ec) {
          fail(ec, "[SOCKS5Session] connect response write");
          return;
        }

        if (rep == SOCKS5_REP::SUCCEEDED) {
          self->start_forwarding();
        }
      });
  }

  void start_forwarding() {
    // Start forwarding data between client and proxy
    do_read_from_client();
  }

  void do_read_from_client() {
    auto self = shared_from_this();
    client_socket_.async_read_some(
      boost::asio::buffer(buffer_.data(), buffer_.size()),
      [self](boost::system::error_code ec, std::size_t length) {
        if (ec) {
          if (ec != boost::asio::error::eof) {
            fail(ec, "[SOCKS5Session] client read");
          }
          // Close the tunnel when client disconnects
          if (self->session_id_ != 0) {
            try {
              self->proxy_user_->CloseTunnel(self->session_id_);
            } catch (const std::exception& e) {
              spdlog::warn("[SOCKS5Session] Error closing tunnel: {}", e.what());
            }
          }
          return;
        }

        // Forward data through NPRPC proxy using SendData
        if (self->session_id_ != 0 && self->tunnel_established_) {
          try {
            proxy::bytestream data(self->buffer_.begin(), self->buffer_.begin() + length);
            self->proxy_user_->set_timeout(2000); // Set timeout for proxy operations
            bool success = self->proxy_user_->SendData(self->session_id_, data);
            if (!success) {
              spdlog::warn("[SOCKS5Session] Failed to send data through proxy");
            }
          } catch (const std::exception& e) {
            spdlog::warn("[SOCKS5Session] Proxy send error: {}", e.what());
          }
        }

        // Continue reading from client
        self->do_read_from_client();
      });
  }
};

class SOCKS5Server : public std::enable_shared_from_this<SOCKS5Server> {
private:
  boost::asio::io_context& ioc_;
  boost::asio::ip::tcp::acceptor acceptor_;
  nprpc::ObjectPtr<proxy::User> proxy_user_;
  std::atomic_bool running_{ true };
public:
  SOCKS5Server(boost::asio::io_context& ioc, unsigned short port, nprpc::ObjectPtr<proxy::User> proxy_user)
    : ioc_(ioc)
    , acceptor_(ioc, boost::asio::ip::tcp::endpoint(boost::asio::ip::tcp::v4(), port))
    , proxy_user_(proxy_user) {
  }

  void start() {
    do_accept();
  }

  void stop() {
    running_ = false;
    boost::system::error_code ec;
    acceptor_.close(ec);
    if (ec) {
      spdlog::warn("[SOCKS5Server] Error closing acceptor: {}", ec.message());
    }
  }

private:
  void do_accept() {
    if (running_.load() == false)
      return;

    acceptor_.async_accept(boost::asio::make_strand(ioc_),
      [self = shared_from_this()](boost::system::error_code ec, boost::asio::ip::tcp::socket socket) {
        if (ec) {
          fail(ec, "[SOCKS5Server] accept");
        } else {
          std::make_shared<SOCKS5Session>(self->ioc_, std::move(socket), self->proxy_user_)->start();
        }

        self->do_accept();
      });
  }
};

// Callback implementation for receiving data from proxy server
class ProxySessionCallbacks : public proxy::ISessionCallbacks_Servant {
public:
  void OnTunnelEstablished (uint32_t session_id) override {
    auto session = SessionManager::getInstance().getSession(session_id);
    if (session) {
      spdlog::info("Tunnel established for session = {}",session_id);
      // Notify the session that the tunnel is established
      session->onTunnelEstablished();
    } else {
      spdlog::warn("[PCS] Session id = {} not found for tunnel establishment", session_id);
    }
  }

  void OnDataReceived(uint32_t session_id, ::nprpc::flat::Span<uint8_t> data) override {
    auto session = SessionManager::getInstance().getSession(session_id);
    if (session) {
      session->onDataFromServer(data);
    } else {
      spdlog::warn("[PSC] Session id = {} not found for data forwarding", session_id);
    }
  }

  void OnSessionClosed(uint32_t session_id, proxy::CloseReason reason) override {
    auto session = SessionManager::getInstance().getSession(session_id);
    if (session) {
      session->onServerClosed(reason);
    }
    SessionManager::getInstance().unregisterSession(session_id);
  }

  ~ProxySessionCallbacks() override = default;
};

// SessionManager implementation should be placed after the SOCKS5Session class
void SessionManager::registerSession(uint32_t session_id, std::shared_ptr<SOCKS5Session> session) {
  std::lock_guard<std::mutex> lock(mutex_);
  sessions_[session_id] = session;
  spdlog::info("[SessionManager] Registered session id = {}", session_id);
}

void SessionManager::unregisterSession(uint32_t session_id) {
  std::lock_guard<std::mutex> lock(mutex_);
  sessions_.erase(session_id);
  spdlog::info("[SessionManager] Unregistered session id = {}", session_id);
}

std::shared_ptr<SOCKS5Session> SessionManager::getSession(uint32_t session_id) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = sessions_.find(session_id);
  if (it != sessions_.end()) {
    return it->second.lock();
  }
  return nullptr;
}

} // anonymous namespace

class Proxy::Impl {
  nprpc::Rpc& rpc_;
  nprpc::Poa* poa_ = nullptr;
  nprpc::ObjectPtr<proxy::Server> server_;
  nprpc::ObjectPtr<proxy::User> user_;
  // lifetime of the callbacks is managed by the NPRPC
  // so we don't need to delete them manually or call release()
  ProxySessionCallbacks* callbacks_ = nullptr;
  nprpc::ObjectId callbacks_activation_;
  std::shared_ptr<SOCKS5Server> socks5_server_;
  // running IO context in a separate thread to prevent deadlock with NPRPC thread pool
  std::thread ioc_thread_;
  std::function<void(ProxyStatus)> status_callback_;

  static inline boost::asio::io_context ioc_;
  static inline boost::asio::executor_work_guard<boost::asio::io_context::executor_type> work_guard_ =
    boost::asio::make_work_guard(ioc_);
public:
  Impl(nprpc::Rpc& rpc)
    : rpc_(rpc)
  {
    ioc_thread_ = std::thread([this]() {
      try {
        ioc_.run();
        spdlog::info("IO context thread finished");
      } catch (const std::exception& e) {
        spdlog::critical("[Proxy::Impl] IO context thread exception: {}", e.what());
      }
    });
  }

  // This method is single used to connect to the proxy server
  void connect(
    std::string_view host,
    std::string_view port, 
    std::string_view login,
    std::string_view password,
    std::function<void(ProxyStatus)> status_callback)
  {
    status_callback_ = std::move(status_callback);

    status_callback_(ProxyStatus::Connecting);

    poa_ = nprpc::PoaBuilder(&rpc_)
      .with_lifespan(nprpc::PoaPolicy::Lifespan::Transient)
      .with_max_objects(1) // one object for callbacks
      .build();

    // Filling manually for now, need to implement json config parsing later or use some existing library
    server_.reset(new proxy::Server(0)); // Assuming 0 is the interface index
    auto& oid = server_->get_data();
    oid.object_id = 3;
    oid.poa_idx = 0;
    oid.flags = 1;
    oid.class_id = "proxy/proxy.Server";
    // Use the provided host and port
    oid.urls = "wss://" + std::string(host) + ":" + std::string(port);

    server_->select_endpoint(std::nullopt);

    // Login to get the User proxy object
    nprpc::Object* out;
    
    try {
      server_->LogIn(std::string(login), std::string(password), out);
    } catch (...) {
      cleanUp();
      // re-throw the exception to be handled by the caller
      throw;
    }

    user_.reset(nprpc::narrow<proxy::User>(out));
    assert(out == nullptr); // Ensure out is null after narrow

    if (!user_) {
      throw std::runtime_error("Failed to cast to proxy::User");
    }

    spdlog::info("Successfully connected to proxy server");

    auto sessionContext = rpc_.get_object_session_context(server_.get());
    assert(sessionContext != nullptr);
    // Create and register session callbacks
    callbacks_ = new ProxySessionCallbacks();
    callbacks_activation_ = poa_->activate_object(
      callbacks_, 
      nprpc::ObjectActivationFlags::SESSION_SPECIFIC,
      sessionContext);

    user_->RegisterCallbacks(callbacks_activation_);
    spdlog::info("Session callbacks registered");

    // Start SOCKS5 server on port 1080
    socks5_server_ = std::make_shared<SOCKS5Server>(ioc_, 1080, user_);
    socks5_server_->start();

    spdlog::info("SOCKS5 server started on port 1080");

    status_callback_(ProxyStatus::Connected);
    // Notify the user that the connection is established
  }

  void cleanUp() {
    if (socks5_server_)
      socks5_server_->stop();
    ioc_.stop();
    if (ioc_thread_.joinable())
      ioc_thread_.join();
    ioc_.restart();
    if (user_)
      user_.reset();
    if (server_)
      server_.reset();
    if (poa_) {
      poa_->deactivate_object(callbacks_activation_.object_id());
      rpc_.destroy_poa(poa_);
      poa_ = nullptr;
    }
  }

  ~Impl() {
    cleanUp();
  }
};

Proxy::Proxy(nprpc::Rpc& rpc)
{
  impl_ = new Impl(rpc);
}

void Proxy::connect(
    std::string_view host,
    std::string_view port,
    std::string_view login,
    std::string_view password,
    std::function<void(ProxyStatus)> status_callback)
{
  impl_->connect(host, port, login, password, status_callback);
}

Proxy::~Proxy()
{
  delete impl_;
}
