"use client";

import { useEffect } from "react";

export function RecapVisitMarker() {
  useEffect(() => {
    void fetch("/api/recap/visit", {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      // Non-critical bookkeeping. The recap should never fail because this did.
    });
  }, []);

  return null;
}
