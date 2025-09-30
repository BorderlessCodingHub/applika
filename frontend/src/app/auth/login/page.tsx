import AuthLayout from '@/components/ui/AuthLayout';
import LoginForm from '@/features/auth/LoginForm';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <AuthLayout title="Sign In" subtitle="Welcome back to Job Tracker">
      <LoginForm />
      <p className="text-center text-white/60 mt-6">
        Don’t have an account?{' '}
        <Link href="/auth/register" className="text-emerald-400 font-semibold hover:underline">
          Register here
        </Link>
      </p>
    </AuthLayout>
  );
}
