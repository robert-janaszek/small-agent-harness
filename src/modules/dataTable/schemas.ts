import { z } from 'zod';

import {
  SALES_COLUMNS,
  SALES_COLUMN_COUNT,
  SALES_ROW_COUNT,
  SALES_TABLE_DESCRIPTION,
  SALES_TABLE_ID,
} from './columns';

export const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, 'Expected ISO datetime');

export const salesRowSchema = z.object({
  rowId: z.number().int().positive(),
  orderId: z.string().min(1),
  lineNumber: z.number().int().positive(),
  orderDate: isoDateTimeSchema,
  shipDate: isoDateSchema.nullable(),
  deliveryDate: isoDateSchema.nullable(),
  fiscalYear: z.number().int(),
  fiscalQuarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerSegment: z.enum(['enterprise', 'smb', 'consumer']),
  industry: z.string().min(1),
  region: z.enum(['EMEA', 'AMER', 'APAC']),
  country: z.string().min(1),
  city: z.string().min(1),
  warehouse: z.string().min(1),
  channel: z.enum(['online', 'retail', 'partner']),
  salespersonId: z.string().min(1),
  salespersonName: z.string().min(1),
  team: z.string().min(1),
  sku: z.string().min(1),
  productName: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  brand: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  discountPct: z.number().min(0).max(1),
  taxPct: z.number().min(0).max(1),
  lineNet: z.number(),
  lineTax: z.number(),
  lineTotal: z.number(),
  unitCost: z.number().nonnegative(),
  lineCost: z.number(),
  marginPct: z.number(),
  currency: z.enum(['EUR', 'USD', 'SGD', 'JPY', 'CAD', 'GBP']),
  paymentMethod: z.enum(['card', 'invoice', 'transfer', 'cash']),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']),
  orderStatus: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  shippingCost: z.number().nonnegative(),
  weightKg: z.number().nonnegative(),
  isReturned: z.boolean(),
  returnReason: z.string().min(1).nullable(),
  promoCode: z.string().min(1).nullable(),
  campaign: z.string().min(1),
  npsScore: z.number().int().min(0).max(10),
  rating: z.number().min(1).max(5),
  notes: z.string().nullable(),
  updatedAt: isoDateTimeSchema,
});

export const salesTableSchema = z
  .object({
    id: z.literal(SALES_TABLE_ID),
    description: z.literal(SALES_TABLE_DESCRIPTION),
    columns: z.array(z.string()).length(SALES_COLUMN_COUNT),
    rows: z.array(salesRowSchema).length(SALES_ROW_COUNT),
  })
  .superRefine((table, ctx) => {
    for (let index = 0; index < SALES_COLUMNS.length; index++) {
      if (table.columns[index] !== SALES_COLUMNS[index]) {
        ctx.addIssue({
          code: 'custom',
          message: `columns[${index}] must be "${SALES_COLUMNS[index]}"`,
          path: ['columns', index],
        });
      }
    }
  });

export type CellValue = z.infer<typeof cellValueSchema>;
export type SalesRow = z.infer<typeof salesRowSchema>;
export type SalesTable = z.infer<typeof salesTableSchema>;
export type DataRow = Record<string, CellValue>;

export const PREVIEW_MAX_LIMIT = 10;
export const SEND_SAMPLE_MAX_ROWS = 5;
export const DISTINCT_VALUES_CAP = 20;

export const filterOpSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
  'isNull',
  'isNotNull',
]);

const filterValueSchema = z.union([cellValueSchema, z.array(cellValueSchema)]);

export const filterClauseSchema = z.object({
  column: z.string().min(1).describe('Column name to test'),
  op: filterOpSchema.describe(
    'Comparison: eq, neq, gt, gte, lt, lte, contains, in, isNull, isNotNull',
  ),
  value: filterValueSchema
    .optional()
    .describe('Right-hand value. Required except for isNull and isNotNull. Use an array for op in.'),
});

