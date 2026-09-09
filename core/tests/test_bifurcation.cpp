#include <gtest/gtest.h>
#include "slicer/calculations/Bifurcation.hpp"
#include "slicer/systems/BoundedSystem.hpp"

namespace {
class Accumulator : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(const std::vector<double>& v,const std::vector<double>& p) override {
    return {v[0]+p[0],v[1]+p[1]};
  }
  std::string get_name() const override {return "accumulator";}
  std::vector<std::string> get_parameter_names() const override {return {"a","b"};}
  std::vector<std::string> get_variable_names() const override {return {"x","y"};}
};
nlohmann::json parameters() {
  return {{"start",{{"a",1.0},{"b",2.0}}},{"end",{{"a",3.0},{"b",4.0}}},
    {"initial_conditions",{0.0,0.0}},{"variable","y"},{"steps",3},
    {"num_iter_transient",1},{"num_iter_attractor",2},{"inherit",false}};
}
}
TEST(Bifurcation, InterpolatesBothParametersIncludesEndpointsAndDiscardsTransient) {
  Accumulator system;
  auto result=slicer::bifurcation_tree(system,parameters());
  EXPECT_EQ(result["samples"][0]["values"],nlohmann::json({4.,6.}));
  EXPECT_EQ(result["samples"][1]["values"],nlohmann::json({6.,9.}));
  EXPECT_EQ(result["samples"][2]["values"],nlohmann::json({8.,12.}));
  EXPECT_EQ(result["samples"][2]["t"],1.);
}
TEST(Bifurcation, InheritsFinalStateWithoutResetting) {
  Accumulator system; auto p=parameters();p["inherit"]=true;
  auto result=slicer::bifurcation_tree(system,p);
  EXPECT_EQ(result["samples"][1]["values"],nlohmann::json({12.,15.}));
  EXPECT_EQ(result["samples"][2]["values"],nlohmann::json({23.,27.}));
}
TEST(Bifurcation, BoundAppliesToEveryCoordinateAndKeepsExistingContinuationSemantics) {
  slicer::BoundedSystem system(std::make_unique<Accumulator>(),5.);
  auto p=parameters(); p["start"]={{"a",1.},{"b",3.}};p["end"]={{"a",0.},{"b",0.}};
  p["inherit"]=true;
  auto result=slicer::bifurcation_tree(system,p);
  EXPECT_TRUE(result["samples"][0]["diverged"]);
  EXPECT_TRUE(result["samples"][2]["diverged"]);
  p["inherit"]=false;result=slicer::bifurcation_tree(system,p);
  EXPECT_FALSE(result["samples"][2]["diverged"]);
}
TEST(Bifurcation, RejectsIncompleteParametersAndWrongDimensions) {
  Accumulator system;auto p=parameters();p["start"].erase("b");
  EXPECT_THROW(slicer::bifurcation_tree(system,p),std::invalid_argument);
  p=parameters();p["initial_conditions"]={0.};
  EXPECT_THROW(slicer::bifurcation_tree(system,p),std::invalid_argument);
}

TEST(Bifurcation, ReportsCompletedStepsIncludingEscapedTrajectories) {
  slicer::BoundedSystem system(std::make_unique<Accumulator>(), 5.);
  auto p = parameters(); p["report_progress"] = true;
  testing::internal::CaptureStdout();
  auto result = slicer::bifurcation_tree(system, p);
  std::istringstream output(testing::internal::GetCapturedStdout());
  std::string line;
  for (int completed = 1; completed <= 3; ++completed) {
    ASSERT_TRUE(static_cast<bool>(std::getline(output, line)));
    auto event = nlohmann::json::parse(line);
    EXPECT_EQ(event["type"], "progress");
    EXPECT_EQ(event["completed"], completed);
    EXPECT_EQ(event["total"], 3);
  }
  EXPECT_FALSE(static_cast<bool>(std::getline(output, line)));
  EXPECT_TRUE(result["samples"][2]["diverged"]);
}

TEST(Bifurcation, RestartsFromInitialStateAfterEscapeWhenEnabled) {
  slicer::BoundedSystem system(std::make_unique<Accumulator>(), 5.);
  auto p=parameters();
  p["start"]={{"a",1.},{"b",3.}};p["end"]={{"a",0.},{"b",0.}};
  p["inherit"]=true;p["reset_after_escape"]=true;
  auto result=slicer::bifurcation_tree(system,p);
  EXPECT_TRUE(result["samples"][0]["diverged"]);
  EXPECT_FALSE(result["samples"][2]["diverged"]);
}

TEST(Bifurcation, PhaseStatesContainAllVariablesAfterTransient) {
  Accumulator system; auto p=parameters(); p["include_states"]=true;
  auto result=slicer::bifurcation_tree(system,p);
  EXPECT_EQ(result["samples"][0]["states"],nlohmann::json({{2.,4.},{3.,6.}}));
  EXPECT_EQ(result["samples"][2]["states"],nlohmann::json({{6.,8.},{9.,12.}}));
  slicer::BoundedSystem bounded(std::make_unique<Accumulator>(),5.);
  result=slicer::bifurcation_tree(bounded,p);
  EXPECT_TRUE(result["samples"][0]["states"].empty());
  EXPECT_TRUE(result["samples"][0]["diverged"]);
}
