import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading(): React.ReactElement {
  return (
    <div role="status" aria-live="polite" style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px" }}>
      <span className="sr-only">Loading</span>
      <Skeleton width={220} height={28} style={{ marginBottom: 12 }} />
      <Skeleton width={360} height={14} style={{ marginBottom: 32 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={96} radius="var(--r-md)" />
        ))}
      </div>
    </div>
  );
}
