#!/usr/bin/env python3
"""Probe pyp9m4 Mace4 envelope: use conda env `p9m4_gui` (see docs/pyp9m4_mace4_stdout_issue.md)."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pyp9m4
from pyp9m4.options import Mace4CliOptions

# Repo root: prover9-mace4-api/
_API_DIR = Path(__file__).resolve().parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from p9m4_types import ProgramType  # noqa: E402
from pyp9m4_runner import Pyp9m4Runner  # noqa: E402

SAMPLE = _API_DIR / "samples" / "Non-Equality" / "Mace4" / "EC-counterexample.in"


async def main() -> None:
    text = SAMPLE.read_text(encoding="utf-8", errors="replace")
    opts = pyp9m4.cli_options_from_nested_dict(
        Mace4CliOptions,
        {"domain_size": 2, "max_seconds": 30, "max_models": 2},
    )
    env = await pyp9m4.arun("mace4", text, options=opts)
    d = env.to_dict()
    print("pyp9m4 version:", getattr(pyp9m4, "__version__", "?"))
    print("envelope keys:", sorted(d.keys()))
    print("raw in dict:", "raw" in d)
    raw = d.get("raw")
    print("raw value:", raw)
    models = d.get("mace4_models") or []
    print("mace4_models count:", len(models))

    runner = Pyp9m4Runner()
    payload = await runner.arun_program(ProgramType.MACE4, text, options={"domain_size": 2, "max_seconds": 30, "max_models": 2})
    print("--- Pyp9m4Runner legacy payload ---")
    print("stdout len:", len(payload.get("stdout") or ""))
    print("stderr len:", len(payload.get("stderr") or ""))
    print("models_found:", payload.get("models_found"))
    print("models_text len:", len(payload.get("models_text") or ""))


if __name__ == "__main__":
    asyncio.run(main())
