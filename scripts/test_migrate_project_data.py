import json
from pathlib import Path
import tempfile
import unittest
import plistlib
import subprocess
import sys
import uuid

from migrate_project_data import migrate, save_domain_preferences


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        base = Path(self.temporary.name)
        self.root, self.legacy = base / "project", base / "legacy"
        (self.legacy / "Credentials").mkdir(parents=True)
        (self.legacy / "Credentials/credentials.json").write_text(json.dumps({"https://example.com/v1": "fixture-secret"}))
        (self.legacy / "Music").mkdir()
        (self.legacy / "Music/track.wav").write_bytes(b"fixture-audio")
        (self.legacy / "Music/library.json").write_text('[{"id":"fixture", "fileName":"track.wav", "title":"曲目"}]')
        self.preferences = {
            "service.settings": json.dumps({"baseURL": "https://example.com/v1", "model": "fixture-model", "prompt": "角色"}).encode(),
            "desktop.imageHeight": 320,
            "music.selected": "fixture",
        }
        self.saved = None

    def save(self, preferences):
        self.saved = preferences

    def testMigrationPreservesDataAndRemovesOnlyVerifiedOriginals(self):
        result = migrate(self.root, self.legacy, self.preferences, self.save)
        config = json.loads((self.root / "config.json").read_bytes())
        self.assertEqual(config, {"baseURL": "https://example.com/v1", "model": "fixture-model", "apiKeys": {"https://example.com/v1": "fixture-secret"}})
        self.assertEqual((self.root / "config.json").stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / "Music/track.wav").read_bytes(), b"fixture-audio")
        self.assertEqual(self.saved, {"persona.prompt": "角色", "desktop.imageHeight": 320, "music.selected": "fixture"})
        self.assertFalse((self.legacy / "Credentials").exists())
        self.assertFalse((self.legacy / "Music").exists())
        self.assertEqual(result["music_files"], 2)
        migrate(self.root, self.legacy, self.saved, self.save)
        self.assertEqual(json.loads((self.root / "config.json").read_bytes()), config)

    def testMusicConflictStopsBeforeChangingConfigOrRemovingOriginals(self):
        (self.root / "Music").mkdir(parents=True)
        (self.root / "Music/track.wav").write_bytes(b"different")
        with self.assertRaises(ValueError):
            migrate(self.root, self.legacy, self.preferences, self.save)
        self.assertFalse((self.root / "config.json").exists())
        self.assertTrue((self.legacy / "Credentials/credentials.json").exists())
        self.assertEqual((self.legacy / "Music/track.wav").read_bytes(), b"fixture-audio")
        self.assertIsNone(self.saved)

    def testPreferenceFailureKeepsOriginalsAndCanResume(self):
        def fail(_):
            raise OSError("fixture failure")
        with self.assertRaises(OSError):
            migrate(self.root, self.legacy, self.preferences, fail)
        self.assertTrue((self.legacy / "Credentials/credentials.json").exists())
        self.assertTrue((self.legacy / "Music/track.wav").exists())
        migrate(self.root, self.legacy, self.preferences, self.save)
        self.assertFalse((self.legacy / "Credentials").exists())

    def testCredentialConflictAndUnexpectedLegacyFilesAreNotDeleted(self):
        self.root.mkdir()
        (self.root / "config.json").write_text(json.dumps({"baseURL":"https://example.com/v1", "model":"fixture-model", "apiKeys":{"https://example.com/v1":"different-secret"}}))
        with self.assertRaises(ValueError):
            migrate(self.root, self.legacy, self.preferences, self.save)
        self.assertTrue((self.legacy / "Credentials/credentials.json").exists())
        (self.root / "config.json").unlink()
        (self.legacy / "Credentials/unexpected.txt").write_text("preserve")
        with self.assertRaises(ValueError):
            migrate(self.root, self.legacy, self.preferences, self.save)
        self.assertTrue((self.legacy / "Credentials/unexpected.txt").exists())

    @unittest.skipUnless(sys.platform == "darwin", "Requires macOS defaults")
    def testDefaultsMigrationRemovesOldFieldAndPreservesOtherPreferences(self):
        domain = "local.ChihayaPet.MigrationTests." + str(uuid.uuid4())
        try:
            subprocess.run(["defaults", "import", domain, "-"], input=plistlib.dumps(self.preferences), check=True, capture_output=True)
            updated = {"persona.prompt": "角色", "desktop.imageHeight": 320, "music.selected": "fixture"}
            save_domain_preferences(domain, updated)
            actual = plistlib.loads(subprocess.check_output(["defaults", "export", domain, "-"]))
            self.assertEqual(actual, updated)
        finally:
            subprocess.run(["defaults", "delete", domain], capture_output=True)


if __name__ == "__main__":
    unittest.main()
