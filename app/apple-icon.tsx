import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * Standard Apple touch icon size invariant (180x180 px).
 * Frozen to prevent runtime tampering or mutations during concurrent execution.
 */
export const size = Object.freeze({
  width: 180,
  height: 180,
});

export const contentType = "image/png";

/**
 * Fallback dimensions ensuring consistency if route metadata is tampered with.
 */
const DEFAULT_ICON_SIZE = Object.freeze({
  width: 180,
  height: 180,
});

/**
 * Renders the Apple Touch Icon for iOS/mobile bookmarks and web app shortcuts.
 * Hardened for concurrent and repeated execution:
 * - Invariant enforcement on dimensions and content type.
 * - Deterministic, idempotent response generation without mutable shared state.
 * - Safe error handling with fallback rendering to prevent 500 edge crashes.
 * - Diagnostic observability without exposing sensitive environment or request data.
 */
export default function AppleIcon() {
  try {
    // Validate size invariants
    const resolvedSize =
      size &&
      typeof size.width === "number" &&
      typeof size.height === "number" &&
      size.width === DEFAULT_ICON_SIZE.width &&
      size.height === DEFAULT_ICON_SIZE.height
        ? size
        : DEFAULT_ICON_SIZE;

    return new ImageResponse(
      <div
        style={{
          fontSize: 100,
          background: "#020617", // slate-950
          color: "#22d3ee", // cyan-400
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "20%",
          fontWeight: 800,
        }}
      >
        L
      </div>,
      {
        width: resolvedSize.width,
        height: resolvedSize.height,
      }
    );
  } catch (error) {
    // Safe failure recovery: log diagnosable error without leaking sensitive internals
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[apple-icon] Failed to generate icon: ${errorMessage}`);

    // Return a minimal, deterministic fallback ImageResponse
    return new ImageResponse(
      <div
        style={{
          fontSize: 100,
          background: "#020617",
          color: "#22d3ee",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "20%",
          fontWeight: 800,
        }}
      >
        L
      </div>,
      {
        width: DEFAULT_ICON_SIZE.width,
        height: DEFAULT_ICON_SIZE.height,
      }
    );
  }
}
