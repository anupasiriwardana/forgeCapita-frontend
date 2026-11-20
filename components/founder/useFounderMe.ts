"use client";

import { useEffect, useState } from "react";
import { describeFounderError, fetchFounderMe, type FounderMeDto } from "@/lib/api";

interface FounderMeState {
  me: FounderMeDto | null;
  error: string;
  reload: () => void;
}

export function useFounderMe(): FounderMeState {
  const [me, setMe] = useState<FounderMeDto | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchFounderMe(signal)
      .then((data) => {
        if (signal.aborted) return;
        setMe(data);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load founder status"));
      });
    return () => controller.abort();
  }, [reloadKey]);

  return { me, error, reload: () => setReloadKey((k) => k + 1) };
}
