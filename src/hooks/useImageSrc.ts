import { useEffect, useState } from "react";
import { resolveImageSrc } from "@/lib/imageStore";

/** Resolve an image reference (idb blob or URL) to a displayable src. */
export function useImageSrc(ref?: string): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!ref) {
      setSrc(undefined);
      return;
    }
    resolveImageSrc(ref).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [ref]);
  return src;
}
