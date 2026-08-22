import { ModelError } from "@/lib/ai/azure-client";
import { fixtureTutorTurn } from "@/lib/ai/fixtures";
import { respondToStudent } from "@/lib/ai/orchestrator";
import { tutorRequestSchema } from "@/lib/ai/schemas";
import { apiError, apiSuccess, guardRoute, isSameOrigin } from "@/lib/server/api";
import { diagnostic } from "@/lib/server/diagnostics";
import { EnvironmentError, fixturesEnabled } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };
const MAX_BODY_BYTES = 128 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return apiError("unauthorized");
  }

  const denied = await guardRoute(request, "tutor", RATE_LIMIT);
  if (denied) {
    return denied;
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return apiError("invalid_request");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError("invalid_request");
  }

  const parsed = tutorRequestSchema.safeParse(json);
  if (!parsed.success) {
    diagnostic("warn", "tutor_request_rejected", {
      firstPath: parsed.error.issues[0]?.path.join(".") ?? "",
    });
    return apiError("invalid_request");
  }

  const payload = parsed.data;

  try {
    const started = Date.now();
    const result = fixturesEnabled() ? fixtureTutorTurn(payload) : await respondToStudent(payload);

    diagnostic("info", "tutor_turn", {
      route: "tutor",
      intent: result.response.assessment.intent,
      status: result.response.assessment.status,
      move: result.response.teacher.move,
      phase: result.state.phase,
      hintDepth: result.state.hintDepth,
      solutionMode: result.state.solutionMode,
      mathFallback: result.mathFallback,
      totalMs: Date.now() - started,
      reasoningTokens: result.usage.reduce((sum, entry) => sum + entry.reasoningTokens, 0),
    });

    return apiSuccess(result);
  } catch (error) {
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
      diagnostic("error", "configuration_invalid", { route: "tutor" });
      return apiError("server_error");
    }

    diagnostic("error", "tutor_unhandled", { route: "tutor" });
    return apiError("server_error");
  }
}
