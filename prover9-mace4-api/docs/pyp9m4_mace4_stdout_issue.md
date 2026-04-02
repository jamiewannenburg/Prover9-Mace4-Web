# Mace4: no subprocess `stdout` / `stderr` in `pyp9m4.arun`

## What you see

With **`pyp9m4` as shipped in conda env `p9m4_gui`** (e.g. `0.1.0`), `await pyp9m4.arun("mace4", ...)` returns a `ToolRunEnvelope` whose **`raw` field is always `None`**. The envelope only carries `program` and `mace4_models` (see `to_dict()` omitting `raw` when unset).

So **process `stdout` and `stderr` are not available** through the same path as Prover9, where `raw` holds `ToolRunResult` with `stdout` / `stderr`.

Upstream implementation (same idea in current `pyp9m4`):

```python
# toolkit.py — mace4 branch
return ToolRunEnvelope(program="mace4", raw=None, mace4_models=tuple(models))
```

Prover9 attaches `raw=_tool_run_from_prover9(...)`.

## Reproduce (conda)

Use the **`p9m4_gui`** environment (where `pyp9m4` is installed):

```powershell
conda activate p9m4_gui
cd path\to\prover9-mace4-api
python scripts\probe_mace4_envelope.py
```

Expect: `raw in dict: False`, **`stdout len: 0`** from `Pyp9m4Runner` (no process capture in the envelope).

End-to-end API (async client so background runs are not blocked):

```powershell
python scripts\check_mace4_api_artifacts.py
```

Example output shape: **`len(stdout): 0`** while `models` / `models_text` depend on whether Mace4 finds models for that input.

## This API’s behavior

- **`stdout` / `stderr`**: whatever `pyp9m4` puts in `envelope["raw"]` (usually **empty strings** for Mace4 `arun`).
- **`models`**: structured models from `mace4_models`.
- **`models_text`**: joined `interpretation(...)` text from those models (for display when there is no process stdout).

Use **`models_text`** (or **`models`**) when **`stdout`** is empty after a Mace4 run.

## Suggested upstream issue

Ask `pyp9m4` to attach a `ToolRunResult` (or equivalent) for Mace4 `arun`, e.g. accumulate stdout/stderr while streaming `amodels`, so **`arun` is uniform with Prover9 and pipeline tools**.
