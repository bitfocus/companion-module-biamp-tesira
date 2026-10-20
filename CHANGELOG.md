# Changelog

## 4.0.1 - 2026-10-20

### Fixed

- Upgrade scripts now read and write action options in the Companion 5 `{ isExpression, value }` format. Hold-to-adjust buttons from v2.x keep their repeat interval, and old subscribe-parameter buttons keep a valid Subscription template.
- Custom attribute subscription buttons created under v3 are migrated by a new upgrade script, and buttons made from the v3 Audio Meter presets get the corrected template id.
- Learned level ranges are requested again after a reconnect or instance tag refresh, so level gauges and `_scaled` variables use the real block range.
- Preset text sizes stay valid (`auto` is kept instead of becoming `NaN`).
- Preset sections are listed in category order with stable ids.
- Tags listed in **Always subscribe these VU meter instance tags** are always treated as meters.
- Login prompts are only answered before the Tesira welcome banner, complete lines received with a prompt are kept, and a rejected password now reports an authentication failure instead of retrying forever.
- Connection status keeps its explanation while connecting; the password default is the same at startup and on config save.
- Level range overrides are parsed once per config change.
- The CI workflow uses `actions/checkout@v7`.

### Changed

- Removed the no-op `parseVariablesInString` helper; Companion 5 already resolves variables in action options.
- **Level range overrides** must be separated by commas (as described in the help text). If you used `;` or new lines in v3, update the setting.

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

## 3.1.0

- Companion 4 / module API 1 release containing the functionality originally submitted as 3.0.4.
- Fixed Tesira connection handling and secured login support.
