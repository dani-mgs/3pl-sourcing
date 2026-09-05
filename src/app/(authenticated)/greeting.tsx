"use client";

import { useSyncExternalStore } from "react";

const ENGLISH_WEIGHT = 0.65;

const INTERNATIONAL_GREETINGS = ["Aloha", "Bonjour", "Ciao", "Namaste"];

function getTimeGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function computeGreeting(): string {
  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const timeGreeting = getTimeGreeting(hour);

  if (Math.random() < ENGLISH_WEIGHT) {
    const options = [timeGreeting, "Welcome back", "Hey", "Good to see you"];
    return options[Math.floor(Math.random() * options.length)];
  }

  const options = isMorning
    ? [...INTERNATIONAL_GREETINGS, "Ohayo"]
    : INTERNATIONAL_GREETINGS;
  return options[Math.floor(Math.random() * options.length)];
}

// Computed once per page load (not per render) so the greeting stays put
// across re-renders instead of re-rolling randomly every time.
let cachedGreeting: string | null = null;

function subscribe() {
  return () => {};
}

function getClientSnapshot(): string {
  if (cachedGreeting === null) {
    cachedGreeting = computeGreeting();
  }
  return cachedGreeting;
}

// The greeting depends on the viewer's local time and randomness, neither of
// which the server can know — render nothing until the client snapshot is
// available (useSyncExternalStore's documented pattern for this exact case)
// rather than setting state in an effect, which would recompute per render.
function getServerSnapshot(): null {
  return null;
}

export function Greeting({ displayName }: { displayName: string }) {
  const greeting = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  return (
    <span className="truncate text-sm font-light text-white/60">
      {greeting ? `${greeting}, ${displayName}` : displayName}
    </span>
  );
}
