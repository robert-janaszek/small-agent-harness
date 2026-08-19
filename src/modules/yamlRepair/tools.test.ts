import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkFile, getFixturePath, HISTORY_MAX_SIZE, resetContext, type YamlRepairContext } from './context';
import { grepTool } from './grep.tool';
import { readTool } from './read.tool';
import { replaceTool } from './replace.tool';
import { undoTool } from './undo.tool';
import { yamlParseTool } from './yamlParse.tool';
import { createYamlRepairModule, type YamlRepairModule } from './module';
import { countOccurrences, formatNumberedLines, getLines, readFileText, replaceExact } from './fileOps';
import { READ_MAX_LIMIT } from './schemas';
import { formatToolActivity, indexToolActivity } from '../../core/tui/toolActivity';

type TempYaml = { path: string; dispose: () => void };

const disposables: Array<{ dispose: () => void }> = [];
let stderrSpy: ReturnType<typeof vi.spyOn> | undefined;

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

function moduleFor(filePath: string): YamlRepairModule {
  if (!stderrSpy) {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  }
  const module = createYamlRepairModule(filePath);
  track(module.context);
  return module;
}

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
  stderrSpy?.mockRestore();
  stderrSpy = undefined;
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

  it('getLines returns an empty array for an empty file', () => {
    const file = tempYaml('');
    expect(getLines(file.path)).toEqual([]);
  });

  it('getLines drops a trailing empty line after a final newline', () => {
    const file = tempYaml('alpha\nbeta\n');
    expect(getLines(file.path)).toEqual(['alpha', 'beta']);
  });

  it('formatNumberedLines pads line numbers to the widest index', () => {
    const narrow = formatNumberedLines(['a', 'b'], 9);
    const wide = formatNumberedLines(['a', 'b', 'c'], 99);

    expect(narrow).toBe(' 9|a\n10|b');
    expect(wide).toBe(' 99|a\n100|b\n101|c');
  });
});

