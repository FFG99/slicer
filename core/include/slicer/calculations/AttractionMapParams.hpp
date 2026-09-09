#pragma once

#include <map>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "slicer/artifact/CoordinateFrame.hpp"
#include "slicer/calculations/AttractorFingerprint.hpp"

namespace slicer {

struct AttractionMapParams {
  std::string first_param;
  std::string second_param;
  double first_param_min = 0.0;
  double first_param_max = 0.0;
  double second_param_min = 0.0;
  double second_param_max = 0.0;
  size_t steps = 0;

  std::string first_var;
  std::string second_var;
  double first_var_min = 0.0;
  double first_var_max = 0.0;
  double second_var_min = 0.0;
  double second_var_max = 0.0;
  size_t var_steps = 0;

  std::map<std::string, double> static_parameters;
  std::vector<double> starting_point;
  size_t num_iter_transient = 0;
  size_t num_iter_attractor = 0;
  double accuracy = 0.01;
  size_t period_verification_cycles = 2;
  double match_coverage = 0.75;
};

AttractorMatchParams ncf_match_params(const AttractionMapParams& params);

AttractionMapParams parse_attraction_map_params(const nlohmann::json& parameters);

CoordinateFrame build_attraction_map_frame(const AttractionMapParams& params,
                                           const std::string& system);

}  // namespace slicer
