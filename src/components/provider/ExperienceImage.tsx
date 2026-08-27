import { useImageSrc } from "@/hooks/useImageSrc";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";

/** Renders an experience image from a ref, with a graceful placeholder. */
export function ExperienceImage({
  imageRef,
  className,
  alt = "",
}: {
  imageRef?: string;
  className?: string;
  alt?: string;
}) {
  const src = useImageSrc(imageRef);
  if (!src)
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground/40",
          className
        )}
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}
