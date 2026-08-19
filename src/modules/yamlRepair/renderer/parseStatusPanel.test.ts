import { describe, expect, it } from 'vitest';

import { createParseStatusState } from '../context';
import { renderParseStatusLines } from './parseStatusPanel';

describe('renderParseStatusLines', () => {
  it('shows a placeholder before the first parse', () => {
    const lines = renderParseStatusLines(createParseStatusState(), 8, 30);

    expect(lines).toContain('Awaiting first yamlParse...');
  });

  it('shows the error count after a failed parse', () => {
    const lines = renderParseStatusLines(
      {
        errorCount: 2,
        ok: false,
        errors: ['1. bad'],
        undoHint: null,
      },
      8,
      30,
    );

    expect(lines).toContain('2 errors');
    expect(lines).toContain('Latest errors:');
    expect(lines.some((line) => line.startsWith('*'))).toBe(true);
  });

  it('wraps Latest errors instead of cutting the label', () => {
    const lines = renderParseStatusLines(
      {
        errorCount: 1,
        ok: false,
        errors: ['1. Missing colon Offending line 59 group lights'],
        undoHint: null,
      },
      12,
      12,
    );

    expect(lines).toContain('Latest');
    expect(lines).toContain('errors:');
    expect(lines).not.toContain('Latest erro');
  });

  it('shows the full work file path', () => {
    const lines = renderParseStatusLines(
      createParseStatusState(),
      8,
      40,
      '/tmp/yaml-repair-123/broken.work.yaml',
    );

    expect(lines.join('')).toContain('/tmp/yaml-repair-123/broken.work.yaml');
  });

  it('shows success after a clean parse', () => {
    const lines = renderParseStatusLines(
      {
        errorCount: 0,
        ok: true,
        errors: [],
        undoHint: null,
      },
      8,
      30,
    );

    expect(lines).toContain('OK');
    expect(lines).toContain('File parses cleanly.');
  });

  it('shows an undo hint when errors increased', () => {
    const lines = renderParseStatusLines(
      {
        errorCount: 12,
        ok: false,
        errors: ['1. Missing colon Offending line 1, column 1: bad'],
        undoHint: 'Errors increased from 6 to 12.',
      },
      10,
      40,
    );

    expect(lines).toContain('Undo recommended');
  });

  it('keeps the undo hint when the panel is too short for every error', () => {
    const lines = renderParseStatusLines(
      {
        errorCount: 5,
        ok: false,
        errors: ['1. a', '2. b', '3. c', '4. d', '5. e'],
        undoHint: 'Errors increased from 1 to 5.',
      },
      6,
      40,
    );

    expect(lines).toContain('Undo recommended');
    expect(lines.at(-1)).toBe('Undo recommended');
  });
});
