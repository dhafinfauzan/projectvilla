import { notFound } from "next/navigation";
import { getVilla, villas } from "@/lib/villas";
import VillaDetail from "./VillaDetail";

export function generateStaticParams() {
  return villas.map((v) => ({ slug: v.slug }));
}

export default async function VillaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const villa = getVilla(slug);
  if (!villa) notFound();

  return <VillaDetail villa={villa} />;
}
