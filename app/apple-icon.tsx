/**
 * @file app/apple-icon.tsx
 *
 * Generates the Apple Touch Icon (180×180 PNG) for LiquiFact using
 * Next.js's built-in `ImageResponse` edge API.
 *
 * ─── COMPATIBILITY CONTRACT ────────────────────────────────────────────────
 *
 * These exported constants form the public interface consumed by Next.js at
 * build time. **They must not be changed without a coordinated framework
 * migration**, because Next.js reads them via static analysis:
 *
 *   • `runtime`     — MUST remain "edge".  Changing to "nodejs" or removing
 *                     it will break dynamic icon generation on edge runtimes.
 *
 *   • `size`        — MUST remain { width: 180, height: 180 }.  Apple
 *                     Touch Icons must be exactly 180×180 pixels; any other
 *                     dimension causes iOS/Safari to ignore the icon.
 *                     The same object is spread into `ImageResponse` options
 *                     so the rendered bitmap dimensions always match the
 *                     advertised contract.
 *
 *   • `contentType` — MUST remain "image/png".  Browsers and crawlers reject
 *                     Apple Touch Icons with non-PNG content types.
 *
 * Invariants:
 *   1. The function MUST always return a Response (never throw to the caller).
 *      If `ImageResponse` fails for any reason, a minimal 1×1 transparent PNG
 *      data-URI fallback is returned so the HTTP layer always gets a valid
 *      Response and the application startup is not blocked.
 *
 *   2. The branded "L" glyph, background colour (#020617 / slate-950), and
 *      foreground colour (#22d3ee / cyan-400) MUST match the design token
 *      palette defined in `app/globals.css`.  Update both locations together.
 *
 *   3. Border-radius is set to "20%" (not a pixel value) so the rounding
 *      scales correctly at all DPR levels without aliasing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 */

import { ImageResponse } from "next/og";

// ─── Public route-segment config (consumed by Next.js at build time) ────────

/** MUST remain "edge" — see contract above. */
export const runtime = "edge";

/**
 * Icon dimensions.
 * MUST remain 180×180 — Apple Touch Icon specification requirement.
 * Also spread into `ImageResponse` to guarantee bitmap matches advertisement.
 */
export const size = {
  width: 180,
  height: 180,
} as const;

/** MUST remain "image/png" — see contract above. */
export const contentType = "image/png";

// ─── Minimal fallback PNG (1×1 transparent) ─────────────────────────────────
// Used only when ImageResponse throws so the caller always receives a Response.
// Generated via: `convert -size 1x1 xc:none PNG:- | base64`
const FALLBACK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ─── Route handler ───────────────────────────────────────────────────────────

/**
 * Generates the LiquiFact Apple Touch Icon.
 *
 * @returns {Response} A 180×180 PNG `ImageResponse`, or a minimal 1×1
 *   transparent PNG fallback if `ImageResponse` construction fails (invariant 1).
 */
export default function AppleIcon(): Response {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 100,
            background: "#020617" /* slate-950 — keep in sync with --color-bg in globals.css */,
            color: "#22d3ee" /* cyan-400 — keep in sync with --color-primary in globals.css */,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "20%" /* percentage-based, scales correctly at all DPR levels */,
            fontWeight: 800,
          }}
        >
          L
        </div>
      ),
      {
        // Spread `size` so the rendered bitmap always matches the exported
        // dimension contract — a single source of truth.
        ...size,
      }
    );
  } catch {
    // Invariant 1: never propagate errors to the caller.
    // Return a minimal valid PNG so the HTTP layer is always satisfied.
    const fallbackBody = FALLBACK_PNG.replace(/^data:image\/png;base64,/, "");
    const bytes = Buffer.from(fallbackBody, "base64");
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  }
}
