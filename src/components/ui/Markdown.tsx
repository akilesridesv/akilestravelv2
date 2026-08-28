import * as React from "react";

// Lightweight markdown for AI replies: **bold**, *italic*, # headings, and
// numbered/bulleted lists. Keeps chat + concierge readable without a heavy dep.

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    const k = `${keyBase}-${i}`;
    const b = part.match(/^\*\*([^*]+)\*\*$/);
    if (b) return <strong key={k}>{b[1]}</strong>;
    const it = part.match(/^\*([^*]+)\*$/);
    if (it) return <em key={k}>{it[1]}</em>;
    return <span key={k}>{part}</span>;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i} className="pl-1">
        {renderInline(it, `li-${blocks.length}-${i}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`b${blocks.length}`} className="ml-4 list-decimal space-y-1 marker:text-muted-foreground">
          {items}
        </ol>
      ) : (
        <ul key={`b${blocks.length}`} className="ml-4 list-disc space-y-1 marker:text-muted-foreground">
          {items}
        </ul>
      )
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      // A blank line inside a list is kept as-is (don't split consecutive items,
      // otherwise every numbered item restarts at "1.").
      if (!list) flush();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push(
        <p key={`b${blocks.length}`} className="mt-1 font-semibold text-foreground">
          {renderInline(heading[1], `h${blocks.length}`)}
        </p>
      );
      continue;
    }
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ol) {
      if (!list || !list.ordered) {
        flush();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[2]);
      continue;
    }
    if (ul) {
      if (!list || list.ordered) {
        flush();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    flush();
    blocks.push(<p key={`b${blocks.length}`}>{renderInline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}
