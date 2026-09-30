/**
 * Mock invoice data — replace with real API call once the backend endpoint
 * is available (follow-up: link backend issue here).
 *
 * ⚠️  SINGLE SOURCE OF TRUTH: This file is the only place mock invoice
 * fixtures are defined. All components and tests must import MOCK_INVOICES
 * and loadMockInvoices from here. Do NOT redeclare them inline elsewhere.
 * Remove this block and swap loadMockInvoices for the real API client once
 * the backend `/invoices` endpoint is ready.
 *
 * Contract per item: { id, issuer, amount, currency, dueDate, yield, status }
 * NOTE: yield values are illustrative; contracts use on-chain basis points and
 * actual settlement is at maturity.
 */
export const MOCK_INVOICES = [
  {
    id: "inv-001",
    issuer: "Acme Supplies Ltd",
    amount: "12,500",
    amountValue: 12500,
    currency: "USD",
    dueDate: "2026-06-15",
    yield: "8.2%",
    yieldValue: 8.2,
    status: "Open",
    events: [
      { id: "evt-001-a", type: "uploaded", actor: "Acme Supplies Ltd", occurredAt: "2025-04-01T09:00:00Z" },
      { id: "evt-001-b", type: "verified", actor: "Liquidity Desk", occurredAt: "2025-04-03T11:30:00Z" },
      { id: "evt-001-c", type: "listed", actor: "Marketplace Bot", occurredAt: "2025-04-06T16:45:00Z" },
    ],
  },
  {
    id: "inv-002",
    issuer: "Bright Logistics GmbH",
    amount: "7,800",
    amountValue: 7800,
    currency: "EUR",
    dueDate: "2026-07-01",
    yield: "7.5%",
    yieldValue: 7.5,
    status: "Open",
    events: [
      { id: "evt-002-a", type: "uploaded", actor: "Bright Logistics GmbH", occurredAt: "2025-03-20T12:00:00Z" },
      { id: "evt-002-b", type: "verified", actor: "Risk Review", occurredAt: "2025-03-21T15:30:00Z" },
      { id: "evt-002-c", type: "listed", actor: "Marketplace Bot", occurredAt: "2025-03-22T10:15:00Z" },
    ],
  },
  {
    id: "inv-003",
    issuer: "Sunrise Exports Pte",
    amount: "22,000",
    amountValue: 22000,
    currency: "USD",
    dueDate: "2026-05-30",
    yield: "9.1%",
    yieldValue: 9.1,
    status: "Open",
    events: [
      { id: "evt-003-a", type: "uploaded", actor: "Sunrise Exports Pte", occurredAt: "2025-02-10T08:45:00Z" },
      { id: "evt-003-b", type: "verified", actor: "Compliance Team", occurredAt: "2025-02-11T09:10:00Z" },
      { id: "evt-003-c", type: "listed", actor: "Marketplace Bot", occurredAt: "2025-02-12T14:20:00Z" },
    ],
  },
];

// DEV-only delay (ms) to make the skeleton visible during local development.
const DEV_DELAY = process.env.NODE_ENV === "development" ? 1500 : 0;

export function loadMockInvoices() {
  // Test hook: Playwright / Jest tests may override the fixture by setting
  // window.__TEST_MOCK_INVOICES__ before the component mounts.  The override
  // is ignored in non-browser (SSR) environments and in production builds.
  if (typeof window !== "undefined" && window.__TEST_MOCK_INVOICES__) {
    return Promise.resolve(window.__TEST_MOCK_INVOICES__);
  }
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_INVOICES), DEV_DELAY);
  });
}

/**
 * Calculate the number of days between now and a target date string.
 * Returns positive days for future, negative for past, 0 for today.
 * Dates are compared at midnight UTC (time-of-day insensitive).
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @param {Date} [now] - Reference date (defaults to new Date())
 * @returns {number}
 */
export function daysUntilMaturity(dateStr, now = new Date()) {
  const target = new Date(dateStr + "T00:00:00Z");
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Resolve an invoice by its id from the current mock invoice list.
 *
 * @param {string} id - Invoice identifier to look up.
 * @returns {object | undefined} The matching invoice object, or undefined if no invoice exists with the given id.
 */
export function getInvoiceById(id) {
  return MOCK_INVOICES.find((invoice) => invoice.id === id);
}

/**
 * Validate an invoice ID segment received from the URL.
 *
 * An ID is considered valid when ALL of the following are true:
 *   1. It is a non-null, non-undefined string.
 *   2. After trimming it is non-empty (blocks pure-whitespace segments).
 *   3. Its length does not exceed MAX_INVOICE_ID_LENGTH (128 chars).
 *   4. It matches the allowed character set: [A-Za-z0-9_-].
 *      This rejects segments that contain path-traversal characters (e.g.
 *      `../`), null bytes, HTML metacharacters, or other unexpected input.
 *
 * The function deliberately has NO side-effects and does NOT throw —
 * callers receive a structured result and decide how to proceed.
 *
 * @param {unknown} id - Raw ID value from `params.id`.
 * @returns {{ valid: boolean, reason?: string }}
 *
 * @example
 * validateInvoiceId("inv-001")   // { valid: true }
 * validateInvoiceId("")          // { valid: false, reason: "empty" }
 * validateInvoiceId("../secret") // { valid: false, reason: "invalid-chars" }
 * validateInvoiceId(null)        // { valid: false, reason: "not-a-string" }
 */
export const MAX_INVOICE_ID_LENGTH = 128;

/** Allowlist: alphanumeric, hyphen, underscore only. */
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function validateInvoiceId(id) {
  if (typeof id !== "string") {
    return { valid: false, reason: "not-a-string" };
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "empty" };
  }
  if (trimmed.length > MAX_INVOICE_ID_LENGTH) {
    return { valid: false, reason: "too-long" };
  }
  if (!SAFE_ID_RE.test(trimmed)) {
    return { valid: false, reason: "invalid-chars" };
  }
  return { valid: true };
}

// NOTE: This file is the single source of truth for mock invoice data
// until the API client is fully integrated.
