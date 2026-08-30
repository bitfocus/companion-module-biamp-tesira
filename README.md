# companion-module-biamp-tesira

Bitfocus Companion module for controlling and monitoring Biamp Tesira systems through the Tesira Text Protocol.

## Compatibility

- Module 4.x targets Companion 5 and uses the Companion module API 2 runtime.
- Module 3.1.0 remains the supported release for Companion 4.
- Legacy image-buffer meter feedbacks remain available when a Companion 4 configuration is imported into Companion 5.

## Features

- Dual Tesira telnet sessions for commands and recurring polling.
- Tracked subscriptions with automatic re-subscription after reconnect.
- Level, mute, preset, matrix, router, source-selector, polling, and raw-command actions.
- Automatic instance-tag discovery and control-to-meter pairing.
- Manual and discovered presets for buttons, rotary controls, cough/talk workflows, and meters.
- Companion 5 layered presets with scalable level, vertical VU, horizontal VU, peak, and gain-reduction gauges.
- Tesira-style non-linear VU/peak scaling from `-64 dB` through `+36 dB`.
- Native gauge ordering below button images and text, including wide-button support.
- Normalized numeric gauge variables, live Level-block range detection, and optional range/pairing overrides.

See [HELP.md](./companion/HELP.md) for setup, upgrade, preset, and troubleshooting guidance.

## Development

Install dependencies and run the release checks:

```bash
yarn install
yarn test
yarn lint
yarn companion-module-check
yarn package
```

The package command writes `biamp-tesira-<version>.tgz` in the repository root.
