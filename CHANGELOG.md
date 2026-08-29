# Changelog

## 4.0.0 - 2026-08-29

### Added

- Companion 5 and module API 2 support.
- Native scalable gauge layers for level, VU, peak, gain-reduction, and combined rotary presets.
- Horizontal VU presets for wide controls such as Stream Deck + touch strips.
- Tesira-style non-linear VU/peak scaling with green, yellow, and red regions.
- Normalized numeric variables for stable native gauge rendering.
- One-decimal signed dB labels and larger preset text.

### Changed

- Layered presets now render in background, gauge, image, then text order.
- Rotary level gauges use 60% opacity and retain red mute feedback.
- Audio Meter subscriptions use the valid `Audio Meter (Peak & RMS): level` template.
- Only Level-style controls are queried for `minLevel` and `maxLevel`; Audio Meter blocks use the Tesira meter scale.
- The Companion 4-compatible image-buffer implementation remains on the 3.x release line.

### Fixed

- Meter buffers scale to the target control dimensions and use Companion's expected ARGB/base64 encoding.
- VU subscriptions, first-channel numeric publication, mute-state layer overrides, and initial gauge scaling.
- Login prompt handling, polling status reporting, range parsing, and legacy subscription migration regressions.

## 3.0.4

- Fixed Tesira connection handling and secured login support.
