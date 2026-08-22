import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: [
    // Everything except static assets, which need no policy header.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2?)$).*)",
  ],
};

export default function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const region = process.env.AZURE_SPEECH_REGION ?? "eastus";

  // Vercel terminates TLS upstream, so trust the forwarded scheme.
  const isHttps =
    (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) ===
    "https";

  // Only the app's own origin and the Speech endpoints the SDK actually reaches.
  const speechOrigins = [
    `https://${region}.api.cognitive.microsoft.com`,
    `https://${region}.stt.speech.microsoft.com`,
    `https://${region}.tts.speech.microsoft.com`,
    `wss://${region}.stt.speech.microsoft.com`,
    `wss://${region}.tts.speech.microsoft.com`,
  ].join(" ");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${speechOrigins}${isDev ? " ws: http://localhost:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Safari upgrades every asset, which breaks plain-HTTP local and LAN testing.
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}
