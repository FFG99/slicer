export const HENON_SYSTEM_EXAMPLE = `#include <cmath>
#include <string>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

class HenonMap : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(
      const std::vector<double>& variables,
      const std::vector<double>& parameters) override {
    const double a = parameters[0];
    const double b = parameters[1];
    const double x = variables[0];
    const double y = variables[1];
    return {1.0 - a * x * x + y, b * x};
  }

  std::vector<std::string> get_variable_names() const override {
    return {"x", "y"};
  }

  std::vector<std::string> get_parameter_names() const override {
    return {"a", "b"};
  }

  std::string get_name() const override { return "henon"; }
};

SLICER_REGISTER_SYSTEM(HenonMap)`;

export const REGISTRY_EXAMPLE = `henon:
  description: Hénon map (discrete 2D)
  parameters:
    - a
    - b
  variables:
    - x
    - y
  default_starting_point:
    - 0.1
    - 0.0`;
