#include "slicer/calculations/AttractionMap.hpp"

#include <algorithm>
#include <array>
#include <limits>
#include <map>
#include <mutex>
#include <stdexcept>

#include <omp.h>

#include "slicer/systems/SystemManager.hpp"
#include "slicer/utils/ProgressReporter.hpp"

namespace slicer {

AttractionMapCalculator::AttractionMapCalculator(AttractionMapParams params,
                                                 std::string system,
                                                 std::string systems_dir)
    : params_(std::move(params)),
      system_(std::move(system)),
      systems_dir_(std::move(systems_dir)) {
  validate();
  initialize_system();
}

void AttractionMapCalculator::validate() const {
  if (params_.starting_point.empty()) {
    throw std::invalid_argument("starting_point must not be empty");
  }
  if (params_.num_iter_attractor == 0) {
    throw std::invalid_argument("num_iter_attractor must be positive");
  }
}

void AttractionMapCalculator::initialize_system() {
  auto& manager = SystemManager::instance();
  manager.load_systems(systems_dir_);
  dynamical_system_ = manager.create_system(system_);
  if (!dynamical_system_) {
    throw std::runtime_error("Failed to load system: " + system_);
  }

  base_initial_conditions_ = params_.starting_point;

  const auto param_names = dynamical_system_->get_parameter_names();
  bool found_first = false;
  bool found_second = false;
  for (size_t i = 0; i < param_names.size(); ++i) {
    if (param_names[i] == params_.first_param) {
      first_param_index_ = i;
      found_first = true;
    } else if (param_names[i] == params_.second_param) {
      second_param_index_ = i;
      found_second = true;
    }
  }
  if (!found_first || !found_second) {
    throw std::runtime_error("Unknown parameter name in attraction_map configuration");
  }

  const auto var_names = dynamical_system_->get_variable_names();
  bool found_first_var = false;
  bool found_second_var = false;
  for (size_t i = 0; i < var_names.size(); ++i) {
    if (var_names[i] == params_.first_var) {
      first_var_index_ = i;
      found_first_var = true;
    } else if (var_names[i] == params_.second_var) {
      second_var_index_ = i;
      found_second_var = true;
    }
  }
  if (!found_first_var || !found_second_var) {
    throw std::runtime_error("Unknown variable name in attraction_map configuration");
  }
}

AttractorTraceConfig AttractionMapCalculator::trace_config() const {
  AttractorTraceConfig config;
  config.num_iter_transient = params_.num_iter_transient;
  config.num_iter_attractor = params_.num_iter_attractor;
  config.accuracy = params_.accuracy;
  config.period_verification_cycles = params_.period_verification_cycles;
  return config;
}

AttractionMapCalculator::CellResult AttractionMapCalculator::classify_attractors(
    const std::vector<double>& params) const {
  AttractorClassifier classifier(ncf_match_params(params_));
  const AttractorTraceConfig config = trace_config();
  const size_t grid_size = params_.var_steps;
  const double var1_step =
      (params_.first_var_max - params_.first_var_min) / (grid_size - 1);
  const double var2_step =
      (params_.second_var_max - params_.second_var_min) / (grid_size - 1);

  for (size_t i = 0; i < grid_size; ++i) {
    const double var2 = params_.second_var_min + i * var2_step;
    for (size_t j = 0; j < grid_size; ++j) {
      const double var1 = params_.first_var_min + j * var1_step;

      std::vector<double> initial = base_initial_conditions_;
      initial[first_var_index_] = var1;
      initial[second_var_index_] = var2;

      const auto trace =
          trace_attractor_fingerprint(*dynamical_system_, initial, params, config);
      if (!trace.converged) {
        continue;
      }
      classifier.classify(trace.fingerprint);
    }
  }
  classifier.consolidate();
  std::array<size_t, 3> counts{};
  const auto kinds = classifier.final_kinds();
  for (size_t label = 1; label < kinds.size(); ++label) {
    const auto kind = kinds[label];
    switch (kind) {
      case AttractorKind::FixedPoint:
        ++counts[0];
        break;
      case AttractorKind::Periodic:
        ++counts[1];
        break;
      case AttractorKind::NonPeriodic:
        ++counts[2];
        break;
    }
  }

  // Four bits per class count give a compact, stable categorical code. A count
  // above 15 is deliberately saturated; the UI labels it as "15+".
  const size_t composition = std::min(counts[0], size_t{15}) |
                             (std::min(counts[1], size_t{15}) << 4U) |
                             (std::min(counts[2], size_t{15}) << 8U);

  const auto class_periods = classifier.final_periods();
  std::vector<size_t> periods;
  size_t nonperiodic = 0;
  for (const size_t period : class_periods) {
    if (period == 0) {
      ++nonperiodic;
    } else {
      periods.push_back(period);
    }
  }
  std::sort(periods.begin(), periods.end());
  std::string period_signature;
  for (const size_t period : periods) {
    if (!period_signature.empty()) {
      period_signature += "+";
    }
    period_signature += std::to_string(period);
  }
  for (size_t index = 0; index < nonperiodic; ++index) {
    if (!period_signature.empty()) {
      period_signature += "+";
    }
    period_signature += "NP";
  }
  return {classifier.class_count(), composition, std::move(period_signature)};
}

void AttractionMapCalculator::run(ArtifactFile& artifact) {
  const size_t grid_size = params_.steps;
  artifact.create_main_grid(grid_size, grid_size);
  artifact.create_composition_grid(grid_size, grid_size);
  artifact.create_period_grid(grid_size, grid_size);
  artifact.write_frame(build_attraction_map_frame(params_, system_));

  const auto param_names = dynamical_system_->get_parameter_names();
  std::vector<double> params_base(param_names.size(), std::numeric_limits<double>::quiet_NaN());
  for (size_t i = 0; i < param_names.size(); ++i) {
    const auto it = params_.static_parameters.find(param_names[i]);
    if (it != params_.static_parameters.end()) {
      params_base[i] = it->second;
    }
  }

  const double param1_step =
      (params_.first_param_max - params_.first_param_min) / (grid_size - 1);
  const double param2_step =
      (params_.second_param_max - params_.second_param_min) / (grid_size - 1);

  ProgressReporter progress(grid_size);
  std::map<std::string, size_t> period_signature_ids;

#pragma omp parallel for
  for (size_t i = 0; i < grid_size; ++i) {
    std::vector<std::size_t> row(grid_size, 0);
    std::vector<std::size_t> composition_row(grid_size, 0);
    std::vector<std::string> period_signatures(grid_size);
    const double param2 = params_.second_param_min + i * param2_step;

    for (size_t j = 0; j < grid_size; ++j) {
      const double param1 = params_.first_param_min + j * param1_step;
      std::vector<double> params = params_base;
      params[first_param_index_] = param1;
      params[second_param_index_] = param2;
      const CellResult result = classify_attractors(params);
      row[j] = result.attractor_count;
      composition_row[j] = result.composition;
      period_signatures[j] = result.period_signature;
    }

#pragma omp critical
    {
      artifact.write_main_grid_row(i, row);
      artifact.write_composition_grid_row(i, composition_row);
      std::vector<std::size_t> period_row(grid_size, 0);
      for (size_t j = 0; j < grid_size; ++j) {
        const auto& signature = period_signatures[j];
        if (signature.empty()) {
          continue;
        }
        const auto it = period_signature_ids
                            .emplace(signature, period_signature_ids.size() + 1)
                            .first;
        period_row[j] = it->second;
      }
      artifact.write_period_grid_row(i, period_row);
      progress.advance(1);
    }
  }

  nlohmann::json period_categories = nlohmann::json::object();
  for (const auto& [signature, id] : period_signature_ids) {
    period_categories[std::to_string(id)] = signature;
  }
  artifact.write_period_grid_categories(period_categories.dump());

  artifact.mark_finished();
}

}  // namespace slicer
