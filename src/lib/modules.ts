export type HubModule = {
  name: string;
  description: string;
  href: string | null;
};

export const APP_NAME = "MOVE Supply Chain Decision Hub";
export const APP_SHORT_NAME = "MOVE Decision Hub";

export const HUB_MODULES: HubModule[] = [
  {
    name: "3PL Sourcing",
    description: "Source, compare, and recommend 3PL partners for a client.",
    href: "/3pl-sourcing",
  },
  {
    name: "Forwarder Sourcing",
    description: "Source and compare freight forwarders.",
    href: "/forwarder-sourcing",
  },
  {
    name: "Tariff Calculator",
    description: "Estimate duties and tariffs on imported goods.",
    href: "/tariff-calculator",
  },
  {
    name: "Landed Cost Calculator",
    description: "Calculate the full landed cost of goods.",
    href: null,
  },
  {
    name: "3PL Audit",
    description: "Audit 3PL invoices against contracted rates.",
    href: null,
  },
  {
    name: "Forwarder Audit",
    description: "Audit forwarder invoices against quotes.",
    href: null,
  },
];
