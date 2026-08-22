import "server-only";

type Level = "info" | "warn" | "error";

/**
 * Content-free diagnostics. Nothing here may carry question text, images,
 * student messages, tutor replies or reasoning items — only categories,
 * counts and timings.
 */
export function diagnostic(
  level: Level,
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.info(payload);
  }
}
