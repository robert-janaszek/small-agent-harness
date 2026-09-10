# Data table module

A third benchmark domain for **small-agent-harness**: can a locally hosted LLM transform a wide table **without dropping or inventing rows**?

Unlike `smartHome` (short device commands) and `yamlRepair` (format fidelity on a large file), this scenario stresses **deterministic tabular work**. Small models that scan records in the prompt tend to skip lines, round badly, or invent totals. The agent should keep a buffer in memory and use tools instead of doing SQL-like work in its head.

---

## Fixture

`fixtures/sales.json` is a synthetic B2B sales extract:

| | Count |
|---|---|
| Columns | 50 |
| Rows | 50 |

Each row is one order line item (shared `orderId` across lines). Columns mix identifiers, timestamps (`orderDate` is ISO datetime with a time of day), categories, money, and flags so tools can filter and aggregate like SQL.

**Money is mixed-currency on purpose.** Catalog `unitPrice` / `unitCost` are EUR and converted to the customer currency (so a chair is not `289` in both EUR and JPY). A naive `SUM(lineTotal)` is still the wrong answer; group by `currency` first. `aggregate` still computes the number and adds a warning when a money column is summed or averaged without `currency` in `groupBy`.

`shippingCost` is an order-level amount stored on `lineNumber === 1` (other lines are `0`), so `SUM(shippingCost)` over rows matches summing once per `orderId`.

Regenerate the JSON after changing the builder:

```bash
npx tsx src/modules/dataTable/fixtures/writeSalesFixture.ts
```

The committed file must match `buildSalesTable()` (seeded). Unit tests fail if they drift.

---

## How to run

Same prerequisites as the main repo: Node 18+, a local OpenAI-compatible server, and `.env`.

```bash
npm run data-table
npm run data-table:harness -- --serve
```

The right panel shows buffer size (`50 rows x 50 cols`) and column names. Row payloads stay in process memory — they are not streamed in module `state` events. `sendBufferToUser` emits `{ type: 'module', event: 'export' }` with the **full** current table for JSONL consumers (numeric cells rounded to two decimal places). The TUI log shows up to 15 rows and as many columns as fit, marked `(truncated)`.

System tests (`npm run test:system`) run the same live-model loop as smart home when `GET {OPENAI_BASE_URL}/models` is reachable: filter to EMEA, `SUM(lineTotal)` grouped by currency, and `sendBufferToUser`. They are skipped automatically if the API is down.

---

## Tools

The working set is the in-memory buffer. `filterRows`, `selectColumns`, `sortRows`, and `aggregate` replace it. `resetBuffer` (and session reset) restore the sales fixture.

| Tool | Mutates buffer? | What the model sees |
|------|-----------------|---------------------|
| `describeTable` | no | Column types, null/distinct counts; optional distinct values (capped) |
| `filterRows` | yes (WHERE) | `{ rowCount, dropped }` |
| `selectColumns` | yes (SELECT) | `{ rowCount, columnCount, columns }` |
| `sortRows` | yes (ORDER BY) | `{ rowCount }` |
| `aggregate` | yes (replaces with the result table) | Grouped rows plus `warnings` |
| `previewRows` | no | Up to 10 rows, 1-based `offset`; optional `columns` project the read |
| `sendBufferToUser` | no | Counts only; full rows go to the user via `export` |
| `resetBuffer` | yes (fixture) | `{ rowCount, columnCount }` |

Typical sequences:

- Totals in EMEA per currency: `describeTable` → `filterRows` `region = EMEA` → `aggregate` `groupBy: [currency]`, `sum(lineTotal)` → answer from the tool result.
- Inspect expensive lines: `sortRows` `lineTotal desc` → `previewRows` with a narrow `columns` list.
- Hand the user a slice: `filterRows` → `selectColumns` → `sendBufferToUser` (do not reprint the rows).

The buffer starts as a clone of `sales.json`. Session reset restores rows **and** columns.
