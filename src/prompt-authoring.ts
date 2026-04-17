/**
 * Prompt authoring — turn scene context into a Lyria3 prompt for
 * *non-synth* content (field recording, vocal fragment, broken gear,
 * cultural instrument, hybrid impossible source). The host app's
 * built-in `audio-texture` plugin already lets users type any prompt;
 * our value-add is the *authored* prompt that's biased away from synth
 * patches and tailored to the scene's contract + existing track roles.
 */

import type {
  LLMGenerationRequest,
  LLMGenerationResult,
  MusicalContext,
  PluginConcurrentTrackInfo,
  PluginSceneContext,
} from '@signalsandsorcery/plugin-sdk';

/** Inputs to a single prompt-authoring call. */
export interface AuthorPromptInputs {
  /** Scene contract state handed to every plugin via UIProps. Optional — a
   *  scene with no contract yet still produces a usable prompt. */
  sceneContext?: PluginSceneContext | null;
  /** Lightweight musical context from `host.getMusicalContext()`. Used for
   *  BPM / key / bars when `sceneContext` is absent. Optional. */
  musicalContext?: MusicalContext | null;
  /** Concurrent tracks from `host.getGenerationContext()`. We only read the
   *  `role` + `presetCategory` so the LLM can fill the timbral real estate
   *  the existing MIDI parts leave vacant. Ignored if empty/undefined. */
  concurrentTracks?: PluginConcurrentTrackInfo[];
  /** Optional freeform hint from the user — passed straight through and
   *  tagged so the LLM weighs it against the contract rather than ignoring
   *  it. */
  hint?: string;
}

/** Function signature a plugin instance can call — matches the shape of
 *  `PluginHost.generateWithLLM` so tests can inject a fake trivially. */
export type LLMCallFn = (request: LLMGenerationRequest) => Promise<LLMGenerationResult>;

const SYSTEM_PROMPT = `You write audio-generation prompts for Lyria 3, but ONLY for non-synth content. A synth cannot make what you prompt for.

Lean hard toward:
- Field recordings (rain on tin, subway tunnel wind, factory machinery, distant traffic, crowd murmur, wind through power lines)
- Vocal fragments & cultural instruments (Bulgarian choir fragment, Turkish saz through tape, throat singing, Arabic vocal run, Gregorian chant, children's voices, hurdy-gurdy)
- Broken / lo-fi character (cassette warble, vinyl crackle, AM radio static, tape bleed, warped Super-8 projector whir, degraded analog video hum)
- Hybrid impossible sources ("whale song through a broken radio", "crumpling paper with distant bells", "speaker cone rattling a glass bead")
- Story-encoded environments ("1940s speakeasy crowd through a dusty tube amp", "abandoned Tokyo mall at 3am", "desert wind through a telephone line")

Explicitly AVOID:
- Synth patches, pads, leads, basses, keys, plucks
- Anything describable as a standard instrument preset
- Foreground melodic content (MIDI tracks handle melody/harmony)
- The word "synth" in any form

The texture is a *bed* that sits behind the existing MIDI tracks. Do not duplicate timbres the existing tracks already cover — fill the midfield / atmosphere / ambience they leave vacant.

Output EXACTLY one prompt. 1–2 sentences. No quotes, no labels, no explanation, no formatting. Just the prompt string.`;

/** Format inputs → a single user-prompt string for the LLM. Exported for
 *  test assertions that want to verify the LLM actually saw the scene
 *  context. */
export function buildUserPrompt(inputs: AuthorPromptInputs): string {
  const lines: string[] = [];

  const ctx = inputs.sceneContext;
  const mc = inputs.musicalContext;

  if (ctx?.contractPrompt) {
    lines.push(`Scene style (user's contract prompt): ${ctx.contractPrompt}`);
  }
  const genre = ctx?.genre ?? mc?.genre ?? null;
  if (genre) {
    lines.push(`Genre: ${genre}`);
  }
  const tonic = ctx?.key?.tonic ?? mc?.key ?? null;
  const mode = ctx?.key?.mode ?? mc?.mode ?? null;
  if (tonic && mode) {
    lines.push(`Key: ${tonic} ${mode}`);
  }
  const bpm = ctx?.bpm ?? mc?.bpm ?? null;
  if (bpm) {
    lines.push(`BPM: ${bpm}`);
  }
  const bars = ctx?.bars ?? mc?.bars ?? null;
  if (bars) {
    lines.push(`Length: ${bars} bars`);
  }

  const existing = (inputs.concurrentTracks ?? [])
    .map((t) => {
      const role = t.role ?? 'track';
      const cat = t.presetCategory ? ` (${t.presetCategory})` : '';
      return `${role}${cat}`;
    })
    .filter(Boolean);
  if (existing.length > 0) {
    lines.push(`Existing tracks in this scene: ${existing.join(', ')}`);
  }

  if (inputs.hint && inputs.hint.trim()) {
    lines.push(`User hint: ${inputs.hint.trim()}`);
  }

  const header =
    'Write ONE Lyria-3 prompt for a non-synth atmospheric texture bed for this scene. Fill timbral real estate the existing tracks leave vacant — do not duplicate what they already cover.';

  return lines.length > 0 ? `${header}\n\n${lines.join('\n')}` : header;
}

/** Author a single Lyria-3 prompt by calling the host's LLM. */
export async function authorTexturePrompt(
  llm: LLMCallFn,
  inputs: AuthorPromptInputs
): Promise<string> {
  const response = await llm({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(inputs),
    maxTokens: 200,
    responseFormat: 'text',
    // We already include scene context in the user prompt. Skip the host's
    // auto-prefix so context doesn't duplicate (and so role/preset info,
    // which the auto-prefix does NOT include, is the same line count the
    // LLM expects).
    skipContextPrefix: true,
  });

  // Strip stray quotes / leading labels the model sometimes adds despite
  // the system instruction.
  return stripLLMArtifacts(response.content);
}

/** Normalize common LLM output artifacts: wrapping quotes, "Prompt: " prefixes. */
export function stripLLMArtifacts(raw: string): string {
  let out = raw.trim();
  // Remove a leading label like "Prompt:", "Texture:", etc.
  out = out.replace(/^(prompt|texture|output|result)\s*:\s*/i, '');
  // Strip matching wrapping quotes.
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  // Collapse any interior smart quotes the model emits.
  out = out.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  return out.trim();
}
