"""Shared offline encoder for original recordings and identified test derivatives."""

import os
import time
import wave
import numpy as np

from core import AlignmentError, frame_geometry


def read_wave(path):
    with wave.open(str(path), "rb") as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (16000, 1, 2):
            raise AlignmentError("Expected mono PCM16 at 16000 samples/second")
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768


def load_encoder(model_dir, cache_dir):
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1", HF_HOME=str(cache_dir))
    import torch
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    extractor = Wav2Vec2FeatureExtractor.from_pretrained(model_dir, local_files_only=True)
    model = Wav2Vec2ForCTC.from_pretrained(model_dir, local_files_only=True, use_safetensors=True)
    model.eval()
    return extractor, model


def encode_samples(samples, encoder, checkpoint, *, capture_features=False, alternative_head=None):
    import torch
    samples = np.asarray(samples, dtype=np.float32)
    step, receptive = frame_geometry(checkpoint["convKernel"], checkpoint["convStride"])
    if samples.ndim != 1 or len(samples) < receptive or not np.isfinite(samples).all():
        raise AlignmentError("Encoder requires finite mono audio longer than its receptive field")
    extractor, model = encoder
    core_samples, context = 20 * 16000, 2 * 16000
    all_emissions, all_starts, all_features = [], [], []
    alternative_emissions = []
    started = time.monotonic()
    with torch.inference_mode():
        for core_start in range(0, len(samples), core_samples):
            core_end = min(len(samples), core_start + core_samples)
            window_start, window_end = max(0, core_start - context), min(len(samples), core_end + context)
            inputs = extractor(samples[window_start:window_end], sampling_rate=16000, return_tensors="pt")
            hidden = model.wav2vec2(**inputs).last_hidden_state
            logits = model.lm_head(model.dropout(hidden))[0]
            expected = (window_end - window_start - receptive) // step + 1
            if logits.shape != (expected, checkpoint["vocabularySize"]):
                raise AlignmentError("Model output differs from the source-time geometry")
            starts = np.arange(expected, dtype=np.int64) * step + window_start
            centers = starts + receptive / 2
            mask = (centers >= core_start) & (centers < core_end)
            all_emissions.append(torch.log_softmax(logits, dim=-1).cpu().numpy()[mask])
            all_starts.append(starts[mask])
            if capture_features:
                all_features.append(hidden[0].cpu().numpy()[mask].astype(np.float16))
            if alternative_head is not None:
                alternative = alternative_head(hidden)[0]
                if alternative.shape != logits.shape:
                    raise AlignmentError("Alternative head changes vocabulary shape")
                alternative_emissions.append(torch.log_softmax(alternative, dim=-1).cpu().numpy()[mask])
    emissions, starts = np.concatenate(all_emissions), np.concatenate(all_starts)
    expected_total = (len(samples) - receptive) // step + 1
    if len(starts) != expected_total or starts[0] != 0 or not np.all(np.diff(starts) == step):
        raise AlignmentError("Context stitching lost or duplicated source frames")
    evidence = {"log_probs": emissions, "frame_starts": starts}
    if capture_features:
        evidence["encoder_features"] = np.concatenate(all_features)
    if alternative_head is not None:
        evidence["adapted_log_probs"] = np.concatenate(alternative_emissions)
    metadata = {"sampleRate": 16000, "decodedSamples": len(samples), "frameStepSamples": step,
                "receptiveFieldSamples": receptive, "coreSeconds": 20, "contextSeconds": 2,
                "sourceOriginSeconds": 0, "removedSilenceSamples": 0,
                "boundaryConvention": "Source bins begin at convolution receptive-field left edges; not calibrated phonetic onsets",
                "acousticInferenceSeconds": time.monotonic() - started}
    if capture_features:
        metadata["encoderFeatures"] = "float16 final hidden states; frame-aligned; encoder frozen"
    return evidence, metadata
