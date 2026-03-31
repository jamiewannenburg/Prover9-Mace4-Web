# API/GUI Migration: Current -> Per-Program Contracts

This document maps the current generic API/models to the new per-program request/response contracts.

## Endpoint mapping

| Current endpoint | Current contract | New endpoint/contract |
| --- | --- | --- |
| `POST /start` | `ProgramInput` (`program`, `input`, `name`, `options`) -> `{ process_id }` | Replaced by program-specific endpoints: `POST /prover9`, `POST /mace4`, `POST /prooftrans`, `POST /interpformat`, `POST /isofilter` with typed per-program request models and typed run-accepted response |
| `GET /status/{process_id}` | `ProcessInfo` | Persisted mode: `GET /runs/{run_id}/status` with shared run lifecycle schema; stream mode: status implied through stream events |
| `GET /processes` | `List[int]` | Persisted mode: `GET /runs` returning list of typed run summaries (not bare IDs) |
| `GET /output/{process_id}` | `ProcessOutput` (`output`, pagination metadata) | Persisted mode: `GET /runs/{run_id}/artifacts/{artifact}` or `GET /runs/{run_id}/output`; stream mode: `stdout`/`stderr`/`model` events over SSE |
| `GET /download/{process_id}` | `StreamingResponse` plain-text file | Persisted mode: `GET /runs/{run_id}/download/{artifact}` |
| `DELETE /process/{process_id}` | `{ status, message }` | `DELETE /runs/{run_id}` with typed deletion response |
| `POST /kill/{process_id}` | `{ status, message }` | `POST /runs/{run_id}/cancel` with typed cancellation response |
| `POST /pause/{process_id}` / `POST /resume/{process_id}` | process control | Not carried forward in async facade contract (pause/resume removed) |
| `POST /parse` | `ParseInput` -> `ParseOutput` | Kept as helper endpoint unless folded into program routes |
| `POST /generate_input` | `GuiOutput` -> `str` | Kept as helper endpoint unless folded into program routes |

## Request model mapping

### Current generic launch model

`ProgramInput`:
- `program: ProgramType`
- `input: Union[str, int]`
- `name: Optional[str]`
- `options: Optional[Dict]`

### New per-program launch models

The single `ProgramInput` is split into one model per program with explicit options and shared delivery controls:

- `Prover9RunRequest`
- `Mace4RunRequest`
- `ProoftransRunRequest`
- `InterpformatRunRequest`
- `IsofilterRunRequest`

Each new model should include:
- `input: InputSource` (tagged union)
  - `kind: "text"` + `text`
  - `kind: "file"` + `file_ref`
  - `kind: "process_output"` + `run_id` + `artifact` (+ optional transform hints)
- `options: <ProgramSpecificOptions>` (typed, no free-form dict)
- `delivery_mode: "persisted" | "stream"`
- `name: Optional[str]`

### Options mapping

| Current shape | New shape |
| --- | --- |
| `options: Optional[Dict]` (program-dependent, weakly typed) | Program-specific typed options per endpoint (aligned with `pyp9m4.options.*CliOptions`) |
| `input: int` meaning "use process output" | `input.kind = "process_output"` + explicit `run_id`/`artifact` |
| `input: str` | `input.kind = "text"` + `text` |

## Response model mapping

### Current launch response

`POST /start` returns:

```json
{ "process_id": 123456789 }
```

### New launch responses

The response is mode-dependent:

- persisted mode:

```json
{
  "run_id": "uuid-or-stable-id",
  "program": "prover9",
  "delivery_mode": "persisted",
  "lifecycle": "queued",
  "created_at": "2026-03-31T12:00:00Z"
}
```

- stream mode:

```json
{
  "run_id": "uuid-or-stable-id",
  "program": "prover9",
  "delivery_mode": "stream",
  "stream_url": "/runs/uuid-or-stable-id/stream"
}
```

### Current process state model

`ProcessInfo` currently mixes runtime internals and API-facing fields:
- runtime internals (`pid`, `fin_path`, `fout_path`, `ferr_path`)
- lifecycle (`state`, `exit_code`, `error`)
- payload/meta (`stats`, `resource_usage`, `options`, `input`)

### New run state/results split

Replace `ProcessInfo` with API-facing models:
- `RunSummary` (list/status-safe metadata)
- `RunLifecycle` (queued/running/completed/failed/cancelled)
- `RunOutcome` (exit status, typed program result, diagnostics)
- `RunArtifacts` (stable artifact keys for chaining/downstream retrieval)
- `StreamEvent` union for SSE (`started`, `stdout`, `stderr`, `model`, `completed`, `error`)

Do not expose server file paths or OS process IDs in public contracts.

## Program enum mapping

| Current `ProgramType` | New route |
| --- | --- |
| `PROVER9` | `POST /prover9` |
| `MACE4` | `POST /mace4` |
| `PROOFTRANS` | `POST /prooftrans` |
| `INTERPFORMAT` | `POST /interpformat` |
| `ISOFILTER` | `POST /isofilter` |
| `ISOFILTER2` | No dedicated route in current redesign scope (deprecate or fold into `isofilter` options if needed) |

## Compatibility and breaking changes

- Breaking: remove generic `POST /start` in favor of per-program endpoints.
- Breaking: remove integer-based implicit chaining (`input: int`) and require explicit `process_output` references.
- Breaking: replace untyped `options: Dict` with typed, program-specific options.
- Breaking: process lifecycle APIs move from `process_id` and file-backed outputs to `run_id` and artifact-based retrieval/streaming.
