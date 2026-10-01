/**
 * @file app/apple-icon.test.tsx
 *
 * Tests for the LiquiFact Apple Touch Icon route (app/apple-icon.tsx).
 *
 * Strategy
 * ────────
 * `ImageResponse` is an edge-runtime API not available in jsdom. We mock
 * `next/og` with a hand-rolled class so all code paths — including the
 * error-guard fallback — can be exercised without an actual edge runtime.
 *
 * Hoisting note
 * ─────────────
 * Jest hoists `jest.mock(...)` above all imports AND above all top-level
 * statements in the test file. Therefore any data the factory wants to share
 * with the test body must be initialised inside the factory itself (not outside
 * it), and read back via a stable reference — here `globalThis.__appleIconCalls`.
 * We initialise the array inside the factory so it exists on first use, and
 * read it back via the `calls()` helper below.
 *
 * The jsdom global `Response` (set up in jest.setup.js) is a bare stub class
 * with no `.status` or `.headers`. For the fallback-path tests we temporarily
 * replace it with a richer mock that records the init options.
 *
 * Scenarios covered
 * ─────────────────
 *  Exported contracts (regression guard)
 *    • `runtime` is "edge"
 *    • `size` is exactly { width: 180, height: 180 }
 *    • `contentType` is "image/png"
 *
 *  Success path
 *    • Returns the MockImageResponse instance
 *    • `size` dimensions are spread into the ImageResponse options
 *    • Idempotent — safe to call multiple times
 *
 *  ImageResponse options invariant
 *    • options.width / options.height equal exported `size` constants
 *
 *  Failure / fallback path
 *    • Does not throw when ImageResponse constructor throws
 *    • Fallback Response is constructed with status 200
 *    • Fallback Response is constructed with Content-Type "image/png"
 *
 *  Boundary assertions
 *    • width and height are positive integers equal to 180
 *    • Icon is square (width === height)
 *    • contentType starts with "image/"
 *    • default export is a callable function
 */

// ─── Mock next/og ─────────────────────────────────────────────────────────────
// The factory is hoisted above all imports. We initialise the shared registry
// HERE so it exists before any constructor call occurs.
jest.mock("next/og", () => {
  // Initialise the registry on globalThis so tests can read it.
  if (!(globalThis as unknown as Record<string, unknown>).__appleIconCalls) {
    (globalThis as unknown as Record<string, unknown>).__appleIconCalls = [];
  }
  const registry = (globalThis as unknown as Record<string, unknown>)
    .__appleIconCalls as Array<{ element: unknown; options: unknown }>;

  class MockImageResponse {
    element: unknown;
    options: unknown;
    constructor(element: unknown, options: unknown) {
      this.element = element;
      this.options = options;
      registry.push({ element, options });
    }
  }

  return { ImageResponse: MockImageResponse };
});

// ─── Module under test (imported after mock is in place) ─────────────────────
import AppleIcon, { runtime, size, contentType } from "./apple-icon";

// ─── Convenience accessor for the shared call registry ───────────────────────
function calls(): Array<{ element: unknown; options: unknown }> {
  return (globalThis as unknown as Record<string, unknown>)
    .__appleIconCalls as Array<{ element: unknown; options: unknown }>;
}

// ─── Per-test reset ───────────────────────────────────────────────────────────
beforeEach(() => {
  calls().length = 0;
  jest.restoreAllMocks();
});

// ── Exported compatibility contracts ─────────────────────────────────────────

describe("Exported compatibility contracts", () => {
  it('runtime must be "edge"', () => {
    expect(runtime).toBe("edge");
  });

  it("size must be exactly { width: 180, height: 180 }", () => {
    expect(size).toEqual({ width: 180, height: 180 });
  });

  it("size.width must be exactly 180 (not adjacent values)", () => {
    expect(size.width).toBe(180);
    expect(size.width).not.toBe(0);
    expect(size.width).not.toBe(181);
    expect(size.width).not.toBe(179);
  });

  it("size.height must be exactly 180 (not adjacent values)", () => {
    expect(size.height).toBe(180);
    expect(size.height).not.toBe(0);
    expect(size.height).not.toBe(181);
    expect(size.height).not.toBe(179);
  });

  it('contentType must be "image/png"', () => {
    expect(contentType).toBe("image/png");
  });
});

// ── Success path ──────────────────────────────────────────────────────────────

describe("AppleIcon() — success path", () => {
  it("returns a defined, non-null object", () => {
    const result = AppleIcon();
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });

  it("returns the MockImageResponse instance produced by the mock", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ImageResponse } = require("next/og");
    const result = AppleIcon();
    expect(result).toBeInstanceOf(ImageResponse);
  });

  it("passes the size dimensions as options to ImageResponse", () => {
    AppleIcon();
    expect(calls()).toHaveLength(1);
    const options = calls()[0].options as Record<string, unknown>;
    expect(options).toMatchObject({ width: 180, height: 180 });
  });

  it("passes a JSX element (object) as the first argument to ImageResponse", () => {
    AppleIcon();
    expect(calls()).toHaveLength(1);
    expect(typeof calls()[0].element).toBe("object");
    expect(calls()[0].element).not.toBeNull();
  });

  it("is idempotent — safe to call multiple times without throwing", () => {
    expect(() => {
      AppleIcon();
      AppleIcon();
      AppleIcon();
    }).not.toThrow();
    expect(calls()).toHaveLength(3);
  });
});

