#!/usr/bin/env python3
"""
Async pyp9m4 runner service and option mapping layer.
"""

from __future__ import annotations

import os
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Union

from pyp9m4.mace4_facade import Mace4
from pyp9m4.options import (
    InterpformatCliOptions,
    IsofilterCliOptions,
    Mace4CliOptions,
    ProofTransCliOptions,
    Prover9CliOptions,
)
from pyp9m4.prover9_facade import Prover9
from pyp9m4.resolver import BinaryResolver
from pyp9m4.runner import AsyncToolRunner, SubprocessInvocation

from p9m4_types import Mace4Options, ProgramType, Prover9Options

InputData = Union[str, bytes, Path]
LegacyOptions = Optional[Union[Dict[str, Any], Prover9Options, Mace4Options]]


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


def _extract_option_value(options_dict: Dict[str, Any], key: str, default: Any = None) -> Any:
    if key not in options_dict:
        return default
    field_value = options_dict.get(key)
    if isinstance(field_value, dict) and "value" in field_value:
        return field_value.get("value")
    return field_value


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
    """Service object that dispatches tool runs through async pyp9m4 APIs."""

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

        resolver = BinaryResolver()
        self._prover9 = Prover9(
            resolver=resolver,
            cwd=self._cwd,
            env=self._env,
            encoding=self._encoding,
            errors=self._errors,
        )
        self._mace4 = Mace4(
            resolver=resolver,
            cwd=self._cwd,
            env=self._env,
            encoding=self._encoding,
            errors=self._errors,
        )
        self._resolver = resolver
        self._runner = AsyncToolRunner()

    @staticmethod
    def map_prover9_options(options: Optional[Union[Prover9Options, Dict[str, Any]]]) -> Prover9CliOptions:
        data = _to_plain_dict(options)
        return Prover9CliOptions(
            max_seconds=_extract_option_value(data, "max_seconds"),
        )

    @staticmethod
    def map_mace4_options(options: Optional[Union[Mace4Options, Dict[str, Any]]]) -> Mace4CliOptions:
        data = _to_plain_dict(options)
        return Mace4CliOptions(
            domain_size=_extract_option_value(data, "start_size"),
            end_size=_extract_option_value(data, "end_size"),
            increment=_extract_option_value(data, "increment"),
            max_models=_extract_option_value(data, "max_models"),
            max_seconds=_extract_option_value(data, "max_seconds"),
            max_seconds_per=_extract_option_value(data, "max_seconds_per"),
            max_megs=_extract_option_value(data, "max_megs"),
            print_models=1 if _extract_option_value(data, "print_models", True) else 0,
            print_models_tabular=1 if _extract_option_value(data, "print_models_tabular", False) else 0,
            integer_ring=1 if _extract_option_value(data, "integer_ring", False) else 0,
            verbose=1 if _extract_option_value(data, "verbose", False) else 0,
            trace=1 if _extract_option_value(data, "trace", False) else 0,
            ignore_unrecognized_assigns=True,
        )

    @staticmethod
    def map_isofilter_options(options: Optional[Dict[str, Any]]) -> IsofilterCliOptions:
        data = _to_plain_dict(options)
        return IsofilterCliOptions(
            ignore_constants=bool(data.get("ignore_constants", False)),
            wrap=bool(data.get("wrap", False)),
            check_operations=data.get("check"),
            output_operations=data.get("output"),
        )

    @staticmethod
    def map_interpformat_options(options: Optional[Dict[str, Any]]) -> InterpformatCliOptions:
        data = _to_plain_dict(options)
        style = data.get("format", "standard2")
        return InterpformatCliOptions(style=style)

    @staticmethod
    def map_prooftrans_options(options: Optional[Dict[str, Any]]) -> ProofTransCliOptions:
        data = _to_plain_dict(options)
        mode = data.get("format", "default")
        return ProofTransCliOptions(
            mode=mode,
            expand=bool(data.get("expand", False)),
            renumber=bool(data.get("renumber", False)),
            striplabels=bool(data.get("striplabels", False)),
        )

    async def arun_program(
        self,
        program: ProgramType,
        input_data: InputData,
        *,
        options: LegacyOptions = None,
    ) -> Dict[str, Any]:
        if program == ProgramType.PROVER9:
            result = await self._prover9.arun(
                input_data,
                options=self.map_prover9_options(options if isinstance(options, (dict, Prover9Options)) else None),
            )
            payload = asdict(result.parsed) if is_dataclass(result.parsed) else str(result.parsed)
            return {
                "program": program.value,
                "lifecycle": result.lifecycle,
                "outcome": str(result.outcome),
                "exit_code": result.exit_code,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "parsed": payload,
            }

        if program == ProgramType.MACE4:
            handle = self._mace4.start_amodels(
                input_data,
                options=self.map_mace4_options(options if isinstance(options, (dict, Mace4Options)) else None),
            )
            models: list[Any] = []
            async for model in handle.amodels():
                models.append(asdict(model) if is_dataclass(model) else str(model))
            await handle.wait()
            status = await handle.status()
            # stderr_tail: search diagnostics (verbose/trace); keep as stderr like Prover9.
            # Model interpretations live in `models` with `raw` — expose as stdout for download/save.
            tail = status.stderr_tail or ""
            text_out = _mace4_stdout_from_models(models)
            return {
                "program": program.value,
                "lifecycle": status.lifecycle,
                "exit_code": status.exit_code,
                "stdout": text_out,
                "stderr": tail,
                "models_found": status.models_found,
                "models": models,
            }

        return await self._arun_via_tool_runner(program, input_data, options=options if isinstance(options, dict) else None)

    async def _arun_via_tool_runner(
        self,
        program: ProgramType,
        input_data: InputData,
        *,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if isinstance(input_data, Path):
            stdin: Union[str, bytes] = input_data.read_bytes()
        else:
            stdin = input_data

        exe = self._resolver.resolve(program.value)
        argv: list[str] = [os.fspath(exe)]

        if program in (ProgramType.ISOFILTER, ProgramType.ISOFILTER2):
            cli = self.map_isofilter_options(options)
            argv.extend(cli.to_argv())
        elif program == ProgramType.INTERPFORMAT:
            cli = self.map_interpformat_options(options)
            argv.extend(cli.to_argv())
        elif program == ProgramType.PROOFTRANS:
            cli = self.map_prooftrans_options(options)
            argv.extend(cli.to_argv())
        else:
            raise ValueError(f"Unsupported program for tool runner path: {program}")

        invocation = SubprocessInvocation(
            argv=tuple(argv),
            cwd=self._cwd,
            env=self._env,
            stdin=stdin,
            encoding=self._encoding,
            errors=self._errors,
        )
        result = await self._runner.run(invocation)
        return {
            "program": program.value,
            "lifecycle": result.status.value,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "argv": list(result.argv),
            "duration_s": result.duration_s,
        }

    def start_program(
        self,
        program: ProgramType,
        input_data: InputData,
        *,
        options: LegacyOptions = None,
    ) -> Any:
        if program == ProgramType.PROVER9:
            return self._prover9.start_arun(
                input_data,
                options=self.map_prover9_options(options if isinstance(options, (dict, Prover9Options)) else None),
            )
        if program == ProgramType.MACE4:
            return self._mace4.start_amodels(
                input_data,
                options=self.map_mace4_options(options if isinstance(options, (dict, Mace4Options)) else None),
            )
        raise NotImplementedError(
            f"Background handles are currently supported only for prover9/mace4, got {program.value}."
        )
