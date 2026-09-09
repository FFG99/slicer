import pytest
from pydantic import ValidationError
from slicer_api.routes.bifurcation import BifurcationRequest

@pytest.mark.parametrize("change", [
    {"escape_threshold": 0}, {"escape_threshold": float("nan")},
    {"steps": 1}, {"num_iter_transient": -1}, {"num_iter_attractor": 0},
    {"start": {"a": 1.}, "end": {"a": 1.}},
    {"start": {"a": float("inf")}},
])
def test_rejects_invalid_tree(change):
    data=dict(system="test", start={"a":0.},end={"a":2.},initial_conditions=[.2],variable="x")
    with pytest.raises(ValidationError):
        BifurcationRequest(**{**data,**change})


def test_accepts_four_million_points_from_reported_request():
    request = BifurcationRequest(
        system="sine_map", start={"k":3.168928179824561,"b":0.6298211348684211},
        end={"k":6.437705592105263,"b":0.4507435581140351},
        variable="y", initial_conditions=[.2,.2], steps=400,
        num_iter_transient=10000, num_iter_attractor=10000, inherit=True,
    )
    assert request.steps * request.num_iter_attractor == 4000000


def test_large_tree_is_not_rejected_by_work_limits():
    request = BifurcationRequest(
        system="test", start={"a":0.}, end={"a":2.},
        initial_conditions=[.2], variable="x", steps=5000,
        num_iter_transient=2000000, num_iter_attractor=20000,
    )
    assert request.steps == 5000
    assert request.num_iter_transient == 2000000
    assert request.num_iter_attractor == 20000


def test_hdf5_roundtrip_preserves_steps_states_and_settings():
    import io
    import h5py
    from slicer_api.routes.bifurcation import TreeExport, export_hdf5
    payload = TreeExport(system="test", variable="y", variables=["x","y"],
        parameters={"start":{"a":1.},"end":{"a":2.},"initial_conditions":[.2,.3],"inherit":True},
        samples=[{"t":0.,"values":[2.,4.],"states":[[1.,2.],[3.,4.]],"diverged":False},
                 {"t":1.,"values":[],"states":[],"diverged":True}])
    with h5py.File(io.BytesIO(export_hdf5(payload).body),"r") as file:
        assert file["samples/offsets"][:].tolist() == [0,2,2]
        assert file["samples/states"][:].tolist() == [[1.,2.],[3.,4.]]
        assert file["samples/values"][:].tolist() == [2.,4.]
        assert file["samples/diverged"][:].tolist() == [False,True]
        assert list(file.attrs["variables"]) == ["x","y"]
        assert file["parameters/start"].attrs["a"] == 1.
        assert file["parameters"].attrs["inherit"]
    payload.samples = payload.samples[1:]
    with h5py.File(io.BytesIO(export_hdf5(payload).body),"r") as file:
        assert file["samples/states"].shape == (0,2)
