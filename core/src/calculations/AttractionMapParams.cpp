#include "slicer/calculations/AttractionMapParams.hpp"

#include <stdexcept>

namespace slicer {

AttractorMatchParams ncf_match_params(const AttractionMapParams& params) {
  AttractorMatchParams match;
  match.match_coverage = params.match_coverage;
  return match;
}

AttractionMapParams parse_attraction_map_params(const nlohmann::json& parameters) {
  AttractionMapParams params;
  params.first_param = parameters.at("first_param").get<std::string>();
  params.second_param = parameters.at("second_param").get<std::string>();
  params.first_param_min = parameters.at("first_param_min").get<double>();
  params.first_param_max = parameters.at("first_param_max").get<double>();
  params.second_param_min = parameters.at("second_param_min").get<double>();
  params.second_param_max = parameters.at("second_param_max").get<double>();
  params.steps = parameters.at("steps").get<size_t>();

  params.first_var = parameters.at("first_var").get<std::string>();
  params.second_var = parameters.at("second_var").get<std::string>();
  params.first_var_min = parameters.at("first_var_min").get<double>();
  params.first_var_max = parameters.at("first_var_max").get<double>();
  params.second_var_min = parameters.at("second_var_min").get<double>();
  params.second_var_max = parameters.at("second_var_max").get<double>();
  params.var_steps = parameters.at("var_steps").get<size_t>();

  if (parameters.contains("static_parameters")) {
    params.static_parameters =
        parameters.at("static_parameters").get<std::map<std::string, double>>();
  }
  params.starting_point = parameters.at("starting_point").get<std::vector<double>>();
  params.num_iter_transient = parameters.at("num_iter_transient").get<size_t>();
  params.num_iter_attractor = parameters.at("num_iter_attractor").get<size_t>();
  params.accuracy = parameters.value("accuracy", params.accuracy);
  params.period_verification_cycles =
      parameters.value("period_verification_cycles", params.period_verification_cycles);
  params.match_coverage = parameters.value("match_coverage", params.match_coverage);

  if (params.steps < 2 || params.var_steps < 2) {
    throw std::invalid_argument("steps and var_steps must be at least 2");
  }
  return params;
}

CoordinateFrame build_attraction_map_frame(const AttractionMapParams& params,
                                           const std::string& system) {
  CoordinateFrame frame;
  frame.system = system;
  frame.space = "parameter_plane";
  frame.parameters = params.static_parameters;
  frame.axes = {
      Axis{params.first_param,
           "sweep",
           std::nullopt,
           params.first_param_min,
           params.first_param_max,
           params.steps},
      Axis{params.second_param,
           "sweep",
           std::nullopt,
           params.second_param_min,
           params.second_param_max,
           params.steps},
  };
  return frame;
}

}  // namespace slicer
