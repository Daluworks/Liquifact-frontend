/**
 * @file lib/hooks/useFundingSubmit.js
 *
 * React hook that owns the complete lifecycle of a single funding submission.
 *
 * ── What this hook does ───────────────────────────────────────────────────────
 *
 * 1. **Double-submit guard** — an in-memory ref (`submissionGuardRef`) ensures
 *    that re-activating the action while a request is in-flight is a no-op,
 *    even if the button becomes briefly clickable before React re-renders with
 *    the disabled attribute.
 *
 * 2. **Idempotency key** — `getOrCreateIdempotencyKey` returns a stable UUID
 *    shared across tabs for the (wallet, invoiceId, amount) triple.
 *    The same key is re-used on retry so the server can detect and respond to
 *    a replay without double-charging.  The key is cleared on confirmed success
 *    so a future legitimate re-fund gets a fresh key.
 *
 * 3. **Cross-tab lock (BroadcastChannel)** — when two browser tabs are open to
 *    the same invoice, the first tab to start a submission broadcasts a lock
 *    message.  The second tab that receives it shows a warning and refuses to
 *    submit until it observes an "unlock" message.  This is advisory (the
 *    server-side idempotency key is the true safety net) but prevents the user
 *    from accidentally double-funding via two tabs.
 *
 *    `BroadcastChannel` is not available in all test environments.  The hook
 *    degrades gracefully when the API is absent.
 *
 * 4. **Abort on unmount** — an `AbortController` tied to the current request is
 *    cancelled on component unmount, preventing stale-state updates.
 *
 * 5. **Explicit state machine** — the hook exposes one of four states:
 *    `idle | pending | success | failure | blocked_by_tab`.
 *    Each state is rendered as a distinct UI in `FundActions`.
 *
 * ── State machine ─────────────────────────────────────────────────────────────
 *
 *   idle ──[submit]──────────────────────▶ pending ──[resolved]──▶ success
 *     ▲                                       │
 *     │                              [rejected / timeout]
 *     │                                       │
 *     └──[retry after failure] ◀── failure ◀──┘
 *
 *   idle ──[tab-lock received]──▶ blocked_by_tab ──[tab-unlock received]──▶ idle
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 * const {
 *   fundingState,      // "idle" | "pending" | "success" | "failure" | "blocked_by_tab"
 *   isPending,         // boolean
 *   isBlocked,         // boolean — another tab already has a lock
 *   idempotencyKey,    // string | null — the key sent with the current/last request
 *   submit,            // (amount: number) => Promise<boolean>; false means no request ran
 *   reset,             // () => void — clear failure state to re-enable form
 * } = useFundingSubmit({ invoiceId, walletAddress, performFund, onSuccess, onError });
 *
 * @module lib/hooks/useFundingSubmit
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrCreateIdempotencyKey,
  clearIdempotencyKey,
} from "@/lib/idempotency";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stable state labels — consumers should import and compare against these. */
export const FUNDING_SUBMIT_STATES = {
  IDLE: "idle",
  PENDING: "pending",
  SUCCESS: "success",
  FAILURE: "failure",
  /** Another tab for the same invoice has already acquired the in-flight lock. */
  BLOCKED_BY_TAB: "blocked_by_tab",
};

/**
 * BroadcastChannel name template for a given invoice.
 * Each invoice gets its own channel so unrelated invoices do not interfere.
 *
 * @param {string} invoiceId
 * @returns {string}
 */
function channelName(invoiceId) {
  return `liquifact-fund-${invoiceId}`;
}

