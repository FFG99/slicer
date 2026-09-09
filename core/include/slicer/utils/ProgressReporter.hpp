#pragma once

#include <atomic>
#include <algorithm>
#include <cstdint>
#include <iostream>
#include <mutex>

namespace slicer {

/** Emits `SLICER_PROGRESS <fraction>` lines on stderr (throttled). */
class ProgressReporter {
 public:
  explicit ProgressReporter(std::uint64_t total) : total_(total > 0 ? total : 1) {}

  void advance(std::uint64_t steps = 1) {
    const std::uint64_t current =
        completed_.fetch_add(steps, std::memory_order_relaxed) + steps;
    maybe_report(current);
  }

 private:
  void maybe_report(std::uint64_t current) {
    const double fraction =
        std::min(1.0, static_cast<double>(current) / static_cast<double>(total_));
    std::lock_guard<std::mutex> lock(mutex_);
    if (fraction - last_reported_ >= 0.01 || current >= total_) {
      std::cerr << "SLICER_PROGRESS " << fraction << '\n';
      std::cerr.flush();
      last_reported_ = fraction;
    }
  }

  std::uint64_t total_;
  std::atomic<std::uint64_t> completed_{0};
  double last_reported_{-1.0};
  std::mutex mutex_;
};

}  // namespace slicer
