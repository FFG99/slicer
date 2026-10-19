import pytest

from slicer_api.computation_manager import ComputationValidationError, _validate_parameters


@pytest.mark.parametrize("name", ["starting_point", "initial_conditions"])
def test_one_dimensional_map_rejects_hidden_coordinate(name):
    definition = {"parameters": [{"name": name, "type": "array", "required": True}]}
    system = {"variables": ["x"]}
    _validate_parameters(definition, {name: [0.1]}, system)
    with pytest.raises(ComputationValidationError, match="expected 1, got 2"):
        _validate_parameters(definition, {name: [0.1, 0.0]}, system)
