#!/usr/bin/env python3
"""Async runner service built on top-level pyp9m4 orchestration APIs."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from inspect import signature
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Union

import pyp9m4 as _pyp9m4
from pyp9m4.options import (
    InterpformatCliOptions,
    IsofilterCliOptions,
    Mace4CliOptions,
    ProofTransCliOptions,
    Prover9CliOptions,
)

from p9m4_types import Mace4Options, ProgramType, Prover9Options

InputData = Union[str, bytes, Path]
LegacyOptions = Optional[Union[Dict[str, Any], Prover9Options, Mace4Options]]
_ARUN = getattr(_pyp9m4, "arun", None)
_CLI_OPTIONS_FROM_NESTED_DICT = getattr(_pyp9m4, "cli_options_from_nested_dict", None)


def _require_pyp9m4_api(name: str, value: Any) -> Any:
    if value is None:
        raise RuntimeError(f"pyp9m4 is missing required top-level API: {name}")
    return value


def _to_plain_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return {}


def _normalize_program_name(program: ProgramType) -> str:
    if program == ProgramType.ISOFILTER2:
        return ProgramType.ISOFILTER.value
    return program.value


def _mace4_stdout_from_models(models: list[Any]) -> str:
    """Primary text for artifacts: LADR interpretation lines (classic Mace4 print_models output)."""
    parts: list[str] = []
    for m in models:
        if isinstance(m, dict):
            raw = m.get("raw")
            if raw is not None and str(raw).strip():
                parts.append(str(raw).strip())
        elif isinstance(m, str) and m.strip():
            parts.append(m.strip())
    return "\n\n".join(parts)


class Pyp9m4Runner:
    """Service object that dispatches tool runs through top-level async pyp9m4 APIs."""

    def __init__(
        self,
        *,
        cwd: Optional[Union[str, Path]] = None,
        env: Optional[Mapping[str, str]] = None,
        encoding: str = "utf-8",
        errors: str = "replace",
    ) -> None:
        self._cwd = Path(cwd).resolve() if cwd is not None else None
        self._env = dict(env) if env is not None else None
        self._encoding = encoding
        self._errors = errors

    @staticmethod
    def map_prover9_options(options: Optional[Union[Prover9Options, Dict[str, Any]]]) -> Prover9CliOptions:
        data = _to_plain_dict(options)
        parse_options = _require_pyp9m4_api("cli_options_from_nested_dict", _CLI_OPTIONS_FROM_NESTED_DICT)
        return parse_options(
            Prover9CliOptions,
            data,
        )

    @staticmethod
    def map_mace4_options(options: Optional[Union[Mace4Options, Dict[str, Any]]]) -> Mace4CliOptions:
        data = _to_plain_dict(options)
        # Backward-compat: accept legacy bool flags and normalize to CLI-style ints.
        for key, value in list(data.items()):
            if isinstance(value, bool):
                data[key] = int(value)
        parse_options = _require_pyp9m4_api("cli_options_from_nested_dict", _CLI_OPTIONS_FROM_NESTED_DICT)
        return parse_options(
            Mace4CliOptions,
            data,
            aliases={"start_size": "domain_size"},
        )

    @staticmethod
    def map_isofilter_options(options: Optional[Dict[str, Any]]) -> IsofilterCliOptions:
        data = _to_plain_dict(options)
        parse_options = _require_pyp9m4_api("cli_options_from_nested_dict", _CLI_OPTIONS_FROM_NESTED_DICT)
        return parse_options(
            IsofilterCliOptions,
            data,
            aliases={"check": "check_operations", "output": "output_operations"},
        )

    @staticmethod
    def map_interpformat_options(options: Optional[Dict[str, Any]]) -> InterpformatCliOptions:
        data = _to_plain_dict(options)
        parse_options = _require_pyp9m4_api("cli_options_from_nested_dict", _CLI_OPTIONS_FROM_NESTED_DICT)
        return parse_options(
            InterpformatCliOptions,
            data,
            aliases={"format": "style"},
        )

    @staticmethod
    def map_prooftrans_options(options: Optional[Dict[str, Any]]) -> ProofTransCliOptions:
        data = _to_plain_dict(options)
        parse_options = _require_pyp9m4_api("cli_options_from_nested_dict", _CLI_OPTIONS_FROM_NESTED_DICT)
        return parse_options(
            ProofTransCliOptions,
            data,
            aliases={"format": "mode"},
        )

    def _map_options_for_program(self, program: ProgramType, options: LegacyOptions) -> Any:
        if program == ProgramType.PROVER9:
            return self.map_prover9_options(options if isinstance(options, (dict, Prover9Options)) else None)
        if program == ProgramType.MACE4:
            return self.map_mace4_options(options if isinstance(options, (dict, Mace4Options)) else None)
        if program in (ProgramType.ISOFILTER, ProgramType.ISOFILTER2):
            return self.map_isofilter_options(options if isinstance(options, dict) else None)
        if program == ProgramType.INTERPFORMAT:
            return self.map_interpformat_options(options if isinstance(options, dict) else None)
        if program == ProgramType.PROOFTRANS:
            return self.map_prooftrans_options(options if isinstance(options, dict) else None)
        return None

    @staticmethod
    def _to_legacy_payload(program: ProgramType, envelope_dict: Dict[str, Any]) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"program": _normalize_program_name(program), "envelope": envelope_dict}
        raw = envelope_dict.get("raw") if isinstance(envelope_dict, dict) else None
        if isinstance(raw, dict):
            payload["lifecycle"] = raw.get("status")
            payload["exit_code"] = raw.get("exit_code")
            payload["stdout"] = raw.get("stdout", "")
            payload["stderr"] = raw.get("stderr", "")
            if "argv" in raw:
                payload["argv"] = raw.get("argv")
            if "duration_s" in raw:
                payload["duration_s"] = raw.get("duration_s")

        if program == ProgramType.PROVER9:
            prover9 = envelope_dict.get("prover9", {})
            if isinstance(prover9, dict):
                payload["lifecycle"] = prover9.get("lifecycle", payload.get("lifecycle"))
                payload["outcome"] = prover9.get("outcome")
                payload["exit_code"] = prover9.get("exit_code", payload.get("exit_code"))
                payload["stdout"] = prover9.get("stdout", payload.get("stdout", ""))
                payload["stderr"] = prover9.get("stderr", payload.get("stderr", ""))
                payload["parsed"] = prover9.get("parsed")
            return payload

        if program == ProgramType.MACE4:
            models = envelope_dict.get("mace4_models", [])
            payload["lifecycle"] = payload.get("lifecycle", "completed")
            payload["stdout"] = _mace4_stdout_from_models(models if isinstance(models, list) else [])
            payload["stderr"] = payload.get("stderr", "")
            payload["models"] = models if isinstance(models, list) else []
            payload["models_found"] = len(payload["models"])
            return payload

        if program in (ProgramType.ISOFILTER, ProgramType.ISOFILTER2, ProgramType.INTERPFORMAT, ProgramType.PROOFTRANS):
            pipeline = envelope_dict.get("pipeline", {})
            if isinstance(pipeline, dict):
                payload["lifecycle"] = pipeline.get("lifecycle", payload.get("lifecycle"))
                payload["exit_code"] = pipeline.get("exit_code", payload.get("exit_code"))
                payload["stdout"] = pipeline.get("stdout", payload.get("stdout", ""))
                payload["stderr"] = pipeline.get("stderr", payload.get("stderr", ""))
                if "result" in pipeline:
                    payload["parsed"] = pipeline.get("result")
            return payload
        return payload

    async def arun_program(
        self,
        program: ProgramType,
        input_data: InputData,
        *,
        options: LegacyOptions = None,
    ) -> Dict[str, Any]:
        mapped_options = self._map_options_for_program(program, options)
        run_tool = _require_pyp9m4_api("arun", _ARUN)
        kwargs: Dict[str, Any] = {"options": mapped_options}
        # Support multiple pyp9m4 versions with different arun signatures.
        params = signature(run_tool).parameters
        if "cwd" in params:
            kwargs["cwd"] = self._cwd
        if "env" in params:
            kwargs["env"] = self._env
        if "encoding" in params:
            kwargs["encoding"] = self._encoding
        if "errors" in params:
            kwargs["errors"] = self._errors
        envelope = await run_tool(
            _normalize_program_name(program),
            input_data,
            **kwargs,
        )
        envelope_dict: Dict[str, Any]
        if hasattr(envelope, "to_dict"):
            envelope_dict = envelope.to_dict()
        elif is_dataclass(envelope):
            envelope_dict = asdict(envelope)
        else:
            envelope_dict = {"program": _normalize_program_name(program)}
        return self._to_legacy_payload(program, envelope_dict)

    def start_program(
        self,
        program: ProgramType,
        input_data: InputData,
        *,
        options: LegacyOptions = None,
    ) -> Any:
        raise NotImplementedError("start_program is deprecated; use managed run orchestration via delivery manager.")
