import AuthLayout from "@/components/ui/AuthLayout";
import LoginForm from "@/features/auth/LoginForm";
import Link from "next/link";
import { featureFlags } from "@/config/featureFlags";
import { DEFAULT_SUBTITLE } from "@/config/appConfig";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const isAuthenticated = await verifyAuth();
  if (isAuthenticated) redirect("/dashboard");
  
  return (
    <AuthLayout title="Sign In" subtitle={DEFAULT_SUBTITLE}>
      <LoginForm />
      {/* Hide "Don’t have an account?" text on v1 */}
      {featureFlags.EMAIL_LOGIN_ENABLED && (
        <p className="text-center text-white/60 mt-6">
          Don’t have an account?{" "}
          <Link
            href="/auth/register"
            className="text-emerald-400 font-semibold hover:underline"
          >
            Register here
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
