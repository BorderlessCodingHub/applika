import { featureFlags } from "@/config/featureFlags";
import { redirect } from "next/navigation";
import AuthLayout from "@/components/ui/AuthLayout";
import RegisterForm from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  // Feature flag for controlling access to the Register page.
  if (!featureFlags.REGISTER_FEATURE_ENABLED) {
    redirect("/");
  }
  return (
    <AuthLayout
      title="Create Account"
      subtitle="Join Job Tracker to manage your applications"
    >
      <RegisterForm />
    </AuthLayout>
  );
}
