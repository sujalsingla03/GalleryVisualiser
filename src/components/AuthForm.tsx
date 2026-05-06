import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useAuthStore } from '../store/authStore';

type Mode = 'sign-in' | 'sign-up' | 'magic-link';

export function AuthForm() {
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signUpWithPassword = useAuthStore((s) => s.signUpWithPassword);
  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    let result: { error: string | null };
    if (mode === 'sign-in') result = await signInWithPassword(email, password);
    else if (mode === 'sign-up') result = await signUpWithPassword(email, password);
    else result = await signInWithMagicLink(email);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (mode === 'magic-link') setInfo('Check your email for the magic link.');
    else if (mode === 'sign-up') setInfo('Account created. Check your email if confirmation is required.');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 'var(--font-size-lg)',
    fontFamily: 'inherit',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-button)',
    color: 'var(--text-primary)',
    marginBottom: 12,
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 16px',
    fontSize: 'var(--font-size-md)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    background: 'var(--color-accent)',
    color: 'var(--text-on-accent)',
    border: 'none',
    borderRadius: 'var(--radius-button)',
    cursor: 'pointer',
    fontWeight: 600,
    opacity: busy ? 0.6 : 1,
  };

  const linkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 'var(--font-size-md)',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center mb-6">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-medium)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          PinViz
        </h1>
        <p style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-secondary)' }}>
          {mode === 'sign-in' && 'Sign in to your spaces.'}
          {mode === 'sign-up' && 'Create an account.'}
          {mode === 'magic-link' && 'Sign in with a link.'}
        </p>
      </div>

      <FrostPanel style={{ width: 'min(420px, 90vw)', padding: 28 }}>
        <form onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
          />
          {mode !== 'magic-link' && (
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              style={inputStyle}
            />
          )}
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? '…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send link'}
          </button>

          {error && (
            <div style={{ color: 'var(--color-system-red)', fontSize: 'var(--font-size-md)', marginTop: 12 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-md)', marginTop: 12 }}>
              {info}
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {mode === 'sign-in' && (
              <>
                <button type="button" style={linkStyle} onClick={() => setMode('sign-up')}>
                  Create account
                </button>
                <button type="button" style={linkStyle} onClick={() => setMode('magic-link')}>
                  Magic link
                </button>
              </>
            )}
            {mode === 'sign-up' && (
              <button type="button" style={linkStyle} onClick={() => setMode('sign-in')}>
                ← Sign in instead
              </button>
            )}
            {mode === 'magic-link' && (
              <button type="button" style={linkStyle} onClick={() => setMode('sign-in')}>
                ← Use password
              </button>
            )}
          </div>
        </form>
      </FrostPanel>
    </div>
  );
}
