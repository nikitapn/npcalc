// Copyright (c) 2021 nikitapnn1@gmail.com
// This file is a part of nprpc (Distributed Control System) and covered by LICENSING file in the topmost directory

#pragma once

#include <boost/asio/io_context.hpp>
#include <boost/asio/post.hpp>
#include <boost/asio/use_future.hpp>
#include <boost/asio/thread_pool.hpp>
#include <boost/asio/strand.hpp>
#include <future>
#include <mutex>
#include <thread>
#include <iostream>
#include <string_view>

namespace nplib {

template<size_t NUMBER_OF_THREADS, size_t NUMBER_OF_IOC_THREADS, size_t NUMBER_OF_IOC1_THREADS>
class thread_pool {
	boost::asio::io_context ioc_;
	boost::asio::executor_work_guard<boost::asio::io_context::executor_type> work_guard_;
	boost::asio::io_context ioc1_;
	boost::asio::executor_work_guard<boost::asio::io_context::executor_type> work_guard1_;
	boost::asio::thread_pool pool_{ NUMBER_OF_THREADS + NUMBER_OF_IOC_THREADS + NUMBER_OF_IOC1_THREADS };

	std::mutex mtx_;

	thread_pool() 
		: work_guard_(boost::asio::make_work_guard(ioc_))
		, work_guard1_(boost::asio::make_work_guard(ioc1_)) 
	{ 
		for (size_t i = 0; i < NUMBER_OF_IOC_THREADS; ++i) {
			boost::asio::post(pool_, [this] { 
				ioc_.run();
				std::lock_guard lk(mtx_);
				std::cout << "ioc thread exited: " << std::this_thread::get_id() << std::endl;
			});
		}
		for (size_t i = 0; i < NUMBER_OF_IOC1_THREADS; ++i) {
			boost::asio::post(pool_, [this] { 
				ioc1_.run(); 
				std::lock_guard lk(mtx_);
				std::cout << "ioc1 thread exited: " << std::this_thread::get_id() << std::endl;
			});
		}
	}
public:
	static thread_pool& get_instance() {
		static thread_pool tp;
		return tp;
	}

	boost::asio::io_context& ctx() noexcept {
		return ioc_; 
	}

	boost::asio::io_context::strand make_strand() noexcept {
		return boost::asio::io_context::strand(ioc1_);
	}

	boost::asio::thread_pool& executor() noexcept {
		return pool_;
	}
	
	void stop() noexcept {
		ioc_.stop();
		work_guard_.reset();

		ioc1_.stop();
		work_guard1_.reset();
	}

	void wait() noexcept {
		pool_.wait();
	}
};

using thread_pool_1 = thread_pool<1, 1, 1>;
using thread_pool_2 = thread_pool<2, 2, 2>;
using thread_pool_3 = thread_pool<3, 3, 2>;
using thread_pool_4 = thread_pool<3, 4, 2>;
using thread_pool_5 = thread_pool<3, 5, 2>;
using thread_pool_6 = thread_pool<3, 6, 2>;
using thread_pool_7 = thread_pool<3, 7, 2>;
using thread_pool_8 = thread_pool<4, 8, 2>;

template<bool UseFuture, typename Executor, typename Func, typename... Args>
std::enable_if_t<!UseFuture, void>
async(Executor& ctx, Func&& job, Args&&... args) {
	boost::asio::post(ctx, std::bind(std::forward<Func>(job), std::forward<Args>(args)...));
}

template<bool UseFuture, typename Executor, typename Func, typename... Args>
std::enable_if_t<UseFuture, std::future<std::invoke_result_t<Func, Args...>>>
async(Executor& ctx, Func&& job, Args&&... args) {
	using boost::asio::use_future;
	return boost::asio::post(ctx, use_future(
		std::bind(std::forward<Func>(job), std::forward<Args>(args)...)
	));
}

inline std::string toHex(std::string_view str) noexcept {
  std::string result;
  for (auto c : str) {
    auto b = (unsigned char)c;
    result += "0123456789ABCDEF"[b >> 4];
    result += "0123456789ABCDEF"[b & 0x0F];
  }
  return result;
};

} // namespace nplib


using thread_pool = nplib::thread_pool_4;