#pragma once

#include <map>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "slicer/artifact/CoordinateFrame.hpp"

namespace slicer {

struct LyapunovSpectrumParams {
  std::string first_param;
  std::string second_param;
  double first_param_min = 0.0;
  double first_param_max = 0.0;
  double second_param_min = 0.0;
  double second_param_max = 0.0;
  size_t steps = 0;

  std::map<std::string, double> static_parameters;
  std::vector<double> starting_point;
  size_t num_iter_transient = 0;
  size_t num_iter_attractor = 0;
  size_t num_lyapunov_exponents = 1;
  double preparation_force = 0.00001;
  std::string direction = "n";
  bool reset_after_escape = false;
};

LyapunovSpectrumParams parse_lyapunov_spectrum_params(const nlohmann::json& parameters);

CoordinateFrame build_lyapunov_spectrum_frame(const LyapunovSpectrumParams& params,
                                              const std::string& system);

}  // namespace slicer
