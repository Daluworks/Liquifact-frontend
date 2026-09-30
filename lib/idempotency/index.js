/**
 * @file lib/idempotency/index.js
 *
 * Idempotency key utilities for the funding submission flow.
 *
 * Design rationale
 * ────────────────
 * A double-click or browser/wallet retry must not result in two competing
 * submissions for the same funding intent.  We enforce this at the client
 * layer in two complementary ways:
 *
 * 1. **In-memory guard** (`submissionGuardRef` in `useFundingSubmit`) — blocks
 *    a second call while a request is in-flight within the same React component
 *    instance.
 *
 * 2. **Persisted idempotency key** (`getOrCreateIdempotencyKey`) —
 *    localStorage shares an intent key across tabs and remounts. On retry the
 *    same key is re-sent, so the server can deduplicate an uncertain result.
 *
 *    Keys are removed only after confirmed success. Retaining them after an
 *    uncertain failure is essential: a retry in another tab must not receive
 *    a fresh server idempotency key.
 *
 * Security note
 * ─────────────
 * The key is a random UUID — it carries no sensitive information about the
 * user, wallet, or invoice.  It is only sent as a request header so the
 * backend can deduplicate within the same session.
 *
 * @module lib/idempotency
 */

/** Prefix shared by current and legacy idempotency storage keys. */
const KEY_PREFIX = "liquifact-idem-";

/**
 * Build the storage key for a given (walletAddress, invoiceId, amount)
 * triple.  Amount is included so that two different partial-fund attempts on
 * the same invoice (e.g. $100 then $200) each get an independent idempotency
 * key.
 *
 * @param {string}         invoiceId     - The invoice being funded
 * @param {string | null}  walletAddress - Connected wallet address (or null)
 * @param {number}         amount        - Funding amount
 * @returns {string}
 */
export function buildStorageKey(invoiceId, walletAddress, amount) {
  // walletAddress may be absent before connection; treat null / undefined as
  // "anonymous" so a key is always generated and can be stored before the
  // wallet is fully connected.
  const wallet = walletAddress ?? "anon";
  return `${KEY_PREFIX}${wallet}-${invoiceId}-${amount}`;
}

/**
 * Return the existing idempotency key for this (wallet, invoice, amount)
 * triple from `localStorage`, or generate and persist a fresh UUID if none
 * exists yet.
 *
 * Calling this function multiple times with the same arguments is safe —
 * it always returns the same key for the same triple while its localStorage
 * entry remains present, including across tabs.
 *
 * @param {string}         invoiceId
 * @param {string | null}  walletAddress
 * @param {number}         amount
 * @returns {string}  A v4 UUID string
 */
export function getOrCreateIdempotencyKey(invoiceId, walletAddress, amount) {
  const storageKey = buildStorageKey(invoiceId, walletAddress, amount);

  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;

    const legacy = sessionStorage.getItem(storageKey);
    if (legacy) {
      localStorage.setItem(storageKey, legacy);
      return legacy;
    }

    const fresh = crypto.randomUUID();
    localStorage.setItem(storageKey, fresh);
    return localStorage.getItem(storageKey) ?? fresh;
  } catch {
    // Per-tab fallback would create different retry keys in other tabs.
    throw Object.assign(new Error("Cannot persist a funding retry key"), {
      code: "FUND_IDEMPOTENCY_UNAVAILABLE",
    });
  }
}

/**
 * Remove the persisted idempotency key for this triple.
 *
 * Call this on confirmed SUCCESS so that a fresh invoice funding attempt
 * (same invoice, same amount) in a later session gets a new key rather than
 * re-using a key the server already marked as processed.
 *
 * On FAILURE / ROLLBACK the key is intentionally kept so that a user retry
 * re-uses the same key and the server can return a cached idempotent response
 * if it already partially processed the request.
 *
 * @param {string}         invoiceId
 * @param {string | null}  walletAddress
 * @param {number}         amount
 */
export function clearIdempotencyKey(invoiceId, walletAddress, amount) {
  const storageKey = buildStorageKey(invoiceId, walletAddress, amount);
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore — key was never stored or storage is unavailable.
  }
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore — legacy storage may be unavailable.
  }
}
