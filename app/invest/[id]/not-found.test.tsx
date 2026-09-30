/**
 * @file app/invest/[id]/not-found.test.tsx
 *
 * Tests for the invoice-detail not-found boundary
 * (app/invest/[id]/not-found.js) and the ID-validation helper
 * (validateInvoiceId in app/invest/lib.js).
 *
 * Test strategy
 * ─────────────
 * 1. Rendering — the component renders expected copy, links, and structure.
 * 2. Accessibility — landmark roles, ARIA attributes, heading hierarchy,
 *    decorative badge is aria-hidden, jest-axe passes.
 * 3. Links — marketplace link href and keyboard reachability.
 * 4. Theme / styling — dark background and cyan brand colour classes present.
 * 5. Snapshot regression — consistent output across test runs.
 * 6. validateInvoiceId — valid inputs, invalid inputs (empty, non-string,
 *    too-long, unsafe chars), boundary values, duplicate/idempotent calls.
 * 7. NavMenu integration — NavMenu is rendered in the header.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

import InvoiceNotFound from "./not-found";
import { copy } from "@/app/copy/en";
import {
  validateInvoiceId,
  MAX_INVOICE_ID_LENGTH,
  MOCK_INVOICES,
} from "@/app/invest/lib";

// ── Module mocks ──────────────────────────────────────────────────────────────

// NavMenu is a client component that calls usePathname; mock it for SSR tests.
jest.mock("@/components/NavMenu", () => {
  return function NavMenuMock() {
    return <nav data-testid="nav-menu">NavMenu</nav>;
  };
});

// next/navigation is not available in jsdom; mock the parts we need.
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/invest"),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const { detail } = copy.invest;

function renderNotFound() {
  return render(<InvoiceNotFound />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. Rendering
// ─────────────────────────────────────────────────────────────────────────────
describe("InvoiceNotFound — rendering", () => {
  it("renders the page wrapper with data-testid", () => {
    renderNotFound();
    expect(screen.getByTestId("invoice-not-found-page")).toBeInTheDocument();
  });

  it("renders the h1 with copy from the dictionary", () => {
    renderNotFound();
    expect(
      screen.getByRole("heading", { level: 1, name: detail.notFoundHeading })
    ).toBeInTheDocument();
  });

  it("renders exactly one h1 on the page", () => {
    renderNotFound();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the description from the copy dictionary", () => {
    renderNotFound();
    expect(screen.getByText(detail.notFoundDescription)).toBeInTheDocument();
  });

  it("renders the decorative status badge using the copy dictionary value", () => {
    renderNotFound();
    const badge = screen.getByTestId("invoice-not-found-status-badge");
    expect(badge).toHaveTextContent(detail.notFoundStatusLabel);
  });

  it("renders the marketplace link with copy dictionary text", () => {
    renderNotFound();
    const link = screen.getByTestId("invoice-not-found-marketplace-link");
    expect(link).toHaveTextContent(detail.notFoundMarketplaceLabel);
  });

  it("does NOT render raw invoice id or any dynamic user-supplied content", () => {
    renderNotFound();
    // The component should contain no dynamic data; verify it does not
    // accidentally render a placeholder like "{id}" from an unresolved template.
    const body = screen.getByTestId("invoice-not-found-page").textContent ?? "";
    expect(body).not.toMatch(/\{[^}]+\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Accessibility
// ─────────────────────────────────────────────────────────────────────────────
describe("InvoiceNotFound — accessibility", () => {
  it("renders a main landmark", () => {
    renderNotFound();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("the main landmark has id='main-content' (skip-link target)", () => {
    renderNotFound();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });

  it("the main landmark is labelled by the h1 via aria-labelledby", () => {
    renderNotFound();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("aria-labelledby", "invoice-not-found-heading");
  });

  it("the h1 has id matching the main aria-labelledby", () => {
    renderNotFound();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAttribute("id", "invoice-not-found-heading");
  });

  it("the decorative status badge is aria-hidden", () => {
    renderNotFound();
    const badge = screen.getByTestId("invoice-not-found-status-badge");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("the marketplace link is keyboard-focusable (no tabIndex=-1)", () => {
    renderNotFound();
    const link = screen.getByTestId("invoice-not-found-marketplace-link");
    expect(link).not.toHaveAttribute("tabindex", "-1");
  });

  it("the marketplace link has the focus-ring class for consistent keyboard styling", () => {
    renderNotFound();
    const link = screen.getByTestId("invoice-not-found-marketplace-link");
    expect(link.className).toContain("focus-ring");
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderNotFound();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Links
// ─────────────────────────────────────────────────────────────────────────────
describe("InvoiceNotFound — links", () => {
  it("the marketplace link points to /invest", () => {
    renderNotFound();
    const link = screen.getByTestId("invoice-not-found-marketplace-link");
    expect(link).toHaveAttribute("href", "/invest");
  });

  it("the page contains exactly one actionable link (marketplace CTA)", () => {
    renderNotFound();
    // The NavMenu mock renders no <a> tags; the only link is the CTA.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/invest");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Theme / styling
// ─────────────────────────────────────────────────────────────────────────────
describe("InvoiceNotFound — theme and styling", () => {
  it("applies the dark slate-950 background to the page wrapper", () => {
    renderNotFound();
    const page = screen.getByTestId("invoice-not-found-page");
    expect(page.className).toContain("bg-slate-950");
  });

  it("applies text-slate-100 to the page wrapper", () => {
    renderNotFound();
    const page = screen.getByTestId("invoice-not-found-page");
    expect(page.className).toContain("text-slate-100");
  });

  it("the status badge uses the cyan brand colour class", () => {
    renderNotFound();
    const badge = screen.getByTestId("invoice-not-found-status-badge");
    expect(badge.className).toContain("text-cyan-500");
  });

  it("the marketplace link uses the cyan brand colour class", () => {
    renderNotFound();
    const link = screen.getByTestId("invoice-not-found-marketplace-link");
    expect(link.className).toContain("text-cyan-400");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. NavMenu integration
// ─────────────────────────────────────────────────────────────────────────────
describe("InvoiceNotFound — NavMenu", () => {
  it("renders NavMenu inside the header", () => {
    renderNotFound();
    const nav = screen.getByTestId("nav-menu");
    expect(nav).toBeInTheDocument();
    // NavMenu must be inside a <header> element
    expect(nav.closest("header")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Snapshot regression
// ─────────────────────────────────────────────────────────────────────────────
describe("InvoiceNotFound — snapshot", () => {
  it("renders consistently across test runs", () => {
    const { container } = renderNotFound();
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. validateInvoiceId — accepted inputs
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInvoiceId — accepted inputs", () => {
  it.each([
    ["simple alphanumeric", "inv001"],
    ["canonical mock ID", "inv-001"],
    ["all mock IDs", "inv-002"],
    ["hyphens only separator", "inv-003"],
    ["single character", "a"],
    ["uppercase letters", "INV-ABC"],
    ["mixed case with underscore", "Inv_001"],
    ["exactly 128 chars (boundary)", "a".repeat(128)],
    ["alphanumeric no separator", "abc123"],
    ["underscores", "inv_001_extra"],
  ])("accepts %s", (_label, id) => {
    expect(validateInvoiceId(id)).toEqual({ valid: true });
  });

  it("accepts every MOCK_INVOICES id", () => {
    for (const invoice of MOCK_INVOICES) {
      expect(validateInvoiceId(invoice.id)).toEqual({ valid: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. validateInvoiceId — rejected inputs
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInvoiceId — rejected inputs", () => {
  it("rejects null with reason 'not-a-string'", () => {
    expect(validateInvoiceId(null)).toEqual({ valid: false, reason: "not-a-string" });
  });

  it("rejects undefined with reason 'not-a-string'", () => {
    expect(validateInvoiceId(undefined)).toEqual({ valid: false, reason: "not-a-string" });
  });

  it("rejects a number with reason 'not-a-string'", () => {
    expect(validateInvoiceId(42 as unknown as string)).toEqual({
      valid: false,
      reason: "not-a-string",
    });
  });

  it("rejects an object with reason 'not-a-string'", () => {
    expect(validateInvoiceId({} as unknown as string)).toEqual({
      valid: false,
      reason: "not-a-string",
    });
  });

  it("rejects empty string with reason 'empty'", () => {
    expect(validateInvoiceId("")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects whitespace-only string with reason 'empty'", () => {
    expect(validateInvoiceId("   ")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects tab-only string with reason 'empty'", () => {
    expect(validateInvoiceId("\t")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects a string of 129 chars with reason 'too-long'", () => {
    expect(validateInvoiceId("a".repeat(MAX_INVOICE_ID_LENGTH + 1))).toEqual({
      valid: false,
      reason: "too-long",
    });
  });

  it("rejects path-traversal '../' with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("../etc/passwd")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects path-traversal '../../secret' with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("../../secret")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects a null byte with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv\x00001")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects HTML '<script>' with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("<script>alert(1)</script>")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects angle-bracket injection with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv<001>")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects space-embedded id with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv 001")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects slash with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv/001")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects percent-encoded traversal with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv%2e%2e%2fsecret")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects ampersand-injected id with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv&001")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });

  it("rejects newline character with reason 'invalid-chars'", () => {
    expect(validateInvoiceId("inv\n001")).toEqual({
      valid: false,
      reason: "invalid-chars",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. validateInvoiceId — boundary values
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInvoiceId — boundary values", () => {
  it("accepts a single valid character", () => {
    expect(validateInvoiceId("a")).toEqual({ valid: true });
  });

  it("accepts exactly MAX_INVOICE_ID_LENGTH characters", () => {
    expect(validateInvoiceId("a".repeat(MAX_INVOICE_ID_LENGTH))).toEqual({ valid: true });
  });

  it("rejects exactly MAX_INVOICE_ID_LENGTH + 1 characters", () => {
    expect(validateInvoiceId("a".repeat(MAX_INVOICE_ID_LENGTH + 1))).toEqual({
      valid: false,
      reason: "too-long",
    });
  });

  it("accepts a string with only hyphens and digits", () => {
    expect(validateInvoiceId("001-002-003")).toEqual({ valid: true });
  });

  it("accepts a string with only underscores and letters", () => {
    expect(validateInvoiceId("inv_ABC_xyz")).toEqual({ valid: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. validateInvoiceId — determinism / idempotency
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInvoiceId — determinism", () => {
  it("returns the same result for repeated calls with the same valid id", () => {
    const id = "inv-001";
    const first = validateInvoiceId(id);
    const second = validateInvoiceId(id);
    expect(first).toEqual(second);
    expect(first).toEqual({ valid: true });
  });

  it("returns the same result for repeated calls with the same invalid id", () => {
    const id = "../traversal";
    const first = validateInvoiceId(id);
    const second = validateInvoiceId(id);
    expect(first).toEqual(second);
    expect(first).toEqual({ valid: false, reason: "invalid-chars" });
  });

  it("calling validate does not mutate the input string", () => {
    const id = "inv-001";
    const before = id;
    validateInvoiceId(id);
    expect(id).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. MAX_INVOICE_ID_LENGTH export
// ─────────────────────────────────────────────────────────────────────────────
describe("MAX_INVOICE_ID_LENGTH", () => {
  it("is exported as a number", () => {
    expect(typeof MAX_INVOICE_ID_LENGTH).toBe("number");
  });

  it("is a positive integer", () => {
    expect(MAX_INVOICE_ID_LENGTH).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_INVOICE_ID_LENGTH)).toBe(true);
  });

  it("is exactly 128", () => {
    expect(MAX_INVOICE_ID_LENGTH).toBe(128);
  });
});
