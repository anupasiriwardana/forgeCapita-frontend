"use client";

interface GlobalErrorProps {
  error: unknown;
  retry: () => void;
}

/** Last-resort fallback when the root layout fails; global styles are not loaded, so it is styled inline. */
export default function GlobalError({ retry }: GlobalErrorProps): React.ReactElement {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070908",
          color: "#f2f5f3",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <title>ForgeCapita - Error</title>
        <div role="alert">
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#a3ada9", marginBottom: 24 }}>ForgeCapita could not load. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "none",
              background: "#3ee08f",
              color: "#04140b",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
