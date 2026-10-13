// Staff-facing wording shared by the Publish confirm dialog and /help.
export const PUBLISH_CONFIRM =
  "Published updates can't be edited. To correct one, publish a new one; ask an admin to remove one that was a mistake.";

// Shown when a project's client is changed after an update was published to
// it (the database refuses: refuse_client_change_after_publish).
export const CLIENT_FIXED_AFTER_PUBLISH =
  "Updates for this project have been shared with its client, so its client can't be changed. If it's linked to the wrong client, ask an admin to remove the shared updates first.";

// The Publish Market Report confirm dialog and /help.
export const REPORT_PUBLISH_CONFIRM =
  "Published reports can't be edited. To correct one, publish a new one (the client only ever sees the latest); ask an admin to remove one that was a mistake.";

// Who sees a Market Report.
export function reportAudienceText(clientName: string, paid: boolean, validUntil: string | null): string {
  return paid
    ? `Only clients on the Market Report plan see this. ${clientName} is on the Market Report plan${validUntil ? ` (until ${validUntil})` : ""}, so they'll see it in their portal as soon as you publish.`
    : `Only clients on the Market Report plan see this. ${clientName} is on the Free plan, so they won't see it unless they move to the Market Report plan.`;
}
