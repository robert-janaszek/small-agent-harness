import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLangfuseSessionId,
  flushLangfuse,
  initLangfuseTracing,
  isLangfuseEnabled,
  resetLangfuseTracingForTests,
  withAgentObservation,
  withToolObservation,
} from './langfuse';

describe('langfuse observability', () => {
  afterEach(() => {
    resetLangfuseTracingForTests();
    vi.unstubAllEnvs();
  });

  describe('isLangfuseEnabled', () => {
    it('returns false when keys are missing', () => {
      expect(isLangfuseEnabled({})).toBe(false);
      expect(isLangfuseEnabled({ LANGFUSE_PUBLIC_KEY: 'pk' })).toBe(false);
      expect(isLangfuseEnabled({ LANGFUSE_SECRET_KEY: 'sk' })).toBe(false);
    });

    it('returns false for blank keys', () => {
      expect(
        isLangfuseEnabled({
          LANGFUSE_PUBLIC_KEY: '   ',
          LANGFUSE_SECRET_KEY: 'sk',
        }),
      ).toBe(false);
    });

    it('returns true when both keys are set', () => {
      expect(
        isLangfuseEnabled({
          LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
          LANGFUSE_SECRET_KEY: 'sk-lf-test',
        }),
      ).toBe(true);
    });
  });

  it('createLangfuseSessionId returns a uuid', () => {
    const id = createLangfuseSessionId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('initLangfuseTracing is a no-op without credentials', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');
    expect(() => initLangfuseTracing()).not.toThrow();
    await expect(flushLangfuse()).resolves.toBeUndefined();
  });

  it('withAgentObservation runs the callback when disabled', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');

    const result = await withAgentObservation(
      { sessionId: 'session-1', input: { command: 'hi' } },
      async (observation) => {
        observation.update({ output: { ok: true } });
        return 42;
      },
    );

    expect(result).toBe(42);
  });

  it('withToolObservation runs the callback when disabled', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');

    const result = await withToolObservation(
      { name: 'echo', input: { text: 'hi' } },
      async () => 'echo:hi',
    );

    expect(result).toBe('echo:hi');
  });
});
