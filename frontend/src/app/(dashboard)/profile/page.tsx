"use client";

import { redirect } from "next/navigation";
import FlashMessages from "@/features/profile/components/FlashMessages";
import { useProfile } from "@/features/profile/hooks/userProfile";
import ProfileInformationSection from "@/features/profile/sections/ProfileInformationSection";
import SecuritySection from "@/features/profile/sections/SecuritySection";
import ActionsSection from "@/features/profile/sections/ActionSection";

// Feature flag for controlling access to the Profile page.
const PROFILE_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_PROFILE_FEATURE === "true";

export default function ProfilePage() {
  if (!PROFILE_FEATURE_ENABLED) {
    redirect("/");
  }

  const { flashMessage, showMessage, clearMessage } = useProfile();

  return (
    <div className="min-h-screen w-full p-6 flex flex-col items-center bg-gradient-to-br from-gray-900 to-black text-white">
      <div className="w-full max-w-4xl">
        <h3 className="text-2xl font-bold text-center mb-6">User Profile</h3>

        {flashMessage && (
          <FlashMessages
            category={flashMessage.category}
            message={flashMessage.message}
            onClose={clearMessage}
          />
        )}

        <ProfileInformationSection />
        <SecuritySection />
        <ActionsSection />
      </div>
    </div>
  );
}
