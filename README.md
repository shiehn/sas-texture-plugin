# @signalsandsorcery/texture-plugin

Grid-Bound Texture plugin for [Signals & Sorcery](https://signalsandsorcery.com).

## What it is (v1 target)

A `GeneratorPlugin` that orchestrates **contract-aware, non-synth AI textures**
and chops/stitches them onto the scene grid.

The core idea: freeform text-to-audio models (Lyria3, Stable Audio, MusicGen)
are unpredictable by nature — the model picks its own tempo, key, structure.
Stitching freeform clips together rarely works musically. But a synth-like pad
prompt wastes what the model is actually good at.

This plugin treats the generative audio model as a **constrained texture oven**:

- MIDI tracks (contract-driven) remain the rhythmic and harmonic authority.
- An LLM call authors **texture prompts** from the scene contract + every
  existing MIDI track's role prompt, biased away from synth-like outputs and
  toward content a synth cannot make: field recordings, vocal fragments,
  cultural instruments, broken/lo-fi character, story-encoded hybrids.
- DSP (time-stretch, bar-align, pitch-shift, LUFS normalize) enforces every
  musical dimension the model shouldn't be trusted with.
- The resulting textured bed drops into the scene as a new sample track
  layered under the MIDI parts.

> *"Don't generate songs. Generate textures. We handle the music."*

See `sas-assistant/docs-ai-planning/texture-plugin-plan.md` in the host repo
for the full design intent and deferred feature scope.

## Status

**v0.0.1 — scaffold only.** This commit establishes the plugin shape
(conforming to `GeneratorPlugin`) with a placeholder UI panel and a stub
`generate_texture` skill. The core-side `lyria-service` + tool + real UI land
in subsequent commits.

## Install

Peer dependencies: `react`, `react-dom`, `@signalsandsorcery/plugin-sdk`.

The plugin registers itself when loaded by the Signals & Sorcery plugin
registry. In dev, place the built plugin in `{userData}/plugins/` or let the
host app auto-discover it via the usual plugin-loader path.

## Development

```bash
npm install
npm test          # Jest — unit + @testing-library/react
npm run typecheck
npm run lint
npm run build     # tsup produces dist/ (ESM + CJS + .d.ts)
```

## Structure

```
src/
├── index.ts              # barrel export
├── plugin.tsx            # TexturePlugin class (GeneratorPlugin)
├── plugin.json           # Manifest for the SAS plugin registry
└── __tests__/            # Jest conformance tests
```

## License

MIT
