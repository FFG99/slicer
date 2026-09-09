#pragma once

#include <cstddef>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

namespace slicer {

std::vector<double> calculate_lyapunov_exponents(SystemBase& system,
                                               const std::vector<double>& starting_point,
                                               const std::vector<double>& parameters,
                                               size_t num_iter_transient,
                                               size_t num_iter_attractor,
                                               size_t num_exponents,
                                               double preparation_force);

}  // namespace slicer
