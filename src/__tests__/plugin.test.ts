/**
 * TexturePlugin lifecycle + orchestration spec (v0.1.0).
 *
 * Verifies:
 *   - GeneratorPlugin identity conformance (id, displayName, version,
 *     generatorType, minHostVersion).
 *   - activate(host) / deactivate() lifecycle.
 *   - Orchestration end-to-end: generateTexture() walks the full
 *     host.getActiveSceneId → getMusicalContext → getGenerationContext →
 *     generateWithLLM → createTrack → generateAudioTexture → writeAudioClip
 *     → setTrackVolume path, with the authored prompt threaded through.
 *   - Failure modes: no active scene returns status 'no_scene' without
 *     mutating the scene; a generation failure deletes the placeholder
 *     track so no orphans are left.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TexturePlugin, TEXTURE_PLUGIN_ID } from '../plugin';

// Minimal fake PluginHost — only the methods the plugin touches.
function makeHost(overrides: Record<string, unknown> = {}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const defaults: Record<string, unknown> = {
    getActiveSceneId: jest.fn<any>().mockReturnValue('scene-abc'),
    getMusicalContext: jest.fn<any>().mockResolvedValue({
      key: 'A',
      mode: 'minor',
      bpm: 90,
      bars: 8,
      genre: 'Trip-Hop',
      timeSignature: '4/4',
      chordProgression: [],
    }),
    getGenerationContext: jest.fn<any>().mockResolvedValue({
      chordProgression: {
        key: { tonic: 'A', mode: 'minor' },
        chordsWithTiming: [],
        genre: 'Trip-Hop',
      },
      concurrentTracks: [
        { trackId: 't1', role: 'bass', presetCategory: 'MPC Sub', notesByChord: [] },
      ],
    }),
    generateWithLLM: jest.fn<any>().mockResolvedValue({
      content: '"rain on a tin roof in a quiet alley, distant trains"',
      tokensUsed: 42,
      model: 'test-model',
    }),
    createTrack: jest.fn<any>().mockResolvedValue({ id: 'track-123' }),
    generateAudioTexture: jest.fn<any>().mockResolvedValue({
      filePath: '/tmp/tex.wav',
      durationSeconds: 16.0,
    }),
    writeAudioClip: jest.fn<any>().mockResolvedValue(undefined),
    setTrackVolume: jest.fn<any>().mockResolvedValue(undefined),
    deleteTrack: jest.fn<any>().mockResolvedValue(undefined),
    showToast: jest.fn(),
  };
  return { ...defaults, ...overrides };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('TexturePlugin — GeneratorPlugin conformance', () => {
  let plugin: TexturePlugin;

  beforeEach(() => {
    plugin = new TexturePlugin();
  });

  describe('identity', () => {
    it('has the canonical plugin id', () => {
      expect(plugin.id).toBe(TEXTURE_PLUGIN_ID);
      expect(plugin.id).toBe('@signalsandsorcery/texture-plugin');
    });

    it('declares displayName, version, description, generatorType', () => {
      expect(plugin.displayName).toBe('Texture');
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(plugin.description).toBeTruthy();
      expect(plugin.generatorType).toBe('audio');
    });

    it('declares a minHostVersion (skill-capable host, >=1.1.0)', () => {
      expect(plugin.minHostVersion).toBeDefined();
      expect(plugin.minHostVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('activate / deactivate', () => {
    it('activate(host) does not throw', async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await expect(plugin.activate(makeHost() as any)).resolves.toBeUndefined();
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    it('deactivate() releases host reference and is idempotent', async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await plugin.activate(makeHost() as any);
      await plugin.deactivate();
      await expect(plugin.deactivate()).resolves.toBeUndefined();
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
  });

  describe('UI & settings', () => {
    it('getUIComponent() returns a renderable React component type', () => {
      const C = plugin.getUIComponent();
      expect(typeof C === 'function' || (typeof C === 'object' && C !== null)).toBe(true);
    });

    it('getSettingsSchema() returns null in v0.1.0', () => {
      expect(plugin.getSettingsSchema()).toBeNull();
    });
  });

  describe('getSkills()', () => {
    it('declares a single `generate_texture` skill', () => {
      const skills = plugin.getSkills?.() ?? [];
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('generate_texture');
      expect(skills[0].description).toBeTruthy();
    });

    it('generate_texture skill accepts optional `hint` and `volume`', () => {
      const skill = plugin.getSkills?.()?.[0];
      expect(skill?.inputSchema.type).toBe('object');
      const props = (skill?.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(props).toHaveProperty('hint');
      expect(props).toHaveProperty('volume');
      expect(skill?.inputSchema.required ?? []).not.toContain('hint');
      expect(skill?.inputSchema.required ?? []).not.toContain('volume');
    });
  });
});

describe('TexturePlugin.generateTexture() — orchestration', () => {
  let plugin: TexturePlugin;

  beforeEach(() => {
    plugin = new TexturePlugin();
  });

  it('walks the full host pipeline and returns status ok', async () => {
    const host = makeHost();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await plugin.activate(host as any);
    const result = await plugin.generateTexture({});
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(result.status).toBe('ok');
    expect(result.trackId).toBe('track-123');
    expect(result.filePath).toBe('/tmp/tex.wav');
    expect(result.durationSeconds).toBe(16.0);
    // Prompt was returned AND had its wrapping quotes stripped by the
    // artifact-scrubber in prompt-authoring.
    expect(result.prompt).toBe('rain on a tin roof in a quiet alley, distant trains');

    // Verify the sequence of host calls.
    expect(host.getActiveSceneId).toHaveBeenCalled();
    expect(host.getMusicalContext).toHaveBeenCalled();
    expect(host.getGenerationContext).toHaveBeenCalled();
    expect(host.generateWithLLM).toHaveBeenCalledTimes(1);
    expect(host.createTrack).toHaveBeenCalledTimes(1);
    expect(host.generateAudioTexture).toHaveBeenCalledTimes(1);
    expect(host.writeAudioClip).toHaveBeenCalledWith('track-123', '/tmp/tex.wav');
    expect(host.setTrackVolume).toHaveBeenCalledWith('track-123', 0.6);
    expect(host.deleteTrack).not.toHaveBeenCalled();
  });

  it('passes the scene BPM to generateAudioTexture', async () => {
    const host = makeHost();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await plugin.activate(host as any);
    await plugin.generateTexture({});
    const call = (host.generateAudioTexture as any).mock.calls[0][0];
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(call.bpm).toBe(90);
    expect(typeof call.prompt).toBe('string');
    expect(call.prompt.length).toBeGreaterThan(0);
  });

  it('respects a custom volume in range', async () => {
    const host = makeHost();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await plugin.activate(host as any);
    await plugin.generateTexture({ volume: 0.3 });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(host.setTrackVolume).toHaveBeenCalledWith('track-123', 0.3);
  });

  it('ignores an out-of-range volume and uses the default', async () => {
    const host = makeHost();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await plugin.activate(host as any);
    await plugin.generateTexture({ volume: 5 });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(host.setTrackVolume).toHaveBeenCalledWith('track-123', 0.6);
  });

  it('returns status no_scene when no scene is active and does NOT create a track', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const host = makeHost({ getActiveSceneId: jest.fn<any>().mockReturnValue(null) });
    await plugin.activate(host as any);
    const result = await plugin.generateTexture({});
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(result.status).toBe('no_scene');
    expect(result.message).toBeTruthy();
    expect(host.createTrack).not.toHaveBeenCalled();
    expect(host.generateAudioTexture).not.toHaveBeenCalled();
  });

  it('cleans up the orphan track when generateAudioTexture throws', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const host = makeHost({
      generateAudioTexture: jest.fn<any>().mockRejectedValue(new Error('Lyria unavailable')),
    });
    await plugin.activate(host as any);
    const result = await plugin.generateTexture({});
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/Lyria unavailable/);
    expect(host.createTrack).toHaveBeenCalledTimes(1);
    expect(host.deleteTrack).toHaveBeenCalledWith('track-123');
    expect(host.writeAudioClip).not.toHaveBeenCalled();
  });

  it('refuses to run before activation with a clear error', async () => {
    await expect(plugin.generateTexture({})).rejects.toThrow(/not activated/i);
  });

  it('still produces a result when getMusicalContext + getGenerationContext fail', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const host = makeHost({
      getMusicalContext: jest.fn<any>().mockRejectedValue(new Error('boom')),
      getGenerationContext: jest.fn<any>().mockRejectedValue(new Error('boom')),
    });
    await plugin.activate(host as any);
    const result = await plugin.generateTexture({});
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(result.status).toBe('ok');
    // bpm omitted because musical context failed
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const audioCall = (host.generateAudioTexture as any).mock.calls[0][0];
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(audioCall.bpm).toBeUndefined();
  });
});
