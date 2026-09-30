#!/usr/bin/env python3
"""Build the artwork checklist from game originals and native-tea progress."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "docs/reports/chihaya-character-progress.html"
TEMPLATE = ROOT / "ArtSources/CharacterExpansion/progress/progress.template.html"
STATE = ROOT / "ArtSources/CharacterExpansion/native-tea/progress.json"
ORIGINALS = ROOT / "ArtSources/CharacterExpansion/native-tea/originals.json"
PLAN = ROOT / "docs/plans/2026-09-30-native-tea-and-original-faces.md"
STYLES = [
    ("a", "冬服正面"), ("a_", "夏服正面"),
    ("b", "冬服侧身"), ("b_", "夏服侧身"),
    ("c", "米色便服"), ("d", "粉色裙装"), ("e", "体操服"),
    ("blue_rose", "蓝白玫瑰礼装"), ("red_skirt", "白衬衫红裙"),
    ("long_shirt", "宽松长衬衫"),
]
DESIGNS = {
    "blue_rose": "蓝白配色与玫瑰礼装设计；游戏头部、原脸与服装的配对待验证。",
    "red_skirt": "白衬衫与红裙设计；游戏头部、原脸与服装的配对待验证。",
    "long_shirt": "宽松长衬衫设计；游戏头部、原脸与服装的配对待验证。",
}


def relative_url(path: Path) -> str:
    return quote(os.path.relpath(path, REPORT.parent), safe="/.-_")


def png_record(path: Path) -> dict:
    path = path.resolve()
    relative = path.relative_to(ROOT)
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG: {path}")
    width, height, depth, color_type = struct.unpack(">IIBB", data[16:26])
    return {
        "path": relative.as_posix(),
        "url": relative_url(path), "name": path.name,
        "width": width, "height": height,
        "bitDepth": depth, "hasAlpha": color_type in (4, 6),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def original_source(baseline: dict) -> dict:
    body = png_record(ROOT / baseline["body"])
    assert body["sha256"] == baseline["bodySHA256"], body["path"]
    assert (body["width"], body["height"]) == (baseline["width"], baseline["height"])
    faces = []
    for entry in baseline["faces"]:
        face = png_record(ROOT / entry["path"])
        assert face["sha256"] == entry["sha256"], face["path"]
        assert [face["width"], face["height"]] == baseline["faceSize"], face["path"]
        faces.append({**face, "id": entry["id"]})
    default = next(face for face in faces if face["path"] == baseline["defaultFace"])
    x, y = baseline["faceOffset"]
    assert 0 <= x < x + default["width"] <= body["width"]
    assert 0 <= y < y + default["height"] <= body["height"]
    return {"body": body, "face": default, "faces": faces, "offset": [x, y]}


def build(snapshot_date: str) -> None:
    state = json.loads(STATE.read_text())
    original = json.loads(ORIGINALS.read_text())["variants"]
    assert set(state["outfits"]) == {key for key, _ in STYLES}
    outfits = []
    for index, (key, name) in enumerate(STYLES, 1):
        native = f"{key}/full" in original
        record = state["outfits"][key]
        sources, requirements, results = {}, {}, {}
        for view in ("full", "close"):
            # The three new outfits retain an explicitly provisional front baseline.
            baseline = original[f"{key if native else 'a'}/{view}"]
            requirements[view] = {
                "width": baseline["width"], "height": baseline["height"],
                "faceWidth": baseline["faceSize"][0],
                "faceHeight": baseline["faceSize"][1],
                "faceOffset": baseline["faceOffset"] if native else None,
            }
            if native:
                sources[view] = original_source(baseline)
            mother = record["mother"][view]
            results[view] = {
                "mother": png_record(ROOT / mother) if mother else None,
                "composites": [png_record(ROOT / p) for p in record["composites"][view]],
                "checks": record.get("checks", {}).get(view, {}),
                "evidence": relative_url(ROOT / record["evidence"][view])
                if record.get("evidence", {}).get(view) else None,
                "localPart": png_record(ROOT / record["localParts"][view])
                if record.get("localParts", {}).get(view) else None,
            }
        outfits.append({
            "id": key, "number": f"{index:02}", "name": name, "native": native,
            "design": DESIGNS.get(key),
            "requirements": requirements, "sources": sources, "results": results,
            "pixelCheck": record["pixelCheck"], "review": record["review"],
        })
    links = {
        "plan": PLAN, "state": STATE, "originals": ORIGINALS,
        "artDirection": ROOT / "docs/art-direction/chihaya-game-original-authority.md",
    }
    if state.get("teaWareReference"):
        links["teaWare"] = ROOT / state["teaWareReference"]
    for path in links.values():
        assert path.is_file(), path
    payload = {
        "date": snapshot_date, "timezone": "Asia/Shanghai", "scope": state["scope"],
        "next": state["next"], "outfits": outfits,
        "links": {key: relative_url(path) for key, path in links.items()},
    }
    encoded = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    template = TEMPLATE.read_text()
    assert template.count("__PROGRESS_DATA__") == 1
    REPORT.write_text(template.replace("__PROGRESS_DATA__", encoded))
    images = {}
    for outfit in outfits:
        for source in outfit["sources"].values():
            for image in [source["body"], *source["faces"]]:
                images[image["path"]] = image
        for result in outfit["results"].values():
            for image in [result[key] for key in ("mother", "localPart") if result[key]] + result["composites"]:
                images[image["path"]] = image
    print(json.dumps({
        "html": str(REPORT), "outfits": len(outfits),
        "originalOutfits": sum(o["native"] for o in outfits),
        "checkedImageReferences": len(images),
        "newTeaMotherViews": sum(bool(r["mother"]) for o in outfits for r in o["results"].values()),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, help="Snapshot date in Asia/Shanghai (YYYY-MM-DD)")
    args = parser.parse_args()
    build(args.date)
