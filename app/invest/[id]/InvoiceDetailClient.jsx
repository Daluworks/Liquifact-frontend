"use client";

/**
 * @file app/invest/[id]/InvoiceDetailClient.jsx
 *
 * Client boundary for the density-aware invoice metadata section.
 *
 * Why a separate client component?
 * ─────────────────────────────────
 * The page shell (`page.js`) is a Server Component — it cannot use hooks.
 * Density preference is stored in `localStorage` and read via `useDensity`,
 * which requires a React hook.  Rather than converting the entire detail
 * page to a client component (losing all RSC benefits), this thin wrapper:
 *
 *   1. Accepts pre-formatted invoice values as props (all formatting stays
 *      server-side in `page.js`).
 *   2. Owns the density preference state via `useDensity` and passes it down
 *      to `DensityToggle` as controlled props so both components react to the
 *      same state without prop-drilling through multiple layers.
 *   3. Applies spacing variants to the metadata `<dl>` based on density.
 *   4. Renders the Reference row with CopyButton when `referenceId` is set.
 *   5. Supports inline editing of issuer, amount, yield, and maturity rows
 *      with save/cancel buttons, validation, keyboard shortcuts (Escape to
 *      cancel, Enter to save), and polite aria-live announcements.
 *
 * Spacing variants
 * ─────────────────
 * • compact     → `gap-2 p-4`   (tighter grid, smaller section padding)
 * • comfortable → `gap-4 p-6`   (default spacing, matches original design)
 *
 * Inline edit
 * ─────────────
 * Each editable row has an "Edit" button (visible on hover / focus). Clicking
 * it replaces the `<dd>` with an `<input>` and Save / Cancel buttons.
 * Pressing Escape in the input cancels; pressing Enter saves (unless the field
 * is the date input, which already uses Enter for date-picker navigation).
 * Validation errors are announced via the same polite aria-live region used
 * for success / cancel confirmations.
 *
 * The `onSave` callback (optional) receives the field key and the new raw
 * value string when a save succeeds. The parent (page.js) may wire this to
 * an API call in future.
 *
 * Concurrency & idempotency (issue #1138)
 * ──────────────────────────────────────
 * Inline saves may be asynchronous (the parent can persist to an API). To make
 * repeated or concurrent execution deterministic, every row enforces:
 *
 *   I1 · Single-flight — a second save attempt (double-click, Enter racing a
 *        click, programmatic re-entry) is ignored while one is unresolved.
 *   I2 · Idempotent — saving an unchanged value, or a value already committed
 *        by this row, emits no request.
 *   I3 · No stale clobber — an edit session is bound to the `rawValue` it began
 *        from; if that value changes underneath (a concurrent external update)
 *        the stale draft is rejected rather than overwriting newer data.
 *   I4 · Latest-wins — resolutions from superseded or unmounted attempts are
 *        discarded and never mutate state.
 *
 * A rejected save keeps the row in edit mode with the draft preserved and the
 * lock released, so retrying is safe and re-uses the same value.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
// ── Concurrency invariants (issue #1138) ─────────────────────────────────
// EditableRow enforces four invariants for any `onSave` (sync or async):
//
//   I1 · Single-flight — a second save attempt during an unresolved `onSave` is a no-op.
//   I2 · Idempotent     — an unchanged value, or one already committed by this row,
//                          emits no request.
//   I3 · No stale clobber — an edit session bound to an outdated `rawValue` is rejected
//                          and resynced rather than overwriting a newer external value.
//   I4 · Latest-wins    — resolutions from superseded or unmounted attempts are discarded
//                          and never call `setState`.
//
// These invariants are tested in `InvoiceDetailClient.concurrency.test.tsx`.
//
import CopyButton from "@/components/CopyButton";
import DensityToggle from "@/components/DensityToggle";
import { useDensity } from "@/lib/hooks/useDensity";
import { getInvoiceFieldValidator } from "@/lib/validation/invoice";
import { copy } from "@/app/copy/en";

/** @type {Record<string, {gap: string, padding: string}>} */
const SPACING = {
  compact: { gap: "gap-2", padding: "p-4" },
  comfortable: { gap: "gap-4", padding: "p-6" },
};

const ie = copy.invest.detail.inlineEdit;

