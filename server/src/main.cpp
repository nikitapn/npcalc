// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

#include <exception>
#include <iostream>
#include <cassert>
#include <string>
#include <fstream>
#include <filesystem>
#include <boost/asio/signal_set.hpp>
#include <boost/beast/core/error.hpp>
#include <boost/program_options.hpp>
#include <spdlog/spdlog.h>
#include <nprpc/serialization/oarchive.h>
#include "services/db/UserService.hpp"
#include "util/util.hpp"
#include "services/boost/di.hpp"
#include "services/db/Database.hpp"
#include "services/db/SolutionService.hpp"
#include "services/db/FertilizerService.hpp"
#include "services/db/CalculationService.hpp"
#include "services/objects/Calculator.hpp"
#include "services/objects/Authorizator.hpp"
#include "services/objects/Chat.hpp"
#include "services/objects/Proxy.hpp"

struct HostJson {
  bool secured;

  struct {
    nprpc::ObjectId calculator;
    nprpc::ObjectId authorizator;
    nprpc::ObjectId chat;
    nprpc::ObjectId proxy;

    template <typename Archive>
    void serialize(Archive& ar) {
      ar & NVP(calculator);
      ar & NVP(authorizator);
      ar & NVP(chat);
      ar & NVP(proxy);
    }
  } objects;

  template <typename Archive>
  void serialize(Archive& ar) {
    ar & NVP(secured);
    ar & NVP(objects);
  }
};

