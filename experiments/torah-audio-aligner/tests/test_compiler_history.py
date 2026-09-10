"""Old alignments remain readable without weakening source-data integrity."""

import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from aligner import verify_sources
from core import AlignmentError


class CompilerHistoryTests(unittest.TestCase):
    def test_history_requires_exact_bytes_and_still_verifies_audio_and_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            work = root / "work"
            pages = root / "text/pages/torah"
            pages.mkdir(parents=True)
            source = root / "validator.ts"
            source.write_bytes(b"new compiler")
            original = b"original compiler"
            expected = hashlib.sha256(original).hexdigest()
            archived = work / "compiler-history" / expected / source.name
            archived.parent.mkdir(parents=True)
            archived.write_bytes(original)
            audio = root / "site/audio/fixture.mp3"
            audio.parent.mkdir(parents=True)
            audio.write_bytes(b"test audio")
            recording = {"audioId": "fixture", "mediaPath": "site/audio/fixture.mp3",
                         "mediaIdentity": {"algorithm": "sha256", "digest": hashlib.sha256(audio.read_bytes()).hexdigest(), "byteLength": audio.stat().st_size}}
            bundle = {"compilerSources": {source.name: expected}, "textPagesSha256": hashlib.sha256(b"").hexdigest(),
                      "recordings": [recording]}
            with patch("aligner.REPO", root), patch("aligner.WORK", work):
                verify_sources(bundle)
                archived.write_bytes(b"changed archive")
                with self.assertRaisesRegex(AlignmentError, "Source changed"):
                    verify_sources(bundle)
                archived.write_bytes(original)
                audio.write_bytes(b"bad audio!")
                with self.assertRaisesRegex(AlignmentError, "Recording bytes changed"):
                    verify_sources(bundle)
                audio.write_bytes(b"test audio")
                (pages / "1.json").write_text("[]")
                with self.assertRaisesRegex(AlignmentError, "Canonical text changed"):
                    verify_sources(bundle)


if __name__ == "__main__":
    unittest.main()
