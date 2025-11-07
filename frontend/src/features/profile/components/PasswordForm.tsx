import Input from "@/components/ui/Input";
import {Button} from "@/components/ui/Button";

export default function PasswordForm() {
  return (
    <form className="space-y-4">
      <Input label="Current Password" type="password" />
      <Input label="New Password" type="password" />
      <Button type="submit">Update Password</Button>
    </form>
  );
}
