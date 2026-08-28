import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-1 text-sm">
      <button
        type="button"
        aria-label="Anterior"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition enabled:hover:bg-accent disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-muted-foreground">
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        aria-label="Siguiente"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition enabled:hover:bg-accent disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
