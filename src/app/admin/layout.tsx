import M2AppLayout from "@/app/(app)/layout";
import { AdminNav } from "@/components/admin/admin-nav";

/** Admin uses the same verified SocialOlla shell as customer routes. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <M2AppLayout>
      <div className="mb-6">
        <AdminNav />
      </div>
      {children}
    </M2AppLayout>
  );
}
