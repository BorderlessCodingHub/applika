import Input from "@/components/ui/Input";
import {Button} from "@/components/ui/Button";

export default function ProfileForm() {
  return (
    <form className="space-y-4">
      <Input label="Full Name" placeholder="Enter your name" />
      <Input label="Email" type="email" placeholder="Enter your email" />
      <Button type="submit">Save</Button>
    </form>
  );
}
