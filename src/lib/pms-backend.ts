import { prisma } from "@/lib/prisma";
import { villas as villaContent } from "@/lib/villas";

export function isLocalPms(): boolean {
  return (process.env.PMS_BACKEND ?? "local").toLowerCase() !== "qloapps";
}

export function compatibilityRoomTypeId(slug: string): number | null {
  return villaContent.find((villa) => villa.slug === slug)?.qloRoomTypeId ?? null;
}

export async function findVillaByCompatibilityId(id: number) {
  const content = villaContent.find((villa) => villa.qloRoomTypeId === id);
  if (!content) return null;
  return prisma.villa.findUnique({ where: { slug: content.slug } });
}

export async function localRoomTypes() {
  const records = await prisma.villa.findMany({ orderBy: { pricePerNight: "asc" } });
  return records.flatMap((villa) => {
    const content = villaContent.find((item) => item.slug === villa.slug);
    if (!content) return [];
    return [{
      id: content.qloRoomTypeId,
      name: villa.name,
      description: content.description.id,
      pricePerNight: villa.pricePerNight,
      images: content.images,
    }];
  });
}
