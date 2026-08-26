import { redirect } from "next/navigation";

export default function SignInPage() {
  redirect("/auth/login?returnTo=%2Fhome");
}
