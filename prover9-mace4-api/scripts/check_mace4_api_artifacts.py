#!/usr/bin/env python3
"""POST /mace4 (persisted) and print stdout vs models_text — use conda env `p9m4_gui`."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

_API_DIR = Path(__file__).resolve().parent.parent
os.environ.setdefault("P9M4_DATA_DIR", str(_API_DIR / "tests" / "data"))
sys.path.insert(0, str(_API_DIR))

from api_server import app, delivery_manager  # noqa: E402

SAMPLE = _API_DIR / "samples" / "Non-Equality" / "Mace4" / "EC-counterexample.in"


async def main() -> None:
    delivery_manager._runs.clear()
    delivery_manager._tasks.clear()
    delivery_manager._job_handles.clear()
    delivery_manager._subscribers.clear()

    text = SAMPLE.read_text(encoding="utf-8", errors="replace")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(
            "/mace4",
            json={
                "input": {"kind": "text", "text": text},
                "delivery_mode": "persisted",
                "options": {"domain_size": 2, "max_seconds": 30, "max_models": 4},
            },
        )
        print("POST /mace4", r.status_code)
        body = r.json()
        print(json.dumps(body, indent=2))
        run_id = body["run_id"]
        for _ in range(400):
            s = await client.get(f"/runs/{run_id}/status")
            life = s.json().get("lifecycle")
            if life in ("completed", "failed", "cancelled"):
                break
            await asyncio.sleep(0.05)
        art = await client.get(f"/runs/{run_id}/artifacts")
        print("GET /artifacts", art.status_code)
        payload = art.json().get("artifacts") or {}
        out = payload.get("stdout") or ""
        mt = payload.get("models_text") or ""
        print("len(stdout):", len(out))
        print("len(models_text):", len(mt))
        res = payload.get("result") or {}
        print("result.models_found:", res.get("models_found"))


if __name__ == "__main__":
    asyncio.run(main())
