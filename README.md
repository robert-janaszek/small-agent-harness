# small-agent-harness

A minimal harness for evaluating **small LLMs running on the edge** (local inference via LM Studio, Ollama, etc.) in realistic **tool-calling agent loops**.

The goal is not to ship a smart home product. The goal is to answer a practical question:

> **How feasible is it to build agent-driven applications (e.g. a smart home controller) on small, locally hosted models?**

This repo provides a repeatable testbed: a generic agent loop, a fake integration domain, and both fast unit tests and slower end-to-end tests against a live model.

---

## What this repo is

- A **tool-calling agent harness** — send a command, let the model call tools in a loop until it responds with text.
- A **benchmark / experiment setup** for edge models — swap `MODEL_NAME`, run the same scenarios, compare behaviour.
- An **example domain module** (`smartHome`) that simulates device control in memory — no real hardware, no external APIs.
- A **second benchmark module** ([`yamlRepair`](src/modules/yamlRepair/README.md)) — repair a large broken YAML file via file tools (`grep`, `read`, `replace`, `yamlParse`).

## What this repo is not

- Not a production smart home stack.
- Not connected to real devices or home automation platforms.
- Not a general-purpose agent framework — it is intentionally small and focused.

The `smartHome` module is an **imaginary integration**: lights, AC units, TVs, and water valves live in an in-memory `ToolContext`. Tools read and mutate that state as if they talked to real services, but nothing leaves the process.

See also **[YAML repair](src/modules/yamlRepair/README.md)** — a format-fidelity stress test on a ~6 700-line config file (syntax errors, placeholders, exact whitespace in `replace`).

---

## Why smart home as the example domain?

Smart home control is a useful stress test for small LLMs because it combines patterns that show up in many edge-agent apps:

| Challenge | Example in this repo |
|-----------|----------------------|
| Multi-step planning | Turn off *all* lights in a room (4 separate devices) |
| Verify-after-act | Agent must re-check state, not trust tool output blindly |
| Heterogeneous devices | Binary switches vs AC (power + temperature) |
| Misleading tool responses | `controlAllDevicesInRoom` reports success but changes nothing |
| No human in the loop | Agent must recover and retry without asking for permission |

If a 7B model can reliably complete these scenarios locally, that is a strong signal for other edge agent use cases (industrial panels, field devices, offline assistants). If it cannot, the failure modes here are usually instructive: wrong tool choice, skipped verification, premature "done" responses, or getting stuck on the poisoned bulk tool.

---

## Quick start

### Prerequisites

- Node.js 18+
- A local OpenAI-compatible inference server, e.g. [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.com/)

### Setup

```bash
git clone <repo-url>
cd small-agent-harness
npm install
cp .env.sample .env
```

Edit `.env` with your local server details:

```env
OPENAI_BASE_URL=http://127.0.0.1:1234/v1
OPENAI_API_KEY=lmstudio
MODEL_NAME=google/gemma-3-12b
HARNESS_MAX_ITERATIONS=15
```

Start your local model server, then run the in-process TUI:

```bash
npm start
```

Or pass an initial command:

```bash
npm start -- turn off all lights in the living room
```

On a TTY this is the Core split-view (`DefaultRenderer`). `npm run harness` always writes JSONL (`--jsonl`), including on a TTY. The same entrypoint also uses JSONL when stdout is not a TTY, or with `--serve`.

**One-shot JSONL** — `npm run harness` forces JSONL even in an interactive terminal:

```bash
npm run harness -- turn off all lights in the living room
```

Or from `npm start` / `npm run smart-home`:

```bash
npm start -- --jsonl turn off all lights in the living room
```

**Serve mode** — long-lived JSONL session for external clients (stdin commands, stdout events):

```bash
npm run harness -- --serve
```

`npm run smart-home` is an alias for the same entrypoint. `npm run core` runs the host with no module (placeholder right panel).

---

## Configuration

| Variable | Description |
|----------|-------------|
| `OPENAI_BASE_URL` | Base URL of an OpenAI-compatible API (e.g. `http://127.0.0.1:1234/v1`) |
| `OPENAI_API_KEY` | API key — many local servers accept any non-empty string |
| `MODEL_NAME` | Model identifier as exposed by your server |
| `HARNESS_MAX_ITERATIONS` | Safety cap on agent loop iterations (positive integer) |
| `LANGFUSE_PUBLIC_KEY` | Optional. Langfuse public key — enables tracing when set with the secret key |
| `LANGFUSE_SECRET_KEY` | Optional. Langfuse secret key |
| `LANGFUSE_BASE_URL` | Optional. Langfuse host (default `https://cloud.langfuse.com`) |

Config is loaded lazily: `.env` is read on the first call to `getHarnessConfig()` (via `loadEnv()`). Importing modules does not require a valid `.env` until the harness actually runs.

