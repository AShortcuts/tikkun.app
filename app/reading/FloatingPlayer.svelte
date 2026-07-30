<script lang="ts">
  import UiIcon from '../components/UiIcon.svelte'
</script>

<div
  class="floating-player u-hidden"
  data-target-id="floating-player"
  id="floating-player"
  role="region"
  aria-label="Audio player"
>
  <div class="floating-player-sheet-handle" aria-hidden="true"></div>
  <header class="floating-player-header">
    <button
      class="floating-player-drag-handle"
      data-target-id="floating-drag-handle"
      type="button"
      title="Drag to move the audio player"
      aria-label="Move audio player"
    >
      <UiIcon name="grip" />
    </button>
    <div class="floating-player-heading">
      <strong
        class="floating-player-title mod-desktop"
        data-target-id="floating-player-title-desktop">—</strong
      >
      <strong
        class="floating-player-title mod-mobile"
        data-target-id="floating-player-title-mobile">—</strong
      >
      <span
        class="floating-player-subtitle mod-desktop"
        data-target-id="floating-player-subtitle">Audio</span
      >
      <span
        class="floating-player-subtitle mod-mobile"
        data-target-id="floating-player-parsha">—</span
      >
    </div>
    <span class="floating-player-mode-group">
      <span
        class="floating-player-mode"
        data-target-id="floating-player-mode">Word cues</span
      >
      <span
        class="floating-player-cue-progress u-hidden"
        data-target-id="floating-player-cue-progress">Cue 0 / 0</span
      >
    </span>
    <button
      class="floating-player-button mod-expand"
      data-target-id="floating-expand-toggle"
      type="button"
      title="Expand player"
      aria-label="Expand player"
      aria-expanded="false"
    ></button>
    <button
      class="floating-player-mobile-close"
      data-target-id="floating-mobile-close"
      type="button"
      aria-label="Close expanded player"
    >
      <UiIcon name="x" />
    </button>
  </header>

  <div class="floating-player-controls">
    <button
      class="floating-player-button"
      data-target-id="floating-replay"
      type="button"
      title="Restart recording"
      aria-label="Restart recording"
    >
      <span
        class="floating-player-tool-icon"
        data-target-id="floating-replay-icon"
      >
        <UiIcon name="replay" />
      </span>
    </button>
    <button
      class="floating-player-button"
      data-target-id="floating-prev"
      type="button"
      title="Previous Word"
      aria-label="Previous Word"
    ></button>
    <button
      class="floating-player-button"
      data-target-id="floating-play"
      type="button"
      title="Play or pause"
      aria-label="Play or pause"
    ></button>
    <button
      class="floating-player-button"
      data-target-id="floating-next"
      type="button"
      title="Next Word"
      aria-label="Next Word"
    ></button>
    <div class="floating-speed-control">
      <button
        class="floating-player-button mod-speed"
        data-target-id="floating-speed-toggle"
        type="button"
        title="Playback speed"
        aria-label="Playback speed"
        aria-expanded="false"
      >
        <span
          class="floating-player-tool-icon"
          data-target-id="floating-speed-icon"
        >
          <UiIcon name="gauge" />
        </span>
        <span
          class="floating-player-tool-label"
          data-target-id="floating-speed-label">1x speed</span
        >
        <span
          class="floating-player-tool-label mod-compact"
          data-target-id="floating-speed-compact-label"
          aria-hidden="true">1x</span
        >
      </button>
      <div
        class="floating-speed-popover u-hidden"
        data-target-id="floating-speed-popover"
      >
        <input
          class="floating-speed-slider"
          data-target-id="floating-speed-slider"
          type="range"
          min="0.5"
          max="3"
          step="0.05"
          list="floating-speed-marks"
          aria-label="Playback speed"
        />
        <datalist id="floating-speed-marks">
          <option value="0.5" label="0.5x"></option>
          <option value="1" label="1x"></option>
          <option value="1.5" label="1.5x"></option>
          <option value="2" label="2x"></option>
          <option value="3" label="3x"></option>
        </datalist>
        <div class="floating-speed-ticks" aria-hidden="true">
          <span style="--speed-tick-position: 0%">0.5x</span>
          <span style="--speed-tick-position: 20%">1x</span>
          <span style="--speed-tick-position: 40%">1.5x</span>
          <span style="--speed-tick-position: 60%">2x</span>
          <span style="--speed-tick-position: 100%">3x</span>
        </div>
      </div>
    </div>
  </div>

  <div class="mobile-player-timeline">
    <span
      class="mobile-player-word-progress u-hidden"
      data-target-id="mobile-player-word-progress">Word 0 of 0</span
    >
    <span
      class="mobile-player-time"
      data-target-id="mobile-player-current-time">0:00</span
    >
    <input
      class="mobile-player-seek"
      data-target-id="mobile-player-seek"
      type="range"
      min="0"
      max="1000"
      step="1"
      value="0"
      aria-label="Audio position"
    />
    <span
      class="mobile-player-time"
      data-target-id="mobile-player-duration">0:00</span
    >
  </div>

  <button
    class="floating-player-mobile-expand"
    data-target-id="floating-mobile-expand"
    type="button"
    aria-label="Expand audio player"
    aria-expanded="false"
    aria-controls="floating-player"
  >
    <UiIcon name="chevronUp" />
  </button>

  <h3 class="floating-player-tools-heading">Playback controls</h3>
  <div class="floating-player-tools">
    <a
      class="floating-player-button mod-tool mod-save u-hidden"
      data-target-id="floating-download"
      href="./"
      title="Save audio"
      aria-label="Save audio"
      aria-disabled="true"
      tabindex="-1"
    >
      <span
        class="floating-player-tool-icon"
        data-target-id="floating-download-icon"
      >
        <UiIcon name="download" />
      </span>
      <span class="floating-player-tool-label">Save</span>
    </a>
    <a
      class="floating-player-button mod-tool mod-video u-hidden"
      data-target-id="floating-video-download"
      href="./"
      title="Save aliyah video"
      aria-label="Save aliyah video"
      aria-disabled="true"
      tabindex="-1"
    >
      <span
        class="floating-player-tool-icon"
        data-target-id="floating-video-download-icon"
      >
        <UiIcon name="download" />
      </span>
      <span class="floating-player-tool-label">Video</span>
    </a>
  </div>

  <div
    class="floating-player-details"
    data-target-id="floating-player-details"
  >
    <div class="floating-player-meta" data-target-id="floating-player-meta">
      <span
        class="floating-player-meta-item u-hidden"
        data-target-id="floating-meta-status-wrap"
      >
        <span class="floating-player-meta-label">Playback</span>
        <span
          class="floating-player-meta-value"
          data-target-id="floating-meta-status"
        ></span>
      </span>
    </div>
    <div class="floating-player-progress-list">
      <div class="floating-player-progress-item mod-word-progress">
        <div class="floating-player-progress-head">
          <span class="floating-player-progress-label">Word progress</span>
          <span
            class="floating-player-progress-value"
            data-target-id="floating-meta-cues">0 / 0</span
          >
        </div>
      </div>
    </div>
  </div>
</div>

<button
  class="floating-player-backdrop"
  data-target-id="floating-player-backdrop"
  type="button"
  aria-label="Close expanded player"
  aria-hidden="true"
  tabindex="-1"
></button>
