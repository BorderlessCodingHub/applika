import AuthLayout from '@/components/ui/AuthLayout';
import RegisterForm from '@/features/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <AuthLayout title="Create Account" subtitle="Join Job Tracker to manage your applications">
      <RegisterForm />
    </AuthLayout>
  );
}
