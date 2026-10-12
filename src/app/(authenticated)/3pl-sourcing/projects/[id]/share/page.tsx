import { SharePage } from "../../../../client-updates/share-page";

export default async function ThreePlSharePage({ params }: PageProps<"/3pl-sourcing/projects/[id]/share">) {
  const { id } = await params;
  return <SharePage kind="three_pl" projectId={id} />;
}
