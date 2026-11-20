"use client";

import { LogIn } from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signIn } = useAuth();
  let content: React.ReactNode;
  if (loading && !user) {
    content = (
      <div className="gate-loading" role="status">
        <Spinner size={16} />
        Loading…
      </div>
    );
  } else if (!user) {
    content = (
      <Card className="gate-card">
        <EmptyState
          icon={<LogIn size={20} />}
          title="Please sign in"
          action={<Button onClick={() => void signIn()}>Sign in</Button>}
        />
      </Card>
    );
  } else if (role !== "staff" && role !== "admin") {
    content = (
      <div className="gate-card">
        <InlineAlert tone="warning">Staff access only</InlineAlert>
      </div>
    );
  } else {
    content = children;
  }
  return <div className="page-container">{content}</div>;
}
