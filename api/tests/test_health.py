from fastapi.testclient import TestClient

from slicer_api.main import app


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database_configured"] is True


def test_student_api_has_no_accounts_or_security_requirements():
    from slicer_api.main import app
    from slicer_api.models import Base

    schema = app.openapi()
    assert 'users' not in Base.metadata.tables
    assert 'owner_id' not in Base.metadata.tables['runs'].columns
    assert not schema.get('components', {}).get('securitySchemes')
    assert not any(path.startswith('/admin') for path in schema['paths'])
    assert 'patch' not in schema['paths']['/systems/{system_name}']
