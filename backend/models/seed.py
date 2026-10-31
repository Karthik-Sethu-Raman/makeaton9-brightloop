"""seed.py — SEED fixture for first boot (owner: Manu, T02).

*** SEED DATA ONLY — never served as static JSON. Rows live in SQLite like any
live row; the simulator (T03) mutates them from the moment the app boots. ***

seed_if_empty() runs once (guarded by app_meta.seeded) so restarts and the
livefeed thread never duplicate it. Dates are relative to boot day so the demo
always shows a live month: active subs due today (billing-day scene), an
overdue invoice (chasing scene), a paid invoice with matched payments.
Demo logins (fixture creds, not secrets): admin@brightloop.test / Admin@12345,
staff@brightloop.test / Staff@12345, shop@aralamstores.test / Shop@12345.
"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .passwords import hash_password

IST = ZoneInfo("Asia/Kolkata")


def _now() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")


def _d(offset_days: int) -> str:
    return (date.today() + timedelta(days=offset_days)).isoformat()


def seed_if_empty(conn: sqlite3.Connection) -> bool:
    """Insert fixture rows once. Returns True if this call did the seeding."""
    if conn.execute(
        "SELECT value FROM app_meta WHERE key='seeded'"
    ).fetchone():
        return False

    now = _now()
    cur = conn.cursor()

    # ---- SEED customers ------------------------------------------------
    cur.executemany(
        "INSERT INTO customers (name,email,phone,kind,created_at) VALUES (?,?,?,?,?)",
        [
            ("Aralam Stores", "shop@aralamstores.test", "+91 98470 11122", "business", now),
            ("Kochi Books LLP", "accounts@kochibooks.test", "+91 98470 33344", "business", now),
            ("Trivandrum Logistics Pvt Ltd", "finance@tvllogistics.test", "+91 98470 55566", "business", now),
        ],
    )

    # ---- SEED users (roles drive RBAC scenes; customer user sees portal) ----
    cur.executemany(
        "INSERT INTO users (email,password_hash,name,role,customer_id,created_at)"
        " VALUES (?,?,?,?,?,?)",
        [
            ("admin@brightloop.test", hash_password("Admin@12345"), "Brightloop Admin", "admin", None, now),
            ("staff@brightloop.test", hash_password("Staff@12345"), "Priya (Staff)", "staff", None, now),
            ("shop@aralamstores.test", hash_password("Shop@12345"), "Aralam Stores Owner", "customer", 1, now),
        ],
    )

    # ---- SEED products + variants (statement: Odoo brand adds 560) ----
    cur.executemany(
        "INSERT INTO products (name,type,sales_price,cost_price,notes,created_at)"
        " VALUES (?,?,?,?,?,?)",
        [
            ("Cadence Books", "software", 999.0, 180.0, "Accounting & billing suite", now),
            ("Cadence Inventory", "software", 1499.0, 320.0, "Stock and warehouse module", now),
            ("Priority Support", "addon", 499.0, 60.0, "4-hour response SLA", now),
            ("Onboarding Visit", "service", 2500.0, 900.0, "One-day on-site setup", now),
        ],
    )
    cur.executemany(
        "INSERT INTO product_variants (product_id,attribute,value,price_delta,created_at)"
        " VALUES (?,?,?,?,?)",
        [
            (1, "brand", "Odoo", 560.0, now),        # the statement's +₹560 example
            (1, "brand", "Tally", 0.0, now),
            (2, "brand", "Odoo", 560.0, now),
            (2, "tier", "Multi-warehouse", 400.0, now),
        ],
    )

    # ---- SEED plans (every frequency + every close policy present) ----
    cur.executemany(
        "INSERT INTO plans (name,billing_frequency,price,min_quantity,available_from,"
        " available_to,close_policy,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [
            ("Books Monthly", "monthly", 999.0, 1, _d(-90), None, "renew", now),
            ("Books Yearly", "yearly", 9990.0, 1, _d(-90), _d(365), "auto_close", now),
            ("Inventory Monthly", "monthly", 1499.0, 1, _d(-60), None, "pause", now),
            ("Support Weekly", "weekly", 499.0, 3, _d(-30), None, "early_close", now),
            ("Books Daily Trial", "daily", 99.0, 1, _d(-7), _d(60), "auto_close", now),
        ],
    )

    # ---- SEED subscriptions across the state machine ----
    # Odoo-brand line price = 999 + 560 = 1559 (variant delta folded into unit price).
    cur.executemany(
        "INSERT INTO subscriptions (number,customer_id,plan_id,state,start_date,"
        " expiry_date,payment_terms,next_billing_date,created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        [
            ("SUB-0001", 1, 1, "active", _d(-35), _d(330), "Net 15", _d(0), now),   # due today
            ("SUB-0002", 2, 3, "active", _d(-20), _d(345), "Net 15", _d(0), now),   # due today
            ("SUB-0003", 3, 2, "active", _d(-200), _d(165), "Net 30", _d(10), now),
            ("SUB-0004", 2, 4, "quotation", _d(5), _d(370), "Net 15", None, now),
            ("SUB-0005", 3, 5, "draft", _d(0), _d(30), "Net 15", None, now),
            ("SUB-0006", 1, 1, "closed", _d(-400), _d(-40), "Net 15", None, now),
        ],
    )
    cur.executemany(
        "INSERT INTO subscription_lines (subscription_id,product_id,variant_id,"
        " description,quantity,unit_price,tax_percent,amount) VALUES (?,?,?,?,?,?,?,?)",
        [
            (1, 1, 1, "Cadence Books (brand: Odoo)", 3, 1559.0, 18.0, 4677.0),
            (2, 2, None, "Cadence Inventory", 2, 1499.0, 18.0, 2998.0),
            (2, 3, None, "Priority Support", 3, 499.0, 18.0, 1497.0),
            (3, 1, 1, "Cadence Books (brand: Odoo)", 10, 1559.0, 18.0, 15590.0),
            (4, 3, None, "Priority Support", 5, 499.0, 18.0, 2495.0),
            (5, 1, 2, "Cadence Books (brand: Tally)", 1, 999.0, 18.0, 999.0),
        ],
    )

    # ---- SEED invoices: paid / overdue / outstanding / draft ----
    # INV-0001 paid in full; INV-0002 due yesterday => OVERDUE for the chase scene.
    cur.executemany(
        "INSERT INTO invoices (number,subscription_id,customer_id,issue_date,due_date,"
        " state,subtotal,discount_total,tax_total,total,created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
            ("INV-0001", 1, 1, _d(-35), _d(-20), "paid",
             4677.0, 0.0, 841.86, 5518.86, now),
            ("INV-0002", 2, 2, _d(-31), _d(-1), "confirmed",
             4495.0, 0.0, 809.1, 5304.1, now),
            ("INV-0003", 3, 3, _d(-10), _d(20), "confirmed",
             15590.0, 1559.0, 2525.58, 16556.58, now),   # 10% multi-seat discount applied
            # Draft issued 4 days ago (not today): T20's UNIQUE(sub, issue_day)
            # index must let the billing run invoice SUB-0002's due day even
            # while a draft for that sub exists — a same-day draft would block it.
            ("INV-0004", 2, 2, _d(-4), _d(11), "draft",
             4495.0, 0.0, 809.1, 5304.1, now),
        ],
    )
    cur.executemany(
        "INSERT INTO invoice_lines (invoice_id,description,quantity,unit_price,"
        " tax_percent,discount_amount,amount) VALUES (?,?,?,?,?,?,?)",
        [
            (1, "Cadence Books (brand: Odoo)", 3, 1559.0, 18.0, 0.0, 4677.0),
            (2, "Cadence Inventory", 2, 1499.0, 18.0, 0.0, 2998.0),
            (2, "Priority Support", 3, 499.0, 18.0, 0.0, 1497.0),
            (3, "Cadence Books (brand: Odoo)", 10, 1559.0, 18.0, 1559.0, 15590.0),
            (4, "Cadence Inventory", 2, 1499.0, 18.0, 0.0, 2998.0),
            (4, "Priority Support", 3, 499.0, 18.0, 0.0, 1497.0),
        ],
    )
    cur.executemany(
        "INSERT INTO payments (invoice_id,method,amount,paid_on,note,created_at)"
        " VALUES (?,?,?,?,?,?)",
        [
            (1, "upi", 5518.86, _d(-22), "Full settlement - UPI ref 44821", now),
            (2, "bank_transfer", 2000.0, _d(-5), "Part payment against INV-0002", now),
            (3, "card", 8000.0, _d(-3), "Advance on yearly contract", now),
        ],
    )

    # ---- SEED discounts + tax rules ----
    cur.executemany(
        "INSERT INTO discounts (name,kind,value,min_purchase,min_quantity,start_date,"
        " end_date,usage_limit,used_count,scope,product_id,active)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            ("Multi-seat 10%", "percentage", 10.0, None, 5, _d(-30), _d(60), None,
             3, "subscription", None, 1),
            ("Launch offer ₹500 off", "fixed", 500.0, 5000.0, None, _d(-60), _d(30), 50,
             12, "product", 1, 1),
            ("Expired festive 5%", "percentage", 5.0, None, None, _d(-200), _d(-100), None,
             40, "subscription", None, 1),  # expired: engine must NOT re-apply
        ],
    )
    cur.executemany(
        "INSERT INTO tax_rules (name,rate_percent,product_type,created_at)"
        " VALUES (?,?,?,?)",
        [
            ("GST 18% — software", 18.0, "software", now),
            ("GST 18% — addon", 18.0, "addon", now),
            ("GST 12% — service", 12.0, "service", now),
        ],
    )

    # ---- SEED quotation template (sales-rep scene) ----
    cur.execute(
        "INSERT INTO quotation_templates (name,plan_id,valid_days,created_at)"
        " VALUES (?,?,?,?)",
        ("Large Retailer Bundle", 2, 30, now),
    )
    cur.executemany(
        "INSERT INTO quotation_template_lines (template_id,product_id,variant_id,quantity)"
        " VALUES (?,?,?,?)",
        [
            (1, 1, 1, 10),  # Cadence Books, Odoo brand, 10 seats
            (1, 2, None, 2),
            (1, 3, None, 5),
        ],
    )

    cur.execute(
        "INSERT INTO app_meta (key,value) VALUES ('seeded','1')")
    conn.commit()
    return True
