"use client";

import { useSyncExternalStore } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function format(date: Date, utc: boolean): string {
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day = utc ? date.getUTCDate() : date.getDate();
  return `${MONTHS[month]} ${day}`;
}

const subscribe = () => () => {};

// A timestamp shown as a date in the viewer's own timezone. The server (and
// hydration) render the UTC date so the HTML matches; the browser then
// renders the local date.
export function LocalDate({ timestamp }: { timestamp: string }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <time dateTime={timestamp}>{format(new Date(timestamp), !inBrowser)}</time>;
}
