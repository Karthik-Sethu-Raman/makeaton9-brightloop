"""T02 — backend/models tests (owner: Manu). Real temp-file SQLite DBs, no server."""
from backend.models import db as mdb
from backend.models import schema as mschema


def test_schema_creates_every_board_table(tmp_path):
    conn = mdb.connect(tmp_path / "t.db")
    mschema.init_db(conn)
    mschema.init_db(conn)  # idempotent: second boot must not raise
    names = {
        r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")
    }
    for table in mschema.BOARD_TABLES:
        assert table in names, f"missing table {table}"
    idx = {
        r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'")
    }
    assert {"ix_subs_state", "ix_invoices_state", "ix_payments_invoice"} <= idx
    conn.close()


def test_schema_enums_reject_bad_values(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    conn.execute("INSERT INTO customers (name,email,created_at) VALUES ('X','x@x.test','2026-10-31')")
    conn.execute(
        "INSERT INTO plans (name,billing_frequency,price,created_at)"
        " VALUES ('P','monthly',100,'2026-10-31')")
    import pytest
    with pytest.raises(Exception):  # bad state violates CHECK (FK target exists)
        conn.execute(
            "INSERT INTO subscriptions (number,customer_id,plan_id,state,start_date,created_at)"
            " VALUES ('SUB-9999',1,1,'zombie','2026-10-31','2026-10-31')")
    conn.close()



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
