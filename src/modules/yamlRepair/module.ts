import type { Module, ModulePanel } from '../../core/module';
import type { Tool } from '../../core/tool';
import {
  createContext,
  createParseStatusState,
  logWorkFilePath,
  resetContext,
  snapshotYamlRepairState,
  type YamlRepairContext,
  type YamlRepairStateSnapshot,
} from './context';
import { grepTool } from './grep.tool';
import { readTool } from './read.tool';
import { paintParseStatusPanel } from './renderer/parseStatusPanel';
import { replaceTool } from './replace.tool';
import { undoTool } from './undo.tool';
import { yamlParseTool } from './yamlParse.tool';

export const YAML_REPAIR_MODULE_ID = 'yamlRepair';

export const YAML_REPAIR_PROMPT = `You are a YAML repair agent.
Your only job is to repair the work file until yamlParse succeeds, filling any __FILL_FROM_CONTEXT__ placeholders from surrounding context and defaults.

Rules:
- Do not ask questions. There is no human-in-the-loop.
- Never try to read the entire file. It is too large. Use grep to locate problems, then read small windows with read (max 80 lines).
- Start by calling yamlParse to learn the first parser errors, then grep for markers like __FILL_FROM_CONTEXT__ and suspicious nearby structure.
- Use replace for exact, targeted edits. Match the smallest unique broken substring — not the whole line unless you need extra context for uniqueness.
- After every replace, call yamlParse before grep, read, undo, or another replace.
- Never revert a bad edit with replace (swapping old_string and new_string). Whitespace will be wrong again. Always use undo to restore the previous file state.
- When yamlParse reports that errors increased, follow this sequence exactly: undo → yamlParse → smaller indentation-preserving replace.
- When filling gaps: prefer site-wide defaults.* and sibling devices in the same group. Binary defaultState is usually OFF. Light wattage defaults to 9. Protocol is zigbee except covers which use zwave. Scene action state is ON or OFF like neighboring actions.
- Finish only when yamlParse reports success. Then reply briefly in prose that the file parses.

Example when an edit makes things worse:
1. replace (targeted fix)
2. yamlParse → errors increased → call undo (not replace)
3. yamlParse → confirm errors dropped
4. replace (smaller, indentation-preserving retry)

Example minimal replace (preferred over whole-line replace):
- Offending line text might be "        timeoutMs 3000" but only "timeoutMs 3000" is wrong.
- replace old_string="timeoutMs 3000" new_string="timeoutMs: 3000"
- Leading spaces stay in the file because they are outside old_string.
- Avoid old_string="        timeoutMs 3000" unless the shorter match is ambiguous — counting indentation in tool args fails often.

YAML heuristics:
- Run yamlParse after every replace — one edit, then parse, then decide the next move.
- Indentation is syntax, not formatting. Leading spaces on a line must stay the same unless you intentionally restructure a block.
- In replace, change only the broken characters (e.g. insert a missing ":"). Do not rewrite a full line when a shorter match fixes the error.
- Omit line-leading whitespace from old_string when the broken token or phrase alone is unique in the file.
- In replace, copy old_string exactly and change only the broken part. new_string must keep the same leading whitespace as the matched text.
- When yamlParse reports an "Offending line", the fault is on that line — but replace only the smallest broken span on it, not necessarily the entire line.
- Before replace, use read (limit 1–3) or grep to find the shortest unique old_string.
- grep searches file contents only. Do not grep parser error messages.`;

export type YamlRepairModule = Module & { context: YamlRepairContext };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isYamlRepairStateSnapshot(payload: unknown): payload is YamlRepairStateSnapshot {
  if (!isPlainObject(payload) || typeof payload.filePath !== 'string' || !isPlainObject(payload.parseStatus)) {
    return false;
  }

  const status = payload.parseStatus;
  return (
    (status.errorCount === null || typeof status.errorCount === 'number') &&
    typeof status.ok === 'boolean' &&
    Array.isArray(status.errors) &&
    status.errors.every((item) => typeof item === 'string') &&
    (status.undoHint === null || typeof status.undoHint === 'string')
  );
}

export function createYamlRepairPanel(): ModulePanel {
  let state: YamlRepairStateSnapshot = {
    filePath: '',
    parseStatus: createParseStatusState(),
  };

  return {
    onEvent(event, payload) {
      if (event === 'state' && isYamlRepairStateSnapshot(payload)) {
        state = payload;
      }
    },
    paint({ terminal, startCol, width, height }) {
      paintParseStatusPanel(terminal, startCol, width, height, state);
    },
  };
}

export function createYamlRepairModule(filePath?: string): YamlRepairModule {
  const context = createContext(filePath);
  logWorkFilePath(context);
  const emitState = (runtime: { emit: (event: string, payload?: unknown) => void }) => {
    runtime.emit('state', snapshotYamlRepairState(context));
  };

  return {
    id: YAML_REPAIR_MODULE_ID,
    context,
    prompt: YAML_REPAIR_PROMPT,
    tools: [
      readTool(context),
      grepTool(context),
      replaceTool(context),
      undoTool(context),
      yamlParseTool(context),
    ] as Tool<any>[],
    createPanel: createYamlRepairPanel,
    onSessionStart: emitState,
    onSessionReset: (runtime) => {
      resetContext(context);
      emitState(runtime);
    },
    onToolRound: emitState,
  };
}
