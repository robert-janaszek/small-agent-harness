import { describe, expect, it } from 'vitest';

import {
  applyParseStatusEvent,
  createParseStatusState,
  renderParseStatusLines,
} from './parseStatusPanel';
import { EventLog } from './eventLog';
import { getBottomLayout } from './yamlRepairRenderer';

describe('getBottomLayout', () => {
  it('reserves only the input row when chrome is inactive', () => {
    expect(getBottomLayout(10, 0, 0)).toEqual({
      contentRows: 9,
      inputRow: 9,
      paletteRows: [],
      queueBannerRow: null,
    });
  });

  it('stacks palette rows above input and queue above palette', () => {
    expect(getBottomLayout(10, 2, 2)).toEqual({
      contentRows: 6,
      inputRow: 9,
      paletteRows: [7, 8],
      queueBannerRow: 6,
    });
  });
});

describe('yamlRepair renderer frame composition', () => {
  it('composes left log lines and right parse status from harness events', () => {
    const eventLog = new EventLog();
    const parseStatus = createParseStatusState();

    eventLog.append({
      type: 'work_file',
      path: '/tmp/yaml-repair-123/broken.work.yaml',
    });
    eventLog.append({
      type: 'user_command',
      command: 'call yamlParse',
    });
    eventLog.append({
      type: 'tool_call',
      name: 'yamlParse',
      args: {},
      toolCallId: '1',
    });
    applyParseStatusEvent(parseStatus, {
      type: 'tool_result',
      name: 'yamlParse',
      content: 'The YAML file failed to parse (2 error(s)). Fix these issues:\n\n1. bad line',
      toolCallId: '1',
    });

    const leftLines = eventLog.render(4, 40);
    const rightLines = renderParseStatusLines(parseStatus, 6, 30);

    expect(leftLines.join('\n')).toContain('work file: /tmp/yaml-repair-123/broken.');
    expect(leftLines.join('\n')).toContain('> call yamlParse');
    expect(leftLines.join('\n')).toContain('→ yamlParse');
    expect(rightLines).toContain('2 errors');
  });
});
