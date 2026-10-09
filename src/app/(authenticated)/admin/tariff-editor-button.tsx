"use client";

import { ConfirmActionButton } from "./confirm-action-button";
import { updateTariffEditor } from "./actions";

export function TariffEditorButton({
  userId,
  userLabel,
  isEditor,
}: {
  userId: string;
  userLabel: string;
  isEditor: boolean;
}) {
  return isEditor ? (
    <ConfirmActionButton
      label="Revoke tariff editor"
      title="Revoke tariff editor"
      description={`Revoke the tariff editor permission from ${userLabel}? They'll no longer be able to change duty and fee data.`}
      confirmLabel="Revoke"
      onConfirm={() => updateTariffEditor(userId, false)}
    />
  ) : (
    <ConfirmActionButton
      label="Make tariff editor"
      title="Make tariff editor"
      description={`Make ${userLabel} a tariff editor? They'll be able to change duty and fee data, which every estimate uses.`}
      confirmLabel="Make tariff editor"
      onConfirm={() => updateTariffEditor(userId, true)}
    />
  );
}
