#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace slicer {

struct JobSpec {
  std::string calculation_type;
  std::string system;
  nlohmann::json parameters;
  std::string parent_run_id;
};

JobSpec parse_job_spec_file(const std::string& path);

}  // namespace slicer
