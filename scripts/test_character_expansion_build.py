#!/usr/bin/env python3
"""Integration tests for the macOS CharacterExpansion build validator."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
import zlib

from character_expansion_build import ExpansionValidationError, _run_validator, validate_expansion


STYLES = ("a", "a_", "b", "b_", "c", "d", "e", "blue_rose", "red_skirt", "long_shirt")
POSES = ("standing", "reading", "tea", "dozing")
FRAMINGS = ("full", "close")
EXPRESSIONS = ("neutral", "serious", "smile", "surprised", "shy", "pout", "sleepy", "proud")
EYES = ("open", "half", "closed")
GAZES = ("center", "left", "right", "up", "down")
MOUTHS = ("closed", "small", "medium")


def png_rgba(red, green, blue, alpha=255):
    """Return a hand-built 1x1 RGBA PNG with no image-library dependency."""
    signature = b"\x89PNG\r\n\x1a\n"

    def chunk(kind, payload):
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        signature
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes((0, red, green, blue, alpha))))
        + chunk(b"IEND", b"")
    )


class ExpansionFixture:
    def __init__(self, directory):
        self.root = Path(directory)
        self.pack = self.root / "ChihayaPet/Resources/CharacterExpansion"
        self.source = self.root / "art/source.png"
        self.asset = self.pack / "assets/base.png"
        self.bundle = self.root / "build/Test.app"
        self._write()

    def _write(self):
        pixel = png_rgba(12, 34, 56)
        self.asset.parent.mkdir(parents=True)
        self.source.parent.mkdir(parents=True)
        self.asset.write_bytes(pixel)
        self.source.write_bytes(pixel)

        states = [
            {"expression": expression, "eye": eye, "gaze": gaze, "mouth": mouth}
            for expression in EXPRESSIONS
            for eye in EYES
            for gaze in GAZES
            for mouth in MOUTHS
        ]
        recipes = [
            {
                "state": state,
                "patches": [
                    {
                        "asset": "base",
                        "destination": {"x": 0, "y": 0, "width": 1, "height": 1},
                    }
                ],
            }
            for state in states
        ]
        variant = {
            "base": "base",
            "source": "source",
            "sourceCrop": {"x": 0, "y": 0, "width": 1, "height": 1},
            "face": {"x": 0, "y": 0, "width": 1, "height": 1},
            "head": {"x": 0, "y": 0, "width": 1, "height": 1},
            "mouth": {"x": 0, "y": 0},
            "hairLeft": 0,
            "hairRight": 1,
            "recipes": recipes,
        }
        manifest = {
            "version": 1,
            "assets": {
                "base": {
                    "origin": "extensionPack",
                    "path": "assets/base.png",
                    "sha256": hashlib.sha256(pixel).hexdigest(),
                    "width": 1,
                    "height": 1,
                }
            },
            "sourceArtworks": [
                {
                    "id": "source",
                    "projectRelativePath": "art/source.png",
                    "sha256": hashlib.sha256(pixel).hexdigest(),
                    "width": 1,
                    "height": 1,
                }
            ],
            "declaredStates": states,
            "variants": {
                f"{style}/{pose}/{framing}": deepcopy(variant)
                for style in STYLES
                for pose in POSES
                for framing in FRAMINGS
            },
        }
        (self.pack / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))

    def install_bundle_pack(self):
        target = self.bundle / "Contents/Resources/CharacterExpansion"
        target.parent.mkdir(parents=True)
        shutil.copytree(self.pack, target)
        return target

    def move_runtime_asset(self, relative_path):
        destination = self.pack / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        previous_parent = self.asset.parent
        self.asset.rename(destination)
        if previous_parent != destination.parent and not any(previous_parent.iterdir()):
            previous_parent.rmdir()
        manifest_path = self.pack / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["assets"]["base"]["path"] = relative_path
        manifest_path.write_text(json.dumps(manifest, separators=(",", ":")))
        self.asset = destination


class CharacterExpansionBuildValidationTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix="chihaya-expansion-test-")
        self.addCleanup(temporary.cleanup)
        return ExpansionFixture(temporary.name)

    def test_delegates_complete_schema(self):
        fixture = self.fixture()
        summary = validate_expansion(fixture.root, source_only=True, require_expansion=True)
        self.assertIn("80 variants, 360 face states", summary)

        manifest_path = fixture.pack / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["variants"].pop("long_shirt/dozing/close")
        manifest_path.write_text(json.dumps(manifest, separators=(",", ":")))
        with self.assertRaisesRegex(ExpansionValidationError, "80 variants"):
            validate_expansion(fixture.root, source_only=True, require_expansion=True)

    def test_explicit_source_qa_rejects_artwork_hash_mismatch(self):
        fixture = self.fixture()
        fixture.source.write_bytes(png_rgba(99, 88, 77))
        with self.assertRaisesRegex(ExpansionValidationError, "invalidSource"):
            _run_validator(fixture.pack, fixture.root)

    def test_runtime_pack_build_does_not_require_source_artwork(self):
        fixture = self.fixture()
        fixture.source.unlink()
        fixture.install_bundle_pack()
        validate_expansion(fixture.root, bundle=fixture.bundle, require_expansion=True)

    def test_rejects_unreferenced_and_raw_qa_pack_entries(self):
        for relative_path in (
            "extra.png",
            "rawAI/master.ai",
            "QA/contact-sheet.png",
            "prompts/generation.json",
        ):
            with self.subTest(relative_path=relative_path):
                fixture = self.fixture()
                unexpected = fixture.pack / relative_path
                unexpected.parent.mkdir(parents=True, exist_ok=True)
                unexpected.write_bytes(b"must never ship")
                with self.assertRaisesRegex(ExpansionValidationError, "Unexpected pack entry"):
                    validate_expansion(fixture.root, source_only=True, require_expansion=True)

    def test_rejects_referenced_assets_outside_flat_runtime_namespace(self):
        for relative_path in (
            "rawAI/master.png",
            "QA/contact-sheet.png",
            "prompts/generated.png",
            "assets/nested/base.png",
            "assets/.png",
            "base.png",
        ):
            with self.subTest(relative_path=relative_path):
                fixture = self.fixture()
                fixture.move_runtime_asset(relative_path)
                with self.assertRaisesRegex(
                    ExpansionValidationError,
                    "Runtime extension asset must match assets/<filename>.png",
                ):
                    validate_expansion(fixture.root, source_only=True, require_expansion=True)

    def test_explicit_source_qa_rejects_a_shipped_asset_as_source(self):
        fixture = self.fixture()
        manifest_path = fixture.pack / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["sourceArtworks"][0]["projectRelativePath"] = fixture.asset.relative_to(fixture.root).as_posix()
        manifest_path.write_text(json.dumps(manifest, separators=(",", ":")))
        with self.assertRaisesRegex(
            ExpansionValidationError,
            "Source artwork must be outside CharacterExpansion",
        ):
            _run_validator(fixture.pack, fixture.root)

    def test_rejects_symlinks_even_when_the_target_is_expected(self):
        fixture = self.fixture()
        actual_pack = fixture.pack.with_name("CharacterExpansion-real")
        fixture.pack.rename(actual_pack)
        fixture.pack.symlink_to(actual_pack.name, target_is_directory=True)
        with self.assertRaisesRegex(ExpansionValidationError, "symlink"):
            validate_expansion(fixture.root, source_only=True, require_expansion=True)

    def test_optional_validation_rejects_a_dangling_pack_root_symlink(self):
        fixture = self.fixture()
        shutil.rmtree(fixture.pack)
        fixture.pack.symlink_to("missing-CharacterExpansion", target_is_directory=True)
        with self.assertRaisesRegex(ExpansionValidationError, "symlink"):
            validate_expansion(fixture.root, source_only=True, require_expansion=False)

    def test_require_expansion_fails_when_pack_is_missing(self):
        fixture = self.fixture()
        shutil.rmtree(fixture.pack)
        with self.assertRaisesRegex(ExpansionValidationError, "CharacterExpansion is required"):
            validate_expansion(fixture.root, source_only=True, require_expansion=True)

    def test_bundle_must_match_source_bytes_without_resolving_project_sources(self):
        fixture = self.fixture()
        bundled = fixture.install_bundle_pack()
        validate_expansion(
            fixture.root,
            bundle=fixture.bundle,
            source_only=False,
            require_expansion=True,
        )

        manifest_path = bundled / "manifest.json"
        manifest_path.write_text(json.dumps(json.loads(manifest_path.read_text()), indent=2))
        with self.assertRaisesRegex(ExpansionValidationError, "Bundle expansion mismatch: manifest.json"):
            validate_expansion(
                fixture.root,
                bundle=fixture.bundle,
                source_only=False,
                require_expansion=True,
            )


if __name__ == "__main__":
    unittest.main()
