"use client";

import { UsersTab } from "@/components/admin/UsersTab";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useAuth } from "@/components/web3/AuthProvider";

export default function AdminUsersPage() {
  const { role } = useAuth();
  if (role !== "admin") {
    return (
      <div className="gate-card">
        <InlineAlert tone="warning">Admin access only</InlineAlert>
      </div>
    );
  }
  return <UsersTab />;
}
