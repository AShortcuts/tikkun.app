"""Portable, explicitly unreviewed timings with durable word-level review flags."""

from core import AlignmentError, digest_json, validate_result

LABELS = {
    "ambiguous_repeated_prefix": "Possible restart or rearticulation. Listen to the word and its lead-in.",
    "candidate_skip": "Possible missing word match. Check whether the complete word was read.",
    "partial_display_token": "Only part of this word group matched. Check each maqaf part.",
    "unassigned_audio": "Audio outside the matched words needs listening review.",
    "uncertain_region_anchor": "The boundary between alignment regions needs timing review.",
    "unresolved_word": "This word could not be placed reliably.",
    "unclear_audio": "Audio quality limits what can be verified.",
}


def generated_draft(bundle, recording, proposal, state, seed):
    validate_result(bundle, recording, seed)
    expected_seed = proposal.get("seedProposalSha256")
    if expected_seed and expected_seed != digest_json(seed):
        raise AlignmentError("The initial alignment changed. Preserve it before downloading provisional timings.")
    rate = proposal["sampleRate"]
    lead = state["playbackLeadSamples"]
    tokens = recording["tokens"]
    grouped, seed_words = {}, {}
    for row in state["occurrences"]:
        grouped.setdefault(row["tokenKey"], []).append(row)
    for row in seed["occurrences"]:
        seed_words.setdefault(row["tokenKey"], row)
    cues, samples = [], []
    basis = digest_json(proposal)[:16]
    for index, token in enumerate(tokens):
        key = token["tokenKey"]
        matches = grouped.get(key, [])
        fallback = seed_words.get(key)
        if not matches and not fallback:
            raise AlignmentError(f"No saved timing exists for word {index + 1}. Keep the review package and repair this alignment first.")
        sample = matches[0]["startSample"] if matches else fallback["sourceStartSample"]
        review = {"source": "torah-audio-aligner", "status": "pending", "flags": []}
        if matches and matches[0]["accepted"]:
            review["status"] = "reviewed"
        if not matches:
            next_samples = [grouped[t["tokenKey"]][0]["startSample"] for t in tokens[index + 1:]
                            if grouped.get(t["tokenKey"])]
            lower = samples[-1] if samples else 0
            upper = next_samples[0] if next_samples else int(recording["durationSeconds"] * rate)
            estimated = not lower < sample < upper
            if estimated:
                sample = (lower + upper) // 2
            review["flags"].append({"id": f"{basis}:missing:{index}", "kind": "unresolved_word",
                "message": "No reliable word match. " + ("This provisional timing is estimated between neighboring words" if estimated else
                    "This provisional timing comes from the saved initial alignment") + "; listen and adjust it.",
                "status": "pending", "sourceTime": sample / rate})
        for repeat_index, row in enumerate(matches[1:], 1):
            review["flags"].append({"id": f"{basis}:repeat:{index}:{repeat_index}", "kind": "repeated_word",
                "message": f"Additional occurrence at {row['startSample'] / rate:.3f}s. This cue starts at the first occurrence; review the repeated reading.",
                "status": "pending", "sourceTime": row["startSample"] / rate})
        cue = {**token["position"], "cueNumber": index + 1,
               "timeStart": 0 if index == 0 else max(0, sample - lead) / rate, "review": review}
        if cues and cue["timeStart"] <= cues[-1]["timeStart"]:
            raise AlignmentError("Edited or repeated word timings are out of canonical order. Repair their order before downloading cues; all original evidence is retained.")
        cues.append(cue)
        samples.append(sample)
    if not cues:
        raise AlignmentError("This recording has no generated timings to download.")
    positions = {token["tokenKey"]: index for index, token in enumerate(tokens)}
    for event_index, event in enumerate(proposal["events"]):
        sample = event.get("sourceStartSample", event.get("sourceSample"))
        index = positions.get(event.get("tokenKey") or event.get("beforeTokenKey"))
        if index is None:
            index = min(range(len(samples)), key=lambda i: abs(samples[i] - (sample or 0)))
        note = state["eventReviews"].get(str(event_index))
        flag = {"id": f"{basis}:event:{event_index}", "kind": event["kind"],
                "message": LABELS.get(event["kind"], event["kind"].replace("_", " ")),
                "status": "reviewed" if note else "pending"}
        if note:
            flag["note"] = note
        if sample is not None:
            flag["sourceTime"] = sample / rate
        cues[index]["review"]["flags"].append(flag)
    for cue in cues:
        if any(flag["status"] == "pending" for flag in cue["review"]["flags"]):
            cue["review"]["status"] = "pending"
    if state["includeAcousticEnds"]:
        for index, token in enumerate(tokens):
            matches = grouped.get(token["tokenKey"], [])
            if len(matches) == 1 and matches[0]["endAccepted"]:
                end = matches[0]["endSample"] / rate
                if index + 1 < len(cues) and end > cues[index + 1]["timeStart"]:
                    raise AlignmentError("A reviewed end overlaps the next cue's highlight lead. Adjust the end or turn off end export.")
                cues[index]["timeEnd"] = end
    return {"audioId": recording["audioId"], "audioFormat": recording["audioFormat"],
            "narratorId": recording["narratorId"], "readingId": recording["readingId"], "aliyah": recording["aliyah"],
            "tokenCount": len(tokens), "cueCount": len(cues), "tokenizationVersion": bundle["tokenizationVersion"],
            "mediaIdentity": recording["mediaIdentity"], "cues": cues}
