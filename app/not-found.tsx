import { Compass, Home, LayoutGrid } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound(): React.ReactElement {
  return (
    <div className="hero-glow" style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 52,
          height: 52,
          borderRadius: "var(--r-lg)",
          background: "var(--accent-soft)",
          color: "var(--accent)",
          marginBottom: 20,
        }}
      >
        <Compass size={24} />
      </span>
      <p className="num" style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>
        Error 404
      </p>
      <h1 style={{ fontSize: 30, marginBottom: 12 }}>Page not found</h1>
      <p style={{ fontSize: 15, color: "var(--text-2)", marginBottom: 32 }}>
        The page you are looking for does not exist or has moved.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <ButtonLink href="/" leftIcon={<Home size={16} aria-hidden="true" />}>
          Go home
        </ButtonLink>
        <ButtonLink href="/projects" variant="secondary" leftIcon={<LayoutGrid size={16} aria-hidden="true" />}>
          Browse projects
        </ButtonLink>
      </div>
    </div>
  );
}
