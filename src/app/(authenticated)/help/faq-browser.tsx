"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { faqModules, faqTag, groupFaq, type FaqFilter } from "@/lib/help/faq";
import { FAQ_ITEMS } from "./faq-items";
import { Faq } from "./help-parts";

// The FAQ grouped under one heading per module (navigation order), with a
// row of chips to show one module. The filter is client state only.
export function FaqBrowser() {
  const [filter, setFilter] = useState<FaqFilter>("all");
  const modules = faqModules(FAQ_ITEMS);
  const groups = groupFaq(FAQ_ITEMS, filter);

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Filter questions by module" className="flex flex-wrap gap-2">
        {(["all", ...modules] as const).map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={filter === option ? "default" : "outline"}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {option === "all" ? "All" : option}
          </Button>
        ))}
      </div>
      {/* Keyed by the filter, so open questions close when it changes. */}
      <div key={filter} className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.module} className="flex flex-col gap-2">
            <h3 className="font-display text-base font-semibold text-move-navy">{group.module}</h3>
            {group.items.map((item) => (
              <Faq key={item.id} question={item.question} tag={faqTag(item)}>
                {item.answer}
              </Faq>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
