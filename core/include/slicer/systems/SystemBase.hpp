#pragma once

#include <memory>
#include <string>
#include <vector>

namespace slicer {

class SystemBase {
 public:
  virtual ~SystemBase() = default;

  virtual std::vector<double> evaluate(const std::vector<double>& variables,
                                       const std::vector<double>& parameters) = 0;

  virtual std::string get_name() const = 0;
  virtual std::vector<std::string> get_parameter_names() const = 0;
  virtual std::vector<std::string> get_variable_names() const = 0;
};

using SystemPtr = std::unique_ptr<SystemBase>;

}  // namespace slicer

#include "SystemWrapper.hpp"

#define SLICER_REGISTER_SYSTEM(SystemClass)              \
  extern "C" ::slicer::SystemWrapper create_system() {   \
    return ::slicer::wrap_system(                          \
        std::make_unique<SystemClass>());                \
  }
