#include "slicer/io/JobSpec.hpp"

#include <fstream>
#include <stdexcept>

namespace slicer {

JobSpec parse_job_spec_file(const std::string& path) {
  std::ifstream input(path);
  if (!input) {
    throw std::runtime_error("Failed to open job file: " + path);
  }

  nlohmann::json json;
  input >> json;

  JobSpec job;
  job.calculation_type = json.at("calculation_type").get<std::string>();
  job.system = json.at("system").get<std::string>();
  job.parameters = json.at("parameters");
  if (json.contains("parent_run_id")) {
    job.parent_run_id = json.at("parent_run_id").get<std::string>();
  }
  return job;
}

}  // namespace slicer
