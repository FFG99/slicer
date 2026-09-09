#include "slicer/calculations/PoolOfAttractionParams.hpp"

#include <stdexcept>

namespace slicer {

AttractorMatchParams ncf_match_params(const PoolOfAttractionParams& params) {
  AttractorMatchParams match;
  match.match_coverage = params.match_coverage;
  return match;
}

PoolClassificationMode parse_pool_classification_mode(const std::string& value) {
  if (value == "ncf") {
    return PoolClassificationMode::Ncf;
  }
  if (value == "period") {
    return PoolClassificationMode::Period;
  }
  if (value == "lyapunov") {
    return PoolClassificationMode::Lyapunov;
  }
  throw std::invalid_argument("Unknown pool classification_mode: " + value);
}

PoolOfAttractionParams parse_pool_of_attraction_params(const nlohmann::json& parameters) {
  PoolOfAttractionParams params;
  params.first_var = parameters.at("first_var").get<std::string>();
  params.second_var = parameters.at("second_var").get<std::string>();
  params.first_var_min = parameters.at("first_var_min").get<double>();
  params.first_var_max = parameters.at("first_var_max").get<double>();
  params.second_var_min = parameters.at("second_var_min").get<double>();
  params.second_var_max = parameters.at("second_var_max").get<double>();
  params.steps = parameters.at("steps").get<size_t>();

  params.parameters = parameters.at("parameters").get<std::map<std::string, double>>();
  params.starting_point = parameters.at("starting_point").get<std::vector<double>>();
  params.num_iter_transient = parameters.at("num_iter_transient").get<size_t>();
  params.num_iter_attractor = parameters.at("num_iter_attractor").get<size_t>();
  params.accuracy = parameters.value("accuracy", params.accuracy);
  params.period_verification_cycles =
      parameters.value("period_verification_cycles", params.period_verification_cycles);
  params.match_coverage = parameters.value("match_coverage", params.match_coverage);
  if (parameters.contains("classification_mode")) {
    params.classification_mode =
        parse_pool_classification_mode(parameters.at("classification_mode").get<std::string>());
  }
  params.num_lyapunov_exponents =
      parameters.value("num_lyapunov_exponents", params.num_lyapunov_exponents);
  params.preparation_force = parameters.value("preparation_force", params.preparation_force);

  if (params.steps < 2) {
    throw std::invalid_argument("steps must be at least 2");
  }
  return params;
}

CoordinateFrame build_pool_of_attraction_frame(const PoolOfAttractionParams& params,
                                               const std::string& system) {
  CoordinateFrame frame;
  frame.system = system;
  frame.space = "ic_plane";
  frame.parameters = params.parameters;
  frame.axes = {
      Axis{params.first_var,
           "sweep",
           std::nullopt,
           params.first_var_min,
           params.first_var_max,
           params.steps},
      Axis{params.second_var,
           "sweep",
           std::nullopt,
           params.second_var_min,
           params.second_var_max,
           params.steps},
  };
  return frame;
}

}  // namespace slicer
