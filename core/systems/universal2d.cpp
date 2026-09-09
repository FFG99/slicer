#include <cmath>
#include <string>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

class Universal2DMap : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(const std::vector<double>& variables,
                               const std::vector<double>& parameters) override {
    const double S = parameters[0];
    const double J = parameters[1];
    const double x = variables[0];
    const double y = variables[1];
    const double r_sq = x * x + y * y;
    return {S * x - y - r_sq, J * x - r_sq / 5.0};
  }

  std::vector<std::string> get_variable_names() const override { return {"x", "y"}; }

  std::vector<std::string> get_parameter_names() const override { return {"S", "J"}; }

  std::string get_name() const override { return "universal2d"; }
};

SLICER_REGISTER_SYSTEM(Universal2DMap)
