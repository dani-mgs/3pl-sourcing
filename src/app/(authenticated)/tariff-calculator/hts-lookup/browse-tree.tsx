"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import type { BrowseNode, LookupLine } from "@/lib/tariff/hts-lookup";
import { LineFacts } from "./hts-line";

function allIds(nodes: BrowseNode[]): string[] {
  return nodes.flatMap((n) => (n.children.length ? [n.id, ...allIds(n.children)] : []));
}

// A heading's lines as an indented tree; rows with children expand and
// collapse. Everything starts expanded.
export function BrowseTree({ nodes, onPick }: { nodes: BrowseNode[]; onPick: (line: LookupLine) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const buttonClass =
    "rounded text-xs font-medium text-move-navy outline-none hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green";

  function render(list: BrowseNode[], depth: number) {
    return (
      <ul className={depth === 0 ? "flex flex-col" : "flex flex-col border-l border-neutral-border pl-4"}>
        {list.map((node) => {
          const open = !collapsed.has(node.id);
          const hasChildren = node.children.length > 0;
          return (
            <li key={node.id}>
              <div className="flex items-start gap-2 rounded-lg py-1.5 pr-2">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(node.id)}
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${node.code ? formatHtsCode(node.code) : node.description}`}
                    className="mt-0.5 rounded text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
                  >
                    {open ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 text-sm text-move-navy">
                  {node.code ? (
                    <span className="mr-2 font-semibold whitespace-nowrap tabular-nums">{formatHtsCode(node.code)}</span>
                  ) : null}
                  <span className={node.code ? "" : "text-neutral-muted"}>{node.description}</span>
                  {node.line && <LineFacts line={node.line} onPick={onPick} />}
                </div>
              </div>
              {hasChildren && open && render(node.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <div className="mb-3 flex gap-4">
        <button type="button" className={buttonClass} onClick={() => setCollapsed(new Set())}>
          Expand all
        </button>
        <button type="button" className={buttonClass} onClick={() => setCollapsed(new Set(allIds(nodes).slice(1)))}>
          Collapse all
        </button>
      </div>
      {render(nodes, 0)}
    </div>
  );
}
