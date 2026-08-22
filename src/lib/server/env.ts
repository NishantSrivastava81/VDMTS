import "server-only";
import { z } from "zod";

/**
 * Every Azure value stays server-side. Nothing here may be exposed through a
 * NEXT_PUBLIC_ variable, or the browser could call the paid deployment directly.
 */
const envSchema = z.object({
  AZURE_OPENAI_BASE_URL: z
    .string()
    .url()
    .refine((value) => value.endsWith("/openai/v1/"), {
      message:
        "Base URL must end at /openai/v1/ — the OpenAI SDK appends 'responses' itself.",
    }),
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_DEPLOYMENT: z.string().min(1),
  // Restricted to the approved value; configurable for evaluation, not for students.
  AZURE_OPENAI_REASONING_EFFORT: z.literal("high").default("high"),
  AZURE_OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(4000).max(120_000).default(25_000),

  AZURE_SPEECH_ENDPOINT: z.string().url(),
  AZURE_SPEECH_KEY: z.string().min(1),
  AZURE_SPEECH_REGION: z.string().min(1),
  AZURE_SPEECH_RECOGNITION_LANGUAGE: z.string().min(2).default("en-IN"),
  // Must support hi-IN as a secondary locale, or Hinglish is read as broken English.
  AZURE_SPEECH_VOICE: z.string().min(1).default("en-IN-Arjun:DragonHDLatestNeural"),

  APP_ACCESS_CODE: z.string().default(""),
  COOKIE_SIGNING_SECRET: z.string().default(""),

  NEXT_THOUGHT_USE_FIXTURES: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parsed lazily so a missing key surfaces as a route error, not a build failure. */
export function serverEnv(): ServerEnv {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new EnvironmentError(`Invalid server configuration — ${detail}`);
  }

  if (parsed.data.APP_ACCESS_CODE && parsed.data.COOKIE_SIGNING_SECRET.length < 32) {
    throw new EnvironmentError(
      "COOKIE_SIGNING_SECRET must be at least 32 characters when APP_ACCESS_CODE is set.",
    );
  }

  cached = parsed.data;
  return cached;
}

export function resetServerEnvCache(): void {
  cached = null;
}

export class EnvironmentError extends Error {
  override readonly name = "EnvironmentError";
}

export function fixturesEnabled(): boolean {
  return process.env.NEXT_THOUGHT_USE_FIXTURES?.toLowerCase() === "true";
}

export function accessCodeConfigured(): boolean {
  return Boolean(process.env.APP_ACCESS_CODE);
}