### Langfuse observability

Set both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` to send traces to [Langfuse](https://langfuse.com). Without those keys, tracing is a no-op.

Each `harness.run` turn becomes an agent trace that includes:

- LLM generations (`observeOpenAI`) — prompts, completions, tool_calls, and token usage
- Tool spans — tool name, args, and result for every tool execution
- A shared `sessionId` across turns in the same CLI / `--serve` session

---

## Architecture

```text
modules/smartHome/main.ts  (or yamlRepair/main.ts)
  └── core/run({ module })
        ├── EventBus
        ├── Harness({ modules })
        │     ├── messageHistory
        │     ├── ChatCompletionClient
        │     ├── agent loop (system prompt + history + tools)
        │     └── runTools()
        └── DefaultRenderer (TTY) or JSONL stdout (non-TTY / --jsonl / --serve)
              └── module.createPanel()  → floor plan / parse status
```

### Core concepts

**`run(options)`** — process host. On a TTY it starts `DefaultRenderer`, unless `--jsonl` or `--serve` is set (or stdout is not a TTY). A module is optional (`npm run core` has none).

**`Harness`** — domain-agnostic loop. Calls the LLM, executes tool calls, repeats until the model returns a text response or `maxIterations` is reached. Maintains `messageHistory` across multiple `run()` calls within a session. Returns a structured `HarnessRunResult` (`content`, token usage, iteration count). Throws if the iteration limit is hit or the API returns an empty `choices` array.

**`Module`** — an id, optional prompt and tools, optional `createPanel()`, and session hooks (`onSessionStart`, `onSessionReset`, `onToolRound`). Domain state is emitted as `{ type: 'module', module, event, payload }`. The harness core never imports domain modules.

**`Tool` / `defineTool`** — each tool has a Zod `argsSchema` (single source of truth) and a `call` handler. OpenAI `function.parameters` are generated from the schema via `z.toJSONSchema()` — no duplicate JSON Schema hand-written in tool files.

**`createSmartHomeModule(initialState?)`** — factory that builds a module with its own isolated `ToolContext`. Pass `initialState` to customize starting device states in tests. Multiple modules can run in parallel without sharing mutable singleton state.

---

## The poisoned tool

`controlAllDevicesInRoom` is deliberately broken: it returns a plausible success message but **does not change any device state**.

This tests whether the model:

1. Verifies outcomes instead of trusting tool output
2. Falls back to per-device control (`controlDevice`) when bulk control fails
3. Completes multi-device tasks without human intervention

The agent system prompt and tool description hint that verification is required. System tests assert both the final in-memory state and that the harness loop completed without hitting `maxIterations` (not merely that side effects happened before a safety timeout).

The prompt also distinguishes **status/query** commands (read-only: `listDevices`, `getDeviceStatus`, `getAcStatus`) from **control** commands (mutating tools). Asking “is anyone home?” or “check if lights are on” should report state, not turn devices off.

---

## Testing

```bash
# Fast unit tests — no LLM required
npm test

# Unit tests with coverage report (text + HTML in coverage/)
npm run test:coverage

# End-to-end tests against a live local model (requires running inference server)
npm run test:system

# Watch mode
npm run test:watch
```

| Suite | What it covers |
|-------|----------------|
| `npm test` | Config validation, `Harness` loop (mocked LLM), `runTools`, all smart home tools, integration scenario with poisoned tool |
| `npm run test:coverage` | Same as `npm test`, plus V8 coverage (`text` + `html` under `coverage/`) |
| `npm run test:system` | Full agent runs: lights off, AC on + temperature, water valve — skipped automatically if the API is unreachable |

System tests probe `GET {OPENAI_BASE_URL}/models` and use `describe.skipIf` when no server is available, so CI and offline development still work with unit tests only. They check `HarnessRunResult.iterations < maxIterations` and domain state in `module.context` — not only side effects that could occur before the loop fails.

---

## Example scenarios to try

```bash
# Control
npm run harness -- turn off all lights in the living room
npm run harness -- set the living room air conditioning to 24 degrees and turn it on
npm run harness -- turn off the water valve in the bathroom
npm run harness -- turn on the bedroom ceiling light

