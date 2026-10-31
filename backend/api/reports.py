"""reports.py — /api/reports/finance (owner: Karthik, T35).

The ONE report the demo walks (T34's fuller Reports API was DROPPED by the
14:16 TRIAGE — this endpoint ships inside T35's own scope). Feeds the Overview
screen's two new blocks (frontend/pages/overview.js):
  GET /api/reports/finance?days=30
    -> { window_days, window_label,
         revenue_series: [{date: 'YYYY-MM-DD', total: 15590.00}, ...]  # contiguous
                           IST calendar days, zeros included (honest zero baseline),
                           oldest first, ending today
         series_total,   # sum of the window — equals the KPI over the same window
         overdue: [invoice rows, worst due-date first, max 5],   # list shape ==
                    the /api/invoices list contract (T22 page reuses the columns)
         overdue_count } # for "View all (N)"

Dynamic source (D1): every figure is a fresh SQL read — the simulator's landing
payments move tomorrow's fetch. Revenue = payments grouped by calendar day
(seed + simulator both write ISO dates into paid_on; substr(1,10) is the day).
Reuse, not re-implementation: the overdue verdict is T21's law
(backend.api.invoices._enrich) so overview and invoices can never disagree on
what "overdue" means.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from backend.api.invoices import LIST_SQL, _enrich
from backend.models import connect

router = APIRouter(prefix="/api/reports", tags=["reports"])

IST = ZoneInfo("Asia/Kolkata")

MIN_DAYS, MAX_DAYS, DEFAULT_DAYS = 7, 120, 30


@router.get("/finance")
def finance(days: int = DEFAULT_DAYS) -> dict:
    days = min(max(days, MIN_DAYS), MAX_DAYS)  # sane window, clamped not rejected
    conn = connect()
    try:
        today = datetime.now(IST).date()
        start = today - timedelta(days=days - 1)

        # payments per calendar day, one SQL read (indexed table, small N)
        by_day = {
            row["d"]: round(float(row["t"] or 0.0), 2)
            for row in conn.execute(
                "SELECT substr(paid_on, 1, 10) AS d, ROUND(SUM(amount), 2) AS t"
                " FROM payments GROUP BY substr(paid_on, 1, 10)"
            )
        }
        series = []
        for i in range(days):
            day = (start + timedelta(days=i)).isoformat()
            series.append({"date": day, "total": by_day.get(day, 0.0)})

        # overdue rows: T21's verdict, worst (oldest due) first, 4-6 for DESIGN's
        # overview-list rule; the count carries the full N for "View all (N)".
        rows = [_enrich(r) for r in conn.execute(LIST_SQL + " ORDER BY i.id DESC")]
        overdue = [r for r in rows if r.get("overdue")]
        overdue.sort(key=lambda r: (str(r.get("due_date") or ""), r["id"]))

        return {
            "window_days": days,
            "window_label": f"Last {days} days",
            "revenue_series": series,
            "series_total": round(sum(p["total"] for p in series), 2),
            "overdue": overdue[:5],
            "overdue_count": len(overdue),
        }
    finally:
        conn.close()
