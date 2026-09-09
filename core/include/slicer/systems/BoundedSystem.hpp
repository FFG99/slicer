#pragma once
#include <cmath>
#include <limits>
#include <stdexcept>
#include "SystemBase.hpp"

namespace slicer {
// Keep plugin ABI unchanged; apply the configured bound to every evaluation.
class BoundedSystem final : public SystemBase {
 public:
  BoundedSystem(SystemPtr system, double threshold)
      : system_(std::move(system)), threshold_(threshold) {}
  std::vector<double> evaluate(const std::vector<double>& state,
                               const std::vector<double>& parameters) override {
    if (escaped(state)) return divergent(state.size());
    auto result = system_->evaluate(state, parameters);
    if (result.size() != state.size()) throw std::runtime_error("System changed state dimension");
    return escaped(result) ? divergent(result.size()) : result;
  }
  std::string get_name() const override { return system_->get_name(); }
  std::vector<std::string> get_parameter_names() const override { return system_->get_parameter_names(); }
  std::vector<std::string> get_variable_names() const override { return system_->get_variable_names(); }
 private:
  bool escaped(const std::vector<double>& state) const {
    for (double x : state) if (!std::isfinite(x) || std::abs(x) > threshold_) return true;
    return false;
  }
  static std::vector<double> divergent(size_t dim) {
    return std::vector<double>(dim, std::numeric_limits<double>::infinity());
  }
  SystemPtr system_;
  double threshold_;
};
}
