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

    for (const [rowIndex, row] of table.rows.entries()) {
      const keys = Object.keys(row);
      if (keys.length !== SALES_COLUMN_COUNT) {
        ctx.addIssue({
          code: 'custom',
          message: `row ${rowIndex} must have ${SALES_COLUMN_COUNT} keys`,
          path: ['rows', rowIndex],
        });
      }
    }
  });

export type CellValue = z.infer<typeof cellValueSchema>;
export type SalesRow = z.infer<typeof salesRowSchema>;
export type SalesTable = z.infer<typeof salesTableSchema>;
export type DataRow = Record<string, CellValue>;
