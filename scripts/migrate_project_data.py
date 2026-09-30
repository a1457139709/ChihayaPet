#!/usr/bin/env python3
"""One-time, verified migration. Quit ChihayaPet before running; never prints secrets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile


def manifest(directory):
    result = {}
    if not directory.exists():
        return result
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Expected a regular directory")
    for item in sorted(directory.rglob("*")):
        if item.is_symlink():
            raise ValueError("Symbolic links require manual review")
        if item.is_file():
            digest = hashlib.sha256()
            with item.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            result[item.relative_to(directory).as_posix()] = (item.stat().st_size, digest.hexdigest())
        elif not item.is_dir():
            raise ValueError("Unsupported file type")
    return result


def read_config(path):
    if path.is_symlink():
        raise ValueError("Configuration must not be a symbolic link")
    value = json.loads(path.read_bytes())
    if not isinstance(value, dict) or not isinstance(value.get("baseURL"), str) or not isinstance(value.get("model"), str):
        raise ValueError("Invalid project configuration")
    validate_keys(value.get("apiKeys"))
    return value


def validate_keys(value):
    if not isinstance(value, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in value.items()):
        raise ValueError("Invalid credentials")


def atomic_config(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix=".config-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def migrate(root, legacy, preferences, save_preferences):
    root, legacy = root.resolve(), legacy.resolve()
    if root == legacy or root in legacy.parents or legacy in root.parents:
        raise ValueError("Source and destination must be separate")
    root.mkdir(parents=True, exist_ok=True)
    credentials = legacy / "Credentials"
    source_music, music = legacy / "Music", root / "Music"
    credential_manifest = manifest(credentials)
    if set(credential_manifest) - {"credentials.json"}:
        raise ValueError("Unexpected files in legacy credentials directory")
    old_keys = json.loads((credentials / "credentials.json").read_bytes()) if credential_manifest else {}
    validate_keys(old_keys)
    old_settings = json.loads(preferences["service.settings"]) if "service.settings" in preferences else {}
    if not isinstance(old_settings, dict):
        raise ValueError("Invalid saved service settings")
    path = root / "config.json"
    config = read_config(path) if path.exists() or path.is_symlink() else {"baseURL": "", "model": "", "apiKeys": {}}
    for key in ("baseURL", "model"):
        old = old_settings.get(key, "")
        if not isinstance(old, str) or (config[key] and old and config[key] != old):
            raise ValueError("Conflicting saved connection")
        config[key] = config[key] or old
    for service, key in old_keys.items():
        if service in config["apiKeys"] and config["apiKeys"][service] != key:
            raise ValueError("Conflicting saved credential")
        config["apiKeys"][service] = key
    source_manifest = manifest(source_music)
    if music.exists() and source_music.exists() and manifest(music) != source_manifest:
        raise ValueError("Conflicting destination music library")
    if not music.exists():
        if source_music.exists():
            staging = Path(tempfile.mkdtemp(prefix=".music-migration-", dir=root))
            try:
                shutil.copytree(source_music, staging, dirs_exist_ok=True)
                if manifest(staging) != source_manifest:
                    raise OSError("Music verification failed")
                staging.rename(music)
            finally:
                if staging.exists():
                    shutil.rmtree(staging)
        else:
            music.mkdir()
    atomic_config(path, config)
    if read_config(path) != config:
        raise OSError("Configuration verification failed")
    updated = dict(preferences)
    if "prompt" in old_settings:
        if not isinstance(old_settings["prompt"], str):
            raise ValueError("Invalid saved persona")
        updated["persona.prompt"] = old_settings["prompt"]
    updated.pop("service.settings", None)
    save_preferences(updated)
    # Recheck both originals immediately before cleanup: no changes may be lost.
    if manifest(credentials) != credential_manifest or manifest(source_music) != source_manifest:
        raise OSError("Legacy data changed during migration")
    if source_music.exists() and manifest(music) != source_manifest:
        raise OSError("Destination music changed during migration")
    if read_config(path) != config:
        raise OSError("Destination configuration changed during migration")
    if credentials.exists():
        shutil.rmtree(credentials)
    if source_music.exists():
        shutil.rmtree(source_music)
    if legacy.exists() and not any(legacy.iterdir()):
        legacy.rmdir()
    final_music = manifest(music)
    return {"music_files": len(final_music), "music_bytes": sum(v[0] for v in final_music.values()), "saved_services": len(config["apiKeys"])}


def save_domain_preferences(domain, updated):
    # Import through stdin so cfprefsd remains coherent and values stay out of argv.
    subprocess.run(["defaults", "import", domain, "-"], input=plistlib.dumps(updated), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    actual = plistlib.loads(subprocess.check_output(["defaults", "export", domain, "-"], stderr=subprocess.DEVNULL))
    # `defaults import` merges keys; absent keys are not deleted by the import.
    if "service.settings" not in updated and "service.settings" in actual:
        subprocess.run(["defaults", "delete", domain, "service.settings"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        actual = plistlib.loads(subprocess.check_output(["defaults", "export", domain, "-"], stderr=subprocess.DEVNULL))
    if actual != updated:
        raise OSError("Preferences verification failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    domain = "local.ChihayaPet"
    # Pipe values in memory; do not put the key or persona on a shell command line.
    preferences = plistlib.loads(subprocess.check_output(["defaults", "export", domain, "-"], stderr=subprocess.DEVNULL))

    def save_preferences(updated):
        save_domain_preferences(domain, updated)

    result = migrate(args.root, Path.home() / "Library/Application Support/ChihayaPet", preferences, save_preferences)
    print(json.dumps({"migration": "verified", **result}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not include values from decoded files in diagnostics.
        print("Migration stopped; inspect paths and permissions. Error type:", type(error).__name__)
        raise SystemExit(1)
