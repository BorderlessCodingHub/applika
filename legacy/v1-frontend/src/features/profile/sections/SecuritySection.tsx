import PasswordForm from "../components/PasswordForm";
import ProfileCard from "../components/ProfileCard";

export default function SecuritySection() {
  return (
    <ProfileCard title="Security" icon="fa-lock">
      <PasswordForm />
    </ProfileCard>
  );
}
