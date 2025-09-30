'use client';
import { useState } from 'react';
import AuthInput from '@/components/ui/AuthInput';
import AuthButton from '@/components/ui/AuthButton';

export default function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: call API
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AuthInput name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
      <AuthInput name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
      <AuthButton type="submit" disabled={loading}>
        {loading ? 'Signing In...' : 'Sign In'}
      </AuthButton>
    </form>
  );
}