// ─────────────────────────────────────────────────────────────────────────────
// EditableRow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single dt/dd pair that can switch between view and inline-edit mode.
 *
 * `onSave` may be synchronous (fire-and-forget) or asynchronous (returns a
 * promise when the parent persists to an API). This component treats both
 * identically and never blocks the first paint on a save.
 *
 * @param {object}   props
 * @param {string}   props.field         - Machine key (e.g. "issuer", "amount")
 * @param {string}   props.label         - Human-readable label shown in the <dt>
 * @param {string}   props.displayValue  - Pre-formatted value shown in view mode
 * @param {string}   props.rawValue      - Editable raw value (unformatted)
 * @param {'text'|'number'|'date'} [props.inputType='text'] - Input type
 * @param {string}   [props.inputPattern] - Optional pattern attribute
 * @param {(value:string) => string | null} [props.validator] - Live validator
 *   returning `null` when valid or an error message string. Defaults to
 *   {@link getInvoiceFieldValidator} keyed off `field`.
 * @param {(field:string, value:string)=>void|Promise<void>} props.onSave
 *   Callback fired once per committed save. A thrown error or a rejected
 *   promise keeps the row open so the user can retry idempotently.
 * @param {(msg:string)=>void} props.onAnnounce - Shared live-region setter
 */
