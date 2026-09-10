"""Bounded CTC reading graph with explicit occurrence and interruption output."""

from dataclasses import dataclass
import math
import numpy as np

from core import AlignmentError, lexical_units


@dataclass(frozen=True)
class GraphConfig:
    repeat_window_words: int = 12
    max_skipped_words: int = 3
    repeat_penalty: float = 12.0
    partial_restart_penalty: float = 18.0
    skip_penalty_per_character: float = 5.0
    skip_base_penalty: float = 12.0
    insertion_entry_penalty: float = 12.0
    insertion_frame_penalty: float = 0.15
    max_trace_cells: int = 40_000_000


def reading_graph(log_probs, tokens, vocabulary, blank_id, frame_step=320, config=GraphConfig()):
    emissions = np.asarray(log_probs, dtype=np.float32)
    if (emissions.ndim != 2 or not len(emissions) or not emissions.shape[1]
            or np.isnan(emissions).any() or np.isposinf(emissions).any()
            or not np.isfinite(emissions.max(axis=1)).all()):
        raise AlignmentError("Invalid graph acoustic evidence")
    if emissions.max() > .0001 or not 0 <= blank_id < emissions.shape[1]:
        raise AlignmentError("Expected log probabilities and a valid blank ID")
    if (not isinstance(frame_step, int) or frame_step <= 0
            or any(type(value) is not int for value in (config.repeat_window_words, config.max_skipped_words, config.max_trace_cells))
            or config.repeat_window_words < 1 or config.max_skipped_words < 0
            or config.max_trace_cells < 1
            or any(not math.isfinite(value) or value < 0 for value in (
                config.repeat_penalty, config.partial_restart_penalty,
                config.skip_penalty_per_character, config.skip_base_penalty,
                config.insertion_entry_penalty, config.insertion_frame_penalty))):
        raise AlignmentError("Invalid reading-graph limits or penalties")
    if "|" not in vocabulary or vocabulary["|"] == blank_id or any(
            not isinstance(value, int) or not 0 <= value < emissions.shape[1] for value in vocabulary.values()):
        raise AlignmentError("Invalid graph label vocabulary")
    units = lexical_units(tokens, profile="torah-spoken-v1")
    if not units:
        raise AlignmentError("Reading graph needs a nonempty reference")
    if np.all(emissions.argmax(axis=1) == blank_id):
        return {"lexicalOccurrences": [], "events": [
            {"kind": "unresolved_word", "lexicalKey": unit["lexicalKey"], "tokenKey": unit["tokenKey"],
             "reason": "No nonblank acoustic label dominates any frame"} for unit in units],
            "pathLogScore": None, "framesAccountedFor": len(emissions), "stateCount": 0,
            "status": "insufficient-acoustic-evidence"}
    labels, owners, character_positions = [], [], []
    bounds = []
    for unit_index, unit in enumerate(units):
        labels.append(vocabulary["|"])
        owners.append(-1)
        character_positions.append(-1)
        first = len(labels) * 2 + 1
        for position, character in enumerate(unit["alignmentText"]):
            if character not in vocabulary or vocabulary[character] == blank_id:
                raise AlignmentError("Reference character outside the acoustic vocabulary")
            labels.append(vocabulary[character])
            owners.append(unit_index)
            character_positions.append(position)
        bounds.append((first, len(labels) * 2 - 1))
    labels.append(vocabulary["|"])
    owners.append(-1)
    character_positions.append(-1)
    base_states = len(labels) * 2 + 1
    state_labels = np.full(base_states + len(units) + 1, blank_id, dtype=np.int32)
    state_owners = np.full(len(state_labels), -1, dtype=np.int32)
    state_positions = np.full(len(state_labels), -1, dtype=np.int32)
    state_labels[1:base_states:2] = labels
    state_owners[1:base_states:2] = owners
    state_positions[1:base_states:2] = character_positions
    incoming = [[] for _ in state_labels]
    # Edge kinds: 0 ordinary, 1 repeat, 2 partial restart, 3 skip, 4 unassigned entry.
    def edge(source, destination, cost=0.0, kind=0):
        incoming[destination].append((source, cost, kind))
    for state in range(base_states):
        edge(state, state)
        if state:
            edge(state - 1, state)
        if state >= 2 and state_labels[state] != blank_id and state_labels[state] != state_labels[state - 2]:
            edge(state - 2, state)
    for unit_index, (first, last) in enumerate(bounds):
        for target in range(max(0, unit_index - config.repeat_window_words + 1), unit_index + 1):
            target_first = bounds[target][0]
            for source in [last, last + 1]:
                edge(source, target_first - 2, -config.repeat_penalty, 1)
                edge(source, target_first - 1, -config.repeat_penalty, 1)
                if state_labels[source] != state_labels[target_first]:
                    edge(source, target_first, -config.repeat_penalty, 1)
        # A partial attempt can restart its current word after consuming audible time.
        for source in range(first, last, 2):
            edge(source, first - 2, -config.partial_restart_penalty, 2)
            edge(source + 1, first - 2, -config.partial_restart_penalty, 2)
            edge(source, first - 1, -config.partial_restart_penalty, 2)
            edge(source + 1, first - 1, -config.partial_restart_penalty, 2)
    for previous in range(-1, len(units)):
        sources = [0] if previous < 0 else [bounds[previous][1], bounds[previous][1] + 1]
        background = base_states + previous + 1
        for source in sources:
            edge(source, background, -config.insertion_entry_penalty, 4)
        edge(background, background)
        for target in range(previous + 1, min(len(units), previous + config.max_skipped_words + 2)):
            skipped = units[previous + 1:target]
            penalty = sum(config.skip_base_penalty + len(unit["alignmentText"]) * config.skip_penalty_per_character for unit in skipped)
            target_first = bounds[target][0]
            for source in [*sources, background]:
                if skipped or source == background:
                    edge(source, target_first - 2, -penalty, 3 if skipped else 0)
                    edge(source, target_first - 1, -penalty, 3 if skipped else 0)
                    if state_labels[source] != state_labels[target_first]:
                        edge(source, target_first, -penalty, 3 if skipped else 0)
    states, frames = len(state_labels), len(emissions)
    if states * frames > config.max_trace_cells:
        raise AlignmentError("Reading graph exceeds its local-region budget; provide passage anchors")
    width = max(map(len, incoming))
    if width >= 65535:
        raise AlignmentError("Too many graph predecessors")
    predecessors = np.zeros((states, width), dtype=np.int32)
    penalties = np.full((states, width), -np.inf, dtype=np.float32)
    kinds = np.zeros((states, width), dtype=np.uint8)
    for state, entries in enumerate(incoming):
        for column, (source, penalty, kind) in enumerate(entries):
            predecessors[state, column], penalties[state, column], kinds[state, column] = source, penalty, kind
    previous = np.full(states, -np.inf, dtype=np.float32)
    previous[0] = 0
    # Delimiters are optional at clip edges, but consume acoustic time when present.
    previous[bounds[0][0] - 1] = 0
    back = np.empty((frames, states), dtype=np.uint16)
    row_indices = np.arange(states)
    for frame, emission in enumerate(emissions):
        candidates = previous[predecessors] + penalties
        choices = candidates.argmax(axis=1)
        scores = emission[state_labels].copy()
        scores[base_states:] = emission.max() - config.insertion_frame_penalty
        previous = candidates[row_indices, choices] + scores
        back[frame] = choices
    finals = {bounds[-1][1]: 0.0, bounds[-1][1] + 1: 0.0,
              base_states - 2: 0.0, base_states - 1: 0.0, states - 1: 0.0}
    for last_read in range(max(-1, len(units) - config.max_skipped_words - 1), len(units) - 1):
        cost = sum(config.skip_base_penalty + len(unit["alignmentText"]) * config.skip_penalty_per_character
                   for unit in units[last_read + 1:])
        sources = [0, bounds[0][0] - 1] if last_read < 0 else [bounds[last_read][1] + offset for offset in range(4)]
        for terminal in [*sources, base_states + last_read + 1]:
            finals[terminal] = cost
    state = max(finals, key=lambda index: previous[index] - finals[index])
    if not np.isfinite(previous[state]):
        raise AlignmentError("No complete reading-graph path")
    total_score = float(previous[state]) - finals[state]
    path, selected_kinds = np.empty(frames, dtype=np.int32), np.zeros(frames, dtype=np.uint8)
    for frame in range(frames - 1, -1, -1):
        path[frame] = state
        choice = back[frame, state]
        selected_kinds[frame] = kinds[state, choice]
        state = int(predecessors[state, choice])
    occurrences, unassigned = [], []
    pending_restart = False
    pending_partial = False
    background_start = None
    for frame, state in enumerate(path):
        if selected_kinds[frame] in {1, 2}:
            pending_restart = True
            pending_partial = bool(selected_kinds[frame] == 2)
        if state >= base_states:
            if background_start is None:
                background_start = frame
            continue
        if background_start is not None:
            unassigned.append({"kind": "unassigned_audio", "sourceStartSample": background_start * frame_step,
                               "sourceEndSample": frame * frame_step})
            background_start = None
        owner = int(state_owners[state])
        if owner < 0:
            continue
        if not occurrences or owner != occurrences[-1]["unitIndex"] or pending_restart:
            occurrences.append({**units[owner], "unitIndex": owner, "sourceStartSample": frame * frame_step,
                                "sourceEndSample": (frame + 1) * frame_step,
                                "restarted": pending_restart, "partialRestart": pending_partial,
                                "observedCharacterPositions": [], "labelLogProbabilities": []})
            pending_restart = pending_partial = False
        current = occurrences[-1]
        current["sourceEndSample"] = (frame + 1) * frame_step
        current["observedCharacterPositions"].append(int(state_positions[state]))
        current["labelLogProbabilities"].append(float(emissions[frame, state_labels[state]]))
    if background_start is not None:
        unassigned.append({"kind": "unassigned_audio", "sourceStartSample": background_start * frame_step,
                           "sourceEndSample": frames * frame_step})
    for occurrence in occurrences:
        observed = set(occurrence.pop("observedCharacterPositions"))
        occurrence["completeWord"] = observed == set(range(len(occurrence["alignmentText"])))
        occurrence["rawAcousticScore"] = math.exp(float(np.mean(occurrence.pop("labelLogProbabilities"))))
    visited = {item["unitIndex"] for item in occurrences if item["completeWord"]}
    events = [*unassigned]
    events += [{"kind": "candidate_skip", "lexicalKey": unit["lexicalKey"], "tokenKey": unit["tokenKey"]}
               for index, unit in enumerate(units) if index not in visited]
    events += [{"kind": "candidate_partial_restart" if item["partialRestart"] else "candidate_repeat",
                "lexicalKey": item["lexicalKey"], "tokenKey": item["tokenKey"], "sourceStartSample": item["sourceStartSample"]}
               for item in occurrences if item["restarted"]]
    return {"lexicalOccurrences": occurrences, "events": events, "pathLogScore": total_score,
            "framesAccountedFor": frames, "stateCount": states, "status": "unreviewed-proposal"}
