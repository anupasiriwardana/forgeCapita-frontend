"use client";

import { UsersTab } from "@/components/admin/UsersTab";
import { useAuth } from "@/components/web3/AuthProvider";

export default function AdminUsersPage() {
  const { role } = useAuth();
  if (role !== "admin") return <div className="alert alert-warning">Admin access only</div>;
  return <UsersTab />;
}
