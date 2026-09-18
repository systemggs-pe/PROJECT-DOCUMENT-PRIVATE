import { zodResolver } from "@hookform/resolvers/zod";
import { Chrome, LockKeyhole, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { SystemFooter } from "@/components/layout/SystemFooter";
import { systemMetadata } from "@/config/system-metadata";
import { useAuthStore } from "@/stores/auth-store";

const loginSchema = z.object({
  email: z.email("Ingresa un email válido."),
  password: z.string().min(1, "Ingresa tu password."),
});

const resetRequestSchema = z.object({
  email: z.email("Ingresa un email válido."),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresa tu nombre."),
    email: z.email("Ingresa un email válido."),
    password: z.string().min(8, "Usa al menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirma tu password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Los passwords no coinciden.",
    path: ["confirmPassword"],
  });

type LoginForm = z.infer<typeof loginSchema>;
type ResetRequestForm = z.infer<typeof resetRequestSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">(window.location.pathname === "/register" ? "register" : "login");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const isConfigured = useAuthStore((state) => state.isConfigured);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const sendPasswordReset = useAuthStore((state) => state.sendPasswordReset);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });
  const resetRequestForm = useForm<ResetRequestForm>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: {
      email: "",
    },
  });
  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const isRegister = mode === "register";

  async function submitLogin(input: LoginForm) {
    setFormError(null);
    setFormSuccess(null);
    try {
      await signIn(input.email, input.password);
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    }
  }

  async function submitRegister(input: RegisterForm) {
    setFormError(null);
    setFormSuccess(null);
    try {
      await signUp({ name: input.name, email: input.email, password: input.password });
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo crear la cuenta.");
    }
  }

  async function continueWithGoogle() {
    setFormError(null);
    setFormSuccess(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Google no está disponible.");
    }
  }

  async function submitPasswordReset(input: ResetRequestForm) {
    setFormError(null);
    setFormSuccess(null);
    try {
      await sendPasswordReset(input.email);
      setFormSuccess("Te enviamos un correo para restablecer tu contraseña.");
      resetRequestForm.reset({ email: input.email });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo enviar el correo de recuperación.");
    }
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setFormError(null);
    setFormSuccess(null);
    window.history.replaceState(null, "", nextMode === "login" ? "/login" : "/register");
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[var(--surface)] text-[var(--ink)] lg:grid-cols-[minmax(0,1fr)_480px]">
      <section className="flex min-h-[38vh] flex-col justify-between border-b border-[var(--line)] bg-[var(--ink)] p-6 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:p-10">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-white text-sm font-black text-[var(--ink)]">
            GGS
          </div>
          <div>
            <p className="text-lg font-semibold">Document Studio</p>
            <p className="text-sm text-white/70">{systemMetadata.poweredBy} · v{systemMetadata.version}</p>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="text-sm uppercase tracking-[0.18em] text-white/55">GGS Document Studio</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
            Acceso seguro al estudio documental.
          </h1>
          <p className="mt-5 text-base leading-7 text-white/72">
            La sesión vive en Supabase Auth; la autorización real se aplica en NestJS con ownership por usuario.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <p className="text-sm text-[var(--muted)]">{isRegister ? "Crear cuenta" : "Iniciar sesión"}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal">GGS Document Studio</h2>
          </div>

          {!isConfigured ? (
            <div className="mb-5 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--muted)]">
              Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación real.
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

          {isRegister ? (
            <form className="grid gap-4" onSubmit={registerForm.handleSubmit(submitRegister)}>
              <Field label="Nombre" error={registerForm.formState.errors.name?.message}>
                <input {...registerForm.register("name")} autoComplete="name" className={inputClassName} />
              </Field>
              <Field label="Email" error={registerForm.formState.errors.email?.message}>
                <input {...registerForm.register("email")} autoComplete="email" className={inputClassName} />
              </Field>
              <Field label="Password" error={registerForm.formState.errors.password?.message}>
                <input {...registerForm.register("password")} type="password" autoComplete="new-password" className={inputClassName} />
              </Field>
              <Field label="Confirmar password" error={registerForm.formState.errors.confirmPassword?.message}>
                <input
                  {...registerForm.register("confirmPassword")}
                  type="password"
                  autoComplete="new-password"
                  className={inputClassName}
                />
              </Field>
              <Button type="submit" className="h-11 gap-2" disabled={!isConfigured || registerForm.formState.isSubmitting}>
                <UserPlus className="size-4" aria-hidden={true} />
                Crear cuenta
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <form className="grid gap-4" onSubmit={loginForm.handleSubmit(submitLogin)}>
                <Field label="Email" error={loginForm.formState.errors.email?.message}>
                  <input {...loginForm.register("email")} autoComplete="email" className={inputClassName} />
                </Field>
                <Field label="Password" error={loginForm.formState.errors.password?.message}>
                  <input {...loginForm.register("password")} type="password" autoComplete="current-password" className={inputClassName} />
                </Field>
                <Button type="submit" className="h-11 gap-2" disabled={!isConfigured || loginForm.formState.isSubmitting}>
                  <LogIn className="size-4" aria-hidden={true} />
                  Iniciar sesión
                </Button>
              </form>

              <form className="grid gap-3 border-t border-[var(--line)] pt-4" onSubmit={resetRequestForm.handleSubmit(submitPasswordReset)}>
                <Field label="Email para recuperación" error={resetRequestForm.formState.errors.email?.message}>
                  <input {...resetRequestForm.register("email")} autoComplete="email" className={inputClassName} />
                </Field>
                <Button
                  type="submit"
                  variant="ghost"
                  className="h-10 w-full border border-[var(--line)]"
                  disabled={!isConfigured || resetRequestForm.formState.isSubmitting}
                >
                  Olvidé mi contraseña
                </Button>
              </form>
            </div>
          )}

          <Button type="button" variant="ghost" className="mt-3 h-11 w-full gap-2 border border-[var(--line)]" onClick={continueWithGoogle} disabled={!isConfigured}>
            <Chrome className="size-4" aria-hidden={true} />
            Continuar con Google
          </Button>

          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-[var(--muted)]">
              <LockKeyhole className="size-4" aria-hidden={true} />
              Supabase Auth
            </span>
            <button
              type="button"
              className="font-medium text-[var(--accent)]"
              onClick={() => switchMode(isRegister ? "login" : "register")}
            >
              {isRegister ? "Ya tengo cuenta" : "Crear cuenta"}
            </button>
          </div>
        </div>
        <SystemFooter compact showSupportLink={false} />
      </section>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
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
