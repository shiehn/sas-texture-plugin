/**
 * TexturePlugin — `GeneratorPlugin` scaffold for the Grid-Bound Texture idea.
 *
 * v0.0.1 is a deliberate placeholder:
 *   - lifecycle (activate/deactivate) stores the host reference
 *   - UI panel renders a "Coming soon" placeholder
 *   - `generate_texture` skill is registered but returns a not-implemented
 *     marker so the skill dispatcher wiring can be validated end-to-end
 *     before the real feature lands
 *
 * The feature commits that follow this scaffold will:
 *   1. Add `lyria-service.ts` + `generate_grid_bound_texture` tool in
 *      sas-assistant core (plugins can't do HTTP or DSP directly).
 *   2. Replace the skill stub with a proxy that calls the core tool via
 *      PluginHost.
 *   3. Replace the placeholder UI with prompt preview / audition /
 *      re-roll / drop-into-scene controls.
 *
 * See `sas-assistant/docs-ai-planning/texture-plugin-plan.md`.
 */

import React, { type ComponentType } from 'react';
import type {
  GeneratorPlugin,
  PluginHost,
  PluginSettingsSchema,
  PluginSkill,
  PluginUIProps,
} from '@signalsandsorcery/plugin-sdk';

export const TEXTURE_PLUGIN_ID = '@signalsandsorcery/texture-plugin';

export interface GenerateTextureInvocation {
  /**
   * Optional freeform hint. The v1 implementation will combine this with
   * the scene's contract style description + every existing track's role
   * prompt to author Lyria3 prompts. For v0 the field is accepted but
   * ignored.
   */
  hint?: string;
}

export interface GenerateTextureResult {
  status: 'not_implemented';
  message: string;
}

// -----------------------------------------------------------------------------
// UI — placeholder panel
// -----------------------------------------------------------------------------

const TexturePanel: ComponentType<PluginUIProps> = () => {
  return React.createElement(
    'div',
    {
      style: {
        padding: '12px 16px',
        fontSize: 13,
        lineHeight: 1.5,
        opacity: 0.75,
      },
    },
    React.createElement(
      'div',
      { style: { fontWeight: 600, marginBottom: 6 } },
      'Texture'
    ),
    React.createElement(
      'div',
      null,
      'Grid-Bound Texture — coming soon. This panel will orchestrate ',
      'contract-aware non-synth AI textures, chopped and stitched to the ',
      'scene grid.'
    )
  );
};

// -----------------------------------------------------------------------------
// Plugin class
// -----------------------------------------------------------------------------

export class TexturePlugin implements GeneratorPlugin {
  readonly id = TEXTURE_PLUGIN_ID;
  readonly displayName = 'Texture';
  readonly version = '0.0.1';
  readonly description =
    'Grid-Bound Texture — contract-aware non-synth AI textures, chopped and stitched to the scene grid.';
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
          'Generate a grid-bound audio texture layered under the active scene. v0 stub — returns a not-implemented marker. v1 will author Lyria3 prompts from the scene contract + existing track prompts, generate non-synth textures, and chop/stitch them to the bar grid as a new sample track.',
        inputSchema: {
          type: 'object',
          properties: {
            hint: {
              type: 'string',
              description:
                'Optional freeform hint to bias prompt authoring (e.g. "lean toward field recordings"). Ignored in v0.',
            },
          },
        },
        isReadOnly: false,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // External-agent entrypoint — stub for now. When the core tool lands,
  // this will proxy to host.executeAppTool('generate_grid_bound_texture', ...).
  // ---------------------------------------------------------------------------

  async generateTexture(_params: GenerateTextureInvocation): Promise<GenerateTextureResult> {
    if (!this.host) {
      throw new Error('TexturePlugin not activated — host is null');
    }
    return {
      status: 'not_implemented',
      message:
        'Grid-Bound Texture is still a scaffold. The core tool (generate_grid_bound_texture) and Lyria3 wiring land in a subsequent commit.',
    };
  }
}

export default TexturePlugin;
