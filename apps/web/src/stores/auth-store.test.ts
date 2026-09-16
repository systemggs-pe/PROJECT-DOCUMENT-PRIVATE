import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: supabaseMock,
  },
}));

describe("auth store password flows", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMock.resetPasswordForEmail.mockReset();
    supabaseMock.updateUser.mockReset();
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:5173",
      },
    });
  });

  it("sends password reset emails through Supabase Auth", async () => {
    supabaseMock.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { useAuthStore } = await import("./auth-store");

    await useAuthStore.getState().sendPasswordReset("demo@ggs.local");

    expect(supabaseMock.resetPasswordForEmail).toHaveBeenCalledWith("demo@ggs.local", {
      redirectTo: "http://localhost:5173/reset-password",
    });
  });

  it("updates the password through Supabase Auth", async () => {
    supabaseMock.updateUser.mockResolvedValue({ data: { user: { id: "demo-user" } }, error: null });
    const { useAuthStore } = await import("./auth-store");

    await useAuthStore.getState().updatePassword("nueva-password");

    expect(supabaseMock.updateUser).toHaveBeenCalledWith({
      password: "nueva-password",
    });
    expect(useAuthStore.getState().user).toEqual({ id: "demo-user" });
  });
});
