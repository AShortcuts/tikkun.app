"""Real-audio perturbations; generated cut structure is an oracle, not human labeling."""

import json
from dataclasses import asdict
import time
import uuid
import wave
import numpy as np

from acoustics import encode_samples, load_encoder, read_wave
from aligner import HERE, WORK, CHECKPOINT, file_hash, verify_model, work_path, write_json
from analysis_runs import baseline_records, require_budget, record_elapsed
from core import digest_json, lexical_units, greedy_text
from reading_graph import GraphConfig, reading_graph

RATE = 16000


def write_wave(path, samples):
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(np.clip(np.rint(samples * 32768), -32768, 32767).astype("<i2").tobytes())


def fixture(source, parts):
    chunks, mapping, cursor = [], [], 0
    for part in parts:
        if part[0] == "silence":
            chunk = np.zeros(round(part[1] * RATE), dtype=np.float32)
            item = {"operation": "insert-silence"}
        else:
            start, end = round(part[1] * RATE), round(part[2] * RATE)
            chunk = source[start:end].copy()
            item = {"operation": "copy", "originalStartSample": start, "originalEndSample": end,
                    "referenceRole": "outside-passage" if part[0] == "unassigned" else "passage"}
        item.update(derivativeStartSample=cursor, derivativeEndSample=cursor + len(chunk))
        cursor += len(chunk)
        chunks.append(chunk)
        mapping.append(item)
    return np.concatenate(chunks), mapping


def main():
    require_budget(300)
    started = time.monotonic()
    directory = work_path("edge-tests/" + uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    try:
        bundle, records = baseline_records()
        record = next(row for row in records if row["recording"]["audioId"] == "haazinu-1")
        source = read_wave(record["directory"] / "analysis.wav")
        tokens = [token for token in record["recording"]["tokens"] if token["verse"]["verse"] <= 2]
        units = lexical_units(tokens, profile="torah-spoken-v1")
        first_verse = lexical_units([token for token in tokens if token["verse"]["verse"] == 1], profile="torah-spoken-v1")
        keys = [unit["lexicalKey"] for unit in units]
        first_keys = [unit["lexicalKey"] for unit in first_verse]
        definitions = [
            ("clean", [("copy", 0, 25.4)], keys),
            ("leading-silence", [("silence", 2), ("copy", 0, 25.4)], keys),
            ("mid-pause", [("copy", 0, 9.5), ("silence", 3), ("copy", 9.5, 25.4)], keys),
            ("repeat-verse", [("copy", 0, 9.5), ("copy", .7, 25.4)], first_keys + keys),
            ("skip-word", [("copy", 0, 4.9), ("copy", 5.85, 25.4)],
             [key for key in keys if key != tokens[3]["tokenKey"] + "/0"]),
            ("insert-off-passage", [("copy", 0, 9.5), ("unassigned", 33.7, 42.8), ("copy", 9.5, 25.4)], keys),
            ("partial-first-word", [("copy", .7, 1.35), ("silence", .25), ("copy", .7, 25.4)], [keys[0]] + keys),
            ("muffled", [("copy", 0, 25.4)], keys),
            ("noise-12db", [("copy", 0, 25.4)], keys),
        ]
        encoder = load_encoder(verify_model(), work_path("hf-cache"))
        # Same source, same chunk geometry: extraction refactor must preserve emissions.
        evidence, _ = encode_samples(source, encoder, CHECKPOINT)
        with np.load(record["directory"] / "emissions.npz", allow_pickle=False) as original:
            parity = {"exactFrameMap": bool(np.array_equal(evidence["frame_starts"], original["frame_starts"])),
                      "maximumLogProbabilityDifference": float(np.max(abs(evidence["log_probs"] - original["log_probs"])))}
        if not parity["exactFrameMap"] or parity["maximumLogProbabilityDifference"] > 0.00001:
            raise ValueError("Shared encoder changed the established original-recording evidence")
        results = []
        for name, parts, expected in definitions:
            if time.monotonic() - started > 260:
                raise TimeoutError("Edge experiment reached its 260-second worker limit")
            samples, mapping = fixture(source, parts)
            transform = None
            if name == "muffled":
                spectrum = np.fft.rfft(samples)
                spectrum[np.fft.rfftfreq(len(samples), 1 / RATE) > 1000] = 0
                samples = np.fft.irfft(spectrum, n=len(samples)).astype(np.float32)
                transform = {"kind": "fft-lowpass", "cutoffHz": 1000}
            if name == "noise-12db":
                random = np.random.default_rng(20260909)
                noise = random.standard_normal(len(samples)).astype(np.float32)
                noise *= np.sqrt(np.mean(samples ** 2) / np.mean(noise ** 2)) / (10 ** (12 / 20))
                samples = np.clip(samples + noise, -1, .9999695)
                transform = {"kind": "add-white-noise", "seed": 20260909, "wholeClipSNRdB": 12}
            audio_path = directory / (name + ".wav")
            write_wave(audio_path, samples)
            samples = read_wave(audio_path)
            evidence, metadata = encode_samples(samples, encoder, CHECKPOINT)
            cache_path = directory / (name + "-emissions.npz")
            np.savez(cache_path, **evidence)
            graph = reading_graph(evidence["log_probs"], tokens, CHECKPOINT["vocabulary"], CHECKPOINT["blankId"])
            observed = [item["lexicalKey"] for item in graph["lexicalOccurrences"]]
            item = {"fixture": name, "derivativeSha256": file_hash(audio_path),
                    "sourceMediaIdentity": record["recording"]["mediaIdentity"],
                    "sourceAnalysisSha256": file_hash(record["directory"] / "analysis.wav"),
                    "sourceMap": mapping, "transform": transform, "audioSeconds": len(samples) / RATE,
                    "acoustics": {**metadata, "emissionsSha256": file_hash(cache_path)},
                    "graph": graph, "expectedLexicalKeysFromCutStructure": expected,
                    "observedLexicalKeys": observed, "exactOccurrenceSequence": observed == expected,
                    "greedyAcousticText": greedy_text(evidence["log_probs"], CHECKPOINT["vocabulary"], CHECKPOINT["blankId"])}
            write_json(directory / (name + ".json"), item)
            results.append({"fixture": name, "exactOccurrenceSequence": observed == expected,
                            "expectedOccurrences": len(expected), "observedOccurrences": len(observed),
                            "events": graph["events"]})
            print(json.dumps(results[-1]), flush=True)
        summary = {"status": "complete", "inputSha256": digest_json(bundle), "encoderRefactorParity": parity,
                   "sourceAudioId": "haazinu-1", "tokens": tokens, "graphConfig": asdict(GraphConfig()),
                   "results": results, "elapsedSeconds": time.monotonic() - started,
                   "implementation": {name: file_hash(HERE / name) for name in ["test_edges.py", "reading_graph.py", "acoustics.py"]},
                   "limitations": ["Cut locations guided by approximate cues and baseline label spans",
                                   "Partial-word and skipped-word acoustic contents are not independently human-verified",
                                   "Artificial cuts and corruption do not establish natural-error detection accuracy",
                                   "All cases remain development data from one reader"]}
        write_json(directory / "summary.json", summary)
        write_json("latest-edge-tests.json", {"path": str((directory / "summary.json").relative_to(WORK))}, replace=True)
    finally:
        record_elapsed("real-audio-edge-tests", time.monotonic() - started, {"directory": str(directory)})


if __name__ == "__main__":
    main()
