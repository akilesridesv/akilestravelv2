import { cn } from "@/lib/utils";

/**
 * Official Akiles wordmark. Asset lives at /akiles-logo.png (charcoal, trimmed,
 * transparent background). Size it with a height class, e.g. <Logo className="h-6" />.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/akiles-logo.png"
      alt="Akiles"
      draggable={false}
      className={cn("h-6 w-auto select-none", className)}
    />
  );
}
