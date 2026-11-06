"use client";

import { useEffect, useMemo } from "react";

/** A blob: URL for previewing a picked file, revoked when the file changes or on unmount. */
export function useObjectUrl(file: Blob | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
