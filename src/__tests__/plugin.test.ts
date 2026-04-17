/**
 * TexturePlugin lifecycle spec (v0 scaffold).
 *
 * Verifies conformance to the GeneratorPlugin interface from the SDK:
 *   - static identity (id, displayName, version, generatorType, minHostVersion)
 *   - activate(host) / deactivate() lifecycle
 *   - getUIComponent() returns a renderable React component type
 *   - getSettingsSchema() returns null (no settings in v0)
 *   - getSkills() declares the `generate_texture` stub skill
 *   - generateTexture() returns a not_implemented marker until the core
 *     tool lands in a subsequent commit
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TexturePlugin, TEXTURE_PLUGIN_ID } from '../plugin';

describe('TexturePlugin — GeneratorPlugin conformance (v0 scaffold)', () => {
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
      // The plugin produces audio sample tracks (via the core tool, once wired).
      expect(plugin.generatorType).toBe('audio');
    });

    it('declares a minHostVersion with a skill-capable host (>=1.1.0)', () => {
      expect(plugin.minHostVersion).toBeDefined();
      expect(plugin.minHostVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('activate / deactivate', () => {
    it('activate(host) does not throw', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(plugin.activate({} as any)).resolves.toBeUndefined();
    });

    it('deactivate() releases host reference and is idempotent', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await plugin.activate({} as any);
      await plugin.deactivate();
      await expect(plugin.deactivate()).resolves.toBeUndefined();
    });
  });

  describe('generateTexture()', () => {
    it('returns a not_implemented marker when activated', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await plugin.activate({} as any);
      const result = await plugin.generateTexture({ hint: 'anything' });
      expect(result.status).toBe('not_implemented');
      expect(result.message).toBeTruthy();
    });

    it('refuses to run before activation with a clear error', async () => {
      await expect(plugin.generateTexture({})).rejects.toThrow(/not activated/i);
    });
  });

  describe('UI & settings', () => {
    it('getUIComponent() returns a renderable React component type', () => {
      const C = plugin.getUIComponent();
      expect(typeof C === 'function' || (typeof C === 'object' && C !== null)).toBe(true);
    });

    it('getSettingsSchema() returns null in v0', () => {
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

    it('generate_texture skill accepts an optional `hint` field', () => {
      const skill = plugin.getSkills?.()?.[0];
      expect(skill?.inputSchema.type).toBe('object');
      expect(skill?.inputSchema.properties).toBeDefined();
      // `hint` is optional — must NOT appear in required[]
      expect(skill?.inputSchema.required ?? []).not.toContain('hint');
    });
  });
});
