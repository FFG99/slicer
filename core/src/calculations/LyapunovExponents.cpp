#include "slicer/calculations/LyapunovExponents.hpp"

#include <cmath>

namespace slicer {

std::vector<double> calculate_lyapunov_exponents(SystemBase& system,
                                               const std::vector<double>& starting_point,
                                               const std::vector<double>& parameters,
                                               size_t num_iter_transient,
                                               size_t num_iter_attractor,
                                               size_t num_exponents,
                                               double preparation_force) {
  std::vector<double> iteration_point = starting_point;
  for (size_t i = 0; i < num_iter_transient; ++i) {
    iteration_point = system.evaluate(iteration_point, parameters);
  }

  const size_t dim = iteration_point.size();
  std::vector<double> exponents(num_exponents, 0.0);
  std::vector<std::vector<double>> dv(num_exponents, std::vector<double>(dim, 0.0));

  for (size_t i = 0; i < num_exponents; ++i) {
    for (size_t j = 0; j < dim; ++j) {
      dv[i][j] = (i == j) ? iteration_point[j] + preparation_force : iteration_point[j];
    }
  }

  for (size_t i = 0; i < num_iter_attractor; ++i) {
    iteration_point = system.evaluate(iteration_point, parameters);
    std::vector<std::vector<double>> ndv(num_exponents, std::vector<double>(dim, 0.0));

    for (size_t j = 0; j < num_exponents; ++j) {
      ndv[j] = system.evaluate(dv[j], parameters);
    }

    for (size_t j = 0; j < num_exponents; ++j) {
      for (size_t k = 0; k < dim; ++k) {
        dv[j][k] = ndv[j][k] - iteration_point[k];
      }
    }

    for (size_t j = 0; j < num_exponents; ++j) {
      for (size_t k = 0; k < j; ++k) {
        double dot_product = 0.0;
        double norm_sq = 0.0;
        for (size_t l = 0; l < dim; ++l) {
          dot_product += dv[j][l] * dv[k][l];
          norm_sq += dv[k][l] * dv[k][l];
        }
        if (norm_sq <= 0.0) {
          continue;
        }
        for (size_t l = 0; l < dim; ++l) {
          dv[j][l] -= (dot_product / norm_sq) * dv[k][l];
        }
      }
    }

    std::vector<double> lens(num_exponents, 0.0);
    for (size_t j = 0; j < num_exponents; ++j) {
      double sum = 0.0;
      for (size_t k = 0; k < dim; ++k) {
        sum += dv[j][k] * dv[j][k];
      }
      lens[j] = std::sqrt(sum);
    }

    for (size_t j = 0; j < num_exponents; ++j) {
      exponents[j] += std::log(lens[j] / preparation_force);
    }

    for (size_t j = 0; j < num_exponents; ++j) {
      for (size_t k = 0; k < dim; ++k) {
        if (lens[j] <= 0.0) {
          dv[j][k] = iteration_point[k];
        } else {
          dv[j][k] = iteration_point[k] + preparation_force * (dv[j][k] / lens[j]);
        }
      }
    }
  }

  for (size_t i = 0; i < num_exponents; ++i) {
    exponents[i] /= static_cast<double>(num_iter_attractor);
  }

  return exponents;
}

}  // namespace slicer
