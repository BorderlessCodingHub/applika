"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { UserProfileView } from "@/components/profile/profile-view";
import { UserProfileEditForm } from "@/components/profile/edit-form";
import { useGeneralStats } from "@/hooks/use-statistics";
import { UserProfileSkeleton } from "@/components/profile/sub-components";

export function ProfilePage() {
  const [editing, setEditing] = useState(false);

  const { user } = useAuth();
  const stats = useGeneralStats();

  if (!user) return <UserProfileSkeleton />;

  if (editing)
    return (
      <UserProfileEditForm
        user={user}
        onSave={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );

  return (
    <UserProfileView
      user={user}
      userStats={stats.data}
      onEditClick={() => setEditing(true)}
    />
  );
}
