import type { CSSProperties } from "react";
import { cx } from "@/components/ui/cx";

interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
  style?: CSSProperties;
}

/** Decorative loading placeholder; pair it with a visible or sr-only loading message. */
export function Skeleton({ width = "100%", height = 14, radius, className, style }: SkeletonProps): React.ReactElement {
  return <span aria-hidden="true" className={cx("skeleton", className)} style={{ width, height, borderRadius: radius, ...style }} />;
}
