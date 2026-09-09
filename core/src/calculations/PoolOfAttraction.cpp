#include "slicer/calculations/PoolOfAttraction.hpp"

#include <cmath>
#include <limits>
#include <stdexcept>

#include <omp.h>

#include "slicer/calculations/LyapunovExponents.hpp"
#include "slicer/systems/SystemManager.hpp"
#include "slicer/utils/ProgressReporter.hpp"

namespace slicer {

PoolOfAttractionCalculator::PoolOfAttractionCalculator(PoolOfAttractionParams params,
                                                       std::string system,
                                                       std::string systems_dir)
    : params_(std::move(params)),
      system_(std::move(system)),
      systems_dir_(std::move(systems_dir)) {
  validate();
  initialize_system();
}

void PoolOfAttractionCalculator::validate() const {
  if (params_.starting_point.empty()) {
    throw std::invalid_argument("starting_point must not be empty");
  }
  if (params_.num_iter_attractor == 0) {
    throw std::invalid_argument("num_iter_attractor must be positive");
  }
  if (params_.classification_mode == PoolClassificationMode::Lyapunov &&
      params_.preparation_force <= 0.0) {
    throw std::invalid_argument("preparation_force must be positive");
  }
}

void PoolOfAttractionCalculator::initialize_system() {
  auto& manager = SystemManager::instance();
  manager.load_systems(systems_dir_);
  dynamical_system_ = manager.create_system(system_);
  if (!dynamical_system_) {
    throw std::runtime_error("Failed to load system: " + system_);
  }

  base_initial_conditions_ = params_.starting_point;

  if (params_.classification_mode == PoolClassificationMode::Lyapunov &&
      params_.num_lyapunov_exponents > dynamical_system_->get_variable_names().size()) {
    throw std::invalid_argument("num_lyapunov_exponents exceeds system dimension");
  }

  const auto param_names = dynamical_system_->get_parameter_names();
  system_parameters_.resize(param_names.size(), 0.0);
  for (size_t i = 0; i < param_names.size(); ++i) {
    const auto it = params_.parameters.find(param_names[i]);
    if (it == params_.parameters.end()) {
      throw std::runtime_error("Missing system parameter: " + param_names[i]);
    }
    system_parameters_[i] = it->second;
  }

  const auto var_names = dynamical_system_->get_variable_names();
  bool found_first = false;
  bool found_second = false;
  for (size_t i = 0; i < var_names.size(); ++i) {
    if (var_names[i] == params_.first_var) {
      first_var_index_ = i;
      found_first = true;
    } else if (var_names[i] == params_.second_var) {
      second_var_index_ = i;
      found_second = true;
    }
  }
  if (!found_first || !found_second) {
    throw std::runtime_error("Unknown variable name in pool_of_attraction configuration");
  }
}

AttractorTraceConfig PoolOfAttractionCalculator::trace_config() const {
  AttractorTraceConfig config;
  config.num_iter_transient = params_.num_iter_transient;
  config.num_iter_attractor = params_.num_iter_attractor;
  config.accuracy = params_.accuracy;
  config.period_verification_cycles = params_.period_verification_cycles;
  return config;
}

AttractorMatchParams PoolOfAttractionCalculator::match_params() const {
  return ncf_match_params(params_);
}

bool PoolOfAttractionCalculator::trajectory_converges(
    const std::vector<double>& initial_point) const {
  std::vector<double> state = initial_point;
  for (size_t i = 0; i < params_.num_iter_transient; ++i) {
    state = dynamical_system_->evaluate(state, system_parameters_);
    for (double x : state) {
      if (!std::isfinite(x)) {
        return false;
      }
    }
  }
  return true;
}

size_t PoolOfAttractionCalculator::compute_cell_value(
    const std::vector<double>& initial, AttractorClassifier& classifier) const {
  const AttractorTraceConfig config = trace_config();
  const AttractorMatchParams match = match_params();

  switch (params_.classification_mode) {
    case PoolClassificationMode::Ncf: {
      const auto trace =
          trace_attractor_fingerprint(*dynamical_system_, initial, system_parameters_, config);
      if (!trace.converged) {
        return 0;
      }
      std::lock_guard<std::mutex> lock(attractors_mutex_);
      return classifier.classify(trace.fingerprint);
    }
    case PoolClassificationMode::Period: {
      const auto trace =
          trace_attractor_fingerprint(*dynamical_system_, initial, system_parameters_, config);
      if (!trace.converged) {
        return 0;
      }
      return attractor_period_label(trace.fingerprint);
    }
    case PoolClassificationMode::Lyapunov:
      return 0;
  }

  return 0;
}

double PoolOfAttractionCalculator::compute_cell_value_float(
    const std::vector<double>& initial) const {
  const double nan_value = std::numeric_limits<double>::quiet_NaN();
  if (!trajectory_converges(initial)) {
    return nan_value;
  }

  const auto exponents = calculate_lyapunov_exponents(
      *dynamical_system_, initial, system_parameters_, params_.num_iter_transient,
      params_.num_iter_attractor, params_.num_lyapunov_exponents, params_.preparation_force);
  if (exponents.empty() || !std::isfinite(exponents.front())) {
    return nan_value;
  }
  return exponents.front();
}

void PoolOfAttractionCalculator::run(ArtifactFile& artifact) {
  const size_t grid_size = params_.steps;
  const bool use_float_grid = params_.classification_mode == PoolClassificationMode::Lyapunov;
  if (use_float_grid) {
    artifact.create_main_grid_float(grid_size, grid_size);
  } else {
    artifact.create_main_grid(grid_size, grid_size);
  }
  artifact.write_frame(build_pool_of_attraction_frame(params_, system_));

  const double var1_step =
      (params_.first_var_max - params_.first_var_min) / (grid_size - 1);
  const double var2_step =
      (params_.second_var_max - params_.second_var_min) / (grid_size - 1);

  AttractorClassifier classifier(match_params());
  ProgressReporter progress(grid_size);

  if (use_float_grid) {
#pragma omp parallel for
    for (size_t i = 0; i < grid_size; ++i) {
      std::vector<double> row(grid_size, 0.0);
      const double var2 = params_.second_var_min + i * var2_step;

      for (size_t j = 0; j < grid_size; ++j) {
        const double var1 = params_.first_var_min + j * var1_step;

        std::vector<double> initial = base_initial_conditions_;
        initial[first_var_index_] = var1;
        initial[second_var_index_] = var2;

        row[j] = compute_cell_value_float(initial);
      }

#pragma omp critical
      {
        artifact.write_main_grid_row_float(i, row);
        progress.advance(1);
      }
    }
  } else {
    // Labels handed out by the classifier are provisional: when a later orbit
    // bridges two classes they merge, invalidating labels already assigned.
    // Buffer the grid and remap through final_labels() before writing.
    std::vector<std::vector<std::size_t>> rows(grid_size);

#pragma omp parallel for
    for (size_t i = 0; i < grid_size; ++i) {
      std::vector<std::size_t> row(grid_size, 0);
      const double var2 = params_.second_var_min + i * var2_step;

      for (size_t j = 0; j < grid_size; ++j) {
        const double var1 = params_.first_var_min + j * var1_step;

        std::vector<double> initial = base_initial_conditions_;
        initial[first_var_index_] = var1;
        initial[second_var_index_] = var2;

        row[j] = compute_cell_value(initial, classifier);
      }

      rows[i] = std::move(row);
#pragma omp critical
      { progress.advance(1); }
    }

    if (params_.classification_mode == PoolClassificationMode::Ncf) {
      classifier.consolidate();
      const auto labels = classifier.final_labels();
      for (auto& row : rows) {
        for (auto& value : row) {
          value = labels[value];
        }
      }
    }
    for (size_t i = 0; i < grid_size; ++i) {
      artifact.write_main_grid_row(i, rows[i]);
    }
  }

  artifact.mark_finished();
}

}  // namespace slicer
