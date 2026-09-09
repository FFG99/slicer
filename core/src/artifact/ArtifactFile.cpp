#include "slicer/artifact/ArtifactFile.hpp"

#include <stdexcept>

namespace slicer {

namespace {

H5::StrType variable_string_type(size_t length) {
  H5::StrType type(H5::PredType::C_S1, length + 1);
  type.setCset(H5T_CSET_UTF8);
  return type;
}

void write_string_attr(H5::Group& group, const char* name, const std::string& value) {
  const H5::StrType type = variable_string_type(value.size());
  H5::Attribute attr = group.createAttribute(name, type, H5S_SCALAR);
  attr.write(type, value.c_str());
}

std::string read_string_attr(const H5::Group& group, const char* name) {
  H5::Attribute attr = group.openAttribute(name);
  H5::StrType type = attr.getStrType();
  std::vector<char> buffer(type.getSize());
  attr.read(type, buffer.data());
  return std::string(buffer.data());
}

}  // namespace

ArtifactFile ArtifactFile::create(const std::string& filepath,
                                const std::string& calculation_type,
                                const std::string& system,
                                const nlohmann::json& parameters) {
  auto file = std::make_unique<H5::H5File>(filepath, H5F_ACC_TRUNC);
  ArtifactFile artifact(std::move(file), true);
  artifact.calculation_type_ = calculation_type;
  artifact.system_ = system;

  artifact.metadata_group_ = artifact.file_->createGroup("/metadata");
  artifact.parameters_group_ = artifact.file_->createGroup("/parameters");
  artifact.artifacts_group_ = artifact.file_->createGroup("/artifacts");
  artifact.main_group_ = artifact.artifacts_group_.createGroup("main");

  write_string_attr(artifact.metadata_group_, "version", "1.0");
  write_string_attr(artifact.metadata_group_, "calculation_type", calculation_type);
  write_string_attr(artifact.metadata_group_, "system", system);

  const H5::StrType author_type = variable_string_type(6);
  H5::Attribute author_attr =
      artifact.metadata_group_.createAttribute("author", author_type, H5S_SCALAR);
  author_attr.write(author_type, "slicer");

  const int64_t created_at =
      std::chrono::system_clock::now().time_since_epoch().count();
  H5::Attribute created_attr = artifact.metadata_group_.createAttribute(
      "created_at", H5::PredType::NATIVE_INT64, H5S_SCALAR);
  created_attr.write(H5::PredType::NATIVE_INT64, &created_at);

  const std::string params_json = parameters.dump();
  write_string_attr(artifact.parameters_group_, "json", params_json);

  return artifact;
}

ArtifactFile::ArtifactFile(const std::string& filepath)
    : ArtifactFile(std::make_unique<H5::H5File>(filepath, H5F_ACC_RDONLY), false) {
  metadata_group_ = file_->openGroup("/metadata");
  parameters_group_ = file_->openGroup("/parameters");
  artifacts_group_ = file_->openGroup("/artifacts");
  main_group_ = artifacts_group_.openGroup("main");

  calculation_type_ = read_string_attr(metadata_group_, "calculation_type");
  system_ = read_string_attr(metadata_group_, "system");

  if (H5Lexists(main_group_.getId(), "values", H5P_DEFAULT) > 0) {
    values_dataset_ = main_group_.openDataSet("values");
    has_grid_ = true;
    const H5::DataSpace space = values_dataset_.getSpace();
    const int rank = space.getSimpleExtentNdims();
    hsize_t dims[2] = {0, 0};
    if (rank >= 1) {
      space.getSimpleExtentDims(dims);
      grid_rows_ = dims[0];
      grid_cols_ = rank >= 2 ? dims[1] : 0;
    }
    const H5T_class_t type_class = values_dataset_.getDataType().getClass();
    grid_is_float_ = type_class == H5T_FLOAT;
  }

  if (H5Lexists(main_group_.getId(), "state", H5P_DEFAULT) > 0) {
    state_dataset_ = main_group_.openDataSet("state");
    has_trajectory_ = true;
    const H5::DataSpace state_space = state_dataset_.getSpace();
    hsize_t dims[2] = {0, 0};
    state_space.getSimpleExtentDims(dims);
    trajectory_points_ = dims[0];
    trajectory_dim_ = dims[1];
  }

  if (H5Lexists(main_group_.getId(), "t", H5P_DEFAULT) > 0) {
    t_dataset_ = main_group_.openDataSet("t");
  }
}

ArtifactFile::ArtifactFile(std::unique_ptr<H5::H5File> file, bool writable)
    : file_(std::move(file)), writable_(writable) {}

void ArtifactFile::write_frame(const CoordinateFrame& frame) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  const std::string json = nlohmann::json(frame).dump();
  write_string_attr(metadata_group_, "frame", json);
}