function lockName(invoiceId) {
  return `liquifact-fund-lock-${encodeURIComponent(invoiceId)}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages the complete lifecycle of a funding submission for a single invoice.
 *
 * @param {object}         options
 * @param {string}         options.invoiceId      - Invoice being funded
 * @param {string | null}  [options.walletAddress] - Connected wallet address
 * @param {number | null}  [options.maxAmount]    - Maximum permitted amount
 * @param {Function}       options.performFund    - Async fn: (invoiceId, amount, idempotencyKey, signal) => Promise<any>
 * @param {Function}       [options.onSuccess]    - Called with result on success
 * @param {Function}       [options.onError]      - Called with error on failure
 *
 * @returns {{
 *   fundingState: string,
 *   isPending: boolean,
 *   isBlocked: boolean,
 *   idempotencyKey: string | null,
 *   submit: (amount: number) => Promise<boolean>,
 *   reset: () => void,
 * }}
 */
export function useFundingSubmit({
  invoiceId,
  walletAddress = null,
  maxAmount = null,
  performFund,
  onSuccess,
  onError,
} = {}) {
  const [fundingState, setFundingState] = useState(FUNDING_SUBMIT_STATES.IDLE);
  const [currentKey, setCurrentKey] = useState(null);
  const activeLockIdRef = useRef(null);
  const tabLockIdRef = useRef(null);

  // ── Refs ──────────────────────────────────────────────────────────────────

  /**
   * In-memory double-submit guard.
   * True while a request is in-flight — blocks re-entrant calls even before
   * React re-renders the disabled button.
   */
  const submissionGuardRef = useRef(false);

  /** AbortController for the active request. Replaced per attempt. */
  const abortRef = useRef(null);

  /** BroadcastChannel for cross-tab coordination (may be null if unavailable). */
  const channelRef = useRef(null);

  /** Whether another tab currently holds the in-flight lock. */
  const tabBlockedRef = useRef(false);

  useEffect(() => {
    setFundingState(FUNDING_SUBMIT_STATES.IDLE);
    setCurrentKey(null);
    tabBlockedRef.current = false;
    tabLockIdRef.current = null;

    return () => {
      if (activeLockIdRef.current && channelRef.current) {
        channelRef.current.postMessage({
          type: "FUND_UNLOCK",
          invoiceId,
          lockId: activeLockIdRef.current,
        });
      }
      abortRef.current?.abort();
      submissionGuardRef.current = false;
      activeLockIdRef.current = null;
    };
  }, [invoiceId]);

  // ── BroadcastChannel setup ────────────────────────────────────────────────

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || !invoiceId) return;

    let channel;
    try {
      channel = new BroadcastChannel(channelName(invoiceId));
    } catch {
      // BroadcastChannel may throw in some restricted environments.
      return;
    }

    channelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data?.invoiceId && event.data.invoiceId !== invoiceId) return;
      if (event.data?.type === "FUND_LOCK") {
        // Another tab just started a submission — block ours.
        if (event.data.lockId === activeLockIdRef.current) return;
        tabLockIdRef.current = event.data.lockId ?? "legacy";
        tabBlockedRef.current = true;
        setFundingState(FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB);
      } else if (event.data?.type === "FUND_UNLOCK") {
        if (
          event.data.lockId &&
          tabLockIdRef.current &&
          event.data.lockId !== tabLockIdRef.current
        ) return;
        // The other tab finished (success or failure) — unblock.
        tabLockIdRef.current = null;
        tabBlockedRef.current = false;
        setFundingState((prev) =>
          prev === FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB
            ? FUNDING_SUBMIT_STATES.IDLE
            : prev
        );
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [invoiceId]);

  // ── submit ────────────────────────────────────────────────────────────────

  /**
   * Initiate the funding submission.
   *
   * @param {number} amount - Validated positive funding amount
   */
  const submit = useCallback(
    async (amount) => {
      // ── Guards ────────────────────────────────────────────────────────────

      if (!invoiceId || typeof invoiceId !== "string" || !invoiceId.trim()) {
        throw Object.assign(new Error("A valid invoice is required"), {
          code: "FUND_INVALID_PARAMS",
        });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw Object.assign(new Error("Amount must be a positive finite number"), {
          code: "FUND_INVALID_AMOUNT",
        });
      }
      if (maxAmount != null && (!Number.isFinite(maxAmount) || maxAmount <= 0 || amount > maxAmount)) {
        throw Object.assign(new Error("Amount exceeds the available funding limit"), {
          code: "FUND_INVALID_AMOUNT",
        });
      }

      // Prevent re-entrant call (double-click within the same React lifecycle).
      if (submissionGuardRef.current) return false;

      // Block if another tab already has the lock for this invoice.
      if (tabBlockedRef.current) return false;

      // ── Acquire in-memory lock ────────────────────────────────────────────
      submissionGuardRef.current = true;
      setFundingState(FUNDING_SUBMIT_STATES.PENDING);
      const lockId = crypto.randomUUID();
      let acquired = false;

      const execute = async () => {
        acquired = true;
        activeLockIdRef.current = lockId;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const idem = getOrCreateIdempotencyKey(invoiceId, walletAddress, amount);
          setCurrentKey(idem);
          channelRef.current?.postMessage({ type: "FUND_LOCK", invoiceId, lockId });

          const result = await performFund(invoiceId, amount, idem, controller.signal);
          if (controller.signal.aborted || activeLockIdRef.current !== lockId) return false;
          if (result === false) {
            throw Object.assign(new Error("Another funding request is in progress"), {
              code: "FUND_CONFLICT",
              status: 409,
            });
          }

          clearIdempotencyKey(invoiceId, walletAddress, amount);
          setCurrentKey(null);
          setFundingState(FUNDING_SUBMIT_STATES.SUCCESS);
          onSuccess?.(result);
          return true;
        } catch (err) {
          if (controller.signal.aborted || activeLockIdRef.current !== lockId) return false;

          setFundingState(FUNDING_SUBMIT_STATES.FAILURE);
          onError?.(err);
          throw err;
        } finally {
          if (activeLockIdRef.current === lockId) {
            submissionGuardRef.current = false;
            activeLockIdRef.current = null;
            if (channelRef.current?.name === channelName(invoiceId)) {
              channelRef.current.postMessage({ type: "FUND_UNLOCK", invoiceId, lockId });
            }
          }
        }
      };

      try {
        const locks = typeof navigator !== "undefined" ? navigator.locks : null;
        let completed = false;
        if (locks?.request) {
          await locks.request(
            lockName(invoiceId),
            { mode: "exclusive", ifAvailable: true },
            async (lock) => {
              if (lock) completed = await execute();
            }
          );
          if (!acquired) {
            throw Object.assign(new Error("Another funding request is in progress"), {
              code: "FUND_CONFLICT",
              status: 409,
            });
          }
        } else {
          // BroadcastChannel remains a best-effort fallback for browsers
          // without Web Locks; the server idempotency key is the final guard.
          completed = await execute();
        }
        return completed;
      } catch (err) {
        if (!acquired) {
          setFundingState(FUNDING_SUBMIT_STATES.FAILURE);
          onError?.(err);
        }
        throw err;
      } finally {
        if (!acquired) submissionGuardRef.current = false;
      }
    },
    [invoiceId, walletAddress, maxAmount, performFund, onSuccess, onError]
  );

  // ── reset ─────────────────────────────────────────────────────────────────

  /**
   * Clear a failure state so the user can retry without refreshing the page.
   * Does nothing when not in a failure state.
   */
  const reset = useCallback(() => {
    setFundingState((prev) =>
      prev === FUNDING_SUBMIT_STATES.FAILURE ? FUNDING_SUBMIT_STATES.IDLE : prev
    );
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    fundingState,
    isPending: fundingState === FUNDING_SUBMIT_STATES.PENDING,
    isBlocked: fundingState === FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB,
    idempotencyKey: currentKey,
    submit,
    reset,
  };
}
