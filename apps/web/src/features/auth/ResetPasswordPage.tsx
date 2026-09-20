import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Usa al menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirma tu contraseña."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const isConfigured = useAuthStore((state) => state.isConfigured);
  const updatePassword = useAuthStore((state) => state.updatePassword);
  const signOut = useAuthStore((state) => state.signOut);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function submitReset(input: ResetPasswordForm) {
    setFormError(null);
    setFormSuccess(null);
    try {
      await updatePassword(input.password);
      form.reset({ password: "", confirmPassword: "" });
      setFormSuccess("Tu contraseña fue actualizada correctamente.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo actualizar la contraseña.");
    }
  }

  async function returnToLogin() {
    setFormError(null);
    try {
      await signOut();
    } catch {
      useAuthStore.setState({ session: null, user: null, error: null, isLoading: false });
    }
    window.history.replaceState(null, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-5 py-8 text-[var(--ink)]">
      <section className="w-full max-w-sm">
        <div className="mb-7">
          <p className="text-sm text-[var(--muted)]">Recuperación de acceso</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">Actualizar contraseña</h1>
        </div>

        {!isConfigured ? (
          <div className="mb-5 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
            El acceso seguro todavía no está configurado. Contacta al administrador del sistema.
          </div>
        ) : null}

        {formError ? (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">
            {formError}
          </div>
        ) : null}

        {formSuccess ? (
          <div className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-[var(--success)]">
            {formSuccess}
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={form.handleSubmit(submitReset)}>
          <Field label="Nueva contraseña" error={form.formState.errors.password?.message}>
            <input {...form.register("password")} type="password" autoComplete="new-password" className={inputClassName} />
          </Field>
          <Field label="Confirmar contraseña" error={form.formState.errors.confirmPassword?.message}>
            <input {...form.register("confirmPassword")} type="password" autoComplete="new-password" className={inputClassName} />
          </Field>
          <Button type="submit" className="h-11 gap-2" disabled={!isConfigured || form.formState.isSubmitting}>
            <KeyRound className="size-4" aria-hidden={true} />
            Actualizar contraseña
          </Button>
        </form>

        <Button type="button" variant="ghost" className="mt-3 h-11 w-full gap-2 border border-[var(--line)]" onClick={returnToLogin}>
          <ArrowLeft className="size-4" aria-hidden={true} />
          Volver al inicio de sesión
        </Button>
      </section>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-normal text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

const inputClassName =
  "h-11 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--focus)]/20";
