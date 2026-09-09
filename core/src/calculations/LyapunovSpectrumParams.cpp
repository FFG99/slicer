#include "slicer/calculations/LyapunovSpectrumParams.hpp"

#include <stdexcept>

namespace slicer {

LyapunovSpectrumParams parse_lyapunov_spectrum_params(const nlohmann::json& parameters) {
  LyapunovSpectrumParams params;
  params.first_param = parameters.at("first_param").get<std::string>();
  params.second_param = parameters.at("second_param").get<std::string>();
  params.first_param_min = parameters.at("first_param_min").get<double>();
  params.first_param_max = parameters.at("first_param_max").get<double>();
  params.second_param_min = parameters.at("second_param_min").get<double>();
  params.second_param_max = parameters.at("second_param_max").get<double>();
  params.steps = parameters.at("steps").get<size_t>();

  if (parameters.contains("static_parameters")) {
    params.static_parameters =
        parameters.at("static_parameters").get<std::map<std::string, double>>();
  }
  params.starting_point = parameters.at("starting_point").get<std::vector<double>>();
  params.num_iter_transient = parameters.at("num_iter_transient").get<size_t>();
  params.num_iter_attractor = parameters.at("num_iter_attractor").get<size_t>();
  params.num_lyapunov_exponents =
      parameters.value("num_lyapunov_exponents", params.num_lyapunov_exponents);
  params.preparation_force = parameters.value("preparation_force", params.preparation_force);
  params.reset_after_escape = parameters.value("reset_after_escape", false);
  params.direction = parameters.value("direction", params.direction);

  if (params.steps < 2) {
    throw std::invalid_argument("steps must be at least 2");
  }
  return params;
}

CoordinateFrame build_lyapunov_spectrum_frame(const LyapunovSpectrumParams& params,
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
