#pragma once

#include <H5Cpp.h>

#include <chrono>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "slicer/artifact/CoordinateFrame.hpp"

namespace slicer {

class ArtifactFile {
 public:
  static ArtifactFile create(const std::string& filepath,
                             const std::string& calculation_type,
                             const std::string& system,
                             const nlohmann::json& parameters);

  explicit ArtifactFile(const std::string& filepath);

  void write_frame(const CoordinateFrame& frame);
  CoordinateFrame read_frame() const;

  void create_main_grid(size_t rows, size_t cols);
  void write_main_grid_row(size_t row, const std::vector<std::size_t>& values);
  void write_main_grid_col(size_t col, const std::vector<std::size_t>& values);
  std::vector<std::size_t> read_main_grid_row(size_t row) const;
  size_t grid_rows() const { return grid_rows_; }
  size_t grid_cols() const { return grid_cols_; }
  bool grid_is_float() const { return grid_is_float_; }

  void create_main_grid_float(size_t rows, size_t cols);
  void write_main_grid_row_float(size_t row, const std::vector<double>& values);
  void write_main_grid_col_float(size_t col, const std::vector<double>& values);

  void create_composition_grid(size_t rows, size_t cols);
  void write_composition_grid_row(size_t row, const std::vector<std::size_t>& values);
  void create_period_grid(size_t rows, size_t cols);
  void write_period_grid_row(size_t row, const std::vector<std::size_t>& values);
  void write_period_grid_categories(const std::string& categories_json);

  void create_trajectory(size_t points, size_t dim);
  void write_trajectory(const std::vector<double>& state, const std::vector<double>& t);
  size_t trajectory_points() const { return trajectory_points_; }
  size_t trajectory_dim() const { return trajectory_dim_; }
  bool has_grid() const { return has_grid_; }
  bool has_trajectory() const { return has_trajectory_; }

  nlohmann::json read_parameters() const;
  std::string calculation_type() const { return calculation_type_; }
  std::string system() const { return system_; }

  void mark_finished();

 private:
  ArtifactFile(std::unique_ptr<H5::H5File> file, bool writable);

  std::unique_ptr<H5::H5File> file_;
  H5::Group metadata_group_{};
  H5::Group parameters_group_{};
  H5::Group artifacts_group_{};
  H5::Group main_group_{};
  H5::DataSet values_dataset_{};
  H5::DataSet composition_dataset_{};
  H5::DataSet period_dataset_{};
  H5::DataSet state_dataset_{};
  H5::DataSet t_dataset_{};

  bool writable_ = false;
  bool has_grid_ = false;
  bool grid_is_float_ = false;
  bool has_trajectory_ = false;
  size_t grid_rows_ = 0;
  size_t grid_cols_ = 0;
  size_t trajectory_points_ = 0;
  size_t trajectory_dim_ = 0;
  std::string calculation_type_;
  std::string system_;
};

}  // namespace slicer
