#pragma once

#include <map>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "slicer/artifact/CoordinateFrame.hpp"
#include "slicer/calculations/AttractorFingerprint.hpp"

namespace slicer {

enum class PoolClassificationMode {
  Ncf,
  Period,
  Lyapunov,
};

PoolClassificationMode parse_pool_classification_mode(const std::string& value);

struct PoolOfAttractionParams {
  std::string first_var;
  std::string second_var;
  double first_var_min = 0.0;
  double first_var_max = 0.0;
  double second_var_min = 0.0;
  double second_var_max = 0.0;
  size_t steps = 0;

  std::map<std::string, double> parameters;
  std::vector<double> starting_point;
  size_t num_iter_transient = 0;
  size_t num_iter_attractor = 0;
  double accuracy = 0.01;
  size_t period_verification_cycles = 2;
  double match_coverage = 0.75;

  PoolClassificationMode classification_mode = PoolClassificationMode::Ncf;
  size_t num_lyapunov_exponents = 1;
  double preparation_force = 0.00001;
};

AttractorMatchParams ncf_match_params(const PoolOfAttractionParams& params);

PoolOfAttractionParams parse_pool_of_attraction_params(const nlohmann::json& parameters);

CoordinateFrame build_pool_of_attraction_frame(const PoolOfAttractionParams& params,
                                               const std::string& system);

}  // namespace slicer
