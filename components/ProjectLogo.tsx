"use client";

import { useEffect, useRef, useState } from "react";

interface ProjectLogoProps {
  name: string;
  logoUrl?: string | null;
}

/** Fixed-size project logo; decorative (the name is always next to it) and falls back to the initial on load error. */
export function ProjectLogo({ name, logoUrl }: ProjectLogoProps): React.ReactElement {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // A server-rendered image can fail before hydration attaches onError; detect that once mounted.
    const img = imgRef.current;
    if (!logoUrl || !img || !img.complete || img.naturalWidth > 0) return;
    const timer = setTimeout(() => setFailedUrl(logoUrl), 0);
    return () => clearTimeout(timer);
  }, [logoUrl]);

  return (
    <div className="project-logo" aria-hidden="true">
      {logoUrl && failedUrl !== logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={imgRef} src={logoUrl} alt="" onError={() => setFailedUrl(logoUrl)} />
      ) : (
        <span>{(name || "P").charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}
