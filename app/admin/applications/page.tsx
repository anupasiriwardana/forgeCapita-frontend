"use client";

import { ApplicationsTab } from "@/components/admin/ApplicationsTab";
import { useAuth } from "@/components/web3/AuthProvider";

export default function AdminApplicationsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <ApplicationsTab selfAddress={user.address} />;
}
