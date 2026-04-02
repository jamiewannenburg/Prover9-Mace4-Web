import asyncio
import os
import sys
import time
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

# directory of this file
test_dir = Path(__file__).parent
# api directory
dir = test_dir.parent
# change python path to the api directory
sys.path.append(str(dir.absolute()))

# set the data directory
os.environ["P9M4_DATA_DIR"] = str((test_dir / "data").absolute())

# Minimal local stub for test environments where pyp9m4 is unavailable.
if "pyp9m4" not in sys.modules:
    pyp9m4_mod = types.ModuleType("pyp9m4")
    mace4_facade_mod = types.ModuleType("pyp9m4.mace4_facade")
    prover9_facade_mod = types.ModuleType("pyp9m4.prover9_facade")
    resolver_mod = types.ModuleType("pyp9m4.resolver")
    runner_mod = types.ModuleType("pyp9m4.runner")
    options_mod = types.ModuleType("pyp9m4.options")

    class _DummyTool:
        def __init__(self, *args, **kwargs):
            pass

        async def arun(self, *args, **kwargs):
            return {}

        def start_arun(self, *args, **kwargs):
            return None

        def start_amodels(self, *args, **kwargs):
            return None

    class _DummyResolver:
        def resolve(self, name):
            return name

    class _DummyRunner:
        async def run(self, invocation):
            return invocation

    class _DummyInvocation:
        def __init__(self, *args, **kwargs):
            self.argv = kwargs.get("argv", ())
            self.status = type("Status", (), {"value": "completed"})()
            self.exit_code = 0
            self.stdout = ""
            self.stderr = ""
            self.duration_s = 0.0

    class _DummyCliOptions:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def to_argv(self):
            return []

    mace4_facade_mod.Mace4 = _DummyTool
    prover9_facade_mod.Prover9 = _DummyTool
    resolver_mod.BinaryResolver = _DummyResolver
    runner_mod.AsyncToolRunner = _DummyRunner
    runner_mod.SubprocessInvocation = _DummyInvocation
    options_mod.InterpformatCliOptions = _DummyCliOptions
    options_mod.IsofilterCliOptions = _DummyCliOptions
    options_mod.Mace4CliOptions = _DummyCliOptions
    options_mod.ProofTransCliOptions = _DummyCliOptions
    options_mod.Prover9CliOptions = _DummyCliOptions

    sys.modules["pyp9m4"] = pyp9m4_mod
    sys.modules["pyp9m4.mace4_facade"] = mace4_facade_mod
    sys.modules["pyp9m4.prover9_facade"] = prover9_facade_mod
    sys.modules["pyp9m4.resolver"] = resolver_mod
    sys.modules["pyp9m4.runner"] = runner_mod
    sys.modules["pyp9m4.options"] = options_mod

from api_server import app, delivery_manager
from p9m4_types import DeliveryMode, ProgramType
from pyp9m4_runner import Pyp9m4Runner, _mace4_stdout_from_models


