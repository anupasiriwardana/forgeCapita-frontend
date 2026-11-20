"use client";

import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError } from "@/lib/api";

interface ErrorPageProps {
  error: unknown;
  retry: () => void;
}

/** Route error boundary. Shows a safe generic message; server error details never reach the page. */
export default function ErrorPage({ error, retry }: ErrorPageProps): React.ReactElement {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
      <ErrorState
        title="This page could not be loaded"
        message="An unexpected error occurred. Please try again; if it keeps happening, contact support with the reference below."
        requestId={requestId}
        onRetry={retry}
      />
    </div>
  );
}
