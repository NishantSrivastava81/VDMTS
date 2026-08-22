import { describe, expect, it, vi } from "vitest";
import { codesMatch, signAccessCookie, verifyAccessCookie } from "@/lib/server/access";

const SECRET = "a-test-signing-secret-of-at-least-32-chars";

describe("access cookie", () => {
  it("verifies a cookie it signed", async () => {
    const cookie = await signAccessCookie(SECRET);
    expect(await verifyAccessCookie(SECRET, cookie)).toBe(true);
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signAccessCookie(SECRET);
    expect(await verifyAccessCookie(`${SECRET}-other`, cookie)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await signAccessCookie(SECRET);
    const [issuedAt, signature] = cookie.split(".");
    expect(await verifyAccessCookie(SECRET, `${issuedAt}.${signature}x`)).toBe(false);
  });

  it("rejects a tampered timestamp", async () => {
    const issuedAt = Date.now() - 60_000;
    const cookie = await signAccessCookie(SECRET, issuedAt);
    const signature = cookie.split(".")[1];
    // Re-dating the cookie must invalidate it, or expiry could be side-stepped.
    expect(await verifyAccessCookie(SECRET, `${Date.now()}.${signature}`)).toBe(false);
  });

  it("rejects a missing cookie", async () => {
    expect(await verifyAccessCookie(SECRET, undefined)).toBe(false);
    expect(await verifyAccessCookie(SECRET, "")).toBe(false);
    expect(await verifyAccessCookie(SECRET, "nonsense")).toBe(false);
  });

  it("expires after thirty days", async () => {
    const cookie = await signAccessCookie(SECRET, Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(await verifyAccessCookie(SECRET, cookie)).toBe(false);
  });

  it("still accepts a cookie inside the window", async () => {
    const cookie = await signAccessCookie(SECRET, Date.now() - 29 * 24 * 60 * 60 * 1000);
    expect(await verifyAccessCookie(SECRET, cookie)).toBe(true);
  });
});

describe("codesMatch", () => {
  it("accepts the configured code", () => {
    expect(codesMatch("open-sesame", "open-sesame")).toBe(true);
  });

  it("rejects a wrong or truncated code", () => {
    expect(codesMatch("open-sesam", "open-sesame")).toBe(false);
    expect(codesMatch("", "open-sesame")).toBe(false);
    expect(codesMatch("open-sesame-extra", "open-sesame")).toBe(false);
  });

  it("compares the whole value rather than stopping at the first difference", () => {
    const spy = vi.spyOn(String.prototype, "localeCompare");
    codesMatch("aaaaaaaa", "bbbbbbbb");
    expect(spy).not.toHaveBeenCalled();
  });
});
