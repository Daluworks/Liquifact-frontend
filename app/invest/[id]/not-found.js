/**
 * @file app/invest/[id]/not-found.js
 *
 * Segment-level not-found boundary for the invoice detail route.
 *
 * Activated automatically by Next.js whenever the page component calls
 * `notFound()` — typically when `getInvoiceById(id)` returns undefined for
 * an unrecognised or withdrawn invoice ID.
 *
 * Design invariants
 * ─────────────────
 * - ALL user-visible strings come from `copy.invest.detail` in
 *   `app/copy/en.js`. No inline strings are permitted.
 * - The decorative "404" badge is `aria-hidden="true"` so screen readers
 *   only announce the semantic `<h1>` heading.
 * - The `<main>` landmark has `id="main-content"` (skip-link target) and
 *   `aria-labelledby="invoice-not-found-heading"` for an unambiguous
 *   landmark label.
 * - Both links use the shared `.focus-ring` utility for consistent
 *   keyboard-focus styling.
 * - `NavMenu` replaces the old bespoke inline `<header>` so navigation and
 *   wallet entry are consistent with every other route.
 * - `data-testid` attributes on the wrapper and links allow tests to locate
 *   elements without coupling to implementation-specific copy strings.
 *
 * Validation invariants (enforced upstream by page.js)
 * ────────────────────────────────────────────────────
 * This component is a pure render boundary — it never receives props and
 * cannot be given a malformed `id`. The input-validation contract lives in
 * `app/invest/[id]/page.js` (and the helper `validateInvoiceId` in
 * `app/invest/lib.js`). Any `id` that fails validation causes `notFound()`
 * to be called before this component ever renders.
 *
 * Security notes
 * ──────────────
 * - No dynamic content (e.g. the raw `id` segment) is rendered into the DOM,
 *   so there is no XSS vector via URL manipulation.
 * - Copy strings are static constants — they cannot be influenced by user input.
 */

import Link from "next/link";
import NavMenu from "@/components/NavMenu";
import { copy } from "@/app/copy/en";

const { detail } = copy.invest;

/**
 * Invoice-not-found boundary.
 *
 * Server Component — no `"use client"` directive is needed because this
 * component has no browser-only APIs or React hooks.
 */
export default function InvoiceNotFound() {
  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      data-testid="invoice-not-found-page"
    >
      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 px-6 py-4">
        <NavMenu />
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main
        id="main-content"
        className="max-w-4xl mx-auto px-6 py-12 text-center"
        aria-labelledby="invoice-not-found-heading"
      >
        {/* Decorative status code — hidden from assistive technologies */}
        <p
          aria-hidden="true"
          className="mb-4 text-8xl font-extrabold tracking-tight text-cyan-500/30 select-none"
          data-testid="invoice-not-found-status-badge"
        >
          {detail.notFoundStatusLabel}
        </p>

        <h1
          id="invoice-not-found-heading"
          className="text-3xl font-bold mb-4"
        >
          {detail.notFoundHeading}
        </h1>

        <p className="text-slate-400 mb-8 max-w-md mx-auto">
          {detail.notFoundDescription}
        </p>

        {/* Primary CTA — back to marketplace */}
        <Link
          href="/invest"
          className="focus-ring inline-block rounded-full bg-cyan-500/20 text-cyan-400 px-6 py-3 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
          data-testid="invoice-not-found-marketplace-link"
        >
          {detail.notFoundMarketplaceLabel}
        </Link>
      </main>
    </div>
  );
}

/**
 * Reads the live URL query string and maps it to a sanitized marketplace href.
 *
 * `useSearchParams()` may resolve to `null` (e.g. during a static render); the
 * mapping handles that by falling back to the unfiltered marketplace (I4).
 * Query values are only ever fed through {@link getMarketplaceHref}, which
 * allow-lists and normalizes them before they can reach the DOM (I2).
 *
 * @returns {JSX.Element}
 */
function RouteAwareInvoiceNotFound() {
  const searchParams = useSearchParams();
  return <InvoiceNotFoundView marketplaceHref={getMarketplaceHref(searchParams)} />;
}

/**
 * Public boundary component.
 *
 * The `<Suspense>` wrapper keeps `useSearchParams` compatible with static
 * generation (Next.js CSR bail-out). The fallback shows the safe, unfiltered
 * marketplace destination, so the page is useful even before hydration.
 */
export default function InvoiceNotFound() {
  return (
    <Suspense fallback={<InvoiceNotFoundView marketplaceHref={MARKETPLACE_FALLBACK_HREF} />}>
      <RouteAwareInvoiceNotFound />
    </Suspense>
  );
}
