/**
 * TexturePlugin — Grid-Bound Texture.
 *
 * v0.1.0 — first working implementation. Orchestrates a non-synth AI
 * texture onto the active scene:
 *
 *   1. authorTexturePrompt() calls host.generateWithLLM with a system
 *      prompt biased away from synth patches and toward field-recording /
 *      vocal-fragment / broken-gear / cultural-instrument content. Reads
 *      scene contract + existing track roles so the texture fills the
 *      timbral real estate the MIDI parts leave vacant.
 *   2. host.createTrack() — a new audio-capable track owned by this plugin.
 *   3. host.generateAudioTexture({ prompt, bpm }) — the host handles
 *      Lyria3 + bar-aligned trim internally.
 *   4. host.writeAudioClip(trackId, filePath) — the returned WAV is
 *      placed onto the track.
 *   5. host.setTrackVolume(trackId, 0.6) — textures sit back in the mix
 *      relative to the foreground MIDI.
 *
 * Chop/stitch + per-chord pitch-shift are v2+ and require extending
 * PluginHost (no split-bars / mix / concat primitives today). v1 ships
 * without them — unique value is the *authored prompt*, not the DSP.
 */

import React, { useCallback, useState, type ComponentType } from 'react';
import type {
  GeneratorPlugin,
  PluginHost,
  PluginSettingsSchema,
  PluginSkill,
  PluginUIProps,
  PluginConcurrentTrackInfo,
} from '@signalsandsorcery/plugin-sdk';
import { authorTexturePrompt } from './prompt-authoring';

export const TEXTURE_PLUGIN_ID = '@signalsandsorcery/texture-plugin';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export interface GenerateTextureInvocation {
  /** Optional freeform hint biasing the authored prompt, e.g. "lean toward
   *  field recordings" or "more vocal fragments this time". */
  hint?: string;
  /** Optional track volume (0..1). Default 0.6 — textures sit back in the
   *  mix. Exposed because an occasional user may want a more present bed. */
  volume?: number;
}

export interface GenerateTextureResult {
  status: 'ok' | 'no_scene' | 'error';
  /** The Lyria-3 prompt the LLM authored. Useful for debugging + UI audit. */
  prompt?: string;
  /** Handle id of the created track, if status === 'ok'. */
  trackId?: string;
  /** WAV file path returned by generateAudioTexture. */
  filePath?: string;
  /** Duration of the generated audio in seconds. */
  durationSeconds?: number;
  /** Human-readable message for error/no_scene statuses. */
  message?: string;
}

// -----------------------------------------------------------------------------
// Core orchestration — pure function over a host. Exported for direct tests
// without needing the UI component.
// -----------------------------------------------------------------------------

export async function runGenerateTexture(
  host: PluginHost,
  params: GenerateTextureInvocation
): Promise<GenerateTextureResult> {
  const sceneId = host.getActiveSceneId();
  if (!sceneId) {
    return {
      status: 'no_scene',
      message: 'No active scene — select a scene before generating a texture.',
    };
  }

  // Pull scene context in parallel. Both are best-effort: if the host
  // doesn't support getGenerationContext yet or the scene has no contract,
  // we still produce a useful prompt from whatever we have.
  const [musicalContext, generationContext] = await Promise.all([
    host.getMusicalContext().catch(() => null),
    host.getGenerationContext().catch(() => null),
  ]);

  const concurrentTracks: PluginConcurrentTrackInfo[] =
    generationContext?.concurrentTracks ?? [];

  // 1. Author the prompt.
  const prompt = await authorTexturePrompt(
    (req) => host.generateWithLLM(req),
    {
      musicalContext,
      concurrentTracks,
      hint: params.hint,
    }
  );

  // 2. Create an audio-capable track for the texture.
  const handle = await host.createTrack({
    name: `texture-${Date.now().toString(36)}`,
    role: 'fx',
  });

  try {
    // 3. Generate the audio. Host internally Lyria3s + bar-aligns.
    const generated = await host.generateAudioTexture({
      prompt,
      bpm: musicalContext?.bpm,
    });

    // 4. Place the WAV on the track.
    await host.writeAudioClip(handle.id, generated.filePath);

    // 5. Textures sit back behind the MIDI mix.
    const volume =
      typeof params.volume === 'number' && params.volume >= 0 && params.volume <= 1
        ? params.volume
        : 0.6;
    await host.setTrackVolume(handle.id, volume);

    return {
      status: 'ok',
      prompt,
      trackId: handle.id,
      filePath: generated.filePath,
      durationSeconds: generated.durationSeconds,
    };
  } catch (error: unknown) {
    // On any failure past track creation, clean up the empty track so we
    // don't leave orphans in the scene.
    await host.deleteTrack(handle.id).catch(() => {});
    const message = error instanceof Error ? error.message : 'Texture generation failed';
    return { status: 'error', prompt, message };
  }
}

