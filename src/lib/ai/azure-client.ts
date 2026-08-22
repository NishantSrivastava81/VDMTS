import "server-only";
import OpenAI, { APIError } from "openai";
import type { z } from "zod";
import { diagnostic } from "@/lib/server/diagnostics";
import { serverEnv } from "@/lib/server/env";
import type { ModelUsage } from "@/types/tutor";

export class ModelError extends Error {
  constructor(
    message: string,
    readonly category:
      | "auth"
      | "deployment"
      | "quota"
      | "content_filter"
      | "incomplete"
      | "malformed"
      | "service",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

let client: OpenAI | null = null;

/** One client per function instance; it holds no per-request state. */
function azureClient(): OpenAI {
  if (client) {
    return client;
  }
  const env = serverEnv();
  client = new OpenAI({
    baseURL: env.AZURE_OPENAI_BASE_URL,
    apiKey: env.AZURE_OPENAI_API_KEY,
    maxRetries: 0, // Retries are handled here so each attempt is measured.
    timeout: 120_000,
  });
  return client;
}

export function resetAzureClientCache(): void {
  client = null;
}

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export type ReasoningEffort = "low" | "medium" | "high";

export interface StructuredCallOptions<TSchema extends z.ZodType> {
  operation: string;
  instructions: string;
  input: string;
  image?: ImageInput;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: TSchema;
  maxOutputTokens?: number;
  effort?: ReasoningEffort;
}

export interface StructuredCallResult<T> {
  data: T;
  usage: ModelUsage;
}

const REASONING_MODE = "standard" as const;
// Explicit rather than the gpt-5.6 all_turns default: this app is stateless.
const REASONING_CONTEXT = "current_turn" as const;

/**
 * One place where every Azure Responses call is shaped, retried and measured.
 * Section 15.1: v1 Responses, deployment name in `model`, nested reasoning,
 * strict structured output, and never a stored response.
 */
export async function runStructuredResponse<TSchema extends z.ZodType>(
  options: StructuredCallOptions<TSchema>,
): Promise<StructuredCallResult<z.infer<TSchema>>> {
  const env = serverEnv();
  const budget = options.maxOutputTokens ?? env.AZURE_OPENAI_MAX_OUTPUT_TOKENS;

  const first = await callOnce(options, budget, 0);
  if (first.kind === "ok") {
    return first.result;
  }

  // An auth, deployment or content-filter failure will not change on a retry.
  if (first.reason === "fatal") {
    throw first.error;
  }

  // A truncated response means high-effort reasoning outran the budget.
  const retryBudget =
    first.reason === "incomplete_tokens"
      ? Math.min(120_000, Math.round(budget * 1.6))
      : budget;

  if (first.reason === "transient") {
    await sleep(jitteredBackoff());
  }

  const second = await callOnce(options, retryBudget, 1);
  if (second.kind === "ok") {
    return second.result;
  }
  throw second.error;
}

type Attempt<T> =
  | { kind: "ok"; result: StructuredCallResult<T> }
  | { kind: "failed"; reason: "incomplete_tokens" | "transient" | "fatal"; error: ModelError };

async function callOnce<TSchema extends z.ZodType>(
  options: StructuredCallOptions<TSchema>,
  maxOutputTokens: number,
  attempt: number,
): Promise<Attempt<z.infer<TSchema>>> {
  const env = serverEnv();
  const startedAt = Date.now();

  const content: OpenAI.Responses.ResponseInputContent[] = [
    { type: "input_text", text: options.input },
  ];
  if (options.image) {
    content.push({
      type: "input_image",
      // A data URL keeps the image request-scoped: nothing is uploaded to Azure Files.
      image_url: `data:${options.image.mimeType};base64,${options.image.base64}`,
      detail: "high",
    });
  }

  try {
    const response = await azureClient().responses.create({
      model: env.AZURE_OPENAI_DEPLOYMENT,
      instructions: options.instructions,
      input: [{ role: "user", content }],
      reasoning: {
        effort: options.effort ?? env.AZURE_OPENAI_REASONING_EFFORT,
        mode: REASONING_MODE,
        context: REASONING_CONTEXT,
      },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: options.schemaName,
          strict: true,
          schema: options.jsonSchema,
        },
      },
      max_output_tokens: maxOutputTokens,
      store: false,
    });

    const usage: ModelUsage = {
      deployment: env.AZURE_OPENAI_DEPLOYMENT,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    };

    diagnostic("info", "model_call", {
      operation: options.operation,
      attempt,
      status: response.status ?? "unknown",
      effort: options.effort ?? env.AZURE_OPENAI_REASONING_EFFORT,
      maxOutputTokens,
      ...usage,
    });

    if (response.status !== "completed") {
      const reason = response.incomplete_details?.reason ?? "unknown";
      return {
        kind: "failed",
        reason: reason === "max_output_tokens" ? "incomplete_tokens" : "fatal",
        error: new ModelError(`Model response ${response.status}: ${reason}`, "incomplete", true),
      };
    }

    const raw = response.output_text;
    if (!raw) {
      return {
        kind: "failed",
        reason: "transient",
        error: new ModelError("Model returned no structured output", "malformed", true),
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return {
        kind: "failed",
        reason: "transient",
        error: new ModelError("Model output was not valid JSON", "malformed", true),
      };
    }

    const parsed = options.zodSchema.safeParse(parsedJson);
    if (!parsed.success) {
      diagnostic("warn", "model_schema_rejected", {
        operation: options.operation,
        attempt,
        issueCount: parsed.error.issues.length,
        firstPath: parsed.error.issues[0]?.path.join(".") ?? "",
      });
      return {
        kind: "failed",
        reason: "transient",
        error: new ModelError("Model output failed schema validation", "malformed", true),
      };
    }

    return { kind: "ok", result: { data: parsed.data, usage } };
  } catch (error) {
    const modelError = toModelError(error);
    diagnostic("error", "model_call_failed", {
      operation: options.operation,
      attempt,
      category: modelError.category,
      latencyMs: Date.now() - startedAt,
    });
    return {
      kind: "failed",
      reason: modelError.retryable ? "transient" : "fatal",
      error: modelError,
    };
  }
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) {
    return error;
  }

  if (error instanceof APIError) {
    const status = error.status ?? 0;
    if (status === 401 || status === 403) {
      return new ModelError("Azure rejected the server key", "auth", false);
    }
    if (status === 404) {
      return new ModelError("Base URL or deployment name does not match Azure", "deployment", false);
    }
    if (status === 429) {
      return new ModelError("Azure quota or capacity limit reached", "quota", true);
    }
    if (status === 400 && isContentFilter(error)) {
      return new ModelError("Azure content filter blocked this request", "content_filter", false);
    }
    if (status >= 500) {
      return new ModelError("Azure service error", "service", true);
    }
    return new ModelError(`Azure request rejected (${status})`, "service", false);
  }

  return new ModelError("Unexpected model failure", "service", true);
}

function isContentFilter(error: APIError): boolean {
  if (error.code === "content_filter") {
    return true;
  }
  const body = error.error as { code?: string; innererror?: { code?: string } } | undefined;
  return body?.code === "content_filter" || body?.innererror?.code === "ResponsibleAIPolicyViolation";
}

function jitteredBackoff(): number {
  return 400 + Math.floor(Math.random() * 400);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
