import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createYamlRepairAgent } from './agent';
import { createWorkFile, getFixturePath, HISTORY_MAX_SIZE } from './context';
import { countOccurrences, readFileText, replaceExact } from './fileOps';
import { READ_MAX_LIMIT } from './schemas';

type TempYaml = { path: string; dispose: () => void };

const disposables: Array<{ dispose: () => void }> = [];

function track<T extends { dispose: () => void }>(value: T): T {
  disposables.push(value);
  return value;
}

function tempYaml(contents: string): TempYaml {
  const dir = mkdtempSync(join(tmpdir(), 'yaml-repair-test-'));
  const path = join(dir, 'sample.yaml');
  writeFileSync(path, contents, 'utf8');
  return track({
    path,
    dispose: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  });
}

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

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
    const file = tempYaml(['a', 'b', 'c', 'd', 'e'].join('\n') + '\n');
    const agent = createYamlRepairAgent(file.path);
    const read = agent.tools.find((tool) => tool.function.name === 'read')!;

    const result = await read.call({ offset: 2, limit: 2 });
    expect(result).toContain('Showing lines 2-3 of 5');
    expect(result).toContain('2|b');
    expect(result).toContain('3|c');

    expect(READ_MAX_LIMIT).toBe(80);
  });

  it('read reports when offset is past EOF', async () => {
    const file = tempYaml('only\n');
    const agent = createYamlRepairAgent(file.path);
    const read = agent.tools.find((tool) => tool.function.name === 'read')!;
    const result = await read.call({ offset: 5, limit: 10 });
    expect(result).toContain('past the end of the file');
  });

  it('grep returns matches with surrounding context in prose', async () => {
    const file = tempYaml(['alpha', 'beta target', 'gamma'].join('\n') + '\n');
    const agent = createYamlRepairAgent(file.path);
    const grep = agent.tools.find((tool) => tool.function.name === 'grep')!;

    const result = await grep.call({ pattern: 'target' });
    expect(result).toContain('Found 1 match');
    expect(result).toContain('Line 2: beta target');
    expect(result).toContain('context before: alpha');
    expect(result).toContain('context after: gamma');
  });

  it('grep only mentions truncation when more matches exist', async () => {
    const file = tempYaml(['a', 'a', 'a'].join('\n') + '\n');
    const agent = createYamlRepairAgent(file.path);
    const grep = agent.tools.find((tool) => tool.function.name === 'grep')!;

    const exactCap = await grep.call({ pattern: 'a', maxMatches: 3 });
    expect(exactCap).toContain('Found 3 match');
    expect(exactCap).not.toContain('Showing the first');

    const truncated = await grep.call({ pattern: 'a', maxMatches: 2 });
    expect(truncated).toContain('Found 2 match');
    expect(truncated).toContain('Showing the first 2 matches');
  });

  it('replace applies a unique edit and refuses ambiguous matches', async () => {
    const file = tempYaml('one\ntwo\none\n');
    const agent = createYamlRepairAgent(file.path);
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;

    const ambiguous = await replace.call({ old_string: 'one', new_string: '1' });
    expect(ambiguous).toContain('Found 2 matches');

    const ok = await replace.call({
      old_string: 'two\none',
      new_string: 'TWO\nONE',
    });
    expect(ok).toContain('Applied 1 replacement');
  });

  it('undo restores the file to the state before the last successful replace', async () => {
    const original = 'alpha\nbeta\ngamma\n';
    const file = tempYaml(original);
    const agent = createYamlRepairAgent(file.path);
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;
    const undo = agent.tools.find((tool) => tool.function.name === 'undo')!;

    await replace.call({ old_string: 'beta', new_string: 'BETA' });
    expect(readFileText(file.path)).toBe('alpha\nBETA\ngamma\n');
    expect(agent.context.historyLength()).toBe(1);

    const restored = await undo.call({});
    expect(restored).toContain('Restored previous version (0 edits remaining in history)');
    expect(readFileText(file.path)).toBe(original);
    expect(agent.context.historyLength()).toBe(0);
  });

  it('undo on an empty history leaves the file unchanged', async () => {
    const original = 'unchanged\n';
    const file = tempYaml(original);
    const agent = createYamlRepairAgent(file.path);
    const undo = agent.tools.find((tool) => tool.function.name === 'undo')!;

    const result = await undo.call({});
    expect(result).toBe('Nothing to undo.');
    expect(readFileText(file.path)).toBe(original);
    expect(agent.context.historyLength()).toBe(0);
  });

  it('undo steps back through multiple successful replaces', async () => {
    const original = 'one\ntwo\nthree\n';
    const file = tempYaml(original);
    const agent = createYamlRepairAgent(file.path);
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;
    const undo = agent.tools.find((tool) => tool.function.name === 'undo')!;

    await replace.call({ old_string: 'one', new_string: 'ONE' });
    await replace.call({ old_string: 'two', new_string: 'TWO' });
    expect(readFileText(file.path)).toBe('ONE\nTWO\nthree\n');
    expect(agent.context.historyLength()).toBe(2);

    await undo.call({});
    expect(readFileText(file.path)).toBe('ONE\ntwo\nthree\n');
    expect(agent.context.historyLength()).toBe(1);

    await undo.call({});
    expect(readFileText(file.path)).toBe(original);
    expect(agent.context.historyLength()).toBe(0);
  });

  it('failed replace does not push a snapshot', async () => {
    const original = 'one\ntwo\none\n';
    const file = tempYaml(original);
    const agent = createYamlRepairAgent(file.path);
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;

    await replace.call({ old_string: 'one', new_string: '1' });
    expect(agent.context.historyLength()).toBe(0);
    expect(readFileText(file.path)).toBe(original);
  });

  it('history drops the oldest snapshot when max size is exceeded', async () => {
    const file = tempYaml('v0\n');
    const agent = createYamlRepairAgent(file.path);
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;
    const undo = agent.tools.find((tool) => tool.function.name === 'undo')!;

    for (let i = 0; i < HISTORY_MAX_SIZE + 1; i += 1) {
      await replace.call({
        old_string: `v${i}`,
        new_string: `v${i + 1}`,
      });
    }

    expect(agent.context.historyLength()).toBe(HISTORY_MAX_SIZE);
    expect(readFileText(file.path)).toBe(`v${HISTORY_MAX_SIZE + 1}\n`);

    for (let i = 0; i < HISTORY_MAX_SIZE; i += 1) {
      await undo.call({});
    }
    expect(readFileText(file.path)).toBe('v1\n');
    expect(agent.context.historyLength()).toBe(0);
    expect(await undo.call({})).toBe('Nothing to undo.');
  });

  it('yamlParse reports fixture errors in prose and succeeds after fixes', async () => {
    const work = track(createWorkFile(getFixturePath()));
    const agent = createYamlRepairAgent(work.filePath);
    const yamlParse = agent.tools.find((tool) => tool.function.name === 'yamlParse')!;
    const replace = agent.tools.find((tool) => tool.function.name === 'replace')!;
    const grep = agent.tools.find((tool) => tool.function.name === 'grep')!;

    const before = await yamlParse.call({});
    expect(before).toContain('failed to parse');
    expect(before).toContain('Offending line 59');
    expect(before).toContain('group lights');
    expect(before).not.toContain('        ^');
    expect(before).toContain('… and 1 more error not shown.');
    expect(before).not.toContain('Offending line 5727');

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

  it('createWorkFile copies fixture so the source stays intact and dispose removes temp dir', () => {
    const source = getFixturePath();
    const work = createWorkFile(source);
    expect(work.filePath).not.toBe(source);
    expect(existsSync(work.filePath)).toBe(true);

    const dir = dirname(work.filePath);
    work.dispose();
    expect(existsSync(work.filePath)).toBe(false);
    expect(existsSync(dir)).toBe(false);
  });
});
