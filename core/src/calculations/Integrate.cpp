#include "slicer/calculations/Integrate.hpp"

#include <cmath>
#include <limits>
#include <stdexcept>

#include "slicer/systems/SystemManager.hpp"
#include "slicer/utils/ProgressReporter.hpp"

namespace slicer {

IntegrateCalculator::IntegrateCalculator(IntegrateParams params, std::string system,
                                         std::string systems_dir)
    : params_(std::move(params)),
      system_(std::move(system)),
      systems_dir_(std::move(systems_dir)) {
  validate();
  initialize_system();
}

void IntegrateCalculator::validate() const {
  if (params_.initial_conditions.empty()) {
    throw std::invalid_argument("initial_conditions must not be empty");
  }
  if (params_.output_mode == "phase_plane" && params_.num_iter_attractor == 0) {
    throw std::invalid_argument("num_iter_attractor must be positive");
  }
}

void IntegrateCalculator::initialize_system() {
  auto& manager = SystemManager::instance();
  manager.load_systems(systems_dir_);
  dynamical_system_ = manager.create_system(system_);
  if (!dynamical_system_) {
    throw std::runtime_error("Failed to load system: " + system_);
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
  if (params_.initial_conditions.size() != var_names.size()) {
    throw std::invalid_argument("initial_conditions size must match system variables");
  }
}

void IntegrateCalculator::run(ArtifactFile& artifact) {
  const auto var_names = dynamical_system_->get_variable_names();
  const size_t dim = var_names.size();
  const double step = params_.dt.value_or(1.0);

  // Divergence is escape to infinity: a state that overflowed to inf/nan. A
  // finite (even very large) transient excursion is not divergence, since many
  // maps overshoot before settling onto a bounded attractor.
  const auto is_finite_state = [&](const std::vector<double>& s) {
    for (double v : s) {
      if (!std::isfinite(v)) {
        return false;
      }
    }
    return true;
  };

  std::vector<double> state = params_.initial_conditions;
  std::vector<double> state_min(dim, std::numeric_limits<double>::infinity());
  std::vector<double> state_max(dim, -std::numeric_limits<double>::infinity());
  bool diverged = false;

  if (params_.output_mode == "phase_plane") {
    for (size_t i = 0; i < params_.num_iter_transient && !diverged; ++i) {
      state = dynamical_system_->evaluate(state, system_parameters_);
      diverged = !is_finite_state(state);
    }

    const size_t max_points = params_.num_iter_attractor;
    std::vector<double> t_values;
    std::vector<double> state_values;
    t_values.reserve(max_points);
    state_values.reserve(max_points * dim);
    ProgressReporter progress(max_points);

    for (size_t i = 0; i < max_points && !diverged; ++i) {
      state = dynamical_system_->evaluate(state, system_parameters_);
      if (!is_finite_state(state)) {
        diverged = true;
        break;
      }
      t_values.push_back(static_cast<double>(params_.num_iter_transient + i + 1) * step);
      for (size_t d = 0; d < dim; ++d) {
        state_values.push_back(state[d]);
        state_min[d] = std::min(state_min[d], state[d]);
        state_max[d] = std::max(state_max[d], state[d]);
      }
      progress.advance(1);
    }

    const size_t n_points = t_values.size();
    const double t_min = n_points > 0 ? t_values.front() : 0.0;
    const double t_max = n_points > 0 ? t_values.back() : 0.0;
    auto frame = build_integrate_frame(params_, system_, var_names, t_min, t_max,
                                       state_min, state_max);
    frame.diverged = diverged;
    artifact.write_frame(frame);
    artifact.create_trajectory(n_points, dim);
    artifact.write_trajectory(state_values, t_values);
    artifact.mark_finished();
    return;
  }

  const size_t steps =
      static_cast<size_t>(std::max(1.0, std::ceil(params_.t_max / step)));
  const size_t max_points = steps + 1;

  std::vector<double> t_values;
  std::vector<double> state_values;
  t_values.reserve(max_points);
  state_values.reserve(max_points * dim);

  for (size_t i = 0; i < max_points; ++i) {
    if (!is_finite_state(state)) {
      diverged = true;
      break;
    }
    t_values.push_back(static_cast<double>(i) * step);
    for (size_t d = 0; d < dim; ++d) {
      state_values.push_back(state[d]);
      state_min[d] = std::min(state_min[d], state[d]);
      state_max[d] = std::max(state_max[d], state[d]);
    }
    if (i + 1 < max_points) {
      state = dynamical_system_->evaluate(state, system_parameters_);
    }
  }

  const size_t n_points = t_values.size();
  const double t_min = n_points > 0 ? t_values.front() : 0.0;
  const double t_max = n_points > 0 ? t_values.back() : 0.0;
  auto frame = build_integrate_frame(params_, system_, var_names, t_min, t_max,
                                     state_min, state_max);
  frame.diverged = diverged;
  artifact.write_frame(frame);
  artifact.create_trajectory(n_points, dim);
  artifact.write_trajectory(state_values, t_values);
  artifact.mark_finished();
}

}  // namespace slicer
