import "server-only";
import { NextResponse } from "next/server";
import { verifyAccessCookie } from "@/lib/server/access";
import { ACCESS_COOKIE } from "@/lib/server/access";
import { consumeRateLimit, clientKey, type RateLimit } from "@/lib/server/rate-limit";
import type { ApiErrorBody, ApiErrorCode } from "@/types/tutor";

const MESSAGES: Record<ApiErrorCode, { message: string; status: number; retryable: boolean }> = {
  unauthorized: {
    message: "This app is set up for one household. Enter the access code to continue.",
    status: 401,
    retryable: false,
  },
  rate_limited: {
    message: "That was a lot of requests at once. Wait a moment and try again.",
    status: 429,
    retryable: true,
  },
  invalid_request: {
    message: "Something in that request did not look right. Try again.",
    status: 400,
    retryable: true,
  },
  invalid_image: {
    message: "I could not read that image. Try a clearer photo or a screenshot.",
    status: 400,
    retryable: true,
  },
  not_mathematics: {
    message: "This version works with one JEE Mathematics question at a time.",
    status: 422,
    retryable: false,
  },
  multiple_questions: {
    message: "There is more than one question here. Crop to the one you want to work on.",
    status: 422,
    retryable: false,
  },
  model_unavailable: {
    message: "I could not examine the question just now. Your image is still here; try again in a moment.",
    status: 503,
    retryable: true,
  },
  model_incomplete: {
    message: "That took longer than expected. Try once more.",
    status: 503,
    retryable: true,
  },
  content_filtered: {
    message: "I could not work with that image. Try a different photo of the question.",
    status: 422,
    retryable: false,
  },
  speech_unavailable: {
    message: "Voice is unavailable right now. You can keep typing.",
    status: 503,
    retryable: true,
  },
  server_error: {
    message: "Something went wrong at my end. Your work is still here; try again.",
    status: 500,
    retryable: true,
  },
};

export function apiError(code: ApiErrorCode): NextResponse<ApiErrorBody> {
  const { message, status, retryable } = MESSAGES[code];
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, retryable } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function apiSuccess<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * The same household check and request ceiling apply to every route that can
 * reach a paid Azure resource.
 */
export async function guardRoute(
  request: Request,
  route: string,
  limit: RateLimit,
): Promise<NextResponse<ApiErrorBody> | null> {
  const accessCode = process.env.APP_ACCESS_CODE;
  if (accessCode) {
    const cookie = readCookie(request, ACCESS_COOKIE);
    const secret = process.env.COOKIE_SIGNING_SECRET ?? "";
    if (!secret || !(await verifyAccessCookie(secret, cookie))) {
      return apiError("unauthorized");
    }
  }

  if (!consumeRateLimit(clientKey(request, route), limit)) {
    return apiError("rate_limited");
  }

  return null;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return undefined;
}

/** Blocks cross-site form posts to the paid routes. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true; // Same-origin fetches from Safari may omit Origin on GET.
  }
  const host = request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
