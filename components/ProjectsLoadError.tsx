"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";

/** Error state for server-rendered project lists; retry re-runs the server component. */
export function ProjectsLoadError({ message }: { message: string }): React.ReactElement {
  const router = useRouter();
  return <ErrorState title="Projects are unavailable right now" message={message} onRetry={() => router.refresh()} />;
}
