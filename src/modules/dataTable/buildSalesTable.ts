import {
  SALES_COLUMNS,
  SALES_ROW_COUNT,
  SALES_TABLE_DESCRIPTION,
  SALES_TABLE_ID,
} from './columns';
import type { SalesRow, SalesTable } from './schemas';

type Customer = {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerSegment: SalesRow['customerSegment'];
  industry: string;
  region: SalesRow['region'];
  country: string;
  city: string;
  warehouse: string;
  currency: SalesRow['currency'];
  taxPct: number;
};

type Product = {
  sku: string;
  productName: string;
  category: string;
  subcategory: string;
  brand: string;
  unitPrice: number;
  unitCost: number;
  weightKg: number;
};

type Salesperson = {
  salespersonId: string;
  salespersonName: string;
  team: string;
};

const CUSTOMERS: readonly Customer[] = [
  {
    customerId: 'C-1001',
    customerName: 'Northwind Logistics',
    customerEmail: 'ops@northwind.example',
    customerSegment: 'enterprise',
    industry: 'logistics',
    region: 'EMEA',
    country: 'Poland',
    city: 'Warsaw',
    warehouse: 'WH-WAW',
    currency: 'EUR',
    taxPct: 0.23,
  },
  {
    customerId: 'C-1002',
    customerName: 'Blue Harbor Retail',
    customerEmail: 'buying@blueharbor.example',
    customerSegment: 'smb',
    industry: 'retail',
    region: 'AMER',
    country: 'USA',
    city: 'Austin',
    warehouse: 'WH-AUS',
    currency: 'USD',
    taxPct: 0.08,
  },
  {
    customerId: 'C-1003',
    customerName: 'Sakura Clinics',
    customerEmail: 'procurement@sakura-clinics.example',
    customerSegment: 'enterprise',
    industry: 'healthcare',
    region: 'APAC',
    country: 'Japan',
    city: 'Osaka',
    warehouse: 'WH-OSA',
    currency: 'JPY',
    taxPct: 0.1,
  },
  {
    customerId: 'C-1004',
    customerName: 'Helios Bakery',
    customerEmail: 'hello@heliosbakery.example',
    customerSegment: 'consumer',
    industry: 'food',
    region: 'EMEA',
    country: 'Germany',
    city: 'Berlin',
    warehouse: 'WH-BER',
    currency: 'EUR',
    taxPct: 0.19,
  },
  {
    customerId: 'C-1005',
    customerName: 'Canyon Outdoor',
    customerEmail: 'orders@canyonoutdoor.example',
    customerSegment: 'smb',
    industry: 'sports',
    region: 'AMER',
    country: 'USA',
    city: 'Denver',
    warehouse: 'WH-DEN',
    currency: 'USD',
    taxPct: 0.08,
  },
  {
    customerId: 'C-1006',
    customerName: 'Maple Civic Office',
    customerEmail: 'facilities@maplecivic.example',
    customerSegment: 'enterprise',
    industry: 'public',
    region: 'AMER',
    country: 'Canada',
    city: 'Toronto',
    warehouse: 'WH-YYZ',
    currency: 'CAD',
    taxPct: 0.13,
  },
  {
    customerId: 'C-1007',
    customerName: 'Solaris Media',
    customerEmail: 'studio@solarismedia.example',
    customerSegment: 'smb',
    industry: 'media',
    region: 'EMEA',
    country: 'United Kingdom',
    city: 'London',
    warehouse: 'WH-LON',
    currency: 'GBP',
    taxPct: 0.2,
  },
  {
    customerId: 'C-1008',
    customerName: 'Lotus Tea Co',
    customerEmail: 'buy@lotustea.example',
    customerSegment: 'consumer',
    industry: 'food',
    region: 'APAC',
    country: 'Singapore',
    city: 'Singapore',
    warehouse: 'WH-SIN',
    currency: 'SGD',
    taxPct: 0.09,
  },
];

