/**
 * @signalsandsorcery/texture-plugin — Grid-Bound Texture Plugin
 *
 * v0.1.0 — orchestrates contract-aware non-synth AI textures (field
 * recordings, vocal fragments, broken gear, cultural instruments, hybrid
 * impossible sources) via Lyria 3. MIDI tracks remain the conductor;
 * texture is the color the synth tracks can't make.
 *
 * See sas-assistant/docs-ai-planning/texture-plugin-plan.md for design
 * intent and the deferred v2 feature scope (chop/stitch + per-chord
 * pitch-shift + accent layers, blocked on PluginHost primitives for
 * split-bars / mix / concatenate).
 */

export { TexturePlugin, TEXTURE_PLUGIN_ID, runGenerateTexture } from './plugin';
export type { GenerateTextureInvocation, GenerateTextureResult } from './plugin';

export { authorTexturePrompt, buildUserPrompt, stripLLMArtifacts } from './prompt-authoring';
export type { AuthorPromptInputs, LLMCallFn } from './prompt-authoring';

export { default } from './plugin';

// Re-export the manifest so host apps can register the plugin without
// importing the JSON file directly.
export { default as textureManifest } from './plugin.json';
