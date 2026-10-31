# backend/models — SQLite data layer (owner: Manu)

stdlib `sqlite3` only, no ORM. `db.py` gives connections (WAL on, dict rows); `schema.py`
holds every table + index and runs on first boot; `seed.py` inserts the clearly-marked
SEED fixture data (incl. the brand variant that adds 560 to price). Repository modules
own all SQL for their domain — routers never write SQL themselves.
