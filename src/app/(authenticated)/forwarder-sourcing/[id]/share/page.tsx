import { SharePage } from "../../../client-updates/share-page";

export default async function ForwarderSharePage({ params }: PageProps<"/forwarder-sourcing/[id]/share">) {
  const { id } = await params;
  return <SharePage kind="forwarder" projectId={id} />;
}