int main(int argc, char *argv[]) {
  namespace di = boost::di;
  namespace po = boost::program_options;
  namespace fs = std::filesystem;

  HostJson host_json;
  std::string hostname, http_dir, data_dir, public_key, private_key, dh_params;
  unsigned short port;
  bool use_ssl, log_trace = false;

  po::options_description desc("Allowed options");
  desc.add_options()
    ("help", "produce help message")
    ("http-dir", po::value<std::string>(&http_dir)->required(), "HTTP root directory")
    ("data-dir", po::value<std::string>(&data_dir)->required(), "Data root directory")
    ("hostname", po::value<std::string>(&hostname)->default_value(""), "Hostname")
    ("port", po::value<unsigned short>(&port)->default_value(8080), "Port to listen")
    ("use-ssl", po::value<bool>(&use_ssl)->default_value(false), "Enable SSL")
    ("public-key", po::value<std::string>(&public_key)->default_value(""), "Path to public key")
    ("private-key", po::value<std::string>(&private_key)->default_value(""), "Path to private key")
    ("dh-params", po::value<std::string>(&dh_params)->default_value(""), "Path to Diffie-Hellman parameters")
    ("get-sha256", po::value<std::string>(), "Return SHA256 of the password")
    ("trace", po::bool_switch(&log_trace)->default_value(false), "Enable log trace");

  try {
    po::variables_map vm;
    po::store(po::command_line_parser(argc, argv).options(desc).run(), vm);
    if (vm.count("help")) {
      std::cout << desc << "\n";
      return 0;
    }
    if (vm.count("get-sha256")) {
      auto pwd = vm.at("get-sha256").as<std::string>();
      std::cout << pwd << ":\n  " << nplib::toHex(UserService::sha256(pwd)) << std::endl;
      return 0;
    }
    po::notify(vm);
  } catch (std::exception& e) {
    std::cerr << "Exception during command line parsing: " << e.what() << std::endl;
    return -1;
  }

  if (log_trace) {
    spdlog::set_level(spdlog::level::trace);
  } else {
    spdlog::set_level(spdlog::level::info);
  }

  try {
    auto builder = nprpc::RpcBuilder();
    builder
      .set_debug_level(nprpc::DebugLevel::DebugLevel_Critical)
      .set_listen_http_port(port)
      .set_http_root_dir(http_dir)
      .set_hostname(hostname)
      .set_spa_links({
        "/calculator",
        "/solutions",
        "/fertilizers",
        "/links",
        "/chat",
        "/about"
      });
    if (use_ssl) {
      if (public_key.empty() || private_key.empty()) {
        throw std::runtime_error("Certificate and private key paths must be provided when using SSL.");
      }
      builder.enable_ssl_server(public_key, private_key, dh_params);
    }

    auto rpc = builder.build(thread_pool::get_instance().ctx());
    auto data_path = fs::canonical(fs::path(data_dir));

    auto firstInjector = [&] () { return di::make_injector(
      di::bind<>().to(*rpc),
      di::bind<Database>().in(di::singleton).to<Database>(
        (data_path / "nscalc.db").generic_string()
      ),
      di::bind<DataObservers>().in(di::singleton).to<DataObservers>(),
      di::bind<BlockList>().in(di::singleton).to<BlockList>(
        data_path / "blocklist.json"
      )
    );};

    auto injector = firstInjector();

    auto solutionService = injector.create<std::shared_ptr<SolutionService>>();
    auto fertilizerService = injector.create<std::shared_ptr<FertilizerService>>();
    auto calculationService = injector.create<std::shared_ptr<CalculationService>>();
    auto userService = injector.create<std::shared_ptr<UserService>>();

    auto injector2 = di::make_injector(
      firstInjector(),
      di::bind<>().to(solutionService),
      di::bind<>().to(fertilizerService),
      di::bind<>().to(calculationService),
      di::bind<>().to(userService)
    );

    // static poa
    auto poa = nprpc::PoaBuilder(rpc)
		  .with_max_objects(4)
		  .with_lifespan(nprpc::PoaPolicy::Lifespan::Persistent)
		  .build();

    auto calc = injector2.create<std::shared_ptr<CalculatorImpl>>();
    auto authorizator = injector2.create<std::shared_ptr<AuthorizatorImpl>>();
    auto chat = injector2.create<std::shared_ptr<ChatImpl>>();
    auto proxy = injector2.create<std::shared_ptr<ProxyImpl>>();

    // Capture SIGINT and SIGTERM to perform a clean shutdown
    boost::asio::signal_set signals(thread_pool::get_instance().executor(), SIGINT, SIGTERM);
    signals.async_wait([&](boost::beast::error_code const&, int) {
      thread_pool::get_instance().stop();
    });


    // Forbid unsecured WebSocket connections when SSL is enabled
    const auto flags = use_ssl ? nprpc::ObjectActivationFlags::ALLOW_SSL_WEBSOCKET
      : nprpc::ObjectActivationFlags::ALLOW_WEBSOCKET;

    host_json.secured = use_ssl;
    host_json.objects.calculator = poa->activate_object(calc.get(), flags);
    host_json.objects.authorizator = poa->activate_object(authorizator.get(), flags);
    host_json.objects.chat = poa->activate_object(chat.get(), flags);
    host_json.objects.proxy = poa->activate_object(proxy.get(), flags);

    spdlog::info("calculator  - poa: {}, oid: {}", calc->poa_index(), calc->oid());
    spdlog::info("authorizator  - poa: {}, oid: {}", authorizator->poa_index(), authorizator->oid());
    spdlog::info("chat  - poa: {}, oid: {}", chat->poa_index(), chat->oid());
    spdlog::info("proxy  - poa: {}, oid: {}", proxy->poa_index(), proxy->oid());

    {
      std::ofstream os(fs::path(http_dir) / "host.json");
      nprpc::serialization::json_oarchive oa(os);
      oa << host_json;
    }

    thread_pool::get_instance().ctx().run();
    thread_pool::get_instance().wait();

    // rpc->destroy();

  } catch (std::exception& ex) {
    spdlog::critical("Exception occurred: {}", ex.what());
    thread_pool::get_instance().stop();
    return EXIT_FAILURE;
  }

  spdlog::info("nscalc is shutting down gracefully");

  return EXIT_SUCCESS;
}