const PRODUCTS: readonly Product[] = [
  {
    sku: 'LUM-AD-120',
    productName: 'Aurora Desk Lamp',
    category: 'lighting',
    subcategory: 'desk',
    brand: 'Lumenia',
    unitPrice: 49.9,
    unitCost: 18.4,
    weightKg: 1.2,
  },
  {
    sku: 'SIT-NM-880',
    productName: 'Nimbus Mesh Chair',
    category: 'furniture',
    subcategory: 'seating',
    brand: 'Sitwell',
    unitPrice: 289,
    unitCost: 112,
    weightKg: 14.8,
  },
  {
    sku: 'PIV-CA-330',
    productName: 'Cascade Monitor Arm',
    category: 'accessories',
    subcategory: 'mounts',
    brand: 'PivotCo',
    unitPrice: 129,
    unitCost: 42.5,
    weightKg: 3.4,
  },
  {
    sku: 'SIT-HB-640',
    productName: 'Harbor Standing Desk',
    category: 'furniture',
    subcategory: 'desks',
    brand: 'Sitwell',
    unitPrice: 799,
    unitCost: 318,
    weightKg: 42,
  },
  {
    sku: 'TYP-QL-210',
    productName: 'Quill Mechanical Keyboard',
    category: 'electronics',
    subcategory: 'input',
    brand: 'TypeForge',
    unitPrice: 159,
    unitCost: 54.2,
    weightKg: 1.1,
  },
  {
    sku: 'SND-DR-455',
    productName: 'Drift Wireless Headset',
    category: 'electronics',
    subcategory: 'audio',
    brand: 'Soundline',
    unitPrice: 219,
    unitCost: 78.6,
    weightKg: 0.4,
  },
  {
    sku: 'LUM-EM-090',
    productName: 'Ember LED Panel',
    category: 'lighting',
    subcategory: 'ceiling',
    brand: 'Lumenia',
    unitPrice: 89,
    unitCost: 31.2,
    weightKg: 2.6,
  },
  {
    sku: 'PIV-FO-118',
    productName: 'Folio Laptop Stand',
    category: 'accessories',
    subcategory: 'stands',
    brand: 'PivotCo',
    unitPrice: 64,
    unitCost: 18.9,
    weightKg: 0.9,
  },
];

const SALESPEOPLE: readonly Salesperson[] = [
  { salespersonId: 'S-11', salespersonName: 'Anna Kowalska', team: 'EMEA-West' },
  { salespersonId: 'S-12', salespersonName: 'James Ortega', team: 'AMER-Central' },
  { salespersonId: 'S-13', salespersonName: 'Mei Tan', team: 'APAC-South' },
  { salespersonId: 'S-14', salespersonName: 'Lukas Weber', team: 'EMEA-Central' },
];

const CHANNELS: readonly SalesRow['channel'][] = ['online', 'retail', 'partner'];
const PAYMENT_METHODS: readonly SalesRow['paymentMethod'][] = ['card', 'invoice', 'transfer', 'cash'];
const CAMPAIGNS = ['spring-refresh', 'q3-volume', 'new-logo', 'retention', 'none'] as const;
const PROMO_CODES = ['SPRING15', 'VOLUME10', 'WELCOME5', null, null, null] as const;
const RETURN_REASONS = ['damaged', 'wrong item', 'changed mind'] as const;
const STATUSES: readonly SalesRow['orderStatus'][] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'delivered',
  'delivered',
  'cancelled',
];

