#!/usr/bin/env python3
"""Restore #68 BGM names from the pinned bgm branch catalog. Quit the pet first.

Numeric source filenames were captured as titles in Music/library.json on import.
Match audio content to restore both names without replacing UUID audio copies.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile


def git_blob(file):
    digest = hashlib.sha1(f"blob {file.stat().st_size}\0".encode())
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def restore(root, catalog):
    names = {}
    for track in json.loads(catalog.read_text(encoding="utf-8"))["tracks"]:
        name, digest = track["fileName"], track["gitBlob"]
        if Path(name).name != name or "\\" in name or Path(name).suffix != ".wav" or not re.fullmatch(r"[a-f0-9]{40}", digest):
            raise ValueError("Invalid BGM catalog entry")
        if digest in names or name in names.values():
            raise ValueError("Duplicate BGM catalog entry")
        names[digest] = name

    bgm, music = root / "assets/bgm", root / "Music"
    wav, index = bgm / "wav", music / "library.json"
    for directory in [root / "assets", bgm, wav, music]:
        if directory.is_symlink():
            raise ValueError(f"Expected a regular directory: {directory}")
    renames = []
    for source in sorted(wav.iterdir()) if wav.exists() else []:
        if source.is_symlink():
            raise ValueError(f"Expected a regular file: {source}")
        if not source.is_file() or source.suffix.lower() != ".wav":
            continue
        digest = git_blob(source)
        name = names.get(digest)
        if name and source.name != name:
            target = wav / name
            if target.is_symlink() or (target.exists() and (not target.is_file() or git_blob(target) != digest)):
                raise ValueError(f"Conflicting canonical BGM file: {target}")
            renames.append((source, target))

    if index.is_symlink():
        raise ValueError("Music index must be a regular file")
    original = index.read_bytes() if index.exists() else None
    tracks = json.loads(original) if original is not None else []
    if not isinstance(tracks, list):
        raise ValueError("Invalid Music/library.json")
    updated = 0
    for track in tracks:
        if not isinstance(track, dict) or not isinstance(track.get("fileName"), str) or not isinstance(track.get("title"), str):
            raise ValueError("Invalid music track")
        filename = track["fileName"]
        if Path(filename).name != filename or "\\" in filename:
            raise ValueError("Invalid imported audio filename")
        audio = music / filename
        if audio.is_symlink():
            raise ValueError("Imported audio must be a regular file")
        if audio.is_file() and audio.suffix.lower() == ".wav":
            name = names.get(git_blob(audio))
            if name and track["title"] != Path(name).stem:
                track["title"] = Path(name).stem
                updated += 1

    obsolete = []
    for file in bgm.rglob("*") if bgm.exists() else []:
        if file.is_symlink():
            raise ValueError(f"Expected a regular BGM resource: {file}")
        if file.is_file() and file.suffix.lower() == ".ogg":
            obsolete.append(file)

    # Confirm every destination before changing names or removing obsolete copies.
    if updated:
        if index.read_bytes() != original:
            raise ValueError("Music index changed during repair; retry after quitting the pet")
        descriptor, temporary = tempfile.mkstemp(prefix=".bgm-", suffix=".tmp", dir=music)
        try:
            os.fchmod(descriptor, index.stat().st_mode & 0o777)
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(tracks, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, index)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    for source, target in renames:
        if target.exists() and not source.samefile(target):
            source.unlink()  # An identical canonical copy already exists.
        else:
            source.rename(target)
    for file in obsolete:
        file.unlink()
    for directory in sorted(bgm.rglob("*"), reverse=True) if bgm.exists() else []:
        if directory.is_dir() and directory.name.lower() == "ogg" and not any(directory.iterdir()):
            directory.rmdir()
    return {"renamed_wav": len(renames), "updated_titles": updated, "deleted_ogg": len(obsolete)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--catalog", type=Path, default=Path(__file__).with_name("bgm-catalog.json"))
    args = parser.parse_args()
    print(json.dumps(restore(args.root, args.catalog), ensure_ascii=False))


if __name__ == "__main__":
    main()
