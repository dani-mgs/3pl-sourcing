export type HubModule = {
  name: string;
  description: string;
  href: string | null;
};

export const APP_NAME = "MOVE Supply Chain Decision Hub";
export const APP_SHORT_NAME = "MOVE Decision Hub";

const LANDED_COST_MODULE = "Landed Cost Calculator";

// Every module, as listed when Landed Cost is off ("Soon"). Use hubModules()
// where the feature flag is known.
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
    description: "Estimate duties and tariffs on imported goods, and look up HTS codes.",
    href: "/tariff-calculator",
  },
  {
    name: LANDED_COST_MODULE,
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

// The modules with Landed Cost linked when its feature flag is on. Pure: the
// server reads the flag (isLandedCostEnabled) and passes the result down.
export function hubModules(landedCostEnabled: boolean): HubModule[] {
  return HUB_MODULES.map((module) =>
    module.name === LANDED_COST_MODULE && landedCostEnabled ? { ...module, href: "/landed-cost" } : module,
  );
}
