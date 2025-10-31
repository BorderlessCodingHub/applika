"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import AuthInput from "@/components/ui/AuthInput";
import AuthButton from "@/components/ui/AuthButton";
import AuthGitHubButton from "@/components/ui/AuthGitHubButton";
import { featureFlags } from "@/config/featureFlags";

export default function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const githubOnly = !featureFlags.EMAIL_LOGIN_ENABLED;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: call API
    setLoading(false);
  }

  if (githubOnly) {
    return (
      <motion.div
        className="flex flex-col gap-6 w-full max-w-md mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <AuthGitHubButton />
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-md mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <AuthInput
        name="email"
        type="email"
        placeholder="Email"
        value={form.email}
        onChange={handleChange}
        required
      />
      <AuthInput
        name="password"
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={handleChange}
        required
      />
      <AuthGitHubButton />
      <AuthButton
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2"
      >
        {loading ? "Signing In..." : "Sign In"}
        <ArrowRight size={18} className="ml-2" />
      </AuthButton>
    </motion.form>
  );
}