describe('yamlRepair tools', () => {
  it('read returns numbered lines and rejects oversized windows via schema max', async () => {
    const file = tempYaml(['a', 'b', 'c', 'd', 'e'].join('\n') + '\n');
    const module = moduleFor(file.path);
    const read = module.tools!.find((tool) => tool.function.name === 'read')!;

    const result = await read.call({ offset: 2, limit: 2 });
    expect(result).toContain('Showing lines 2-3 of 5');
    expect(result).toContain('2|b');
    expect(result).toContain('3|c');

    expect(READ_MAX_LIMIT).toBe(80);
  });

  it('read reports when offset is past EOF', async () => {
    const file = tempYaml('only\n');
    const module = moduleFor(file.path);
    const read = module.tools!.find((tool) => tool.function.name === 'read')!;
    const result = await read.call({ offset: 5, limit: 10 });
    expect(result).toContain('past the end of the file');
  });

  it('grep returns matches with surrounding context in prose', async () => {
    const file = tempYaml(['alpha', 'beta target', 'gamma'].join('\n') + '\n');
    const module = moduleFor(file.path);
    const grep = module.tools!.find((tool) => tool.function.name === 'grep')!;

    const result = await grep.call({ pattern: 'target' });
    expect(result).toContain('Found 1 match');
    expect(result).toContain('Line 2: beta target');
    expect(result).toContain('context before: alpha');
    expect(result).toContain('context after: gamma');
  });

  it('grep only mentions truncation when more matches exist', async () => {
    const file = tempYaml(['a', 'a', 'a'].join('\n') + '\n');
    const module = moduleFor(file.path);
    const grep = module.tools!.find((tool) => tool.function.name === 'grep')!;

    const exactCap = await grep.call({ pattern: 'a', maxMatches: 3 });
    expect(exactCap).toContain('Found 3 match');
    expect(exactCap).not.toContain('Showing the first');

    const truncated = await grep.call({ pattern: 'a', maxMatches: 2 });
    expect(truncated).toContain('Found 2 match');
    expect(truncated).toContain('Showing the first 2 matches');
  });

  it('replace applies a unique edit and refuses ambiguous matches', async () => {
    const file = tempYaml('one\ntwo\none\n');
    const module = moduleFor(file.path);
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;

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
    const module = moduleFor(file.path);
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;
    const undo = module.tools!.find((tool) => tool.function.name === 'undo')!;

    await replace.call({ old_string: 'beta', new_string: 'BETA' });
    expect(readFileText(file.path)).toBe('alpha\nBETA\ngamma\n');
    expect(module.context.history.length()).toBe(1);

    const restored = await undo.call({});
    expect(restored).toContain('Restored previous version (0 edits remaining in history)');
    expect(readFileText(file.path)).toBe(original);
    expect(module.context.history.length()).toBe(0);
  });

  it('undo on an empty history leaves the file unchanged', async () => {
    const original = 'unchanged\n';
    const file = tempYaml(original);
    const module = moduleFor(file.path);
    const undo = module.tools!.find((tool) => tool.function.name === 'undo')!;

    const result = await undo.call({});
    expect(result).toBe('Nothing to undo.');
    expect(readFileText(file.path)).toBe(original);
    expect(module.context.history.length()).toBe(0);
  });

  it('undo steps back through multiple successful replaces', async () => {
    const original = 'one\ntwo\nthree\n';
    const file = tempYaml(original);
    const module = moduleFor(file.path);
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;
    const undo = module.tools!.find((tool) => tool.function.name === 'undo')!;

    await replace.call({ old_string: 'one', new_string: 'ONE' });
    await replace.call({ old_string: 'two', new_string: 'TWO' });
    expect(readFileText(file.path)).toBe('ONE\nTWO\nthree\n');
    expect(module.context.history.length()).toBe(2);

    await undo.call({});
    expect(readFileText(file.path)).toBe('ONE\ntwo\nthree\n');
    expect(module.context.history.length()).toBe(1);

    await undo.call({});
    expect(readFileText(file.path)).toBe(original);
    expect(module.context.history.length()).toBe(0);
  });

  it('failed replace does not push a snapshot', async () => {
    const original = 'one\ntwo\none\n';
    const file = tempYaml(original);
    const module = moduleFor(file.path);
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;

    await replace.call({ old_string: 'one', new_string: '1' });
    expect(module.context.history.length()).toBe(0);
    expect(readFileText(file.path)).toBe(original);
  });

  it('history drops the oldest snapshot when max size is exceeded', async () => {
    const file = tempYaml('v0\n');
    const module = moduleFor(file.path);
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;
    const undo = module.tools!.find((tool) => tool.function.name === 'undo')!;

    for (let i = 0; i < HISTORY_MAX_SIZE + 1; i += 1) {
      await replace.call({
        old_string: `v${i}`,
        new_string: `v${i + 1}`,
      });
    }

    expect(module.context.history.length()).toBe(HISTORY_MAX_SIZE);
    expect(readFileText(file.path)).toBe(`v${HISTORY_MAX_SIZE + 1}\n`);

    for (let i = 0; i < HISTORY_MAX_SIZE; i += 1) {
      await undo.call({});
    }
    expect(readFileText(file.path)).toBe('v1\n');
    expect(module.context.history.length()).toBe(0);
    expect(await undo.call({})).toBe('Nothing to undo.');
  });

  it('yamlParse recommends undo when errors increase after a replace', async () => {
    const file = tempYaml('valid:\n  key: value\n');
    const module = moduleFor(file.path);
    const yamlParse = module.tools!.find((tool) => tool.function.name === 'yamlParse')!;
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;

    const before = await yamlParse.call({});
    expect(before).toContain('parsed successfully');
    expect(before).not.toContain('call undo');
    expect(module.context.parseStatus).toMatchObject({ errorCount: 0, ok: true, undoHint: null });

    await replace.call({ old_string: 'valid:', new_string: 'valid' });
    const after = await yamlParse.call({});
    expect(after).toContain('failed to parse');
    expect(after).toContain('Errors increased from 0 to');
    expect(after).toContain('Do not reverse the edit with replace');
    expect(after).toContain('call undo first');
    expect(module.context.parseStatus.ok).toBe(false);
    expect(module.context.parseStatus.undoHint).toContain('Errors increased from 0 to');
  });

  it('yamlParse does not recommend undo when errors decrease or stay the same', async () => {
    const file = tempYaml('        group lights\n        name: x\n');
    const module = moduleFor(file.path);
    const yamlParse = module.tools!.find((tool) => tool.function.name === 'yamlParse')!;
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;

    const before = await yamlParse.call({});
    expect(before).toContain('failed to parse');
    expect(before).not.toContain('call undo');

    await replace.call({
      old_string: '        group lights',
      new_string: '        group: lights',
    });
    const after = await yamlParse.call({});
    expect(after).toContain('parsed successfully');
    expect(after).not.toContain('call undo');
  });

  it('yamlParse reports fixture errors in prose and succeeds after fixes', async () => {
    const work = track(createWorkFile(getFixturePath()));
    const module = moduleFor(work.filePath);
    const yamlParse = module.tools!.find((tool) => tool.function.name === 'yamlParse')!;
    const replace = module.tools!.find((tool) => tool.function.name === 'replace')!;
    const grep = module.tools!.find((tool) => tool.function.name === 'grep')!;

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

  it('resetContext restores the file to its contents from context creation', () => {
    const file = tempYaml('original content\n');
    const module = moduleFor(file.path);
    writeFileSync(file.path, 'edited content\n');
    module.context.history.push('snapshot');
    module.context.lastParseErrorCount = 12;
    module.context.parseStatus = {
      errorCount: 12,
      ok: false,
      errors: ['1. bad'],
      undoHint: 'undo',
    };

    resetContext(module.context);

    expect(readFileSync(file.path, 'utf8')).toBe('original content\n');
    expect(module.context.history.length()).toBe(0);
    expect(module.context.lastParseErrorCount).toBeNull();
    expect(module.context.parseStatus).toEqual({
      errorCount: null,
      ok: false,
      errors: [],
      undoHint: null,
    });
  });
});

describe('yamlRepair tool activity', () => {
  const dummy = {} as YamlRepairContext;
  const activities = indexToolActivity([
    grepTool(dummy),
    readTool(dummy),
    replaceTool(dummy),
    undoTool(dummy),
    yamlParseTool(dummy),
  ]);

  function format(name: string, args: unknown, status: 'running' | 'done' | 'failed'): string {
    return formatToolActivity(name, args, status, activities.get(name));
  }

  it.each([
    ['grep', { pattern: 'TODO' }, 'grepping "TODO"', 'grepped "TODO"'],
    ['read', { offset: 12, limit: 8 }, 'reading lines 12-19', 'read lines 12-19'],
    ['replace', { old_string: 'foo: bar' }, 'replacing "foo: bar"', 'replaced "foo: bar"'],
    ['undo', {}, 'undoing', 'undid'],
    ['yamlParse', {}, 'parsing YAML', 'parsed YAML'],
  ] as const)('%s present/past', (name, args, running, done) => {
    expect(format(name, args, 'running')).toBe(running);
    expect(format(name, args, 'done')).toBe(done);
  });

  it('truncates long quoted targets', () => {
    const pattern = 'a'.repeat(40);
    expect(format('grep', { pattern }, 'running')).toBe(`grepping "${'a'.repeat(31)}…"`);
  });
});
