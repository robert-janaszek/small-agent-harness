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

## What this repo is not

- Not a production smart home stack.
- Not connected to real devices or home automation platforms.
- Not a general-purpose agent framework — it is intentionally small and focused.

The `smartHome` module is an **imaginary integration**: lights, AC units, TVs, and water valves live in an in-memory `ToolContext`. Tools read and mutate that state as if they talked to real services, but nothing leaves the process.

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

Start your local model server, then run:

```bash
npm run dev
```

By default, `main.ts` runs a single command:

```text
turn off all lights in the living room
```

Change `HARNESS_USER_COMMAND` in `src/main.ts` to try other scenarios.

---

## Configuration

| Variable | Description |
|----------|-------------|
| `OPENAI_BASE_URL` | Base URL of an OpenAI-compatible API (e.g. `http://127.0.0.1:1234/v1`) |
| `OPENAI_API_KEY` | API key — many local servers accept any non-empty string |
| `MODEL_NAME` | Model identifier as exposed by your server |
| `HARNESS_MAX_ITERATIONS` | Safety cap on agent loop iterations (positive integer) |

Config is validated at runtime via Zod when the harness first needs it (`getHarnessConfig()`).

---

## Architecture

```text
main.ts
  └── Harness(agent, options?)
        ├── ChatCompletionClient   ← createOpenAiClient() or inject a mock
        ├── agent loop             ← system prompt + user command + tool history
        └── runTools()             ← Zod-validated tool execution

modules/smartHome/
  └── createSmartHomeAgent()
        ├── ToolContext            ← in-memory fake device state
        ├── tools                  ← listDevices, controlDevice, controlAc, …
        └── onToolRound            ← optional console snapshot after each tool round
```

### Core concepts

**`Harness`** — domain-agnostic loop. Calls the LLM, executes tool calls, repeats until the model returns a text response or `maxIterations` is reached. Returns a structured `HarnessRunResult` (content, token usage, iteration count).

**`Agent`** — a system prompt, a list of tools, and an optional `onToolRound` callback.

**`Tool` / `defineTool`** — each tool has a Zod `argsSchema` (single source of truth) and a `call` handler. OpenAI function parameters are generated from the schema via `z.toJSONSchema`.

**`createSmartHomeAgent()`** — factory that builds an agent with its own isolated `ToolContext`. Pass `initialState` to customize starting device states in tests.

---

## The poisoned tool

`controlAllDevicesInRoom` is deliberately broken: it returns a plausible success message but **does not change any device state**.

This tests whether the model:

1. Verifies outcomes instead of trusting tool output
2. Falls back to per-device control (`controlDevice`) when bulk control fails
3. Completes multi-device tasks without human intervention

The agent system prompt and tool description hint that verification is required. System tests assert the final in-memory state, not the model's final message.

---

## Testing

```bash
# Fast unit tests — no LLM required
npm test

# End-to-end tests against a live local model (requires running inference server)
npm run test:system

# Watch mode
npm run test:watch
```

| Suite | What it covers |
|-------|----------------|
| `npm test` | Config validation, `Harness` loop (mocked LLM), `runTools`, all smart home tools, integration scenario with poisoned tool |
| `npm run test:system` | Full agent runs: lights off, AC on + temperature, water valve — skipped automatically if the API is unreachable |

System tests probe `GET {OPENAI_BASE_URL}/models` and use `describe.skipIf` when no server is available, so CI and offline development still work with unit tests only.

---

## Example scenarios to try

Edit `HARNESS_USER_COMMAND` in `src/main.ts`:

```text
turn off all lights in the living room
set the living room air conditioning to 24 degrees and turn it on
turn off the water valve in the bathroom
turn on the bedroom ceiling light
```

After each run, watch the console: tool calls, token usage, and a live ASCII snapshot of device states.

---

## Adding your own module

The harness does not depend on smart home. To add another domain:

1. Create `src/modules/yourDomain/`
2. Define Zod schemas for tool arguments
3. Use `defineTool()` to declare tools against a context (in-memory state, file, mock API, etc.)
4. Export a factory, e.g. `createYourDomainAgent(): Agent`
5. Wire it in `main.ts`: `new Harness(createYourDomainAgent())`

Keep the domain module responsible for its own state and side effects. Keep `Harness` free of domain imports.

---

## Project structure

```text
src/
├── harness.ts              # Agent loop
├── runTools.ts             # Tool dispatch + Zod validation
├── defineTool.ts           # Tool factory + Zod → OpenAI parameters
├── createOpenAiClient.ts   # OpenAI-compatible client wrapper
├── harness.config.*        # Env config read + validation
├── agent.type.ts           # Agent interface
├── types.ts                # Tool, ToolContext types
├── main.ts                 # Entry point (demo command)
└── modules/
    └── smartHome/          # Imaginary smart home integration (demo domain)
        ├── agent.ts        # Agent factory + system prompt
        ├── devices.ts      # In-memory state + helpers
        ├── schemas.ts      # Zod argument schemas
        ├── context.ts      # Context factory + debug printer
        └── *.tool.ts       # One file per tool
```

---

## Evaluating edge models

When comparing models, look at:

- **Task completion** — does the in-memory state match the requested outcome? (system tests)
- **Iteration count** — fewer tool rounds usually means better planning
- **Recovery from poisoned tool** — does the model verify and switch to per-device control?
- **Token usage** — printed after each LLM call; matters on resource-constrained hardware
- **Failure mode** — wrong tool, missing devices, premature "done", or hitting `maxIterations`

Results will vary widely between models and quantizations. This repo is meant to make those differences visible and reproducible, not to declare a single winner.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the demo agent command |
| `npm start` | Same as `dev` |
| `npm test` | Unit tests (no LLM) |
| `npm run test:system` | E2E tests against local model |
| `npm run build` | Compile TypeScript to `dist/` |

---

## License

MIT — see [LICENSE](LICENSE).
