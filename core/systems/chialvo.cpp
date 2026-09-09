#include <cmath>
#include <string>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

class ChialvoMap : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(const std::vector<double>& variables,
                               const std::vector<double>& parameters) override {
    const double a = parameters[0];
    const double b = parameters[1];
    const double c = parameters[2];
    const double I = parameters[3];
    const double x = variables[0];
    const double y = variables[1];
    return {x * x * std::exp(y - x) + I, a * y - b * x + c};
  }

  std::vector<std::string> get_variable_names() const override { return {"x", "y"}; }

  std::vector<std::string> get_parameter_names() const override {
    return {"a", "b", "c", "I"};
  }

  std::string get_name() const override { return "chialvo"; }
};

SLICER_REGISTER_SYSTEM(ChialvoMap)
