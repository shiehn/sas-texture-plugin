/**
 * prompt-authoring unit tests.
 *
 * Focused on the two behaviors that actually matter:
 *   1. buildUserPrompt() threads every field of the scene context + track
 *      roles + hint into a single LLM-facing string. Regressions here
 *      would silently strip signal the LLM needs to produce a good prompt.
 *   2. authorTexturePrompt() calls the LLM with skipContextPrefix: true
 *      (we assemble context manually and must not have it duplicated) and
 *      strips common LLM output artifacts (quotes, "Prompt:" prefixes).
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  authorTexturePrompt,
  buildUserPrompt,
  stripLLMArtifacts,
  type LLMCallFn,
} from '../prompt-authoring';
import type {
  LLMGenerationRequest,
  LLMGenerationResult,
  MusicalContext,
  PluginConcurrentTrackInfo,
  PluginSceneContext,
} from '@signalsandsorcery/plugin-sdk';

function makeLLMStub(content: string): jest.Mock<(req: LLMGenerationRequest) => Promise<LLMGenerationResult>> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return jest.fn<any>().mockResolvedValue({
    content,
    tokensUsed: 42,
    model: 'test-model',
  }) as jest.Mock<(req: LLMGenerationRequest) => Promise<LLMGenerationResult>>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('buildUserPrompt', () => {
  it('returns a bare header when no context is provided', () => {
    const out = buildUserPrompt({});
    expect(out).toMatch(/Write ONE Lyria-3 prompt/);
    expect(out).not.toContain('Genre:');
    expect(out).not.toContain('Key:');
  });

  it('threads contract style, genre, key, BPM, bars into the prompt', () => {
    const sceneContext: PluginSceneContext = {
      hasContract: true,
      contractPrompt: 'dark trip-hop',
      genre: 'Trip-Hop',
      key: { tonic: 'A', mode: 'minor' },
      chords: ['Am', 'Em', 'Dm'],
      bpm: 90,
      bars: 8,
      hasTracks: true,
      isBulkGenerating: false,
    };
    const out = buildUserPrompt({ sceneContext });
    expect(out).toContain('dark trip-hop');
    expect(out).toContain('Genre: Trip-Hop');
    expect(out).toContain('Key: A minor');
    expect(out).toContain('BPM: 90');
    expect(out).toContain('Length: 8 bars');
  });

  it('falls back to MusicalContext when sceneContext is null', () => {
    const musicalContext: MusicalContext = {
      key: 'C',
      mode: 'major',
      bpm: 120,
      bars: 4,
      genre: 'Ambient',
      timeSignature: '4/4',
      chordProgression: [],
    };
    const out = buildUserPrompt({ musicalContext });
    expect(out).toContain('Genre: Ambient');
    expect(out).toContain('Key: C major');
    expect(out).toContain('BPM: 120');
    expect(out).toContain('Length: 4 bars');
  });

  it('lists existing track roles so the LLM can fill vacant real estate', () => {
    const concurrentTracks: PluginConcurrentTrackInfo[] = [
      { trackId: 't1', role: 'bass', presetCategory: 'MPC Sub', notesByChord: [] },
      { trackId: 't2', role: 'drums', presetCategory: null, notesByChord: [] },
      { trackId: 't3', role: 'chords', presetCategory: 'Rhodes', notesByChord: [] },
    ];
    const out = buildUserPrompt({ concurrentTracks });
    expect(out).toContain('bass (MPC Sub)');
    expect(out).toContain('drums');
    expect(out).toContain('chords (Rhodes)');
  });

  it('includes a user hint verbatim when provided', () => {
    const out = buildUserPrompt({ hint: 'lean toward Balkan brass' });
    expect(out).toContain('User hint: lean toward Balkan brass');
  });

  it('trims whitespace-only hints rather than adding an empty line', () => {
    const out = buildUserPrompt({ hint: '   ' });
    expect(out).not.toContain('User hint:');
  });
});

describe('stripLLMArtifacts', () => {
  it('strips a leading "Prompt:" label', () => {
    expect(stripLLMArtifacts('Prompt: rain on tin roof')).toBe('rain on tin roof');
  });
  it('strips matching wrapping quotes', () => {
    expect(stripLLMArtifacts('"rain on tin roof"')).toBe('rain on tin roof');
    expect(stripLLMArtifacts("'rain on tin roof'")).toBe('rain on tin roof');
  });
  it('leaves interior quotes intact', () => {
    expect(stripLLMArtifacts('rain on "tin" roof')).toBe('rain on "tin" roof');
  });
  it('normalizes smart quotes to ASCII', () => {
    expect(stripLLMArtifacts('\u201Crain\u201D on roof')).toBe('"rain" on roof');
  });
  it('trims surrounding whitespace', () => {
    expect(stripLLMArtifacts('  \n  rain on roof  \n  ')).toBe('rain on roof');
  });
});

describe('authorTexturePrompt', () => {
  it('calls the LLM with skipContextPrefix: true so our scene context is not duplicated', async () => {
    const llm = makeLLMStub('rain on a tin roof in a quiet alley, distant trains');
    await authorTexturePrompt(llm as unknown as LLMCallFn, {});
    const call = llm.mock.calls[0][0] as LLMGenerationRequest;
    expect(call.skipContextPrefix).toBe(true);
  });

  it('returns the LLM content with artifacts stripped', async () => {
    const llm = makeLLMStub('  "rain on a tin roof"  ');
    const result = await authorTexturePrompt(llm as unknown as LLMCallFn, {});
    expect(result).toBe('rain on a tin roof');
  });

  it('threads scene context into the user prompt the LLM sees', async () => {
    const llm = makeLLMStub('some prompt');
    await authorTexturePrompt(llm as unknown as LLMCallFn, {
      sceneContext: {
        hasContract: true,
        contractPrompt: '4am subway neon',
        genre: null,
        key: null,
        chords: [],
        bpm: 110,
        bars: 4,
        hasTracks: false,
        isBulkGenerating: false,
      },
    });
    const call = llm.mock.calls[0][0] as LLMGenerationRequest;
    expect(call.user).toContain('4am subway neon');
    expect(call.user).toContain('BPM: 110');
  });

  it('passes a strong anti-synth system prompt', async () => {
    const llm = makeLLMStub('ok');
    await authorTexturePrompt(llm as unknown as LLMCallFn, {});
    const call = llm.mock.calls[0][0] as LLMGenerationRequest;
    // Stable markers we care about: non-synth framing, field-recording hint.
    expect(call.system.toLowerCase()).toContain('non-synth');
    expect(call.system.toLowerCase()).toContain('field recording');
    expect(call.system.toLowerCase()).toContain('avoid');
  });
});