// -----------------------------------------------------------------------------
// Regenerate — re-author the prompt against current scene context and replace
// the audio on an existing track. Volume is preserved unless explicitly set.
// -----------------------------------------------------------------------------

export async function runRegenerateTexture(
  host: PluginHost,
  trackId: string,
  params: GenerateTextureInvocation
): Promise<GenerateTextureResult> {
  const sceneId = host.getActiveSceneId();
  if (!sceneId) {
    return {
      status: 'no_scene',
      message: 'No active scene — select a scene before regenerating a texture.',
    };
  }

  const [musicalContext, generationContext] = await Promise.all([
    host.getMusicalContext().catch(() => null),
    host.getGenerationContext().catch(() => null),
  ]);

  const concurrentTracks: PluginConcurrentTrackInfo[] =
    generationContext?.concurrentTracks ?? [];

  const prompt = await authorTexturePrompt(
    (req) => host.generateWithLLM(req),
    {
      musicalContext,
      concurrentTracks,
      hint: params.hint,
    }
  );

  try {
    const generated = await host.generateAudioTexture({
      prompt,
      bpm: musicalContext?.bpm,
    });
    await host.writeAudioClip(trackId, generated.filePath);

    if (typeof params.volume === 'number' && params.volume >= 0 && params.volume <= 1) {
      await host.setTrackVolume(trackId, params.volume);
    }

    return {
      status: 'ok',
      prompt,
      trackId,
      filePath: generated.filePath,
      durationSeconds: generated.durationSeconds,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Texture regeneration failed';
    return { status: 'error', prompt, message };
  }
}

// -----------------------------------------------------------------------------
// UI — Generate + Solo + Regenerate.
//
// Generate creates a brand-new track with a freshly authored prompt. After a
// track exists, Solo and Regenerate operate on that last-generated track:
// Solo toggles audio isolation (standard mixer behavior via host.setTrackSolo),
// Regenerate re-authors the prompt and replaces the clip in-place.
// -----------------------------------------------------------------------------

const TexturePanel: ComponentType<PluginUIProps> = ({ host, activeSceneId }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSoloing, setIsSoloing] = useState(false);
  const [isSoloed, setIsSoloed] = useState(false);
  const [lastTrackId, setLastTrackId] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const busy = isGenerating || isRegenerating || isSoloing;
  const generateDisabled = busy || !activeSceneId;
  const trackActionsDisabled = busy || !activeSceneId || !lastTrackId;

  const handleGenerate = useCallback(async (): Promise<void> => {
    setIsGenerating(true);
    setLastStatus(null);
    try {
      const result = await runGenerateTexture(host, {});
      if (result.status === 'ok') {
        setLastPrompt(result.prompt ?? null);
        setLastTrackId(result.trackId ?? null);
        setIsSoloed(false);
        setLastStatus('Generated');
        host.showToast?.('success', 'Texture generated');
      } else if (result.status === 'no_scene') {
        setLastStatus(result.message ?? 'No scene');
        host.showToast?.('warning', 'Select a scene first');
      } else {
        setLastStatus(result.message ?? 'Error');
        host.showToast?.('error', 'Texture generation failed', result.message);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [host]);

  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!lastTrackId) return;
    setIsRegenerating(true);
    setLastStatus(null);
    try {
      const result = await runRegenerateTexture(host, lastTrackId, {});
      if (result.status === 'ok') {
        setLastPrompt(result.prompt ?? null);
        setLastStatus('Regenerated');
        host.showToast?.('success', 'Texture regenerated');
      } else if (result.status === 'no_scene') {
        setLastStatus(result.message ?? 'No scene');
        host.showToast?.('warning', 'Select a scene first');
      } else {
        setLastStatus(result.message ?? 'Error');
        host.showToast?.('error', 'Texture regeneration failed', result.message);
      }
    } finally {
      setIsRegenerating(false);
    }
  }, [host, lastTrackId]);

  const handleToggleSolo = useCallback(async (): Promise<void> => {
    if (!lastTrackId) return;
    const next = !isSoloed;
    setIsSoloing(true);
    try {
      await host.setTrackSolo(lastTrackId, next);
      setIsSoloed(next);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Solo failed';
      host.showToast?.('error', 'Solo failed', message);
    } finally {
      setIsSoloing(false);
    }
  }, [host, lastTrackId, isSoloed]);

  const buttonStyle = (disabled: boolean, accent = false): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    background: accent ? 'rgba(106, 242, 197, 0.2)' : undefined,
    border: accent ? '1px solid rgba(106, 242, 197, 0.6)' : undefined,
    color: accent ? '#6AF2C5' : undefined,
  });

  return React.createElement(
    'div',
    { style: { padding: '12px 16px', fontSize: 13, lineHeight: 1.5 } },
    React.createElement(
      'div',
      { style: { fontWeight: 600, marginBottom: 8 } },
      'Texture'
    ),
    React.createElement(
      'div',
      { style: { opacity: 0.75, marginBottom: 12 } },
      'Authors a non-synth Lyria 3 prompt from the scene contract + existing track roles, then drops the generated audio as a new track.'
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      React.createElement(
        'button',
        {
          onClick: handleGenerate,
          disabled: generateDisabled,
          style: buttonStyle(generateDisabled),
        },
        isGenerating ? 'Generating…' : 'Generate Texture'
      ),
      React.createElement(
        'button',
        {
          onClick: handleRegenerate,
          disabled: trackActionsDisabled,
          style: buttonStyle(trackActionsDisabled),
          title: lastTrackId
            ? 'Re-author the prompt and replace the clip on the last-generated track'
            : 'Generate a track first',
        },
        isRegenerating ? 'Regenerating…' : 'Regenerate'
      ),
      React.createElement(
        'button',
        {
          onClick: handleToggleSolo,
          disabled: trackActionsDisabled,
          style: buttonStyle(trackActionsDisabled, isSoloed),
          title: lastTrackId
            ? isSoloed
              ? 'Un-solo the last-generated texture track'
              : 'Solo the last-generated texture track'
            : 'Generate a track first',
        },
        isSoloing ? 'Working…' : isSoloed ? 'Unsolo' : 'Solo'
      )
    ),
    lastStatus &&
      React.createElement(
        'div',
        { style: { marginTop: 10, fontSize: 12, opacity: 0.8 } },
        lastStatus
      ),
    lastPrompt &&
      React.createElement(
        'div',
        {
          style: {
            marginTop: 8,
            padding: '8px 10px',
            fontSize: 12,
            fontStyle: 'italic',
            opacity: 0.7,
            borderLeft: '2px solid rgba(255,255,255,0.2)',
          },
        },
        lastPrompt
      )
  );
};

