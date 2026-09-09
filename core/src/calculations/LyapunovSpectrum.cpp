#include "slicer/calculations/LyapunovSpectrum.hpp"

#include <cmath>
#include <algorithm>
#include <limits>
#include <stdexcept>

#include <omp.h>

#include "slicer/calculations/LyapunovExponents.hpp"
#include "slicer/systems/SystemManager.hpp"
#include "slicer/utils/ProgressReporter.hpp"

namespace slicer {

LyapunovSpectrumCalculator::LyapunovSpectrumCalculator(LyapunovSpectrumParams params,
                                                       std::string system,
                                                       std::string systems_dir)
    : params_(std::move(params)),
      system_(std::move(system)),
      systems_dir_(std::move(systems_dir)) {
  validate();
  initialize_system();
}

void LyapunovSpectrumCalculator::validate() const {
  if (params_.starting_point.empty()) {
    throw std::invalid_argument("starting_point must not be empty");
  }
  if (params_.num_iter_attractor == 0) {
    throw std::invalid_argument("num_iter_attractor must be positive");
  }
}

void LyapunovSpectrumCalculator::initialize_system() {
  auto& manager = SystemManager::instance();
  manager.load_systems(systems_dir_);
  dynamical_system_ = manager.create_system(system_);
  if (!dynamical_system_) {
    throw std::runtime_error("Failed to load system: " + system_);
  }

  const auto dim = dynamical_system_->get_variable_names().size();
  if (params_.num_lyapunov_exponents > dim) {
    throw std::invalid_argument("num_lyapunov_exponents exceeds system dimension");
  }

  preparation_force_ = params_.preparation_force;

  const auto param_names = dynamical_system_->get_parameter_names();
  params_base_.resize(param_names.size(), std::numeric_limits<double>::quiet_NaN());
  for (size_t i = 0; i < param_names.size(); ++i) {
    if (param_names[i] == params_.first_param) {
      first_param_index_ = i;
    } else if (param_names[i] == params_.second_param) {
      second_param_index_ = i;
    } else {
      const auto it = params_.static_parameters.find(param_names[i]);
      if (it != params_.static_parameters.end()) {
        params_base_[i] = it->second;
      }
    }
  }
}

std::pair<std::vector<double>, std::vector<double>>
LyapunovSpectrumCalculator::calculate_lyapunov_spectrum(
    const std::vector<double>& starting_point,
    const std::vector<double>& thread_params) const {
  const double nan_value = std::numeric_limits<double>::quiet_NaN();

  // Probe for divergence first: a diverging orbit has no meaningful exponent and
  // would otherwise feed inf/nan through the spectrum computation. Escape is
  // detected as a non-finite (overflowed) state. Mark the cell with NaN so it is
  // rendered as a divergence region downstream.
  std::vector<double> iteration_point = starting_point;
  const size_t probe_iter = params_.num_iter_transient + params_.num_iter_attractor;
  for (size_t i = 0; i < probe_iter; ++i) {
    iteration_point = dynamical_system_->evaluate(iteration_point, thread_params);
    for (double v : iteration_point) {
      if (!std::isfinite(v)) {
        return {std::vector<double>(params_.num_lyapunov_exponents, nan_value), iteration_point};
      }
    }
  }

  auto exponents = calculate_lyapunov_exponents(
      *dynamical_system_, starting_point, thread_params, params_.num_iter_transient,
      params_.num_iter_attractor, params_.num_lyapunov_exponents, preparation_force_);
  for (double& e : exponents) {
    if (!std::isfinite(e)) {
      e = nan_value;
    }
  }

  return {exponents, iteration_point};
}

void LyapunovSpectrumCalculator::run(ArtifactFile& artifact) {
  const size_t grid_size = params_.steps;
  artifact.create_main_grid_float(grid_size, grid_size);
  artifact.write_frame(build_lyapunov_spectrum_frame(params_, system_));

  const double first_param_step =
      (params_.first_param_max - params_.first_param_min) / (grid_size - 1);
  const double second_param_step =
      (params_.second_param_max - params_.second_param_min) / (grid_size - 1);

  const std::string& direction = params_.direction;
  ProgressReporter progress(grid_size);

  if (direction == "l" || direction == "r") {
#pragma omp parallel for
    for (size_t col_ind = 0; col_ind < grid_size; ++col_ind) {
      const size_t current_col =
          (direction == "l") ? (grid_size - 1 - col_ind) : col_ind;
      std::vector<double> row(grid_size, 0.0);

      std::vector<double> curr_point = params_.starting_point;
      if (direction == "r") {
        for (size_t row_ind = 0; row_ind < grid_size; ++row_ind) {
          std::vector<double> thread_params = params_base_;
          thread_params[first_param_index_] =
              params_.first_param_min + row_ind * first_param_step;
          thread_params[second_param_index_] =
              params_.second_param_min + current_col * second_param_step;
          const auto [exponents, point] =
              calculate_lyapunov_spectrum(curr_point, thread_params);
          row[row_ind] = exponents.empty() ? 0.0 : exponents[0];
          curr_point = point;
          if (params_.reset_after_escape &&
              std::any_of(point.begin(), point.end(), [](double v) { return !std::isfinite(v); }))
            curr_point = params_.starting_point;
        }
      } else {
        for (size_t row_ind = grid_size; row_ind-- > 0;) {
          std::vector<double> thread_params = params_base_;
          thread_params[first_param_index_] =
              params_.first_param_min + row_ind * first_param_step;
          thread_params[second_param_index_] =
              params_.second_param_min + current_col * second_param_step;
          const auto [exponents, point] =
              calculate_lyapunov_spectrum(curr_point, thread_params);
          row[row_ind] = exponents.empty() ? 0.0 : exponents[0];
          curr_point = point;
          if (params_.reset_after_escape &&
              std::any_of(point.begin(), point.end(), [](double v) { return !std::isfinite(v); }))
            curr_point = params_.starting_point;
        }
      }

#pragma omp critical
      {
        artifact.write_main_grid_row_float(current_col, row);
        progress.advance(1);
      }
    }
  } else if (direction == "u" || direction == "d") {
#pragma omp parallel for
    for (size_t row_ind = 0; row_ind < grid_size; ++row_ind) {
      const size_t current_row =
          (direction == "d") ? (grid_size - 1 - row_ind) : row_ind;
      std::vector<double> col_data(grid_size, 0.0);

      std::vector<double> curr_point = params_.starting_point;
      if (direction == "u") {
        for (size_t col_ind = 0; col_ind < grid_size; ++col_ind) {
          std::vector<double> thread_params = params_base_;
          thread_params[first_param_index_] =
              params_.first_param_min + current_row * first_param_step;
          thread_params[second_param_index_] =
              params_.second_param_min + col_ind * second_param_step;
          const auto [exponents, point] =
              calculate_lyapunov_spectrum(curr_point, thread_params);
          col_data[col_ind] = exponents.empty() ? 0.0 : exponents[0];
          curr_point = point;
          if (params_.reset_after_escape &&
              std::any_of(point.begin(), point.end(), [](double v) { return !std::isfinite(v); }))
            curr_point = params_.starting_point;
        }
      } else {
        for (size_t col_ind = grid_size; col_ind-- > 0;) {
          std::vector<double> thread_params = params_base_;
          thread_params[first_param_index_] =
              params_.first_param_min + current_row * first_param_step;
          thread_params[second_param_index_] =
              params_.second_param_min + col_ind * second_param_step;
          const auto [exponents, point] =
              calculate_lyapunov_spectrum(curr_point, thread_params);
          col_data[col_ind] = exponents.empty() ? 0.0 : exponents[0];
          curr_point = point;
          if (params_.reset_after_escape &&
              std::any_of(point.begin(), point.end(), [](double v) { return !std::isfinite(v); }))
            curr_point = params_.starting_point;
        }
      }

#pragma omp critical
      {
        artifact.write_main_grid_col_float(current_row, col_data);
        progress.advance(1);
      }
    }
  } else if (direction == "n") {
#pragma omp parallel for
    for (size_t col_ind = 0; col_ind < grid_size; ++col_ind) {
      std::vector<double> row(grid_size, 0.0);

      for (size_t row_ind = 0; row_ind < grid_size; ++row_ind) {
        std::vector<double> thread_params = params_base_;
        thread_params[first_param_index_] =
            params_.first_param_min + row_ind * first_param_step;
        thread_params[second_param_index_] =
            params_.second_param_min + col_ind * second_param_step;
        const auto [exponents, _] =
            calculate_lyapunov_spectrum(params_.starting_point, thread_params);
        row[row_ind] = exponents.empty() ? 0.0 : exponents[0];
      }

#pragma omp critical
      {
        artifact.write_main_grid_row_float(col_ind, row);
        progress.advance(1);
      }
    }
  } else {
    throw std::invalid_argument("Invalid direction. Use 'l', 'r', 'u', 'd', or 'n'.");
  }

  artifact.mark_finished();
}

}  // namespace slicer
