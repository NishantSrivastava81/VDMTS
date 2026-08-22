import { apiError, apiSuccess, guardRoute } from "@/lib/server/api";
import { diagnostic } from "@/lib/server/diagnostics";
import { EnvironmentError, serverEnv } from "@/lib/server/env";
import type { SpeechTokenPayload } from "@/types/tutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };
/** Azure STS tokens live 10 minutes; the browser refreshes at 9. */
const CLIENT_LIFETIME_MS = 9 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  const denied = await guardRoute(request, "speech-token", RATE_LIMIT);
  if (denied) {
    return denied;
  }

  let endpoint: string;
  let key: string;
  let env;
  try {
    env = serverEnv();
    endpoint = env.AZURE_SPEECH_ENDPOINT.replace(/\/$/, "");
    key = env.AZURE_SPEECH_KEY;
  } catch (error) {
    if (error instanceof EnvironmentError) {
      diagnostic("error", "configuration_invalid", { route: "speech-token" });
      return apiError("speech_unavailable");
    }
    throw error;
  }

  try {
    const response = await fetch(`${endpoint}/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // The subscription key never leaves the server.
        "Ocp-Apim-Subscription-Key": key,
      },
      body: "",
      cache: "no-store",
    });

    if (!response.ok) {
      diagnostic("error", "speech_token_failed", { status: response.status });
      return apiError("speech_unavailable");
    }

    const token = await response.text();
    if (!token) {
      return apiError("speech_unavailable");
    }

    const payload: SpeechTokenPayload = {
      token,
      region: env.AZURE_SPEECH_REGION,
      recognitionLanguage: env.AZURE_SPEECH_RECOGNITION_LANGUAGE,
      voiceName: env.AZURE_SPEECH_VOICE,
      expiresAt: new Date(Date.now() + CLIENT_LIFETIME_MS).toISOString(),
    };

    return apiSuccess(payload);
  } catch {
    diagnostic("error", "speech_token_unreachable", {});
    return apiError("speech_unavailable");
  }
}
