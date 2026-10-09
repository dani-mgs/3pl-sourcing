"use client";

import { ConfirmActionButton } from "./confirm-action-button";
import { updateUserRole } from "./actions";

const COPY = {
  admin: {
    title: "Promote to Admin",
    description: (user: string) =>
      `Promote ${user} to Admin? They'll be able to manage users, edit and reassign everyone's projects, edit shared clients and change duty data.`,
    confirm: "Promote",
  },
  logistics_expert: {
    title: "Logistics Expert",
    description: (user: string) =>
      `Make ${user} a Logistics Expert? If they're an admin now, they lose Administration and admin rights on other people's projects.`,
    confirm: "Confirm",
  },
} as const;

export function RoleActionButton({
  userId,
  userLabel,
  newRole,
  label,
}: {
  userId: string;
  userLabel: string;
  newRole: "admin" | "logistics_expert";
  label: string;
}) {
  const copy = COPY[newRole];
  return (
    <ConfirmActionButton
      label={label}
      title={copy.title}
      description={copy.description(userLabel)}
      confirmLabel={copy.confirm}
      onConfirm={() => updateUserRole(userId, newRole)}
    />
  );
}
