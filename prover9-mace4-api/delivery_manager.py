#!/usr/bin/env python3
"""Persisted run store and SSE stream fan-out for pyp9m4 runs."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Union

from fastapi import HTTPException

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
        self._subscribers: Dict[str, List[asyncio.Queue[Optional[StreamEvent]]]] = {}
        self._lock = asyncio.Lock()

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

    async def _execute(self, record: _RunRecord, request: ProgramRunRequestV2) -> None:
        try:
            input_data = await self._resolve_input(request, record)
            record.lifecycle = "running"
            await self._publish_event(record, "started", {"name": record.name})

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
        if run.delivery_mode != DeliveryMode.PERSISTED:
            raise HTTPException(status_code=400, detail="artifacts are available only for persisted runs")
        if artifact not in run.artifacts:
            raise HTTPException(status_code=404, detail="artifact not found")
        return run.artifacts[artifact]

    def delete_run(self, run_id: str) -> Dict[str, str]:
        run = self.get_run(run_id)
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        self._runs.pop(run_id, None)
        self._tasks.pop(run_id, None)
        self._subscribers.pop(run_id, None)
        return {"status": "success", "message": f"run {run_id} deleted ({run.program.value})"}

    def cancel_run(self, run_id: str) -> Dict[str, str]:
        run = self.get_run(run_id)
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
