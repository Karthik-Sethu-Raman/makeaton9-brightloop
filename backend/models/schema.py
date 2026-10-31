"""schema.py — every table + index for Cadence (owner: Manu, T02).

Money columns are rupees REAL (rounded 2dp at write time); dates are ISO
'YYYY-MM-DD' text; timestamps ISO 'YYYY-MM-DD HH:MM:SS' IST. CHECK constraints
encode the statement's enums so bad states can't enter through raw SQL either.
Numbering: subscriptions SUB-0001..., invoices INV-0001... — continuation is
always MAX(numeric suffix)+1 so seeds and live rows share one sequence.
"""
from __future__ import annotations

import sqlite3

SCHEMA_SQL = """
-- infra: first-boot flag (seeded=1) and future key/values
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    phone      TEXT,
    kind       TEXT NOT NULL DEFAULT 'business',  -- business | individual
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                  -- pbkdf2_sha256$iters$salt$hash
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','staff','customer')),
    customer_id   INTEGER REFERENCES customers(id), -- portal users only
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('software','addon','service')),
    sales_price REAL NOT NULL CHECK (sales_price >= 0),
    cost_price  REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    notes       TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    attribute   TEXT NOT NULL,                    -- e.g. 'brand'
    value       TEXT NOT NULL,                    -- e.g. 'Odoo'
    price_delta REAL NOT NULL DEFAULT 0,          -- rupees added to sales price
    created_at  TEXT NOT NULL,
    UNIQUE (product_id, attribute, value)
);

CREATE TABLE IF NOT EXISTS plans (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('daily','weekly','monthly','yearly')),
    price             REAL NOT NULL CHECK (price >= 0),
    min_quantity      INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
    available_from    TEXT,
    available_to      TEXT,
    close_policy      TEXT NOT NULL DEFAULT 'renew'
                      CHECK (close_policy IN ('auto_close','early_close','pause','renew')),
    created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id               INTEGER PRIMARY KEY,
    number           TEXT NOT NULL UNIQUE,        -- SUB-0001...
    customer_id      INTEGER NOT NULL REFERENCES customers(id),
    plan_id          INTEGER NOT NULL REFERENCES plans(id),
    state            TEXT NOT NULL DEFAULT 'draft'
                     CHECK (state IN ('draft','quotation','confirmed','active','closed')),
    start_date       TEXT NOT NULL,
    expiry_date      TEXT,
    payment_terms    TEXT NOT NULL DEFAULT 'Net 15',
    next_billing_date TEXT,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_lines (
    id              INTEGER PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    product_id      INTEGER NOT NULL REFERENCES products(id),
    variant_id      INTEGER REFERENCES product_variants(id),
    description     TEXT NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      REAL NOT NULL CHECK (unit_price >= 0),
    tax_percent     REAL NOT NULL DEFAULT 0,
    amount          REAL NOT NULL                  -- qty * unit_price (pre-tax)
);

CREATE TABLE IF NOT EXISTS invoices (
    id              INTEGER PRIMARY KEY,
    number          TEXT NOT NULL UNIQUE,          -- INV-0001...
    subscription_id INTEGER REFERENCES subscriptions(id),
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    issue_date      TEXT NOT NULL,
    due_date        TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','confirmed','paid','cancelled')),
    subtotal        REAL NOT NULL DEFAULT 0,
    discount_total  REAL NOT NULL DEFAULT 0,
    tax_total       REAL NOT NULL DEFAULT 0,
    total           REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id              INTEGER PRIMARY KEY,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id),
    description     TEXT NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      REAL NOT NULL CHECK (unit_price >= 0),
    tax_percent     REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    amount          REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id         INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    method     TEXT NOT NULL CHECK (method IN ('upi','card','bank_transfer','cash','cheque')),
    amount     REAL NOT NULL CHECK (amount > 0),
    paid_on    TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discounts (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('fixed','percentage')),
    value         REAL NOT NULL CHECK (value >= 0),
    min_purchase  REAL,
    min_quantity  INTEGER,
    start_date    TEXT NOT NULL,
    end_date      TEXT,
    usage_limit   INTEGER,                         -- NULL = unlimited
    used_count    INTEGER NOT NULL DEFAULT 0,
    scope         TEXT NOT NULL CHECK (scope IN ('product','subscription')),
    product_id    INTEGER REFERENCES products(id), -- product scope only
    active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tax_rules (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    rate_percent REAL NOT NULL CHECK (rate_percent >= 0),
    product_type TEXT,                             -- NULL = applies to everything
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotation_templates (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    plan_id    INTEGER REFERENCES plans(id),
    valid_days INTEGER NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotation_template_lines (
    id          INTEGER PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES quotation_templates(id),
    product_id  INTEGER NOT NULL REFERENCES products(id),
    variant_id  INTEGER REFERENCES product_variants(id),
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS ix_subs_state       ON subscriptions(state);
CREATE INDEX IF NOT EXISTS ix_subs_customer    ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS ix_subs_billing     ON subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS ix_sublines_sub     ON subscription_lines(subscription_id);
CREATE INDEX IF NOT EXISTS ix_invoices_state   ON invoices(state);
CREATE INDEX IF NOT EXISTS ix_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS ix_invlines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS ix_payments_invoice ON payments(invoice_id);
"""

# Tables the taskboard T02 names explicitly — tests assert every one exists.
BOARD_TABLES = (
    "customers", "users", "products", "product_variants", "plans",
    "subscriptions", "subscription_lines", "invoices", "invoice_lines",
    "payments", "discounts", "tax_rules", "quotation_templates",
)


def init_db(conn: sqlite3.Connection) -> None:
    """Apply SCHEMA_SQL (idempotent — CREATE ... IF NOT EXISTS)."""
    conn.executescript(SCHEMA_SQL)
    conn.commit()