class TestApiContracts(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        delivery_manager._runs.clear()
        delivery_manager._tasks.clear()
        delivery_manager._job_handles.clear()
        delivery_manager._subscribers.clear()

    def tearDown(self):
        for task in list(delivery_manager._tasks.values()):
            if not task.done():
                task.cancel()

    def _wait_for_completion(self, run_id: str, timeout: float = 2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = self.client.get(f"/runs/{run_id}/status")
            self.assertEqual(status.status_code, 200)
            lifecycle = status.json()["lifecycle"]
            if lifecycle in {"completed", "failed", "cancelled"}:
                return status.json()
            time.sleep(0.01)
        self.fail(f"Run {run_id} did not finish within {timeout}s")

    def _text_input(self):
        return {"kind": "text", "text": "formulas(assumptions). end_of_list."}

    def test_program_endpoints_and_old_start_removed(self):
        with patch.object(
            delivery_manager._runner,
            "arun_program",
            new=AsyncMock(return_value={"stdout": "ok", "stderr": "", "parsed": {"x": 1}, "models": []}),
        ):
            for endpoint in ["/prover9", "/mace4", "/prooftrans", "/interpformat", "/isofilter"]:
                response = self.client.post(
                    endpoint,
                    json={
                        "input": self._text_input(),
                        "delivery_mode": "persisted",
                        "options": {"max_seconds": 1},
                    },
                )
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertIsNotNone(body["run_id"])
                self.assertEqual(body["delivery_mode"], DeliveryMode.PERSISTED.value)
                self.assertEqual(body["lifecycle"], "queued")

        removed = self.client.post("/start", json={"program": "prover9", "input": "x"})
        self.assertEqual(removed.status_code, 404)

    def test_persisted_run_artifacts_and_download_contract(self):
        payload = {"stdout": "THEOREM PROVED", "stderr": "", "parsed": {"proofs": 1}, "models": ["m1"]}
        with patch.object(delivery_manager._runner, "arun_program", new=AsyncMock(return_value=payload)):
            response = self.client.post("/prover9", json={"input": self._text_input(), "delivery_mode": "persisted"})
            self.assertEqual(response.status_code, 200)
            run_id = response.json()["run_id"]
            done_status = self._wait_for_completion(run_id)
            self.assertEqual(done_status["lifecycle"], "completed")

        runs = self.client.get("/runs")
        self.assertEqual(runs.status_code, 200)
        self.assertTrue(any(run["run_id"] == run_id for run in runs.json()))

        artifacts = self.client.get(f"/runs/{run_id}/artifacts")
        self.assertEqual(artifacts.status_code, 200)
        artifact_payload = artifacts.json()["artifacts"]
        self.assertEqual(artifact_payload["stdout"], "THEOREM PROVED")
        self.assertEqual(artifact_payload["parsed"]["proofs"], 1)

        stdout_artifact = self.client.get(f"/runs/{run_id}/artifacts/stdout")
        self.assertEqual(stdout_artifact.status_code, 200)
        self.assertEqual(stdout_artifact.json()["content"], "THEOREM PROVED")

        download = self.client.get(f"/runs/{run_id}/download/stdout")
        self.assertEqual(download.status_code, 200)
        self.assertIn("attachment;", download.headers.get("content-disposition", ""))
        self.assertIn("THEOREM PROVED", download.text)

        delete_response = self.client.delete(f"/runs/{run_id}")
        self.assertEqual(delete_response.status_code, 200)

    def test_stream_mode_contract_and_no_artifacts(self):
        async def _slow_result(*_args, **_kwargs):
            await asyncio.sleep(0.05)
            return {"stdout": "streamed-output", "stderr": "", "parsed": {"k": "v"}, "models": []}

        with patch.object(delivery_manager._runner, "arun_program", new=AsyncMock(side_effect=_slow_result)):
            response = self.client.post("/mace4", json={"input": self._text_input(), "delivery_mode": "stream"})
            self.assertEqual(response.status_code, 200)
            run_id = response.json()["run_id"]
            self.assertEqual(response.json()["stream_url"], f"/runs/{run_id}/stream")
            self.assertEqual(response.json()["delivery_mode"], "stream")

        artifacts = self.client.get(f"/runs/{run_id}/artifacts")
        self.assertEqual(artifacts.status_code, 400)

    def test_failure_status_propagates_error_details(self):
        with patch.object(
            delivery_manager._runner,
            "arun_program",
            new=AsyncMock(side_effect=RuntimeError("backend failed")),
        ):
            response = self.client.post("/prover9", json={"input": self._text_input(), "delivery_mode": "persisted"})
            self.assertEqual(response.status_code, 200)
            run_id = response.json()["run_id"]
            done_status = self._wait_for_completion(run_id)

        self.assertEqual(done_status["lifecycle"], "failed")
        self.assertIn("backend failed", done_status.get("error", ""))

    def test_cancel_contract_for_completed_run_returns_400(self):
        with patch.object(delivery_manager, "_job_manager", new=None), patch.object(
            delivery_manager._runner,
            "arun_program",
            new=AsyncMock(return_value={"stdout": "done", "stderr": ""}),
        ):
            response = self.client.post("/mace4", json={"input": self._text_input(), "delivery_mode": "persisted"})
            self.assertEqual(response.status_code, 200)
            run_id = response.json()["run_id"]
            self._wait_for_completion(run_id)

            cancel = self.client.post(f"/runs/{run_id}/cancel")
            self.assertEqual(cancel.status_code, 400)
            self.assertEqual(cancel.json()["detail"], "run is not active")

    def test_process_output_chaining_requires_completed_persisted_source(self):
        source_payload = {"stdout": "A -> B.", "stderr": "", "parsed": {"proofs": 1}, "models": []}

        with patch.object(delivery_manager._runner, "arun_program", new=AsyncMock(return_value=source_payload)):
            source_response = self.client.post(
                "/prover9",
                json={"input": self._text_input(), "delivery_mode": "persisted"},
            )
            self.assertEqual(source_response.status_code, 200)
            source_run_id = source_response.json()["run_id"]
            self._wait_for_completion(source_run_id)

        with patch.object(
            delivery_manager._runner,
            "arun_program",
            new=AsyncMock(return_value={"stdout": "ok", "stderr": "", "parsed": {}, "models": []}),
        ) as patched:
            chained = self.client.post(
                "/prooftrans",
                json={
                    "delivery_mode": "persisted",
                    "input": {
                        "kind": "process_output",
                        "run_id": source_run_id,
                        "artifact": "stdout",
                    },
                },
            )
            self.assertEqual(chained.status_code, 200)
            chained_run_id = chained.json()["run_id"]
            self._wait_for_completion(chained_run_id)

            _, call_args, call_kwargs = patched.mock_calls[-1]
            self.assertEqual(call_args[0].value, "prooftrans")
            self.assertEqual(call_args[1], "A -> B.")
            self.assertEqual(call_kwargs["options"], None)

        bad_stream_source = self.client.post(
            "/mace4",
            json={"input": self._text_input(), "delivery_mode": "stream"},
        )
        self.assertEqual(bad_stream_source.status_code, 200)
        stream_run_id = bad_stream_source.json()["run_id"]

        rejected = self.client.post(
            "/prooftrans",
            json={
                "delivery_mode": "persisted",
                "input": {
                    "kind": "process_output",
                    "run_id": stream_run_id,
                    "artifact": "stdout",
                },
            },
        )
        self.assertEqual(rejected.status_code, 200)
        rejected_status = self._wait_for_completion(rejected.json()["run_id"])
        self.assertEqual(rejected_status["lifecycle"], "failed")
        self.assertIn("source run must be persisted", rejected_status.get("error", ""))

    def test_status_contract_for_unknown_run(self):
        status = self.client.get("/runs/does-not-exist/status")
        self.assertEqual(status.status_code, 404)

    def test_mace4_stdout_from_models_joins_raw(self):
        self.assertEqual(_mace4_stdout_from_models([]), "")
        self.assertEqual(
            _mace4_stdout_from_models([{"raw": "interp(1)"}, {"raw": "interp(2)"}]),
            "interp(1)\n\ninterp(2)",
        )

    def test_mace4_legacy_payload_empty_stdout_uses_models_text(self):
        """Mimics pyp9m4.arun('mace4') envelope without raw subprocess capture."""
        payload = Pyp9m4Runner._to_legacy_payload(
            ProgramType.MACE4,
            {"program": "mace4", "mace4_models": [{"raw": "interp(1)"}]},
        )
        self.assertEqual(payload.get("stdout"), "")
        self.assertEqual(payload.get("stderr"), "")
        self.assertEqual(payload.get("models_text"), "interp(1)")


if __name__ == "__main__":
    unittest.main()