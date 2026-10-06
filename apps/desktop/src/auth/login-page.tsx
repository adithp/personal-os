import { loginSchema } from '@personal-os/shared';
import { Button, GlassCard, Input } from '@personal-os/ui';
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react';
import { Navigate, useRouter } from '@tanstack/react-router';
import { useId, useState, type SyntheticEvent } from 'react';
import type { Auth } from './auth';
import { useAuthState } from './use-auth-state';

type FieldErrors = Partial<Record<'email' | 'password', string>>;

function Field({
  label,
  error,
  children,
  htmlFor,
  errorId,
}: {
  label: string;
  error: string | undefined;
  children: React.ReactNode;
  htmlFor: string;
  errorId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-small font-medium text-fg-secondary">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ConfigError({ issues }: { issues: string[] }) {
  return (
    <GlassCard className="flex w-full max-w-md flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <IconAlertTriangle size={22} className="text-danger" aria-hidden />
        <h1 className="text-section font-semibold text-fg">The app is not configured</h1>
      </div>
      <p className="text-body text-fg-secondary">
        Copy the desktop values from <code>.env.example</code> into <code>apps/desktop/.env</code>{' '}
        and fill them in, then restart the app.
      </p>
      <ul role="list" className="flex flex-col gap-1 text-small text-fg-muted">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </GlassCard>
  );
}

function LoginForm({ auth }: { auth: Auth }) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(undefined);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'password' ? 'password' : 'email';
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});

    setSubmitting(true);
    const result = await auth.signIn(parsed.data.email, parsed.data.password);
    // On success the auth state changes and this screen is replaced, so only failures land here.
    if (!result.ok) {
      setFormError(result.message);
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="flex w-full max-w-sm flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-tile bg-accent text-on-tile">
          <IconSparkles size={24} stroke={1.75} aria-hidden />
        </span>
        <div>
          <h1 className="text-page font-semibold text-fg">Sign in</h1>
          <p className="text-body text-fg-secondary">Personal OS</p>
        </div>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Email" htmlFor={emailId} error={errors.email} errorId={`${emailId}-error`}>
          <Input
            id={emailId}
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${emailId}-error` : undefined}
          />
        </Field>
        <Field
          label="Password"
          htmlFor={passwordId}
          error={errors.password}
          errorId={`${passwordId}-error`}
        >
          <Input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? `${passwordId}-error` : undefined}
          />
        </Field>

        {formError && (
          <p role="alert" className="text-small text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </GlassCard>
  );
}

/** Login screen: email and password, plus a clear message when the app has no Supabase settings. */
export function LoginPage() {
  const { auth } = useRouter().options.context;
  const status = useAuthState(auth, (state) => state.status);
  const issues = useAuthState(auth, (state) => state.configIssues);

  if (status === 'signedIn') return <Navigate to="/" replace />;

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-8 pt-10">
      {status === 'misconfigured' ? <ConfigError issues={issues} /> : <LoginForm auth={auth} />}
    </main>
  );
}
