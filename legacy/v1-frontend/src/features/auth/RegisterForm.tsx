'use client';
import { useState } from 'react';
import AuthInput from '@/components/ui/AuthInput';
import AuthButton from '@/components/ui/AuthButton';

export default function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: '', email: '', password: '', confirmPassword: '',
    firstName: '', lastName: '', currentCompany: '',
    currentSalary: '', experienceYears: '', techStack: ''
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return;
    setLoading(true);
    // TODO: API call
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 px-4 sm:px-0">
      <h3 className="text-white text-lg sm:text-xl font-semibold pb-1 sm:border-b sm:border-white/20 mb-4 sm:mb-6">
        Required Information
      </h3>

      <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
        <AuthInput
          name="username"
          placeholder="Username *"
          value={form.username}
          onChange={handleChange}
          required
        />
        <AuthInput
          name="email"
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={handleChange}
          required
        />
        <AuthInput
          name="password"
          type="password"
          placeholder="Password * (min 6 chars)"
          value={form.password}
          onChange={handleChange}
          required
          minLength={6}
        />
        <AuthInput
          name="confirmPassword"
          type="password"
          placeholder="Confirm Password *"
          value={form.confirmPassword}
          onChange={handleChange}
          required
        />
      </div>

      <h3 className="text-white text-lg sm:text-xl font-semibold pb-1 sm:border-b sm:border-white/20 mt-6 mb-4 sm:mb-6">
        Personal Information (Optional)
      </h3>

      <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
        <AuthInput name="firstName" placeholder="First Name" value={form.firstName} onChange={handleChange} />
        <AuthInput name="lastName" placeholder="Last Name" value={form.lastName} onChange={handleChange} />
        <AuthInput name="currentCompany" placeholder="Current Company" value={form.currentCompany} onChange={handleChange} />
        <AuthInput name="currentSalary" type="number" placeholder="Current Salary (k)" value={form.currentSalary} onChange={handleChange} />
        <AuthInput name="experienceYears" type="number" placeholder="Years of Experience" value={form.experienceYears} onChange={handleChange} />
        <AuthInput name="techStack" placeholder="Tech Stack (e.g., Python, React)" value={form.techStack} onChange={handleChange} />
      </div>

      <AuthButton type="submit" disabled={loading}>
        {loading ? 'Creating Account...' : 'Create Account'}
      </AuthButton>
    </form>
  );
}
