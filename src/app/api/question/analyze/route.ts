import { ModelError } from "@/lib/ai/azure-client";
import { fixtureAnalyze } from "@/lib/ai/fixtures";
import { analyseQuestion, TutoringError } from "@/lib/ai/orchestrator";
import {
  conceptSummaryListSchema,
  questionSelectionSchema,
  sessionIdSchema,
  tutorLanguageSchema,
} from "@/lib/ai/schemas";
import { apiError, apiSuccess, guardRoute, isSameOrigin } from "@/lib/server/api";
import { diagnostic } from "@/lib/server/diagnostics";
import { EnvironmentError, fixturesEnabled } from "@/lib/server/env";
import { ImageValidationError, MAX_IMAGE_BYTES, validateImage } from "@/lib/server/image";
import type { ConceptSummary } from "@/lib/concepts/registry";
import type { QuestionSelection } from "@/types/tutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_LIMIT = { limit: 12, windowMs: 60 * 60 * 1000 };

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return apiError("unauthorized");
  }

  const denied = await guardRoute(request, "analyze", RATE_LIMIT);
  if (denied) {
    return denied;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("invalid_request");
  }

  const sessionId = sessionIdSchema.safeParse(form.get("sessionId"));
  if (!sessionId.success) {
    return apiError("invalid_request");
  }

  const knownConcepts = parseKnownConcepts(form.get("knownConcepts"));
  if (knownConcepts === undefined) {
    return apiError("invalid_request");
  }

  const selection = parseSelection(form.get("selectedQuestion"));
  if (selection === undefined) {
    return apiError("invalid_request");
  }

  const language = tutorLanguageSchema.catch("english").parse(form.get("language"));

  if (fixturesEnabled()) {
    return apiSuccess(fixtureAnalyze());
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return apiError("invalid_image");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const validated = validateImage(bytes);
    // The image lives only in this request: no disk, no object storage, no log.
    const base64 = Buffer.from(bytes).toString("base64");

    const started = Date.now();
    const result = await analyseQuestion(
      { base64, mimeType: validated.mimeType },
      knownConcepts,
      selection,
      language,
    );

    if (result.kind === "choice") {
      diagnostic("info", "question_choice", {
        route: "analyze",
        options: result.questions.length,
        totalMs: Date.now() - started,
        calls: result.usage.length,
      });
      return apiSuccess(result);
    }

    diagnostic("info", "question_analyzed", {
      route: "analyze",
      verdict: result.reviewVerdict,
      needsConfirmation: result.analysis.needsConfirmation,
      selected: Boolean(selection),
      imageWidth: validated.width,
      imageHeight: validated.height,
      totalMs: Date.now() - started,
      calls: result.usage.length,
      reasoningTokens: result.usage.reduce((sum, entry) => sum + entry.reasoningTokens, 0),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleFailure(error);
  }
}

function parseKnownConcepts(raw: FormDataEntryValue | null): ConceptSummary[] | undefined {
  if (raw === null || raw === "") {
    return [];
  }
  if (typeof raw !== "string") {
    return undefined;
  }

  try {
    const parsed = conceptSummaryListSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function parseSelection(raw: FormDataEntryValue | null): QuestionSelection | null | undefined {
  if (raw === null || raw === "") {
    return null;
  }
  if (typeof raw !== "string") {
    return undefined;
  }

  try {
    const parsed = questionSelectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function handleFailure(error: unknown): Response {
  if (error instanceof ImageValidationError) {
    diagnostic("warn", "image_rejected", { reason: error.reason });
    return apiError("invalid_image");
  }

  if (error instanceof TutoringError) {
    diagnostic("info", "question_not_tutorable", { code: error.code });
    return apiError("not_mathematics");
  }

  if (error instanceof ModelError) {
    if (error.category === "content_filter") {
      return apiError("content_filtered");
    }
    if (error.category === "incomplete") {
      return apiError("model_incomplete");
    }
    return apiError("model_unavailable");
  }

  if (error instanceof EnvironmentError) {
    diagnostic("error", "configuration_invalid", { route: "analyze" });
    return apiError("server_error");
  }

  diagnostic("error", "analyze_unhandled", { route: "analyze" });
  return apiError("server_error");
}
