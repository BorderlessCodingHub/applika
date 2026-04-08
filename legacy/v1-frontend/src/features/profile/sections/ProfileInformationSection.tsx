import ProfileForm from "../components/ProfileForm";
import ProfileCard from "../components/ProfileCard";

export default function ProfileInformationSection() {
  return (
    <ProfileCard title="Profile Information" icon="fa-user">
      <ProfileForm />
    </ProfileCard>
  );
}
