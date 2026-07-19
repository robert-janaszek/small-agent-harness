import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createYamlRepairAgent } from './agent';
import { createWorkFile, getFixturePath } from './context';
import { countOccurrences, replaceExact } from './fileOps';
import { READ_MAX_LIMIT } from './schemas';

function tempYaml(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'yaml-repair-test-'));
  const path = join(dir, 'sample.yaml');
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('yamlRepair fileOps', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countOccurrences('aaa', 'aa')).toBe(1);
    expect(countOccurrences('ababab', 'ab')).toBe(3);
  });

  it('replaceExact requires uniqueness unless replace_all', () => {
    const ambiguous = replaceExact('foo bar foo', 'foo', 'baz', false);
    expect(ambiguous.ok).toBe(false);

    const all = replaceExact('foo bar foo', 'foo', 'baz', true);
    expect(all).toEqual({ ok: true, content: 'baz bar baz', replacements: 2 });
  });
});

describe('yamlRepair tools', () => {
  it('read returns numbered lines and rejects oversized windows via schema max', async () => {
    const path = tempYaml(['a', 'b', 'c', 'd', 'e'].join('\n') + '\n');
    const agent = createYamlRepairAgent(path);
    const read = agent.tools.find((tool) => tool.function.name === 'read')!;

    const result = await read.call({ offset: 2, limit: 2 });
    expect(result).toContain('Showing lines 2-3 of 5');
    expect(result).toContain('2|b');
    expect(result).toContain('3|c');

    expect(READ_MAX_LIMIT).toBe(80);
  });

  it('read reports when offset is past EOF', async () => {
    const path = tempYaml('only\n');
    const agent = createYamlRepairAgent(path);
    const read = agent.tools.find((tool) => tool.function.name === 'read')!;
    const result = await read.call({ offset: 5, limit: 10 });
    expect(result).toContain('past the end of the file');
  });

  it('grep returns matches with surrounding context in prose', async () => {
    const path = tempYaml(['alpha', 'beta target', 'gamma'].join('\n') + '\n');
    const agent = createYamlRepairAgent(path);
    const grep = agent.tools.find((tool) => tool.function.name === 'grep')!;

    const result = await grep.call({ pattern: 'target' });
    expect(result).toContain('Found 1 match');
    expect(result).toContain('Line 2: beta target');
    expect(result).toContain('context before: alpha');
    expect(result).toContain('context after: gamma');
  });

  it('replace applies a unique edit and refuses ambiguous matches', async () => {
    const path = tempYaml('one\ntwo\none\n');
    const agent = createYamlRepairAgent(path);
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;

    const ambiguous = await replace.call({ old_string: 'one', new_string: '1' });
    expect(ambiguous).toContain('Found 2 matches');

    const ok = await replace.call({
      old_string: 'two\none',
      new_string: 'TWO\nONE',
    });
    expect(ok).toContain('Applied 1 replacement');
  });

  it('yamlParse reports fixture errors in prose and succeeds after fixes', async () => {
    const work = createWorkFile(getFixturePath());
    const agent = createYamlRepairAgent(work);
    const yamlParse = agent.tools.find((tool) => tool.function.name === 'yamlParse')!;
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;
    const grep = agent.tools.find((tool) => tool.function.name === 'grep')!;

    const before = await yamlParse.call({});
    expect(before).toContain('failed to parse');
    expect(before).toMatch(/line \d+/i);
    expect(before).toContain('… and 1 more error not shown.');
    expect(before).not.toContain('line 5727');

    const markers = await grep.call({ pattern: 'group lights|speedLevels 3|unit celsius|protocol zwave|group patio_fans_WRONG|group covers$' });
    expect(markers).toMatch(/Found \d+ match/);

    const fixes: Array<[string, string]> = [
      ['        group lights', '        group: lights'],
      ['        speedLevels 3', '        speedLevels: 3'],
      ['        unit celsius', '        unit: celsius'],
      ['        protocol zwave', '        protocol: zwave'],
      ['        group patio_fans_WRONG', '        group: fans'],
      ['        group covers\n        deviceId:', '        group: covers\n        deviceId:'],
    ];

    for (const [old_string, new_string] of fixes) {
      const result = await replace.call({ old_string, new_string });
      expect(result).toContain('Applied 1 replacement');
    }

    // Fill placeholders (valid YAML but required by the task)
    await replace.call({
      old_string: 'protocol: __FILL_FROM_CONTEXT__',
      new_string: 'protocol: zigbee',
      replace_all: true,
    });
    await replace.call({
      old_string: 'defaultState: __FILL_FROM_CONTEXT__',
      new_string: 'defaultState: OFF',
      replace_all: true,
    });
    await replace.call({
      old_string: 'wattage: __FILL_FROM_CONTEXT__',
      new_string: 'wattage: 9',
      replace_all: true,
    });
    await replace.call({
      old_string: 'state: __FILL_FROM_CONTEXT__',
      new_string: 'state: OFF',
      replace_all: true,
    });

    const after = await yamlParse.call({});
    expect(after).toContain('parsed successfully');

    const remaining = await grep.call({ pattern: ': __FILL_FROM_CONTEXT__' });
    expect(remaining).toContain('No lines matched');
  });

  it('createWorkFile copies fixture so the source stays intact', () => {
    const source = getFixturePath();
    const work = createWorkFile(source);
    expect(work).not.toBe(source);
    copyFileSync(source, work); // still readable
  });
});
