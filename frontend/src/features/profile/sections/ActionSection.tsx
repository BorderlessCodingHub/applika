import AccountActions from "../components/AccountActions";
import ProfileCard from "../components/ProfileCard";

export default function ActionsSection() {
  return (
    <ProfileCard title="Account Actions" icon="fa-cog">
      <AccountActions />
    </ProfileCard>
  );
}
