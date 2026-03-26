import { User } from "@/services/types/users";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Skeleton } from "../ui/skeleton";

export function UserProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-6">
      <Skeleton className="h-52 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}

export function UserProfileAvatar({ user }: { user: User }) {
  const avatarUrl = `https://avatars.githubusercontent.com/u/${user.github_id}?v=4`;
  const avatarFallback =
    user.first_name && user.last_name
      ? user.first_name[0] + user.last_name[0]
      : user.username.substring(0, 2);

  return (
    <Avatar className="shadow-elevated h-20 w-20 ring-4 ring-card">
      <AvatarImage src={avatarUrl} />
      <AvatarFallback className="capitalize">{avatarFallback}</AvatarFallback>
    </Avatar>
  );
}

export function InfoItem({
  icon: Icon,
  label,
  value,
  tabular,
  capitalize,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tabular?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        <p
          className={`text-sm text-foreground ${tabular ? "tabular-nums" : ""} ${capitalize ? "capitalize" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
