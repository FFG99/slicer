#pragma once

#include <cstddef>
#include <string>
#include <vector>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/AttractorFingerprint.hpp"
#include "slicer/calculations/AttractionMapParams.hpp"
#include "slicer/systems/SystemBase.hpp"

namespace slicer {

class AttractionMapCalculator {
 public:
  AttractionMapCalculator(AttractionMapParams params, std::string system,
                          std::string systems_dir);

  void run(ArtifactFile& artifact);

 private:
  struct CellResult {
    size_t attractor_count = 0;
    size_t composition = 0;
    std::string period_signature;
  };

  void validate() const;
  void initialize_system();

  AttractorTraceConfig trace_config() const;

  CellResult classify_attractors(const std::vector<double>& params) const;

  AttractionMapParams params_;
  std::string system_;
  std::string systems_dir_;
  SystemPtr dynamical_system_;
  size_t first_param_index_ = 0;
  size_t second_param_index_ = 0;
  size_t first_var_index_ = 0;
  size_t second_var_index_ = 0;
  std::vector<double> base_initial_conditions_;
};

}  // namespace slicer
