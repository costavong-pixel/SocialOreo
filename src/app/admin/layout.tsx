import M2AppLayout from "@/app/(app)/layout";

/** Admin uses the same verified SocialOlla shell as customer routes. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <M2AppLayout>{children}</M2AppLayout>;
}
