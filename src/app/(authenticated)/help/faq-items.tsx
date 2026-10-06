import type { FaqItem } from "@/lib/help/faq";
import { FORWARDER_AND_GENERAL_FAQ } from "./faq-items-forwarder";
import { TARIFF_FAQ } from "./faq-items-tariff";

// Every FAQ item; each has a module (required by the type) and may name a
// page. The order here is the order inside a module.
export const FAQ_ITEMS: FaqItem[] = [...FORWARDER_AND_GENERAL_FAQ, ...TARIFF_FAQ];
