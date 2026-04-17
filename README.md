# @signalsandsorcery/texture-plugin

Grid-Bound Texture plugin for [Signals & Sorcery](https://signalsandsorcery.com).

## What it is

A `GeneratorPlugin` that generates **contract-aware, non-synth AI textures** via
Lyria 3 and drops them onto the active scene as a new audio track.

The core idea: freeform text-to-audio models (Lyria 3, Stable Audio, MusicGen)
are unpredictable by nature. Prompting them for a pad-like synth patch wastes
what they're actually good at — and a synth preset does it for free, better.
Their real superpower is *non-synth content*: field recordings, vocal fragments,
broken gear, cultural instruments, hybrid impossible sources.

This plugin's value-add is the **authored prompt**:

- An LLM call reads the scene contract (style description, genre, key, BPM) and
  every existing track's role, then authors a Lyria-3 prompt biased *away* from
  synth patches and toward content a synth cannot make.
- The texture fills the timbral real estate the existing MIDI tracks leave
  vacant — it doesn't duplicate what they already cover.
- The host's `generateAudioTexture` handles the Lyria 3 call + bar-aligned trim.
- The returned WAV drops onto a new audio track, volume pulled back so it sits
  behind the foreground MIDI.

> *"Don't generate songs. Generate textures. We handle the music."*

See `sas-assistant/docs-ai-planning/texture-plugin-plan.md` in the host repo
for the full design intent. Chop / stitch / per-chord pitch-shift / accent
layers are deferred to v2 (blocked on PluginHost primitives for `split-bars`,
`mix`, and `concatenate`).

## Status

**v0.1.0 — first working implementation.** The plugin authors a prompt from
the scene contract + existing track roles, calls the host's Lyria 3 pipeline,
and adds the result as a new audio track. UI is intentionally spare: a single
**Generate Texture** button plus the authored prompt shown back for audit.
Richer audition / re-roll controls land in v0.2+.

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
├── plugin.tsx            # TexturePlugin class + runGenerateTexture()
├── prompt-authoring.ts   # Lyria-3 prompt authoring (LLM-backed)
├── plugin.json           # Manifest for the SAS plugin registry
└── __tests__/            # Jest tests — orchestration + prompt authoring
```

## License

MIT
