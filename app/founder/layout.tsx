"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";

const STAFF_ROUTES = ["/founder/launch", "/founder/launches"];

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const staff = role === "staff" || role === "admin";
  const investor = user !== null && !staff && role !== "founder";

  useEffect(() => {
    if (investor) router.replace("/apply");
  }, [investor, router]);

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
  } else if (role === "founder") {
    content = children;
  } else if (staff) {
    content = STAFF_ROUTES.includes(pathname) ? (
      children
    ) : (
      <div className="gate-card">
        <InlineAlert tone="warning">Founder tools are for founder accounts; staff are not gated.</InlineAlert>
      </div>
    );
  } else {
    content = (
      <div className="gate-card">
        <InlineAlert
          tone="warning"
          action={
            <ButtonLink href="/apply" variant="secondary" size="sm">
              Apply here
            </ButtonLink>
          }
        >
          You need an approved founder application first.
        </InlineAlert>
      </div>
    );
  }
  return <div className="page-container">{content}</div>;
}