const SEED = 20260829;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function datePart(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${datePart(isoDate)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function withTimeOfDay(isoDate: string, rng: () => number): string {
  const hour = 8 + Math.floor(rng() * 11);
  const minute = Math.floor(rng() * 60);
  const second = Math.floor(rng() * 60);
  return `${datePart(isoDate)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000Z`;
}

function fiscalQuarter(isoDate: string): SalesRow['fiscalQuarter'] {
  const month = Number(isoDate.slice(5, 7));
  if (month <= 3) {
    return 'Q1';
  }
  if (month <= 6) {
    return 'Q2';
  }
  if (month <= 9) {
    return 'Q3';
  }
  return 'Q4';
}

function paymentStatusFor(
  orderStatus: SalesRow['orderStatus'],
  isReturned: boolean,
  rng: () => number,
): SalesRow['paymentStatus'] {
  if (orderStatus === 'cancelled') {
    return rng() < 0.5 ? 'failed' : 'refunded';
  }
  if (isReturned) {
    return 'refunded';
  }
  if (orderStatus === 'pending') {
    return 'pending';
  }
  return 'paid';
}

function salespersonFor(region: SalesRow['region'], rng: () => number): Salesperson {
  if (region === 'AMER') {
    return SALESPEOPLE[1]!;
  }
  if (region === 'APAC') {
    return SALESPEOPLE[2]!;
  }
  return rng() < 0.5 ? SALESPEOPLE[0]! : SALESPEOPLE[3]!;
}

export function buildSalesTable(): SalesTable {
  const rng = mulberry32(SEED);
  const rows: SalesRow[] = [];
  let orderSeq = 18420;
  let dayOffset = 0;

  while (rows.length < SALES_ROW_COUNT) {
    const linesInOrder = Math.min(1 + Math.floor(rng() * 3), SALES_ROW_COUNT - rows.length);
    const customer = pick(rng, CUSTOMERS);
    const salesperson = salespersonFor(customer.region, rng);
    const orderStatus = pick(rng, STATUSES);
    const orderDate = withTimeOfDay(addDays('2025-01-06', dayOffset), rng);
    dayOffset += 1 + Math.floor(rng() * 4);

    const shipDate =
      orderStatus === 'pending' || orderStatus === 'processing' || orderStatus === 'cancelled'
        ? null
        : addDays(orderDate, 1 + Math.floor(rng() * 4));
    const deliveryDate =
      orderStatus === 'delivered' && shipDate ? addDays(shipDate, 1 + Math.floor(rng() * 6)) : null;

    const channel = pick(rng, CHANNELS);
    const paymentMethod = pick(rng, PAYMENT_METHODS);
    const campaign = pick(rng, CAMPAIGNS);
    const promoCode = campaign === 'none' ? null : pick(rng, PROMO_CODES);
    const isReturned = orderStatus === 'delivered' && rng() < 0.16;
    const returnReason = isReturned ? pick(rng, RETURN_REASONS) : null;
    const paymentStatus = paymentStatusFor(orderStatus, isReturned, rng);
    const npsScore = 4 + Math.floor(rng() * 7);
    const rating = round2(2.5 + rng() * 2.5);
    const notes =
      orderStatus === 'cancelled'
        ? 'Cancelled before fulfillment.'
        : isReturned
          ? 'Return opened after delivery.'
          : rng() < 0.2
            ? 'Rush handling requested.'
            : null;
    const updatedAt = withTimeOfDay(deliveryDate ?? shipDate ?? orderDate, rng);
    const shippingCost = orderStatus === 'cancelled' ? 0 : round2(8 + rng() * 42);
    const orderId = `ORD-${orderSeq}`;
    orderSeq += 1;

    for (let lineNumber = 1; lineNumber <= linesInOrder; lineNumber++) {
      const product = pick(rng, PRODUCTS);
      const quantity = 1 + Math.floor(rng() * 8);
      const discountPct = promoCode ? round4(0.05 + rng() * 0.12) : round4(rng() * 0.04);
      const lineNet = round2(quantity * product.unitPrice * (1 - discountPct));
      const lineTax = round2(lineNet * customer.taxPct);
      const lineTotal = round2(lineNet + lineTax);
      const lineCost = round2(quantity * product.unitCost);
      const marginPct = lineNet === 0 ? 0 : round4((lineNet - lineCost) / lineNet);

      rows.push({
        rowId: rows.length + 1,
        orderId,
        lineNumber,
        orderDate,
        shipDate,
        deliveryDate,
        fiscalYear: Number(orderDate.slice(0, 4)),
        fiscalQuarter: fiscalQuarter(orderDate),
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerEmail: customer.customerEmail,
        customerSegment: customer.customerSegment,
        industry: customer.industry,
        region: customer.region,
        country: customer.country,
        city: customer.city,
        warehouse: customer.warehouse,
        channel,
        salespersonId: salesperson.salespersonId,
        salespersonName: salesperson.salespersonName,
        team: salesperson.team,
        sku: product.sku,
        productName: product.productName,
        category: product.category,
        subcategory: product.subcategory,
        brand: product.brand,
        quantity,
        unitPrice: product.unitPrice,
        discountPct,
        taxPct: customer.taxPct,
        lineNet,
        lineTax,
        lineTotal,
        unitCost: product.unitCost,
        lineCost,
        marginPct,
        currency: customer.currency,
        paymentMethod,
        paymentStatus,
        orderStatus,
        shippingCost,
        weightKg: round2(product.weightKg * quantity),
        isReturned,
        returnReason,
        promoCode,
        campaign,
        npsScore,
        rating,
        notes,
        updatedAt,
      });
    }
  }

  return {
    id: SALES_TABLE_ID,
    description: SALES_TABLE_DESCRIPTION,
    columns: [...SALES_COLUMNS],
    rows,
  };
}
