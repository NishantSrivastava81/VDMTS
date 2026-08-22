import type { KatexOptions } from "katex";

/**
 * One option object shared by the server-side syntax validator and the browser
 * renderer, so a formula can never be accepted by one and rejected by the other.
 * `displayMode` and `throwOnError` are excluded because rehype-katex owns them.
 */
export type SharedKatexOptions = Omit<KatexOptions, "displayMode" | "throwOnError">;

export const KATEX_SHARED_OPTIONS: SharedKatexOptions = {
  output: "htmlAndMathml",
  strict: "warn",
  // `trust: false` blocks \href, \url, \includegraphics and \htmlClass.
  trust: false,
  maxExpand: 1000,
  // No model-defined macros: an empty allowlist, not an open extension point.
  macros: {},
  globalGroup: false,
  fleqn: false,
};

/** Validator variant: identical grammar, but errors surface instead of colouring. */
export const KATEX_VALIDATION_OPTIONS = {
  ...KATEX_SHARED_OPTIONS,
  throwOnError: true,
} as const satisfies KatexOptions;
