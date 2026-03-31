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

## Frontend migration checklist by file

The frontend migration should be executed file-by-file so API and type changes land coherently.

### `prover9-mace4-gui/src/components/RunPanel.tsx`

- Replace generic launch payload (`program`, free-form `options`) with program-specific request builders:
  - `buildProver9Request(...)`
  - `buildMace4Request(...)`
  - `buildProoftransRequest(...)`
  - `buildInterpformatRequest(...)`
  - `buildIsofilterRequest(...)`
- Add `delivery_mode` selector (`persisted` | `stream`) to launch UI.
- Replace integer process chaining input with explicit `InputSource` UI:
  - text input mode (`kind: "text"`)
  - file reference mode (`kind: "file"`)
  - persisted-run artifact mode (`kind: "process_output"` with `run_id` + `artifact`)
- Route submission to per-program endpoints (`/prover9`, `/mace4`, `/prooftrans`, `/interpformat`, `/isofilter`) instead of `/start`.
- Handle mode-specific launch acknowledgement:
  - persisted: store `run_id` and fetch lifecycle/output from retrieval endpoints
  - stream: open SSE channel and render live events

### `prover9-mace4-gui/src/components/ProcessDetails.tsx`

- Rename/retarget process detail state to run detail state (`process_id` -> `run_id`).
- Replace legacy output fetch (`/output/{process_id}`) with artifact/result fetch APIs (`/runs/{run_id}/output` or `/runs/{run_id}/artifacts/{artifact}`).
- Add artifact viewer sections keyed by stable artifact names (`stdout`, `stderr`, parsed/model payloads).
- Add stream-event renderer for `started`, `stdout`, `stderr`, `model`, `completed`, `error`.
- Remove assumptions about server file paths/PIDs from detail display.

### `prover9-mace4-gui/src/components/ProcessList.tsx`

- Swap list source from `GET /processes` to `GET /runs` (persisted history only).
- Render typed run summaries (program, lifecycle, created timestamp, delivery mode) instead of raw process IDs.
- Update row actions:
  - cancel -> `POST /runs/{run_id}/cancel`
  - delete -> `DELETE /runs/{run_id}`
- Remove pause/resume actions unless/until supported by future backend contracts.
- Include origin/provenance indicators when present (`input_origin`, `source_run_id`, `source_artifact`).

### `prover9-mace4-gui/src/App.tsx`

- Update top-level API client wiring for per-program launch methods and run retrieval APIs.
- Add shared run-store state that can track both persisted runs and active stream subscriptions.
- Centralize SSE lifecycle management (subscribe/unsubscribe/reconnect policy) for stream mode runs.
- Replace legacy process route/state naming with run naming consistently across navigation and props.

### `prover9-mace4-gui/src/types.ts`

- Replace generic `ProgramInput` and weak `options: Record<string, unknown>` shape with explicit per-program request types.
- Introduce tagged input-source union:
  - `TextInputSource`
  - `FileInputSource`
  - `ProcessOutputInputSource`
- Introduce shared enums/unions:
  - `DeliveryMode = "persisted" | "stream"`
  - `RunLifecycle`
  - `StreamEvent` discriminated union
- Replace `ProcessInfo`/`ProcessOutput` with run-oriented models (`RunSummary`, `RunStatus`, `RunArtifacts`, `RunOutcome`).
- Ensure all frontend API function signatures accept/return these typed contracts.

## Suggested migration order

1. Land `types.ts` contract changes first.
2. Update API client + `App.tsx` wiring.
3. Migrate `RunPanel.tsx` launch path to per-program endpoints.
4. Migrate `ProcessList.tsx` and `ProcessDetails.tsx` to run-based retrieval and controls.
5. Enable stream-mode UI and SSE rendering as final step.
