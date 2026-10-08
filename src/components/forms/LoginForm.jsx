import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema } from '../../schemas/authSchemas';
import { signIn } from '../../services/authService';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { isConfigured } from '../../lib/env';
import { Field, Input } from '../ui/Field';
import { Button } from '../ui/Button';
import { ConfigMissing } from '../ui/Feedback';

export function LoginForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const login = useForm({ resolver: zodResolver(loginSchema) });

  async function onLogin({ email, password }) {
    setServerError('');
    const { profile, error } = await signIn(email, password);
    if (error) {
      setServerError('Invalid email or password.');
      return;
    }
    if (profile?.role !== 'admin') {
      toast.error('This account does not have administrator access.');
      return;
    }
    await refreshProfile();
    toast.success('Welcome back!');
    navigate('/admin', { replace: true });
  }

  if (!isConfigured) {
    return (
      <ConfigMissing
        message={
          'Admin login requires the API server with DATABASE_URL + JWT_SECRET configured, and an admin account created with `npm run create-admin -- you@example.com "Password123!"` (see README.md).'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={login.handleSubmit(onLogin)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required error={login.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...login.register('email')}
          />
        </Field>

        <Field label="Password" htmlFor="password" required error={login.formState.errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-10"
              {...login.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={login.formState.isSubmitting} className="w-full" size="lg">
          Sign in
        </Button>

        <p className="text-center text-xs text-stone-400 dark:text-stone-500">
          Forgot your password? Reset it from the terminal with{' '}
          <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
            npm run create-admin -- you@example.com "NewPassword123!"
          </code>
        </p>
      </form>
    </div>
  );
}
