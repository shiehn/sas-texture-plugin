/**
 * @signalsandsorcery/texture-plugin — Grid-Bound Texture Plugin
 *
 * Scaffold only (v0.0.1). The full feature orchestrates contract-aware
 * non-synth AI textures (field recordings, vocal fragments, cultural
 * instruments, broken/lo-fi character) chopped and stitched to the
 * scene grid. MIDI is the conductor; texture is the color.
 *
 * See sas-assistant/docs-ai-planning/texture-plugin-plan.md for the
 * design intent and the deferred v1 feature scope.
 */

export { TexturePlugin, TEXTURE_PLUGIN_ID } from './plugin';
export type { GenerateTextureInvocation, GenerateTextureResult } from './plugin';

export { default } from './plugin';

// Re-export the manifest so host apps can register the plugin without
// importing the JSON file directly.
export { default as textureManifest } from './plugin.json';
