"""Zerodha-style CSV to holdings rows."""

from __future__ import annotations

import csv
import io

ALIASES = {
    "symbol": "symbol",
    "instrument": "symbol",
    "tradingsymbol": "symbol",
    "qty": "qty",
    "qty.": "qty",
    "quantity": "qty",
    "avg. cost": "avg_cost",
    "avg cost": "avg_cost",
    "ltp": "last_price",
    "last": "last_price",
    "company name": "company_name",
    "name": "company_name",
}


def parse_holdings_csv(text: str) -> list[dict]:
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 2:
        return []
    header = [h.strip().lower() for h in rows[0]]
    keys = [ALIASES.get(h) for h in header]
    out: list[dict] = []
    for raw in rows[1:]:
        item = {"symbol": "", "company_name": "", "qty": 0.0, "avg_cost": 0.0, "last_price": 0.0}
        for key, val in zip(keys, raw):
            if not key:
                continue
            if key in {"qty", "avg_cost", "last_price"}:
                item[key] = float(str(val).replace(",", "").replace("₹", "") or 0)
            elif key == "symbol":
                item[key] = str(val).replace("-EQ", "").replace(".NS", "").strip().upper()
            else:
                item[key] = str(val).strip()
        if item["symbol"]:
            out.append(item)
    return out