// -----------------------------------------------------------------------------
// Plugin class
// -----------------------------------------------------------------------------

export class TexturePlugin implements GeneratorPlugin {
  readonly id = TEXTURE_PLUGIN_ID;
  readonly displayName = 'Texture';
  readonly version = '0.2.0';
  readonly description =
    'Grid-Bound Texture — contract-aware non-synth AI textures via Lyria 3.';
  readonly generatorType = 'audio' as const;
  readonly minHostVersion = '1.3.0';

  private host: PluginHost | null = null;

  async activate(host: PluginHost): Promise<void> {
    this.host = host;
  }

  async deactivate(): Promise<void> {
    this.host = null;
  }

  getUIComponent(): ComponentType<PluginUIProps> {
    return TexturePanel;
  }

  getSettingsSchema(): PluginSettingsSchema | null {
    return null;
  }

  getSkills(): PluginSkill[] {
    return [
      {
        id: 'generate_texture',
        description:
          'Generate a non-synth Lyria-3 audio texture on the active scene. Authors the Lyria prompt from the scene contract + existing track roles so the texture fills timbral real estate the MIDI parts leave vacant. Returns the authored prompt, the resulting track id, and the WAV path.',
        inputSchema: {
          type: 'object',
          properties: {
            hint: {
              type: 'string',
              description:
                'Optional freeform hint biasing the authored prompt (e.g. "lean toward field recordings"). Passed verbatim to the authoring LLM.',
            },
            volume: {
              type: 'number',
              description:
                'Optional track volume (0..1). Default 0.6 — textures sit back in the mix.',
            },
          },
        },
        isReadOnly: false,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // External-agent entrypoint. Follows the same convention as
  // ChatPanelPlugin.chat — method name matches the skill id (camelCased).
  // ---------------------------------------------------------------------------

  async generateTexture(params: GenerateTextureInvocation): Promise<GenerateTextureResult> {
    if (!this.host) {
      throw new Error('TexturePlugin not activated — host is null');
    }
    return runGenerateTexture(this.host, params);
  }
}

export default TexturePlugin;
