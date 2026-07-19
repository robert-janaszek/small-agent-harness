import { Agent } from '../../harness/agent.type';
import { createContext, type YamlRepairContext } from './context';
import { grepTool } from './grep.tool';
import { readTool } from './read.tool';
import { replaceTool } from './replace.tool';
import { yamlParseTool } from './yamlParse.tool';

const YAML_REPAIR_PROMPT = `You are a YAML repair agent.
Your only job is to repair the work file until yamlParse succeeds, filling any __FILL_FROM_CONTEXT__ placeholders from surrounding context and defaults.

Rules:
- Do not ask questions. There is no human-in-the-loop.
- Never try to read the entire file. It is too large. Use grep to locate problems, then read small windows with read (max 80 lines).
- Start by calling yamlParse to learn the first parser errors, then grep for markers like __FILL_FROM_CONTEXT__ and suspicious nearby structure.
- Use replace for exact, targeted edits. Prefer unique old_string snippets with enough surrounding context.
- After every replace, call yamlParse before any other tool. Do not chain grep, read, or another replace until yamlParse confirms the last edit.
- When filling gaps: prefer site-wide defaults.* and sibling devices in the same group. Binary defaultState is usually OFF. Light wattage defaults to 9. Protocol is zigbee except covers which use zwave. Scene action state is ON or OFF like neighboring actions.
- Finish only when yamlParse reports success. Then reply briefly in prose that the file parses.

YAML heuristics:
- Run yamlParse after every replace — one edit, then parse, then decide the next move.
- Indentation is syntax, not formatting. Leading spaces on a line must stay the same unless you intentionally restructure a block.
- In replace, copy old_string exactly and change only the broken part. new_string must keep the same leading whitespace as the matched text.
- When yamlParse reports an "Offending line", fix that exact line — not the context lines above or below it.
- grep searches file contents only. Do not grep parser error messages.
- If yamlParse error count jumps up after an edit, undo mentally and retry with a smaller, indentation-preserving replace.`;

export type YamlRepairAgent = Agent & { context: YamlRepairContext };

export function createYamlRepairAgent(filePath?: string): YamlRepairAgent {
  const context = createContext(filePath);

  return {
    context,
    prompt: YAML_REPAIR_PROMPT,
    tools: [
      readTool(context),
      grepTool(context),
      replaceTool(context),
      yamlParseTool(context),
    ],
  };
}