# Status / query (read-only — should not mutate devices)
npm run harness -- Is anyone home? check if there are any lights on
```

After each run, stdout is a stream of JSON Lines (one event per line) when using `npm run harness`, `--jsonl`, `--serve`, or a non-TTY stdout. An external process can spawn the harness and parse each line.

---

## JSONL output protocol

The Core host writes **one JSON object per line** to stdout. Each object has a `type` field.

| `type` | When | Fields |
|--------|------|--------|
| `ready` | Start of session | `protocolVersion` |
| `module` | Domain hook (`onSessionStart`, `onToolRound`, `onSessionReset`) | `module`, `event`, optional `payload` |
| `user_command` | Start of each turn | `command` |
| `assistant_message` | Model returns text before tool calls | `content` |
| `tool_call` | Before executing a tool | `name`, `args`, `toolCallId` |
| `tool_result` | After executing a tool | `name`, `content`, `toolCallId` |
| `tokens` | After each LLM call | `iteration`, `usage` (cumulative per turn) |
| `agent_response` | Final text response for a turn | `content`, `iterations`, `tokenUsage` |
| `session_end` | End of session | `turnCount` |
| `error` | CLI or runtime failure | `message` |

Smart home emits `{ type: 'module', module: 'smartHome', event: 'state', payload }` with a full `ToolContext` snapshot (lights, AC, valves). Binary devices use `"ON"` / `"OFF"`; AC values are `{ power, targetTemperature }`.

YAML repair emits `{ type: 'module', module: 'yamlRepair', event: 'state', payload }` with `{ filePath, parseStatus }` (`errorCount`, `ok`, `errors`, `undoHint`). The work file itself is not streamed — only compact parse status for the right panel.

Example lines:

```json
{"type":"ready","protocolVersion":1}
{"type":"module","module":"smartHome","event":"state","payload":{"light":{"livingRoom":{"1":"ON"}}}}
{"type":"user_command","command":"turn off all lights in the living room"}
{"type":"tool_call","name":"controlDevice","args":{"controlGroup":"light","room":"livingRoom","deviceId":"1","action":"turn_off"},"toolCallId":"call_abc"}
{"type":"tool_result","name":"controlDevice","content":"...","toolCallId":"call_abc"}
{"type":"module","module":"smartHome","event":"state","payload":{"light":{"livingRoom":{"1":"OFF"}}}}
{"type":"agent_response","content":"All living room lights are off.","iterations":4,"tokenUsage":{"prompt_tokens":1200,"completion_tokens":80,"total_tokens":1280}}
```

Parsing from another process:

```bash
# -s hides npm's own stdout banner
npm run harness -s -- turn off all lights in the living room 2>/dev/null | jq -cn 'inputs | .type'
```

Process every event type:

```bash
npm run harness -s -- turn off all lights in the living room 2>/dev/null | jq -cn 'inputs'
```

**Do not use `echo "$line" | jq` on macOS.** Builtin `echo` interprets `\n` inside JSON strings as real newlines, which breaks valid JSONL. Use `jq -cn 'inputs'` (reads one JSON object per line) or `printf '%s\n' "$line" | jq .` in a `while read` loop.

- **stdout** — JSONL events only (dotenv load is silent)
- **stderr** — debug; never parse as protocol

yamlRepair is a Core plugin (`npm run yaml-repair`). virtualWizard still has a **legacy** JSONL CLI (`context_init` / `wizard_state`) used by its spawn renderer (`npm run virtual-wizard:harness`).

---

## JSONL input protocol (`--serve`)

In serve mode, the host reads **one JSON object per line** from stdin:

| `type` | Fields | Description |
|--------|--------|-------------|
| `user_command` | `command` | Start a new turn (wait for `agent_response` before sending another) |
| `cancel` | — | Abort the current turn |
| `reset` | — | Clear history and restore module state |
| `shutdown` | — | End the session gracefully |

**Stream rules:**
- **stdout** — harness events (machine-readable)
- **stdin** — client commands (machine-readable)
- **stderr** — ignored by clients; do not use for protocol

**Session flow:**

```text
← {"type":"ready","protocolVersion":1}
← {"type":"module","module":"smartHome","event":"state","payload":{...}}
→ {"type":"user_command","command":"turn off all lights"}
← {"type":"user_command","command":"turn off all lights"}
← {"type":"tool_call",...}
← {"type":"module","module":"smartHome","event":"state","payload":{...}}
← {"type":"agent_response",...}
→ {"type":"user_command","command":"are any lights still on?"}
← ...
→ {"type":"shutdown"}
← {"type":"session_end","turnCount":2}
```

Any language can implement a client by spawning `npm run harness -- --serve` with piped stdin/stdout. The TypeScript TUI (`npm start`) is in-process and does not spawn.

---

## TUI renderer

On a TTY, `npm start` runs Core `DefaultRenderer` in-process (no spawn):

- **Left panel** — event log (`tool_call`, `tool_result`, tokens, agent response, …)
- **Right panel** — module panel (`smartHome` floor plan, `yamlRepair` parse status); updates on `module` / `state`
- **Diff rendering** — only changed terminal cells are rewritten (no full-screen clear)
- **Multi-turn** — after each `agent_response`, enter another command; `/exit` ends the session

Requires an interactive terminal (TTY):

```bash
npm start -- turn off all lights in the living room
npm start
```

| Command | Output |
|---------|--------|
| `npm start [-- <command>]` | Split-view TUI (multi-turn, default on TTY) |
| `npm run harness -- <command>` | One-shot JSONL (forced with `--jsonl`, including on a TTY) |
| `npm run harness -- --serve` | JSONL stdin/stdout session |
| `npm start -- --jsonl <command>` | Same one-shot JSONL from the TUI entrypoint |
| `npm run smart-home` | Alias for `npm start` |
| `npm run core` | Host with no module (placeholder panel) |

---

## Adding your own module

The Core host does not depend on smart home. To add another domain:

1. Create `src/modules/yourDomain/`
2. Define Zod schemas for tool arguments
3. Use `defineTool()` to declare tools against a context (in-memory state, file, mock API, etc.)
4. Export `createYourDomainModule(): Module` with prompt, tools, hooks, and optional `createPanel()`
5. Add `main.ts` that calls `run({ module: createYourDomainModule(), argv: process.argv.slice(2) })`

Keep the domain module responsible for its own state and side effects. Keep `Harness` free of domain imports.

---

## Project structure

```text
src/
├── client/                 # OpenAI-compatible LLM client
│   ├── createOpenAiClient.ts
│   └── llmClient.type.ts
├── core/                   # Host: run(), Harness, EventBus, DefaultRenderer
│   ├── run.ts
│   ├── harness.ts
│   ├── module.ts           # Module + ModulePanel contract
│   ├── protocol.ts         # Core JSONL events
│   └── tui/                # Default split-view renderer
├── harness/                # Shared config + legacy Agent loop
│   ├── harness.ts
│   ├── agent.type.ts
│   ├── harness.config.*
│   └── loadEnv.ts
├── cli/                    # Legacy JSONL CLI (virtualWizard spawn)
│   ├── jsonl.ts
│   ├── sessionLoop.ts
│   ├── harnessClient.ts
│   └── tui/                # diff terminal + split layout
├── tools/                  # Tool framework
│   ├── defineTool.ts
│   ├── runTools.ts
│   ├── types.ts
│   └── validation.ts
└── modules/
    ├── smartHome/          # Imaginary smart home integration (Core plugin)
    │   ├── main.ts         # run({ module })
    │   ├── module.ts       # createSmartHomeModule() + floor-plan panel
    │   ├── devices.ts      # In-memory state + helpers
    │   ├── schemas.ts      # Zod argument schemas
    │   ├── context.ts      # Context factory + state snapshot
    │   ├── renderer/       # Floor-plan paint
    │   └── *.tool.ts
    ├── virtualWizard/      # Core plugin + legacy spawn CLI
    └── yamlRepair/         # YAML repair benchmark (Core plugin)
        ├── main.ts         # run({ module }) — --default starts the canonical repair
        ├── module.ts       # createYamlRepairModule() + parse-status panel
        ├── context.ts      # temp work file + parse snapshot
        ├── renderer/       # Parse-status paint
        └── *.tool.ts
