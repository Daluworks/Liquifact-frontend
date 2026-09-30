"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manages optimistic UI state for marketplace funding actions.
 *
 * Pattern:
 *   1. Call `fund(invoiceId, amount, performAction, options?)`.
 *   2. The invoice is immediately marked as pending in local state (optimistic).
 *   3. If `options.optimisticUpdate` is provided it is called with
 *      `(invoiceId, amount)` and its return value is captured as the snapshot.
 *   4. `performAction()` is awaited.
 *   5a. On success — the pending entry is committed (cleared from in-flight map).
 *   5b. On failure — the pending entry is rolled back and the error is re-thrown
 *       so the caller can show an error toast.  If `options.rollback` is provided
 *       it is called with `(invoiceId, snapshot)` so the caller can restore any
 *       external state (e.g. invoice list data).
 *
 * Invariants enforced here:
 *   1. `invoiceId` must be a non-empty string; invalid calls are rejected
 *      with a dev-time warning and return false without touching state.
 *   2. A second `fund` call on the same invoiceId while one is already in
 *      flight is rejected immediately (returns false) — the `inFlight` ref
 *      guard is checked before any state or side-effects, so concurrent
 *      duplicate clicks cannot produce duplicate in-flight actions.
 *   3. The in-flight marker is added synchronously before `performAction` is
 *      awaited and removed in both the success and failure paths (via
 *      try/catch/finally-equivalent) so the Set is never left in a dirty state.
 *   4. Rollback is only attempted when a snapshot exists; a null snapshot
 *      (invoice not found at optimistic-update time) is a safe no-op.
 *   5. `onSettled` is read from a ref so a stale closure never fires the wrong
 *      callback; updates to `onSettled` across renders are always picked up.
 *
 * Concurrent actions on different invoices are each tracked independently.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onSettled] - Called after every fund attempt (success or
 *   failure) with `(invoiceId, { ok: boolean })`.  Useful for analytics.
 * @returns {{
 *   pendingIds: Set<string>,
 *   fund: (invoiceId: string, amount: number, performAction: () => Promise<void>,
 *          options?: { optimisticUpdate?: Function, rollback?: Function }) => Promise<boolean>
 * }}
 */
export function useMarketplaceActions({ onSettled } = {}) {
  // Set of invoice ids currently being funded optimistically.
  const [pendingIds, setPendingIds] = useState(() => new Set());

  // Ref-based in-flight tracker so concurrent guards don't need a re-render.
  const inFlight = useRef(new Set());
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  const fund = useCallback(
    async (invoiceId, amount, performAction, { optimisticUpdate, rollback } = {}) => {
      // Invariant: invoiceId must be a non-empty string.
      if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error(
            "[useMarketplaceActions] fund() called with an invalid invoiceId (%s). " +
              "Expected a non-empty string. Action aborted.",
            JSON.stringify(invoiceId),
          );
        }
        return false;
      }

      // Invariant: performAction must be callable.
      if (typeof performAction !== "function") {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error(
            "[useMarketplaceActions] fund() called without a valid performAction (%s). " +
              "Expected a function. Action aborted.",
            typeof performAction,
          );
        }
        return false;
      }

      // Invariant: reject a second action on the same invoice while one is in-flight.
      // The inFlight ref is checked synchronously before any state changes so
      // duplicate clicks cannot slip past the guard.
      if (inFlight.current.has(invoiceId)) {
        return false;
      }

      // Optimistic update — apply external state change and capture snapshot.
      // Called before the in-flight marker is set so it runs synchronously in
      // the same React batch as the pendingIds update below.
      const snapshot = optimisticUpdate?.(invoiceId, amount);

      // Mark invoice as in-flight synchronously.  The ref update is immediate
      // (no re-render needed); the Set state update batches with any React
      // updates triggered by optimisticUpdate above.
      inFlight.current.add(invoiceId);
      setPendingIds((prev) => new Set([...prev, invoiceId]));

      try {
        await performAction(invoiceId, amount);

        // Commit: remove from in-flight tracking on success.
        inFlight.current.delete(invoiceId);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        });

        settledRef.current?.(invoiceId, { ok: true });
        return true;
      } catch (err) {
        // Rollback: revert optimistic update and surface the error.
        // Only call rollback when a snapshot was returned — a null/undefined
        // snapshot means the invoice was not found, so there is nothing to restore.
        if (snapshot != null) {
          rollback?.(invoiceId, snapshot);
        }

        // Always clean up the in-flight state, even on error.
        inFlight.current.delete(invoiceId);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        });

        settledRef.current?.(invoiceId, { ok: false });
        throw err;
      }
    },
    []
  );

  return { pendingIds, fund };
}
