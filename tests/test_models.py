"""T02 — backend/models tests (owner: Manu). Real temp-file SQLite DBs, no server."""
from backend.models import db as mdb


def test_connect_gives_dict_rows_and_wal(tmp_path):
    conn = mdb.connect(tmp_path / "t.db")
    conn.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO probe (name) VALUES ('Brightloop')")
    row = conn.execute("SELECT id, name FROM probe").fetchone()
    assert row == {"id": 1, "name": "Brightloop"}  # dict, not tuple
    mode = conn.execute("PRAGMA journal_mode").fetchone()["journal_mode"]
    assert mode == "wal"
    conn.close()


def test_db_path_env_override(tmp_path, monkeypatch):
    target = tmp_path / "override.db"
    monkeypatch.setenv("CADENCE_DB", str(target))
    assert mdb.db_path() == target
    conn = mdb.connect()  # no explicit path -> env honoured, dirs created
    assert target.parent.is_dir()
    conn.close()
