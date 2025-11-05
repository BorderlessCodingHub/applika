import AuthLayout from "@/components/ui/AuthLayout";
import LoginForm from "@/features/auth/LoginForm";
import Link from "next/link";
import { featureFlags } from "@/config/featureFlags";
import { appConfig } from "@/domain/constants/appConfig";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const access = cookieStore.get("__access")?.value ?? null;
  const refresh = cookieStore.get("__refresh")?.value ?? null;

  if (access || refresh) {
    console.log(
      "[LOGIN PAGE] Authenticated user trying to access login → redirecting to /dashboard"
    );
    redirect("/dashboard");
  }

  return (
    <AuthLayout title="Sign In" subtitle={appConfig.subtitle}>
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
