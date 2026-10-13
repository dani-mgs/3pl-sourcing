// Where each module's "Share update with client" page lives.
export type ShareKind = "forwarder" | "three_pl";

export function sharePath(kind: ShareKind, projectId: string): string {
  return kind === "forwarder" ? `/forwarder-sourcing/${projectId}/share` : `/3pl-sourcing/projects/${projectId}/share`;
}

export function projectPath(kind: ShareKind, projectId: string): string {
  return kind === "forwarder" ? `/forwarder-sourcing/${projectId}` : `/3pl-sourcing/projects/${projectId}`;
}

// "Publish Market Report" (forwarder projects only).
export function marketReportPath(projectId: string): string {
  return `/forwarder-sourcing/${projectId}/market-report`;
}
