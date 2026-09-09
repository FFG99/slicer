#include <gtest/gtest.h>

#include <cmath>
#include <memory>
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

class ChialvoSystemTest : public ::testing::Test {
 protected:
  void SetUp() override { system = std::make_unique<ChialvoMap>(); }

  std::unique_ptr<ChialvoMap> system;
};

TEST_F(ChialvoSystemTest, BasicEvaluation) {
  const std::vector<double> variables = {0.0, 0.0};
  const std::vector<double> parameters = {0.2, 0.6, 1.0, -0.5};

  const auto result = system->evaluate(variables, parameters);

  EXPECT_EQ(result.size(), 2U);
  EXPECT_NEAR(result[0], -0.5, 1e-10);
  EXPECT_NEAR(result[1], 1.0, 1e-10);
}

TEST_F(ChialvoSystemTest, Names) {
  const auto param_names = system->get_parameter_names();
  const auto var_names = system->get_variable_names();

  ASSERT_EQ(param_names.size(), 4U);
  ASSERT_EQ(var_names.size(), 2U);
  EXPECT_EQ(param_names[2], "c");
  EXPECT_EQ(param_names[3], "I");
}
