import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

const passwordSchema = z
  .object({
    password: z.string().min(8, "Usa al menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirma tu contraseña."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const updatePassword = useAuthStore((state) => state.updatePassword);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function submitPassword(input: PasswordForm) {
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

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-[var(--muted)]">Cuenta</p>
        <h2 className="text-xl font-semibold tracking-normal">Mi cuenta</h2>
      </div>

      <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
        <p className="text-sm font-medium">Email</p>
        <p className="break-all text-sm text-[var(--muted)]">{user?.email ?? "Sesión activa"}</p>
      </div>

      <form className="grid max-w-md gap-4" onSubmit={form.handleSubmit(submitPassword)}>
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-[var(--muted)]" aria-hidden={true} />
          <h3 className="text-base font-semibold">Cambiar contraseña</h3>
        </div>

        {formError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">
            {formError}
          </div>
        ) : null}

        {formSuccess ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-[var(--success)]">
            {formSuccess}
          </div>
        ) : null}

        <Field label="Nueva contraseña" error={form.formState.errors.password?.message}>
          <input {...form.register("password")} type="password" autoComplete="new-password" className={inputClassName} />
        </Field>
        <Field label="Confirmar contraseña" error={form.formState.errors.confirmPassword?.message}>
          <input {...form.register("confirmPassword")} type="password" autoComplete="new-password" className={inputClassName} />
        </Field>

        <Button type="submit" className="h-11 w-fit gap-2" disabled={form.formState.isSubmitting}>
          <Save className="size-4" aria-hidden={true} />
          Guardar cambios
        </Button>
      </form>
    </section>
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
