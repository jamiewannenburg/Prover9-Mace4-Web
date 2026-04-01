#!/usr/bin/env python3
"""Persisted run store and SSE stream fan-out for pyp9m4 runs."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from inspect import signature
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Union

from fastapi import HTTPException
import pyp9m4 as _pyp9m4

from p9m4_types import (
    DeliveryMode,
    FileInputSource,
    ProcessOutputInputSource,
    ProgramRunRequestV2,
    ProgramType,
    RunAccepted,
    RunSummary,
    StreamEvent,
    TextInputSource,
)
from pyp9m4_runner import Pyp9m4Runner


@dataclass
class _RunRecord:
    run_id: str
    program: ProgramType
    delivery_mode: DeliveryMode
    created_at: datetime
    lifecycle: str = "queued"
    name: Optional[str] = None
    completed_at: Optional[datetime] = None
    source_run_id: Optional[str] = None
    source_artifact: Optional[str] = None
    error: Optional[str] = None
    artifacts: Dict[str, Any] = field(default_factory=dict)


class DeliveryManager:
    def __init__(self) -> None:
        self._runner = Pyp9m4Runner()
        self._runs: Dict[str, _RunRecord] = {}
        self._tasks: Dict[str, asyncio.Task[None]] = {}
        self._job_handles: Dict[str, Any] = {}
        self._job_manager = getattr(_pyp9m4, "JobManager", None)
        self._job_manager = self._job_manager() if callable(self._job_manager) else None
        self._subscribers: Dict[str, List[asyncio.Queue[Optional[StreamEvent]]]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _normalize_lifecycle(raw: Any) -> str:
        value = str(raw or "").strip().lower()
        mapping = {
            "queued": "queued",
            "pending": "queued",
            "created": "queued",
            "running": "running",
            "in_progress": "running",
            "succeeded": "completed",
            "success": "completed",
            "completed": "completed",
            "done": "completed",
            "failed": "failed",
            "error": "failed",
            "timed_out": "failed",
            "timeout": "failed",
            "cancelled": "cancelled",
            "canceled": "cancelled",
        }
        return mapping.get(value, "queued")

    @staticmethod
    def _call_with_matching_kwargs(func: Callable[..., Any], **kwargs: Any) -> Any:
        params = signature(func).parameters
        payload = {k: v for k, v in kwargs.items() if k in params}
        return func(**payload)

    def _read_snapshot(self, run_id: str) -> Optional[Dict[str, Any]]:
        if self._job_manager is None:
            return None
        handle = self._job_handles.get(run_id, run_id)
        for name in ("get_snapshot", "snapshot", "status", "get_status"):
            method = getattr(self._job_manager, name, None)
            if method is None:
                continue
            try:
                value = self._call_with_matching_kwargs(method, run_id=run_id, job_id=run_id, handle=handle, job=handle)
            except Exception:
                continue
            if value is None:
                continue
            if hasattr(value, "to_dict"):
                return value.to_dict()
            if isinstance(value, dict):
                return value
        return None

    def _read_result(self, run_id: str) -> Optional[Dict[str, Any]]:
        if self._job_manager is None:
            return None
        handle = self._job_handles.get(run_id, run_id)
        for name in ("get_result", "result", "get_job_result"):
            method = getattr(self._job_manager, name, None)
            if method is None:
                continue
            try:
                value = self._call_with_matching_kwargs(method, run_id=run_id, job_id=run_id, handle=handle, job=handle)
            except Exception:
                continue
            if value is None:
                continue
            if hasattr(value, "to_dict"):
                value = value.to_dict()
            if isinstance(value, dict):
                return value
        return None

    def _sync_record_from_snapshot(self, run: _RunRecord) -> None:
        snap = self._read_snapshot(run.run_id)
        if not snap:
            return
        raw_state = snap.get("status", snap.get("state", snap.get("lifecycle")))
        lifecycle = self._normalize_lifecycle(raw_state)
        run.lifecycle = lifecycle
        if lifecycle in {"completed", "failed", "cancelled"} and run.completed_at is None:
            run.completed_at = datetime.utcnow()
        err = snap.get("error") or snap.get("detail") or snap.get("message")
        if isinstance(err, str) and err:
            run.error = err

    def _sync_persisted_artifacts_from_result(self, run: _RunRecord) -> None:
        if run.delivery_mode != DeliveryMode.PERSISTED:
            return
        result = self._read_result(run.run_id)
        if not isinstance(result, dict):
            return
        run.artifacts["result"] = result
        if "stdout" in result:
            run.artifacts["stdout"] = result.get("stdout", "")
        if "stderr" in result:
            run.artifacts["stderr"] = result.get("stderr", "")
        if "parsed" in result:
            run.artifacts["parsed"] = result.get("parsed")
        if "models" in result:
            run.artifacts["models"] = result.get("models", [])

    async def create_run(self, program: ProgramType, request: ProgramRunRequestV2) -> RunAccepted:
        run_id = uuid.uuid4().hex
        now = datetime.utcnow()
        record = _RunRecord(
            run_id=run_id,
            program=program,
            delivery_mode=request.delivery_mode,
            created_at=now,
            name=request.name,
        )
        async with self._lock:
            self._runs[run_id] = record

        task = asyncio.create_task(self._execute(record, request))
        async with self._lock:
            self._tasks[run_id] = task

        stream_url = f"/runs/{run_id}/stream" if request.delivery_mode == DeliveryMode.STREAM else None
        return RunAccepted(
            run_id=run_id,
            program=program,
            delivery_mode=request.delivery_mode,
            lifecycle="queued",
            created_at=now,
            stream_url=stream_url,
        )

    async def _resolve_input(self, request: ProgramRunRequestV2, record: _RunRecord) -> Union[str, bytes]:
        source = request.input
        if isinstance(source, TextInputSource):
            return source.text
        if isinstance(source, FileInputSource):
            path = Path(source.file_ref).expanduser().resolve()
            if not path.exists() or not path.is_file():
                raise HTTPException(status_code=400, detail="file_ref not found")
            return path.read_bytes()
        if isinstance(source, ProcessOutputInputSource):
            source_run = self._runs.get(source.run_id)
            if source_run is None:
                raise HTTPException(status_code=404, detail="source run not found")
            self._sync_record_from_snapshot(source_run)
            self._sync_persisted_artifacts_from_result(source_run)
            if source_run.delivery_mode != DeliveryMode.PERSISTED:
                raise HTTPException(status_code=400, detail="source run must be persisted")
            if source_run.lifecycle != "completed":
                raise HTTPException(status_code=400, detail="source run must be completed")
            if source.artifact not in source_run.artifacts:
                raise HTTPException(status_code=400, detail="unsupported source artifact")
            record.source_run_id = source.run_id
            record.source_artifact = source.artifact
            value = source_run.artifacts[source.artifact]
            if isinstance(value, str):
                return value
            return json.dumps(value)
        raise HTTPException(status_code=400, detail="unsupported input kind")

    async def _publish_event(self, record: _RunRecord, event: str, data: Any = None) -> None:
        payload = StreamEvent(
            event=event,
            run_id=record.run_id,
            program=record.program,
            lifecycle=record.lifecycle,
            data=data,
        )
        if event == "error" and isinstance(data, str):
            record.error = data
        if record.delivery_mode == DeliveryMode.PERSISTED:
            if event == "stdout" and isinstance(data, str):
                record.artifacts["stdout"] = f"{record.artifacts.get('stdout', '')}{data}"
            elif event == "stderr" and isinstance(data, str):
                record.artifacts["stderr"] = f"{record.artifacts.get('stderr', '')}{data}"
            elif event == "model":
                models = record.artifacts.setdefault("models", [])
                if isinstance(models, list):
                    models.append(data)
            elif event == "completed" and data is not None:
                record.artifacts["result"] = data
                if isinstance(data, dict):
                    if "stdout" in data:
                        record.artifacts["stdout"] = data.get("stdout", "")
                    if "stderr" in data:
                        record.artifacts["stderr"] = data.get("stderr", "")
                    if "parsed" in data:
                        record.artifacts["parsed"] = data.get("parsed")
                    if "models" in data:
                        record.artifacts["models"] = data.get("models", [])

        subscribers = self._subscribers.get(record.run_id, [])
        for queue in list(subscribers):
            await queue.put(payload)

    async def _run_via_job_manager(
        self,
        record: _RunRecord,
        input_data: Union[str, bytes],
        options: Optional[Dict[str, Union[str, int, float, bool]]],
    ) -> Optional[Dict[str, Any]]:
        if self._job_manager is None:
            return None

        async def _exec() -> Dict[str, Any]:
            return await self._runner.arun_program(record.program, input_data, options=options)

        # Try common submit/start method names used by async job managers.
        for method_name in ("submit", "create", "start", "enqueue"):
            method = getattr(self._job_manager, method_name, None)
            if method is None:
                continue
            try:
                params = signature(method).parameters
                kwargs: Dict[str, Any] = {}
                if "run_id" in params:
                    kwargs["run_id"] = record.run_id
                if "job_id" in params:
                    kwargs["job_id"] = record.run_id
                if "name" in params:
                    kwargs["name"] = record.name or record.run_id
                if "coroutine" in params:
                    kwargs["coroutine"] = _exec()
                elif "coro" in params:
                    kwargs["coro"] = _exec()
                elif "task" in params:
                    kwargs["task"] = _exec()
                elif "fn" in params:
                    kwargs["fn"] = _exec
                elif "func" in params:
                    kwargs["func"] = _exec
                handle = self._call_with_matching_kwargs(
                    method,
                    **kwargs,
                )
                self._job_handles[record.run_id] = handle
                break
            except Exception:
                continue
        else:
            return None

        # Poll snapshots until terminal; then fetch result from manager.
        while True:
            self._sync_record_from_snapshot(record)
            if record.lifecycle in {"completed", "failed", "cancelled"}:
                break
            await asyncio.sleep(0.05)
        return self._read_result(record.run_id)

    async def _execute(self, record: _RunRecord, request: ProgramRunRequestV2) -> None:
        try:
            input_data = await self._resolve_input(request, record)
            record.lifecycle = "running"
            await self._publish_event(record, "started", {"name": record.name})

            result = await self._run_via_job_manager(record, input_data, request.options)
            if result is None:
                result = await self._runner.arun_program(record.program, input_data, options=request.options)
            if "stdout" in result and result["stdout"]:
                await self._publish_event(record, "stdout", result["stdout"])
            if "stderr" in result and result["stderr"]:
                await self._publish_event(record, "stderr", result["stderr"])
            if "models" in result and isinstance(result["models"], list):
                for model in result["models"]:
                    await self._publish_event(record, "model", model)

            record.lifecycle = "completed"
            record.completed_at = datetime.utcnow()
            await self._publish_event(record, "completed", result)
        except asyncio.CancelledError:
            record.lifecycle = "cancelled"
            record.completed_at = datetime.utcnow()
            await self._publish_event(record, "error", "run cancelled")
            raise
        except HTTPException as exc:
            record.lifecycle = "failed"
            record.completed_at = datetime.utcnow()
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            await self._publish_event(record, "error", detail)
        except Exception as exc:  # pylint: disable=broad-except
            record.lifecycle = "failed"
            record.completed_at = datetime.utcnow()
            await self._publish_event(record, "error", str(exc))
        finally:
            for queue in self._subscribers.get(record.run_id, []):
                await queue.put(None)

    def _to_summary(self, run: _RunRecord) -> RunSummary:
        self._sync_record_from_snapshot(run)
        return RunSummary(
            run_id=run.run_id,
            name=run.name,
            program=run.program,
            delivery_mode=run.delivery_mode,
            lifecycle=run.lifecycle,
            created_at=run.created_at,
            completed_at=run.completed_at,
            source_run_id=run.source_run_id,
            source_artifact=run.source_artifact,
            error=run.error,
        )

    def list_runs(self) -> List[RunSummary]:
        return [self._to_summary(run) for run in self._runs.values() if run.delivery_mode == DeliveryMode.PERSISTED]

    def get_run(self, run_id: str) -> _RunRecord:
        run = self._runs.get(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="run not found")
        return run

    def get_summary(self, run_id: str) -> RunSummary:
        return self._to_summary(self.get_run(run_id))

    def get_artifact(self, run_id: str, artifact: str) -> Any:
        run = self.get_run(run_id)
        self._sync_record_from_snapshot(run)
        self._sync_persisted_artifacts_from_result(run)
        if run.delivery_mode != DeliveryMode.PERSISTED:
            raise HTTPException(status_code=400, detail="artifacts are available only for persisted runs")
        if artifact not in run.artifacts:
            raise HTTPException(status_code=404, detail="artifact not found")
        return run.artifacts[artifact]

    def delete_run(self, run_id: str) -> Dict[str, str]:
        run = self.get_run(run_id)
        self._sync_record_from_snapshot(run)
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        if self._job_manager is not None:
            for name in ("cancel", "cancel_job", "delete", "remove"):
                method = getattr(self._job_manager, name, None)
                if method is None:
                    continue
                try:
                    self._call_with_matching_kwargs(method, run_id=run_id, job_id=run_id, handle=self._job_handles.get(run_id))
                    break
                except Exception:
                    continue
        self._runs.pop(run_id, None)
        self._tasks.pop(run_id, None)
        self._job_handles.pop(run_id, None)
        self._subscribers.pop(run_id, None)
        return {"status": "success", "message": f"run {run_id} deleted ({run.program.value})"}

    def cancel_run(self, run_id: str) -> Dict[str, str]:
        run = self.get_run(run_id)
        self._sync_record_from_snapshot(run)
        if self._job_manager is not None:
            for name in ("cancel", "cancel_job", "stop"):
                method = getattr(self._job_manager, name, None)
                if method is None:
                    continue
                try:
                    self._call_with_matching_kwargs(method, run_id=run_id, job_id=run_id, handle=self._job_handles.get(run_id))
                    run.lifecycle = "cancelled"
                    return {"status": "success", "message": f"run {run_id} cancelled"}
                except Exception:
                    continue
        task = self._tasks.get(run_id)
        if task is None or task.done():
            raise HTTPException(status_code=400, detail="run is not active")
        task.cancel()
        run.lifecycle = "cancelled"
        return {"status": "success", "message": f"run {run_id} cancelled"}

    async def stream_events(self, run_id: str) -> AsyncIterator[str]:
        _ = self.get_run(run_id)
        queue: asyncio.Queue[Optional[StreamEvent]] = asyncio.Queue()
        subscribers = self._subscribers.setdefault(run_id, [])
        subscribers.append(queue)
        try:
            # Initial keepalive for clients that wait for first event.
            yield ": connected\n\n"
            while True:
                event = await queue.get()
                if event is None:
                    yield "event: end\ndata: {}\n\n"
                    break
                yield f"event: {event.event}\ndata: {event.model_dump_json()}\n\n"
        finally:
            subscribers = self._subscribers.get(run_id, [])
            if queue in subscribers:
                subscribers.remove(queue)