export const filterRowsArgsSchema = z
  .object({
    match: z
      .enum(['all', 'any'])
      .optional()
      .describe('Combine clauses with AND (all) or OR (any). Default all.'),
    where: z.array(filterClauseSchema).min(1).describe('Filter clauses against the current buffer'),
  })
  .superRefine((args, ctx) => {
    for (const [index, clause] of args.where.entries()) {
      if (clause.op === 'isNull' || clause.op === 'isNotNull') {
        continue;
      }
      if (clause.value === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `where[${index}].value is required for op "${clause.op}"`,
          path: ['where', index, 'value'],
        });
      }
      if (clause.op === 'in' && clause.value !== undefined && !Array.isArray(clause.value)) {
        ctx.addIssue({
          code: 'custom',
          message: `where[${index}].value must be an array when op is "in"`,
          path: ['where', index, 'value'],
        });
      }
    }
  });

export const sortKeySchema = z.object({
  column: z.string().min(1).describe('Column to sort by'),
  direction: z.enum(['asc', 'desc']).optional().describe('Sort direction. Default asc.'),
});

export const sortRowsArgsSchema = z.object({
  keys: z.array(sortKeySchema).min(1).describe('Sort keys, applied in order'),
});

export const aggregateMetricSchema = z.object({
  op: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('Aggregation: count, sum, avg, min, or max'),
  column: z
    .string()
    .min(1)
    .optional()
    .describe('Column to aggregate. Required for sum, avg, min, and max. Optional for count.'),
  as: z.string().min(1).optional().describe('Result column name. Defaults to count or op_column.'),
});

export const aggregateArgsSchema = z.object({
  groupBy: z
    .array(z.string().min(1))
    .optional()
    .describe('Columns to group by. Omit or pass [] for a single total row.'),
  metrics: z.array(aggregateMetricSchema).min(1).describe('Aggregations to compute for each group'),
});

export const describeTableArgsSchema = z.object({
  column: z
    .string()
    .min(1)
    .optional()
    .describe('When set, also list distinct values for this column (capped).'),
});

export const previewRowsArgsSchema = z.object({
  offset: z.number().int().min(1).describe('1-based row number to start from'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(PREVIEW_MAX_LIMIT)
    .describe(`Number of rows to return (max ${PREVIEW_MAX_LIMIT})`),
  columns: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('Optional column projection for this read only. Does not change the buffer.'),
});

export const limitRowsArgsSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Window size. Required unless next is true. Does not drop rows from the buffer — sendBufferToUser uses this window.',
      ),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-based row number to start from. Default 1. Do not pass offset with next.'),
    next: z
      .boolean()
      .optional()
      .describe(
        'Advance the existing window by one page (same size unless you also pass limit). Use this for "the next 5" after a previous limitRows. Do not re-sort.',
      ),
  })
  .superRefine((args, ctx) => {
    if (args.next) {
      if (args.offset !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Do not pass offset when next is true',
          path: ['offset'],
        });
      }
      return;
    }
    if (args.limit === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'limit is required unless next is true',
        path: ['limit'],
      });
    }
  });

export const selectColumnsArgsSchema = z.object({
  columns: z
    .array(z.string().min(1))
    .min(1)
    .describe('Columns to keep, in this order. Replaces the buffer schema.'),
});

export const sendBufferToUserArgsSchema = z.object({});

export const resetBufferArgsSchema = z.object({});

export type FilterOp = z.infer<typeof filterOpSchema>;
export type FilterClause = z.infer<typeof filterClauseSchema>;
export type FilterRowsArgs = z.infer<typeof filterRowsArgsSchema>;
export type SortKey = z.infer<typeof sortKeySchema>;
export type SortRowsArgs = z.infer<typeof sortRowsArgsSchema>;
export type AggregateMetric = z.infer<typeof aggregateMetricSchema>;
export type AggregateArgs = z.infer<typeof aggregateArgsSchema>;
export type DescribeTableArgs = z.infer<typeof describeTableArgsSchema>;
export type PreviewRowsArgs = z.infer<typeof previewRowsArgsSchema>;
export type LimitRowsArgs = z.infer<typeof limitRowsArgsSchema>;
export type SelectColumnsArgs = z.infer<typeof selectColumnsArgsSchema>;
export type SendBufferToUserArgs = z.infer<typeof sendBufferToUserArgsSchema>;
export type ResetBufferArgs = z.infer<typeof resetBufferArgsSchema>;
