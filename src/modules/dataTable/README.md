# Data table module

A third benchmark domain for **small-agent-harness**: can a locally hosted LLM transform a wide table **without dropping or inventing rows**?

Unlike `smartHome` (short device commands) and `yamlRepair` (format fidelity on a large file), this scenario stresses **deterministic tabular work**. Small models that scan records in the prompt tend to skip lines, round badly, or invent totals. The agent should keep a buffer in memory and use tools instead of doing SQL-like work in its head.

This first increment only loads fake data. Filter, aggregate (`sum` / `avg` / `max` / `min` / `count`), paginated preview, and a user-facing export that **bypasses the model** come next.

---

## Fixture

`fixtures/sales.json` is a synthetic B2B sales extract:

| | Count |
|---|---|
| Columns | 50 |
| Rows | 50 |

Each row is one order line item (shared `orderId` across lines). Columns mix identifiers, timestamps (`orderDate` is ISO datetime with a time of day), categories, money, and flags so later tools can filter and aggregate like SQL.

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

The right panel shows buffer size (`50 rows x 50 cols`) and column names. Row payloads stay in process memory — they are not streamed in module `state` events.

---

## Intended tools (not in this increment)

| Tool | Role |
|------|------|
| Filter / project | Mutate the in-memory buffer (WHERE / SELECT) |
| Aggregate | `sum`, `avg`, `max`, `min`, `count` by column, optional GROUP BY |
| Preview | Paginated slice for the model |
| Export to user | Send the **entire** current buffer to the user, skipping the model so it cannot drop rows |

The buffer starts as a clone of `sales.json`. Session reset restores that clone.
