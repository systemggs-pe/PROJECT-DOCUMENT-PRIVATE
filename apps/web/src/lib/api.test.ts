import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadFile, downloadGeneration, getApiBaseUrl } from "./api";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-only-token" } } }) } },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("getApiBaseUrl", () => {
  it("returns a configured or default API URL", () => {
    expect(getApiBaseUrl()).toMatch(/^http/);
  });
});

describe("signed downloads", () => {
  it.each([["files", downloadFile], ["generations", downloadGeneration]] as const)("authorizes %s through the API and fetches Storage without the bearer", async (resource, download) => {
    vi.useFakeTimers();
    const signedUrl = "https://example.supabase.co/signed-file";
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: signedUrl, expiresIn: 300 })))
      .mockResolvedValueOnce(new Response("%PDF-1.7"));
    vi.stubGlobal("fetch", fetch);
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: () => anchor });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    await download("test-id", "document.pdf");
    expect(fetch.mock.calls[0]?.[0]).toBe(`${getApiBaseUrl()}/${resource}/test-id/signed-url`);
    expect((fetch.mock.calls[0]?.[1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers).get("Authorization")).toBe("Bearer test-only-token");
    expect(fetch.mock.calls[1]).toEqual([signedUrl]);
    expect(anchor.download).toBe("document.pdf");
    expect(anchor.click).toHaveBeenCalledOnce();
  });
});
