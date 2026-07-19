# YAML repair module

A second benchmark domain for **small-agent-harness**: can a locally hosted LLM repair a large, broken YAML file using only file tools?

Unlike `smartHome` (short commands, in-memory state), this scenario stresses **format fidelity** — indentation, exact string edits, and reading parser feedback across a ~6 700-line file.

---

## What we are testing

The agent gets a copy of `fixtures/broken.yaml`: a fictional home-automation device catalog with intentional defects:

| Problem type | Count | Examples |
|--------------|-------|----------|
| YAML syntax errors (missing `:`) | 6 | `group lights`, `speedLevels 3`, `unit celsius` |
| Placeholders to fill from context | 4 | `wattage: __FILL_FROM_CONTEXT__`, `protocol: __FILL_FROM_CONTEXT__`, … |

Success means **`yamlParse` reports zero errors** — the file is syntactically valid YAML. The agent must not read the whole file at once; it is expected to use `grep` / `read` windows and targeted `replace` edits.

This mirrors real edge-agent tasks: fix config dumps, generated manifests, or migration artifacts where the model sees fragments, not the full document.

---

## How to run

### Prerequisites

Same as the main repo: Node 18+, a local OpenAI-compatible server (LM Studio, Ollama, …), and a configured `.env` in the project root.

```bash
cp .env.sample .env
# edit OPENAI_BASE_URL, OPENAI_API_KEY, MODEL_NAME, HARNESS_MAX_ITERATIONS
```

### Run the agent

```bash
npm run yaml-repair
```

On startup the CLI prints the **work file path** — a temp copy of the fixture so the source in the repo stays untouched:

```
[yamlRepair] work file: /tmp/yaml-repair-XXXX/broken.work.yaml
→ yamlParse
← yamlParse: 6 error(s)
…
```

Output on stdout is a **human-readable trace** (tool calls, replace old→new with visible indentation, parse results). JSONL is not printed; the harness still emits the same events internally for future renderers.

Optional: override the default repair instruction:

```bash
npm run yaml-repair -- fix syntax errors only, skip placeholders
```

### Unit tests (no LLM)

```bash
npm test -- src/modules/yamlRepair
```

Integration test mocks the LLM and walks through the full repair sequence deterministically.

---

## Tools

| Tool | Role |
|------|------|
| `yamlParse` | Parse the work file; report error count and line/column details |
| `grep` | Find patterns with line numbers and one line of context before/after |
| `read` | Read a line window (max 80 lines) |
| `replace` | Exact substring replace; must be unique unless `replace_all` |

The system prompt includes YAML-specific heuristics (preserve indentation, run `yamlParse` after every `replace`, do not grep parser error messages, etc.).

---

## Findings so far

**Small LLMs perform poorly in this environment**, even with explicit heuristics in the prompt:

- **They break format while “fixing” it** — e.g. replacing `        group lights` with ` group: lights` (one leading space instead of eight) turns ~6 parser errors into hundreds of cascading failures.
- **They miss the actual fault line** — `yamlParse` snippets show context above the caret; models often focus on the wrong line (e.g. `name: …` instead of `group lights`).
- **They misuse `replace`** — wrong `old_string` / `new_string`, truncated indentation, accidental newlines inside values, or `replace_all` on ambiguous patterns.
- **Tool choice is skewed toward `grep`** — `read` is rarely used because grep already returns a one-line context window; that is enough to guess, not enough to copy exact whitespace reliably.

Prompt tuning helps at the margin (indentation rules, parse-after-every-edit), but **exact whitespace in JSON tool arguments** remains a weak point for 7B-class models. This module is useful as a **negative capability signal**: if a model cannot reliably repair this fixture, similar “edit a large structured file via tools” workflows on the edge will likely fail too.

For comparison, the mocked integration test proves the **harness and tools** support a full repair path; the gap is model behaviour, not missing plumbing.

---

## Layout

```
yamlRepair/
├── README.md           # this file
├── agent.ts            # system prompt + tool wiring
├── context.ts          # work file (temp copy of fixture)
├── fileOps.ts          # read / replace helpers
├── grep.tool.ts
├── read.tool.ts
├── replace.tool.ts
├── yamlParse.tool.ts
├── fixtures/
│   └── broken.yaml     # ~6.7k lines, intentional defects
└── *.test.ts
```

Entry point: `src/cli/yamlRepair.ts` (`npm run yaml-repair`).