function EditableRow({
  field,
  label,
  displayValue,
  rawValue,
  inputType = "text",
  inputPattern,
  validator,
  onSave,
  onAnnounce,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const inputRef = useRef(null);
  const reactId = useId();
  const inputElId = `inline-edit-${field}-${reactId}`;
  const errorElId = `inline-edit-error-${field}-${reactId}`;

  // ── Concurrency-control refs (issue #1138) ────────────────────────────
  /**
   * I1 — true while an `onSave` has been dispatched for this row and not yet
   * resolved (including failure resolution). No second save attempt lands.
   */
  const inFlightRef = useRef(false);
  /** I4 — monotonic attempt id; only the current attempt may commit state. */
  const attemptRef = useRef(0);
  /** I3 — authoritative value the active edit session was opened against. */
  const editBaseRef = useRef(rawValue);
  /**
   * I2 — last value successfully committed through `onSave`.
   * A save whose trimmed draft equals this value is a no-op.
   */
  const lastCommittedRef = useRef(null);
  /** I4 — set false on unmount so late resolutions never call setState. */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Invalidate any attempt still in flight at unmount time.
      attemptRef.current += 1;
    };
  }, []);

  // Resolve the live validator: caller-supplied wins, otherwise fall back to
  // the field-keyed validator from `lib/validation/invoice`. We freeze the
  // function reference in a useCallback so the useMemo below is a pure
  // function of (draft, isEditing) and won't churn on every render.
  const effectiveValidator = useMemo(
    () => (typeof validator === "function" ? validator : getInvoiceFieldValidator(field)),
    [validator, field]
  );

  // Live validation: derived on every keystroke. We deliberately stop
  // validating as soon as we leave edit mode so error copy from a previous
  // keystroke does not flash against the read-only view.
  const error = useMemo(() => {
    if (!isEditing) return null;
    if (typeof effectiveValidator !== "function") return null;
    const result = effectiveValidator(draft);
    // Coerce non-string / empty-string returns to null per the
    // InvoiceFieldValidator contract ("a non-empty error message").
    return typeof result === "string" && result.length > 0 ? result : null;
  }, [isEditing, effectiveValidator, draft]);

  const isInvalid = error !== null;
  const trimmedDraft = draft.trim();

  // Focus the input whenever we enter edit mode (independent of validity;
  // an invalid pre-existing value is rare but possible and we still want
  // the user to start typing).
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEdit = () => {
    // A row that is mid-save stays locked; re-opening it would fork the
    // edit session and allow a stale draft to race the in-flight request.
    if (inFlightRef.current) return;
    // I3 — bind the new edit session to the authoritative value it starts from.
    editBaseRef.current = rawValue;
    setDraft(rawValue);
    setIsEditing(true);
  };

  const handleCancel = useCallback(() => {
    // I1 — ignore cancel while a save is in flight so the row cannot be left
    // half-committed; the request continues and resolves to success/failure.
    if (inFlightRef.current) return;
    // Invalidate any prior attempt so a late resolution cannot re-open the row.
    attemptRef.current += 1;
    setIsEditing(false);
    setDraft(rawValue);
    onAnnounce(ie.announceCancelled);
  }, [rawValue, onAnnounce]);

  const handleSave = useCallback(async () => {
    // I1 — single-flight: ignore re-entrant attempts. A double-click, an Enter
    // keypress racing a click, or a programmatic re-entry all land here.
    if (inFlightRef.current) return;

    if (isInvalid) {
      // Defensive guard: Save button is `disabled` while invalid, but an
      // Enter keypress on a non-disabled text input could still reach here
      // if the browser fires a synthetic click. Announce without saving so
      // the user understands why nothing happened.
      onAnnounce(
        ie.announceSaveFailed
          .replace("{field}", label)
          .replace("{error}", error ?? ie.errorRequired.replace("{field}", label))
      );
      return;
    }

    const currentValue = typeof rawValue === "string" ? rawValue.trim() : rawValue; // I3 — reject a stale draft. If the authoritative value moved since this
    // edit session began, resync instead of clobbering the newer value.
    // npm run build resolves to `Object.is` semantics for refs, so a strict
    // comparison is intentional: only an exact move-away is rejected.
    if (editBaseRef.current !== rawValue) {
      editBaseRef.current = rawValue;
      setDraft(rawValue);
      onAnnounce(ie.announceStale.replace("{field}", label));
      return;
    }

    // I2 — idempotent no-op: nothing changed, or this exact value was already
    // committed by this row. Emitting a request would be duplicate work.
    if (trimmedDraft === currentValue || trimmedDraft === lastCommittedRef.current) {
      setIsEditing(false);
      setDraft(rawValue);
      onAnnounce(ie.announceNoChange.replace("{field}", label));
      return;
    }

    // Acquire the lock *before* the async boundary so a synchronous re-entry
    // (e.g. two keydowns dispatched in the same tick) is blocked as well.
    inFlightRef.current = true;
    setIsSaving(true);
    const attempt = (attemptRef.current += 1);

    try {
      const result = onSave(field, trimmedDraft);
      if (result && typeof result.then === "function") {
        await result;
      }
      // I4 — a superseded or unmounted attempt must never commit.
      if (attempt !== attemptRef.current || !mountedRef.current) return;
      lastCommittedRef.current = trimmedDraft;
      editBaseRef.current = trimmedDraft;
      setIsSaving(false);
      setIsEditing(false);
      onAnnounce(ie.announceSaved.replace("{field}", label));
    } catch (err) {
      if (attempt !== attemptRef.current || !mountedRef.current) return;
      setIsSaving(false);
      // Keep the draft and release the lock so a retry re-uses the same value.
      const message = err instanceof Error ? err.message : String(err ?? "");
      onAnnounce(
        ie.announceSaveFailed.replace("{field}", label).replace("{error}", message || label)
      );
    } finally {
      if (attempt === attemptRef.current) {
        inFlightRef.current = false;
      }
    }
  }, [isInvalid, error, label, field, onSave, onAnnounce, trimmedDraft, rawValue]);

  const handleKeyDown = useCallback(
    (e) => {
      // Ignore keyboard shortcuts routed at a row whose save is in flight.
      if (inFlightRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter" && inputType !== "date") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleCancel, handleSave, inputType]
  );

  const handleChange = (e) => {
    setDraft(e.target.value);
  };

  const editBtnLabel = ie.editButton.replace("{field}", label);

  return (
    <div>
      <dt className="invoice-detail-dt text-slate-500">{label}</dt>
      <dd className="invoice-detail-dd text-slate-100">
        {isEditing ? (
          <div className="flex flex-col gap-2 mt-1">
            <input
              ref={inputRef}
              id={inputElId}
              type={inputType}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              aria-label={label}
              aria-describedby={isInvalid ? errorElId : undefined}
              aria-invalid={isInvalid}
              aria-busy={isSaving}
              readOnly={isSaving}
              pattern={inputPattern}
              data-testid={`inline-edit-input-${field}`}
              className={[
                "w-full bg-slate-950 border rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus-ring",
                isInvalid
                  ? "border-red-500 focus:border-red-500"
                  : "border-slate-700 focus:border-cyan-500",
              ].join(" ")}
            />
            {isInvalid && (
              <p
                id={errorElId}
                role="alert"
                aria-live="polite"
                data-testid={`inline-edit-error-${field}`}
                className="text-red-400 text-xs"
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={isInvalid || isSaving}
                aria-disabled={isInvalid || isSaving}
                aria-busy={isSaving}
                data-testid={`inline-edit-save-${field}`}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 text-white text-xs font-medium rounded transition-colors focus-ring"
              >
                {isSaving ? ie.savingButton : ie.saveButton}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                aria-disabled={isSaving}
                data-testid={`inline-edit-cancel-${field}`}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 text-slate-300 text-xs font-medium rounded transition-colors focus-ring"
              >
                {ie.cancelButton}
              </button>
            </div>
          </div>
        ) : (
          <span className="group/row flex items-center gap-2">
            <span data-testid={`detail-value-${field}`}>{displayValue}</span>
            <button
              type="button"
              onClick={handleEdit}
              aria-label={editBtnLabel}
              data-testid={`inline-edit-btn-${field}`}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-xs text-slate-400 hover:text-cyan-400 border border-slate-700 rounded px-2 py-0.5 transition-all focus-ring"
            >
              {copy.invest.detail.inlineEdit.editButton.replace("{field}", "")}
            </button>
          </span>
        )}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDetailClient
// ─────────────────────────────────────────────────────────────────────────────

export default function InvoiceDetailClient({
  labelIssuer,
  labelAmount,
  labelYield,
  labelMaturity,
  labelStatus,
  labelReference,
  issuer,
  formattedAmount,
  formattedYield,
  dueDate,
  referenceId,
  statusPill,
  summaryHeading,
  /** Raw (unformatted) values used as the initial input drafts */
  rawIssuer,
  rawAmount,
  rawYield,
  rawDueDate,
  /**
   * Optional callback fired after a successful inline save.
   * @type {(field: string, value: string) => void}
   */
  onSave,
}) {
  // Density state is owned here and passed to DensityToggle as controlled props
  // so that both this component and the toggle always reflect the same value.
  const [density, setDensity] = useDensity();
  const spacing = SPACING[density] ?? SPACING.comfortable;

  // Single polite aria-live region shared by all editable rows so announcements
  // do not stack up in the DOM (one region, one message at a time).
  const [announcement, setAnnouncement] = useState("");

  const handleAnnounce = useCallback((msg) => {
    setAnnouncement(msg);
  }, []);

  // Forward the callback's return value so an async `onSave` (one that returns
  // a promise) is awaited by the row. Dropping it here would make every save
  // look instantly successful and defeat the single-flight/idempotency guards.
  const handleSave = useCallback((field, value) => onSave?.(field, value), [onSave]);

  // Clear announcement after it has been read (100 ms grace period keeps it
  // in the DOM long enough for screen readers to pick it up).
  useEffect(() => {
    if (!announcement) return;
    const id = setTimeout(() => setAnnouncement(""), 2000);
    return () => clearTimeout(id);
  }, [announcement]);

  return (
    <section
      aria-labelledby="invoice-summary-heading"
      className={[
        // invoice-detail-section: CSS hook for @media (forced-colors) and
        // @media (prefers-contrast: more) rules in globals.css (issue #31).
        "invoice-detail-section",
        "print-invoice-section rounded-xl border border-slate-800 bg-slate-900/50",
        spacing.padding,
        "mb-6",
      ].join(" ")}
      data-density={density}
    >
      {/* Shared polite live region for all inline-edit announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="inline-edit-announcement"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Density toggle — top-right corner of the section */}
      <div className="no-print flex items-center justify-between mb-4">
        <h2 id="invoice-summary-heading" className="text-xl font-semibold">
          {summaryHeading}
        </h2>
        <DensityToggle density={density} onDensityChange={setDensity} />
      </div>

      <dl className={["grid grid-cols-1 sm:grid-cols-2 text-sm", spacing.gap].join(" ")}>
        <EditableRow
          field="issuer"
          label={labelIssuer}
          displayValue={issuer}
          rawValue={rawIssuer ?? issuer}
          onSave={handleSave}
          onAnnounce={handleAnnounce}
        />
        <EditableRow
          field="amount"
          label={labelAmount}
          displayValue={formattedAmount}
          rawValue={rawAmount ?? formattedAmount}
          inputType="text"
          onSave={handleSave}
          onAnnounce={handleAnnounce}
        />
        <EditableRow
          field="yield"
          label={labelYield}
          displayValue={formattedYield}
          rawValue={rawYield ?? formattedYield}
          onSave={handleSave}
          onAnnounce={handleAnnounce}
        />
        <EditableRow
          field="dueDate"
          label={labelMaturity}
          displayValue={dueDate}
          rawValue={rawDueDate ?? dueDate}
          inputType="date"
          onSave={handleSave}
          onAnnounce={handleAnnounce}
        />
        <div>
          {/* invoice-detail-dt/dd: CSS hooks for high-contrast colour overrides */}
          <dt className="invoice-detail-dt text-slate-500">{labelStatus}</dt>
          <dd className="invoice-detail-dd text-slate-100">{statusPill}</dd>
        </div>
        {referenceId ? (
          <div>
            <dt className="text-slate-500">{labelReference || "Reference"}</dt>
            <dd className="text-slate-100 flex items-center gap-1.5">
              <span className="font-mono">{referenceId}</span>
              <CopyButton
                text={referenceId}
                label={copy.invoiceDetail.copyIdLabel}
                successMessage={copy.invoiceDetail.copyIdSuccess}
                errorMessage={copy.invoiceDetail.copyIdError}
              />
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
