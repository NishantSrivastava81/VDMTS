import { NextResponse } from "next/server";
import { accessRequestSchema } from "@/lib/ai/schemas";
import { accessCookieOptions, codesMatch, signAccessCookie } from "@/lib/server/access";
import { apiError, isSameOrigin } from "@/lib/server/api";
import { diagnostic } from "@/lib/server/diagnostics";
import { clientKey, consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return apiError("unauthorized");
  }

  if (!consumeRateLimit(clientKey(request, "access"), RATE_LIMIT)) {
    return apiError("rate_limited");
  }

  const expected = process.env.APP_ACCESS_CODE;
  const secret = process.env.COOKIE_SIGNING_SECRET;
  if (!expected || !secret) {
    return apiError("unauthorized");
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError("invalid_request");
  }

  const parsed = accessRequestSchema.safeParse(json);
  if (!parsed.success || !codesMatch(parsed.data.accessCode, expected)) {
    diagnostic("warn", "access_denied", {});
    return apiError("unauthorized");
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  response.cookies.set({ ...accessCookieOptions(), value: await signAccessCookie(secret) });
  diagnostic("info", "access_granted", {});

  return response;
}
