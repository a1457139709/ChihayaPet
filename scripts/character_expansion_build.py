#!/usr/bin/env python3
"""Build-time integration for the production CharacterExpansion validator."""

from pathlib import Path
import hashlib
import os
import subprocess


class ExpansionValidationError(AssertionError):
    pass


VALIDATOR = Path(__file__).resolve().with_name("validate_character_expansion.sh")


def _run_validator(pack, legacy, project_root=None):
    command = [str(VALIDATOR), "--pack", str(pack), "--legacy", str(legacy)]
    if project_root is not None:
        command.extend(("--project-root", str(project_root)))
    environment = os.environ.copy()
    environment.setdefault("DEVELOPER_DIR", "/Applications/Xcode.app/Contents/Developer")
    result = subprocess.run(command, text=True, capture_output=True, env=environment)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or "validator exited without diagnostics"
        raise ExpansionValidationError(detail)
    return result.stdout.strip()


def _files(root):
    return {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*")
        if path.is_file()
    }


def validate_expansion(project_root, bundle=None, source_only=False, require_expansion=False):
    """Validate an optional source pack and, when requested, its exact bundled copy."""
    project_root = Path(project_root).resolve()
    source = project_root / "ChihayaPet/Resources/CharacterExpansion"
    legacy = project_root / "ChihayaPet/Resources/CharacterSprites"
    if source.is_symlink():
        raise ExpansionValidationError(f"CharacterExpansion root must not be a symlink: {source}")
    if not source.exists():
        if require_expansion:
            raise ExpansionValidationError(f"CharacterExpansion is required but missing: {source}")
        return None
    if not source.is_dir():
        raise ExpansionValidationError(f"CharacterExpansion is not a directory: {source}")

    summary = _run_validator(source, legacy, project_root)
    if source_only:
        return summary

    if bundle is None:
        bundle = project_root / "build/ChihayaPet.app"
    bundled = Path(bundle) / "Contents/Resources/CharacterExpansion"
    if not bundled.is_dir():
        raise ExpansionValidationError(f"Bundle missing CharacterExpansion: {bundled}")
    _run_validator(bundled, Path(bundle) / "Contents/Resources/CharacterSprites")

    source_files = _files(source)
    bundled_files = _files(bundled)
    if set(source_files) != set(bundled_files):
        missing = sorted(set(source_files) - set(bundled_files))
        extra = sorted(set(bundled_files) - set(source_files))
        raise ExpansionValidationError(
            f"Bundle expansion whitelist mismatch (missing={missing}, extra={extra})"
        )
    for relative, source_path in source_files.items():
        source_hash = hashlib.sha256(source_path.read_bytes()).digest()
        bundled_hash = hashlib.sha256(bundled_files[relative].read_bytes()).digest()
        if source_hash != bundled_hash:
            raise ExpansionValidationError(f"Bundle expansion mismatch: {relative}")
    return summary