CoordinateFrame ArtifactFile::read_frame() const {
  const std::string json = read_string_attr(metadata_group_, "frame");
  return nlohmann::json::parse(json).get<CoordinateFrame>();
}

void ArtifactFile::create_main_grid(size_t rows, size_t cols) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  grid_rows_ = rows;
  grid_cols_ = cols;
  has_grid_ = true;
  grid_is_float_ = false;

  const hsize_t dims[2] = {rows, cols};
  H5::DataSpace space(2, dims);
  values_dataset_ =
      main_group_.createDataSet("values", H5::PredType::NATIVE_UINT64, space);

  std::vector<std::uint64_t> initial(rows * cols, 0);
  values_dataset_.write(initial.data(), H5::PredType::NATIVE_UINT64);
}

void ArtifactFile::create_main_grid_float(size_t rows, size_t cols) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  grid_rows_ = rows;
  grid_cols_ = cols;
  has_grid_ = true;
  grid_is_float_ = true;

  const hsize_t dims[2] = {rows, cols};
  H5::DataSpace space(2, dims);
  values_dataset_ =
      main_group_.createDataSet("values", H5::PredType::NATIVE_DOUBLE, space);

  std::vector<double> initial(rows * cols, 0.0);
  values_dataset_.write(initial.data(), H5::PredType::NATIVE_DOUBLE);
}

void ArtifactFile::write_main_grid_row(size_t row, const std::vector<std::size_t>& values) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (grid_is_float_) {
    throw std::runtime_error("Grid stores float values; use write_main_grid_row_float");
  }
  if (row >= grid_rows_) {
    throw std::out_of_range("Grid row out of range");
  }
  if (values.size() != grid_cols_) {
    throw std::invalid_argument("Row size does not match grid columns");
  }

  std::vector<std::uint64_t> buffer(values.begin(), values.end());
  const hsize_t start[2] = {row, 0};
  const hsize_t count[2] = {1, grid_cols_};
  H5::DataSpace file_space = values_dataset_.getSpace();
  file_space.selectHyperslab(H5S_SELECT_SET, count, start);
  H5::DataSpace mem_space(2, count);
  values_dataset_.write(buffer.data(), H5::PredType::NATIVE_UINT64, mem_space,
                        file_space);
}

void ArtifactFile::write_main_grid_col(size_t col, const std::vector<std::size_t>& values) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (grid_is_float_) {
    throw std::runtime_error("Grid stores float values; use write_main_grid_col_float");
  }
  if (col >= grid_cols_) {
    throw std::out_of_range("Grid column out of range");
  }
  if (values.size() != grid_rows_) {
    throw std::invalid_argument("Column size does not match grid rows");
  }

  for (size_t row = 0; row < grid_rows_; ++row) {
    const hsize_t start[2] = {row, col};
    const hsize_t count[2] = {1, 1};
    const std::uint64_t value = values[row];
    H5::DataSpace file_space = values_dataset_.getSpace();
    file_space.selectHyperslab(H5S_SELECT_SET, count, start);
    H5::DataSpace mem_space(2, count);
    values_dataset_.write(&value, H5::PredType::NATIVE_UINT64, mem_space, file_space);
  }
}

