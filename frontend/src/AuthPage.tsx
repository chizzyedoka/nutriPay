import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './lib/api';

export default function AuthPage() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setNotice('');
    try {
      await api(`/auth/${authMode === 'signin' ? 'login' : 'register'}`, { method: 'POST', body: { email, password } });
      navigate('/membership');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Unable to ${authMode === 'signin' ? 'sign in' : 'register'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-page">
    <header className="topbar"><div className="brand"><span className="brand-mark">n</span><span>nutri<span className="accent">pay</span></span></div><span className="text-link">Nutrition, without the guesswork</span></header>
    <section className="auth-layout">
      <div className="auth-intro"><p className="eyebrow">A clearer way to eat</p><h1>Know what is<br /><em>on your plate.</em></h1><p className="hero-text">Join NutriPay for precise portions, complete nutrition profiles, and meals designed to make everyday choices simpler.</p></div>
      <form className="signin auth-card" onSubmit={submitAuth}><p className="eyebrow">{authMode === 'signin' ? 'Welcome back' : 'Join NutriPay'}</p><h2>{authMode === 'signin' ? 'Your table awaits.' : 'Start your table.'}</h2><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></label><button className="outline-button" disabled={submitting}>{submitting ? 'Working...' : authMode === 'signin' ? 'Sign in' : 'Create account'} <span>↗</span></button><button type="button" className="auth-switch" onClick={() => { setAuthMode(authMode === 'signin' ? 'register' : 'signin'); setNotice(''); }}>{authMode === 'signin' ? 'Need an account? Register' : 'Already registered? Sign in'}</button>{notice && <p className="notice" role="alert">{notice}</p>}</form>
    </section>
    <footer><span>nutripay / 2026</span><span>Private nutrition guidance, made practical.</span></footer>
  </main>;
}
