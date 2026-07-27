import { describe, expect, it } from 'vitest';

import {
  applyParseStatusEvent,
  applyYamlParseResult,
  createParseStatusState,
  renderParseStatusLines,
  resetParseStatusState,
} from './parseStatusPanel';

describe('applyYamlParseResult', () => {
  it('marks success when the file parses cleanly', () => {
    const state = createParseStatusState();

    applyYamlParseResult(state, 'The YAML file parsed successfully with no errors.');

    expect(state).toEqual({
      errorCount: 0,
      ok: true,
      errors: [],
      undoHint: null,
    });
  });

  it('extracts error count and numbered blocks from parser output', () => {
    const state = createParseStatusState();
    const content =
      'The YAML file failed to parse (6 error(s)). Fix these issues:\n\n' +
      '1. Missing colon (BAD_SCALAR)\n' +
      '   Offending line 120, column 8:         group lights\n\n' +
      '2. Missing colon (BAD_SCALAR)\n' +
      '   Offending line 220, column 8:         speedLevels 3\n\n' +
      '… and 4 more errors not shown.';

    applyYamlParseResult(state, content);

    expect(state.errorCount).toBe(6);
    expect(state.ok).toBe(false);
    expect(state.errors).toHaveLength(2);
    expect(state.errors[0]).toContain('Missing colon');
    expect(state.errors[0]).toContain('group lights');
  });

  it('captures undo recommendation hints', () => {
    const state = createParseStatusState();
    const content =
      'The YAML file failed to parse (12 error(s)). Fix these issues:\n\n' +
      '1. Missing colon\n   Offending line 1, column 1: bad\n\n' +
      'Errors increased from 6 to 12. Do not reverse the edit with replace — call undo first, then yamlParse, then retry with a smaller edit.';

    applyYamlParseResult(state, content);

    expect(state.undoHint).toContain('Errors increased from 6 to 12');
  });
});

describe('applyParseStatusEvent', () => {
  it('resets parse status on context_init', () => {
    const state = createParseStatusState();
    applyYamlParseResult(state, 'The YAML file failed to parse (3 error(s)). Fix these issues:\n\n1. bad');

    applyParseStatusEvent(state, { type: 'context_init', changes: [] });

    expect(state.errorCount).toBeNull();
    expect(state.errors).toEqual([]);
  });

  it('updates parse status from yamlParse tool_result events', () => {
    const state = createParseStatusState();

    applyParseStatusEvent(state, {
      type: 'tool_result',
      name: 'yamlParse',
      content: 'The YAML file parsed successfully with no errors.',
      toolCallId: '1',
    });

    expect(state.ok).toBe(true);
    expect(state.errorCount).toBe(0);
  });
});

describe('renderParseStatusLines', () => {
  it('shows a placeholder before the first parse', () => {
    const lines = renderParseStatusLines(createParseStatusState(), 8, 30);

    expect(lines).toContain('Awaiting first yamlParse…');
  });

  it('shows the error count after a failed parse', () => {
    const state = createParseStatusState();
    applyYamlParseResult(state, 'The YAML file failed to parse (2 error(s)). Fix these issues:\n\n1. bad');

    const lines = renderParseStatusLines(state, 8, 30);

    expect(lines).toContain('2 errors');
    expect(lines.some((line) => line.startsWith('•'))).toBe(true);
  });

  it('resets to awaiting state after resetParseStatusState', () => {
    const state = createParseStatusState();
    applyYamlParseResult(state, 'The YAML file parsed successfully with no errors.');
    resetParseStatusState(state);

    expect(renderParseStatusLines(state, 8, 30)).toContain('Awaiting first yamlParse…');
  });
});