void ArtifactFile::write_main_grid_row_float(size_t row, const std::vector<double>& values) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (!grid_is_float_) {
    throw std::runtime_error("Grid stores integer values; use write_main_grid_row");
  }
  if (row >= grid_rows_) {
    throw std::out_of_range("Grid row out of range");
  }
  if (values.size() != grid_cols_) {
    throw std::invalid_argument("Row size does not match grid columns");
  }

  const hsize_t start[2] = {row, 0};
  const hsize_t count[2] = {1, grid_cols_};
  H5::DataSpace file_space = values_dataset_.getSpace();
  file_space.selectHyperslab(H5S_SELECT_SET, count, start);
  H5::DataSpace mem_space(2, count);
  values_dataset_.write(values.data(), H5::PredType::NATIVE_DOUBLE, mem_space, file_space);
}

void ArtifactFile::write_main_grid_col_float(size_t col, const std::vector<double>& values) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (!grid_is_float_) {
    throw std::runtime_error("Grid stores integer values; use write_main_grid_col");
  }
  if (col >= grid_cols_) {
    throw std::out_of_range("Grid column out of range");
  }
  if (values.size() != grid_rows_) {
    throw std::invalid_argument("Column size does not match grid rows");
  }

  for (size_t row = 0; row < grid_rows_; ++row) {
    const hsize_t start[2] = {row, col};
    const hsize_t count[2] = {1, 1};
    const double value = values[row];
    H5::DataSpace file_space = values_dataset_.getSpace();
    file_space.selectHyperslab(H5S_SELECT_SET, count, start);
    H5::DataSpace mem_space(2, count);
    values_dataset_.write(&value, H5::PredType::NATIVE_DOUBLE, mem_space, file_space);
  }
}

void ArtifactFile::create_composition_grid(size_t rows, size_t cols) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (!has_grid_ || rows != grid_rows_ || cols != grid_cols_) {
    throw std::invalid_argument("Composition grid must match the main grid dimensions");
  }

  const hsize_t dims[2] = {rows, cols};
  H5::DataSpace space(2, dims);
  composition_dataset_ =
      main_group_.createDataSet("composition", H5::PredType::NATIVE_UINT64, space);
  std::vector<std::uint64_t> initial(rows * cols, 0);
  composition_dataset_.write(initial.data(), H5::PredType::NATIVE_UINT64);
}

void ArtifactFile::write_composition_grid_row(
    size_t row, const std::vector<std::size_t>& values) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (composition_dataset_.getId() < 0) {
    throw std::runtime_error("Composition grid has not been created");
  }
  if (row >= grid_rows_) {
    throw std::out_of_range("Composition grid row out of range");
  }
  if (values.size() != grid_cols_) {
    throw std::invalid_argument("Row size does not match composition grid columns");
  }

  std::vector<std::uint64_t> buffer(values.begin(), values.end());
  const hsize_t start[2] = {row, 0};
  const hsize_t count[2] = {1, grid_cols_};
  H5::DataSpace file_space = composition_dataset_.getSpace();
  file_space.selectHyperslab(H5S_SELECT_SET, count, start);
  H5::DataSpace mem_space(2, count);
  composition_dataset_.write(buffer.data(), H5::PredType::NATIVE_UINT64, mem_space,
                             file_space);
}

void ArtifactFile::create_period_grid(size_t rows, size_t cols) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (!has_grid_ || rows != grid_rows_ || cols != grid_cols_) {
    throw std::invalid_argument("Period grid must match the main grid dimensions");
  }

  const hsize_t dims[2] = {rows, cols};
  H5::DataSpace space(2, dims);
  period_dataset_ = main_group_.createDataSet("periods", H5::PredType::NATIVE_UINT64, space);
  std::vector<std::uint64_t> initial(rows * cols, 0);
  period_dataset_.write(initial.data(), H5::PredType::NATIVE_UINT64);
}

