import { APIError } from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
const clientOptions: Array<Record<string, unknown>> = [];

vi.mock("openai", async () => {
  const actual = await vi.importActual<typeof import("openai")>("openai");
  class MockOpenAI {
    responses = { create };
    constructor(options: Record<string, unknown>) {
      clientOptions.push(options);
    }
  }
  return { ...actual, default: MockOpenAI };
});

const { ModelError, resetAzureClientCache, runStructuredResponse } = await import(
  "@/lib/ai/azure-client"
);
const { resetServerEnvCache } = await import("@/lib/server/env");

const schema = z.object({ answer: z.string() });
const jsonSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

function completed(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    output_text: JSON.stringify({ answer: "ok" }),
    usage: {
      input_tokens: 120,
      output_tokens: 400,
      output_tokens_details: { reasoning_tokens: 310 },
    },
    ...overrides,
  };
}

function call() {
  return runStructuredResponse({
    operation: "test",
    instructions: "teach",
    input: "question",
    schemaName: "test_schema",
    jsonSchema,
    zodSchema: schema,
  });
}

const lastBody = () => create.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  create.mockReset();
  clientOptions.length = 0;
  resetAzureClientCache();
  resetServerEnvCache();

  vi.stubEnv("AZURE_OPENAI_BASE_URL", "https://example.services.ai.azure.com/openai/v1/");
  vi.stubEnv("AZURE_OPENAI_API_KEY", "test-key");
  vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.6-terra");
  vi.stubEnv("AZURE_OPENAI_MAX_OUTPUT_TOKENS", "25000");
  vi.stubEnv("AZURE_SPEECH_ENDPOINT", "https://eastus.api.cognitive.microsoft.com/");
  vi.stubEnv("AZURE_SPEECH_KEY", "speech-key");
  vi.stubEnv("AZURE_SPEECH_REGION", "eastus");
});

describe("Azure Responses request contract", () => {
  it("points the SDK at the v1 base URL, not the operation URL", async () => {
    create.mockResolvedValue(completed());
    await call();

    const baseURL = clientOptions[0]?.baseURL as string;
    expect(baseURL).toMatch(/\/openai\/v1\/$/);
    expect(baseURL).not.toContain("/responses");
    expect(baseURL).not.toContain("api-version");
  });

  it("sends the deployment name in the model field", async () => {
    create.mockResolvedValue(completed());
    await call();

    expect(lastBody().model).toBe("gpt-5.6-terra");
  });

  it("nests reasoning as the Responses API requires", async () => {
    create.mockResolvedValue(completed());
    await call();

    const body = lastBody();
    expect(body.reasoning).toEqual({
      effort: "high",
      mode: "standard",
      context: "current_turn",
    });
    // The flat spelling belongs to Chat Completions and must never appear here.
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.reasoning).not.toHaveProperty("summary");
  });

  it("requests strict structured output and low verbosity", async () => {
    create.mockResolvedValue(completed());
    await call();

    expect(lastBody().text).toEqual({
      verbosity: "low",
      format: { type: "json_schema", name: "test_schema", strict: true, schema: jsonSchema },
    });
  });

  it("never stores the response or chains on a previous one", async () => {
    create.mockResolvedValue(completed());
    await call();

    const body = lastBody();
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("background");
  });

  it("omits sampling controls, which reasoning models reject", async () => {
    create.mockResolvedValue(completed());
    await call();

    const body = lastBody();
    for (const key of ["temperature", "top_p", "presence_penalty", "frequency_penalty"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("sends the image as a request-scoped data URL", async () => {
    create.mockResolvedValue(completed());
    await runStructuredResponse({
      operation: "test",
      instructions: "teach",
      input: "question",
      image: { base64: "AAAA", mimeType: "image/jpeg" },
      schemaName: "test_schema",
      jsonSchema,
      zodSchema: schema,
    });

    const input = lastBody().input as Array<{ content: Array<Record<string, unknown>> }>;
    const image = input[0]?.content.find((part) => part.type === "input_image");
    expect(image?.image_url).toBe("data:image/jpeg;base64,AAAA");
    expect(image?.detail).toBe("high");
  });

  it("reports token usage without any content", async () => {
    create.mockResolvedValue(completed());
    const result = await call();

    expect(result.usage).toMatchObject({
      deployment: "gpt-5.6-terra",
      inputTokens: 120,
      outputTokens: 400,
      reasoningTokens: 310,
    });
  });
});

describe("Azure Responses failure handling", () => {
  it("retries once with a larger budget when reasoning exhausted the cap", async () => {
    create
      .mockResolvedValueOnce({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "",
      })
      .mockResolvedValueOnce(completed());

    const result = await call();

    expect(create).toHaveBeenCalledTimes(2);
    const first = create.mock.calls[0]?.[0] as Record<string, number>;
    const second = create.mock.calls[1]?.[0] as Record<string, number>;
    expect(second.max_output_tokens).toBeGreaterThan(first.max_output_tokens as number);
    expect(result.data.answer).toBe("ok");
  });

  it("never treats an empty output as a tutor reply", async () => {
    create.mockResolvedValue({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: "",
    });

    await expect(call()).rejects.toMatchObject({ category: "incomplete" });
  });

  it("retries malformed JSON once, then fails as malformed", async () => {
    create.mockResolvedValue(completed({ output_text: "not json" }));

    await expect(call()).rejects.toMatchObject({ category: "malformed" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("rejects output that does not satisfy the schema", async () => {
    create.mockResolvedValue(completed({ output_text: JSON.stringify({ wrong: 1 }) }));

    await expect(call()).rejects.toMatchObject({ category: "malformed" });
  });

  it("maps 401 to an auth failure and does not retry", async () => {
    create.mockRejectedValue(new APIError(401, undefined, "unauthorized", undefined));

    await expect(call()).rejects.toMatchObject({ category: "auth", retryable: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("maps 404 to a deployment mismatch", async () => {
    create.mockRejectedValue(new APIError(404, undefined, "not found", undefined));

    await expect(call()).rejects.toMatchObject({ category: "deployment" });
  });

  it("retries a 429 once before giving up", async () => {
    create.mockRejectedValue(new APIError(429, undefined, "rate limited", undefined));

    await expect(call()).rejects.toMatchObject({ category: "quota", retryable: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("recovers when a retried 429 succeeds", async () => {
    create
      .mockRejectedValueOnce(new APIError(429, undefined, "rate limited", undefined))
      .mockResolvedValueOnce(completed());

    await expect(call()).resolves.toMatchObject({ data: { answer: "ok" } });
  });

  it("separates a content filter block from an ordinary bad request", async () => {
    create.mockRejectedValue(
      new APIError(400, { code: "content_filter" }, "filtered", undefined),
    );

    await expect(call()).rejects.toMatchObject({ category: "content_filter", retryable: false });
  });

  it("treats a 5xx as transient", async () => {
    create.mockRejectedValue(new APIError(503, undefined, "unavailable", undefined));

    await expect(call()).rejects.toMatchObject({ category: "service", retryable: true });
  });

  it("fails clearly when the base URL is misconfigured", async () => {
    vi.stubEnv("AZURE_OPENAI_BASE_URL", "https://example.services.ai.azure.com/openai/v1/responses");
    resetServerEnvCache();
    resetAzureClientCache();

    // The message must say why, so this is not mistaken for a 404 from Azure.
    await expect(call()).rejects.toThrowError(/AZURE_OPENAI_BASE_URL.*openai\/v1\//);
  });

  it("exports a typed error the routes can branch on", () => {
    expect(new ModelError("x", "quota", true)).toBeInstanceOf(Error);
  });
});
