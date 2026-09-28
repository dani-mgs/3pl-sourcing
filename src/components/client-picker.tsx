"use client";

import { useId, useMemo, useState } from "react";
import {
  duplicateClientMessage,
  normalizeClientName,
  type ClientOption,
  type ClientSelection,
} from "@/lib/clients";

export type { ClientSelection };

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

// Picks the client a 3PL project belongs to: an existing shared client, or
// (when allowNew) a new one. Posts client_mode, client_id, new_client_name
// and new_client_business_model as hidden fields so it works inside any form.
export function ClientPicker({
  clients,
  value,
  onChange,
  allowNew,
  serverDuplicate,
}: {
  clients: ClientOption[];
  value: ClientSelection;
  onChange: (next: ClientSelection) => void;
  allowNew: boolean;
  serverDuplicate?: ClientOption | null;
}) {
  const idPrefix = useId();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeClientName(query);
    if (!q) return clients;
    return clients.filter((client) =>
      normalizeClientName(client.name).includes(q),
    );
  }, [clients, query]);

  const duplicate =
    value.mode === "new" && value.name.trim()
      ? (clients.find(
          (client) =>
            normalizeClientName(client.name) === normalizeClientName(value.name),
        ) ??
        (serverDuplicate &&
        normalizeClientName(serverDuplicate.name) ===
          normalizeClientName(value.name)
          ? serverDuplicate
          : null))
      : null;

  const selectedClient =
    value.mode === "existing"
      ? clients.find((client) => client.id === value.clientId)
      : undefined;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-display text-lg font-semibold text-move-navy">
        Which client?
      </legend>

      {allowNew && (
        <div role="radiogroup" aria-label="Client type" className="flex gap-2">
          {(
            [
              { mode: "existing", label: "Existing client" },
              { mode: "new", label: "New client" },
            ] as const
          ).map((option) => {
            const checked = value.mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() =>
                  onChange(
                    option.mode === "existing"
                      ? { mode: "existing", clientId: null }
                      : { mode: "new", name: query.trim(), businessModel: "" },
                  )
                }
                className={
                  checked
                    ? "rounded-full bg-move-green px-4 py-1.5 text-sm font-medium text-white"
                    : "rounded-full border border-neutral-border px-4 py-1.5 text-sm font-medium text-move-navy hover:border-move-green"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {value.mode === "existing" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${idPrefix}-search`} className="sr-only">
            Search clients
          </label>
          <input
            id={`${idPrefix}-search`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            className={`${fieldClass} sm:max-w-sm`}
          />

          {clients.length === 0 ? (
            <p className="text-sm text-neutral-muted">
              No clients yet.
              {allowNew && " Choose “New client” to add the first one."}
            </p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-muted">
              <span>No clients match “{query.trim()}”.</span>
              {allowNew && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      mode: "new",
                      name: query.trim(),
                      businessModel: "",
                    })
                  }
                  className="font-medium text-move-green hover:underline"
                >
                  Add “{query.trim()}” as a new client
                </button>
              )}
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="Clients"
              className="flex max-h-60 flex-col overflow-y-auto rounded-xl border border-neutral-border"
            >
              {filtered.map((client) => {
                const checked =
                  value.mode === "existing" && value.clientId === client.id;
                return (
                  <label
                    key={client.id}
                    className={
                      "flex cursor-pointer items-start gap-3 border-b border-neutral-border px-3 py-2 last:border-b-0 " +
                      (checked ? "bg-move-green/5" : "hover:bg-neutral-bg")
                    }
                  >
                    <input
                      type="radio"
                      name={`${idPrefix}-client`}
                      checked={checked}
                      onChange={() =>
                        onChange({ mode: "existing", clientId: client.id })
                      }
                      className="mt-0.5 size-4 accent-move-green"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-move-navy">
                        {client.name}
                      </span>
                      {client.business_model && (
                        <span className="text-xs text-neutral-muted">
                          {client.business_model}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {selectedClient && (
            <p className="text-xs text-neutral-muted">
              Selected: <span className="font-medium">{selectedClient.name}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-name`} className={labelClass}>
              Client Name
            </label>
            <input
              id={`${idPrefix}-name`}
              type="text"
              required
              value={value.name}
              onChange={(e) =>
                onChange({ ...value, name: e.target.value })
              }
              placeholder="e.g. Acme Corp"
              aria-describedby={duplicate ? `${idPrefix}-dup` : undefined}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-bm`} className={labelClass}>
              Business Model
            </label>
            <input
              id={`${idPrefix}-bm`}
              type="text"
              value={value.businessModel}
              onChange={(e) =>
                onChange({ ...value, businessModel: e.target.value })
              }
              placeholder="e.g. B2C DTC"
              className={fieldClass}
            />
          </div>

          {duplicate && (
            <div
              id={`${idPrefix}-dup`}
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-3 py-2 text-sm text-[#92400E] sm:col-span-2"
            >
              <span>{duplicateClientMessage(duplicate.name)}</span>
              <button
                type="button"
                onClick={() => {
                  // Drop any leftover search so the list shows the chosen
                  // client rather than "No clients match".
                  setQuery("");
                  onChange({ mode: "existing", clientId: duplicate.id });
                }}
                className="rounded-lg border border-[#FBBF24] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#FEF3C7]"
              >
                Use existing client
              </button>
            </div>
          )}
        </div>
      )}

      <input type="hidden" name="client_mode" value={value.mode} />
      <input
        type="hidden"
        name="client_id"
        value={value.mode === "existing" ? (value.clientId ?? "") : ""}
      />
      <input
        type="hidden"
        name="new_client_name"
        value={value.mode === "new" ? value.name : ""}
      />
      <input
        type="hidden"
        name="new_client_business_model"
        value={value.mode === "new" ? value.businessModel : ""}
      />
    </fieldset>
  );
}

// True when a "new client" selection would duplicate an existing client, so
// the form can refuse to submit before the server has to.
export function selectionDuplicates(
  selection: ClientSelection,
  clients: ClientOption[],
): boolean {
  return (
    selection.mode === "new" &&
    clients.some(
      (client) =>
        normalizeClientName(client.name) === normalizeClientName(selection.name),
    )
  );
}