// ── ImageResponse options invariant ──────────────────────────────────────────

describe("ImageResponse options invariant — size is single source of truth", () => {
  it("options.width equals the exported size.width", () => {
    AppleIcon();
    const options = calls()[0].options as Record<string, unknown>;
    expect(options.width).toBe(size.width);
  });

  it("options.height equals the exported size.height", () => {
    AppleIcon();
    const options = calls()[0].options as Record<string, unknown>;
    expect(options.height).toBe(size.height);
  });
});

// ── Failure / fallback path ───────────────────────────────────────────────────

describe("AppleIcon() — failure / fallback path", () => {
  /**
   * Replace the bare Response stub from jest.setup.js with a richer mock
   * that records init options so we can assert on status and Content-Type.
   */
  type ResponseInit = { status?: number; headers?: Record<string, string> };
  let capturedResponseInits: ResponseInit[] = [];

  beforeEach(() => {
    capturedResponseInits = [];
    global.Response = class MockResponse {
      status: number;
      headers: { get: (name: string) => string | null };
      constructor(_body: unknown, init?: ResponseInit) {
        this.status = init?.status ?? 200;
        const h = init?.headers ?? {};
        this.headers = { get: (name: string) => h[name] ?? null };
        capturedResponseInits.push(init ?? {});
      }
    } as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = class Response {} as unknown as typeof Response;
  });

  function makeThrow(message = "simulated failure") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require("next/og"), "ImageResponse").mockImplementationOnce(() => {
      throw new Error(message);
    });
  }

  it("does not throw when ImageResponse construction fails", () => {
    makeThrow("edge runtime unavailable");
    expect(() => AppleIcon()).not.toThrow();
  });

  it("returns a non-null object when ImageResponse throws", () => {
    makeThrow();
    const result = AppleIcon();
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });

  it("fallback Response is constructed with status 200", () => {
    makeThrow();
    AppleIcon();
    expect(capturedResponseInits).toHaveLength(1);
    expect(capturedResponseInits[0].status).toBe(200);
  });

  it('fallback Response is constructed with Content-Type "image/png"', () => {
    makeThrow();
    AppleIcon();
    expect(capturedResponseInits).toHaveLength(1);
    expect(capturedResponseInits[0].headers?.["Content-Type"]).toBe("image/png");
  });

  it("fallback response object exposes status 200", () => {
    makeThrow();
    const result = AppleIcon() as unknown as { status: number };
    expect(result.status).toBe(200);
  });

  it('fallback response object exposes Content-Type "image/png" via headers.get', () => {
    makeThrow();
    const result = AppleIcon() as unknown as {
      headers: { get: (name: string) => string | null };
    };
    expect(result.headers.get("Content-Type")).toBe("image/png");
  });

  it("recovers from multiple distinct error types in sequence", () => {
    const errors = [
      new Error("edge runtime unavailable"),
      new TypeError("fetch is not defined"),
      new RangeError("canvas size too large"),
    ];
    for (const err of errors) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require("next/og"), "ImageResponse").mockImplementationOnce(() => {
        throw err;
      });
      expect(() => AppleIcon()).not.toThrow();
      jest.restoreAllMocks();
    }
  });
});

// ── Boundary / regression assertions ─────────────────────────────────────────

describe("Boundary and regression assertions", () => {
  it("size.width is a positive integer", () => {
    expect(Number.isInteger(size.width)).toBe(true);
    expect(size.width).toBeGreaterThan(0);
  });

  it("size.height is a positive integer", () => {
    expect(Number.isInteger(size.height)).toBe(true);
    expect(size.height).toBeGreaterThan(0);
  });

  it("icon is square — width equals height (Apple Touch Icon requirement)", () => {
    expect(size.width).toBe(size.height);
  });

  it("contentType is a non-empty string", () => {
    expect(typeof contentType).toBe("string");
    expect(contentType.length).toBeGreaterThan(0);
  });

  it('contentType starts with "image/"', () => {
    expect(contentType.startsWith("image/")).toBe(true);
  });

  it("runtime is a non-empty string", () => {
    expect(typeof runtime).toBe("string");
    expect(runtime.length).toBeGreaterThan(0);
  });

  it("AppleIcon default export is a callable function", () => {
    expect(typeof AppleIcon).toBe("function");
  });

  it("default export resolves to a function via dynamic import", async () => {
    const mod = await import("./apple-icon");
    expect(typeof mod.default).toBe("function");
  });
});