void ArtifactFile::write_period_grid_row(size_t row,
                                         const std::vector<std::size_t>& values) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (period_dataset_.getId() < 0) {
    throw std::runtime_error("Period grid has not been created");
  }
  if (row >= grid_rows_) {
    throw std::out_of_range("Period grid row out of range");
  }
  if (values.size() != grid_cols_) {
    throw std::invalid_argument("Row size does not match period grid columns");
  }

  std::vector<std::uint64_t> buffer(values.begin(), values.end());
  const hsize_t start[2] = {row, 0};
  const hsize_t count[2] = {1, grid_cols_};
  H5::DataSpace file_space = period_dataset_.getSpace();
  file_space.selectHyperslab(H5S_SELECT_SET, count, start);
  H5::DataSpace mem_space(2, count);
  period_dataset_.write(buffer.data(), H5::PredType::NATIVE_UINT64, mem_space,
                        file_space);
}

void ArtifactFile::write_period_grid_categories(const std::string& categories_json) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  write_string_attr(main_group_, "periods_categories", categories_json);
}

std::vector<std::size_t> ArtifactFile::read_main_grid_row(size_t row) const {
  if (row >= grid_rows_) {
    throw std::out_of_range("Grid row out of range");
  }

  const hsize_t start[2] = {row, 0};
  const hsize_t count[2] = {1, grid_cols_};
  H5::DataSpace file_space = values_dataset_.getSpace();
  file_space.selectHyperslab(H5S_SELECT_SET, count, start);
  H5::DataSpace mem_space(2, count);

  std::vector<std::uint64_t> buffer(grid_cols_);
  values_dataset_.read(buffer.data(), H5::PredType::NATIVE_UINT64, mem_space,
                       file_space);
  return std::vector<std::size_t>(buffer.begin(), buffer.end());
}

nlohmann::json ArtifactFile::read_parameters() const {
  const std::string json = read_string_attr(parameters_group_, "json");
  return nlohmann::json::parse(json);
}

void ArtifactFile::create_trajectory(size_t points, size_t dim) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  trajectory_points_ = points;
  trajectory_dim_ = dim;
  has_trajectory_ = true;

  const hsize_t state_dims[2] = {points, dim};
  H5::DataSpace state_space(2, state_dims);
  state_dataset_ =
      main_group_.createDataSet("state", H5::PredType::NATIVE_DOUBLE, state_space);

  const hsize_t t_dims[1] = {points};
  H5::DataSpace t_space(1, t_dims);
  t_dataset_ = main_group_.createDataSet("t", H5::PredType::NATIVE_DOUBLE, t_space);
}

void ArtifactFile::write_trajectory(const std::vector<double>& state,
                                    const std::vector<double>& t) {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  if (!has_trajectory_) {
    throw std::runtime_error("Trajectory dataset not created");
  }
  if (state.size() != trajectory_points_ * trajectory_dim_) {
    throw std::invalid_argument("State buffer size mismatch");
  }
  if (t.size() != trajectory_points_) {
    throw std::invalid_argument("Time buffer size mismatch");
  }

  const hsize_t state_dims[2] = {trajectory_points_, trajectory_dim_};
  H5::DataSpace state_space(2, state_dims);
  state_dataset_.write(state.data(), H5::PredType::NATIVE_DOUBLE, state_space, state_space);

  const hsize_t t_dims[1] = {trajectory_points_};
  H5::DataSpace t_space(1, t_dims);
  t_dataset_.write(t.data(), H5::PredType::NATIVE_DOUBLE, t_space, t_space);
}

void ArtifactFile::mark_finished() {
  if (!writable_) {
    throw std::runtime_error("Artifact file is not writable");
  }
  const int finished = 1;
  H5::Attribute attr =
      main_group_.createAttribute("finished", H5::PredType::NATIVE_INT, H5S_SCALAR);
  attr.write(H5::PredType::NATIVE_INT, &finished);
}

}  // namespace slicer
