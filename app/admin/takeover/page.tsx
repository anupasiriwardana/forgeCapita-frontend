"use client";

import { TakeoverTab } from "@/components/admin/TakeoverTab";
import { useAuth } from "@/components/web3/AuthProvider";

export default function AdminTakeoverPage() {
  const { role } = useAuth();
  if (role !== "staff" && role !== "admin") return null;
  return <TakeoverTab role={role} />;
}