```

---

## Evaluating edge models

When comparing models, look at:

- **Task completion** — does the in-memory state match the requested outcome? (system tests)
- **Iteration count** — fewer tool rounds usually means better planning
- **Recovery from poisoned tool** — does the model verify and switch to per-device control?
- **Token usage** — emitted as `tokens` events after each LLM call; matters on resource-constrained hardware
- **Failure mode** — wrong tool, missing devices, premature "done", or hitting `maxIterations`

Results will vary widely between models and quantizations. This repo is meant to make those differences visible and reproducible, not to declare a single winner.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start [-- <command>]` | Smart home Core host (TUI on TTY) |
| `npm run smart-home [-- args]` | Alias for `npm start` |
| `npm run harness [-- args]` | Smart home JSONL (`--jsonl`; one-shot or `--serve`) |
| `npm run core` | Core host with no module |
| `npm run virtual-wizard` | Virtual wizard Core plugin |
| `npm run yaml-repair [-- <command>]` | YAML repair Core host (TUI on TTY; waits for a command) |
| `npm run yaml-repair -- --default` | YAML repair TUI with the canonical repair instruction |
| `npm run yaml-repair:harness [-- args]` | YAML repair JSONL (`--jsonl`; one-shot or `--serve`) |
| `npm run yaml-repair:batch` | One-shot JSONL with the default repair instruction |
| `npm run yaml-repair:harness -- --serve` | JSONL stdin/stdout session |
| `npm run dev` | Same as `npm start` |
| `npm test` | Unit tests (no LLM) |
| `npm run test:coverage` | Unit tests with V8 coverage report |
| `npm run test:system` | E2E tests against local model |
| `npm run build` | Compile TypeScript to `dist/` |

---

## License

MIT — see [LICENSE](LICENSE).
