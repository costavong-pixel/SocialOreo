import { redirect } from "next/navigation";

export default function SignUpPage() {
  redirect("/auth/login?screen_hint=signup");
}
