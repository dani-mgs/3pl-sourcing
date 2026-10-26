"use client";

import { secondaryButtonClass } from "../../styles";

export function PrintButton() {
  return (
    <button type="button" className={secondaryButtonClass} onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
