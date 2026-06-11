const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const villas = [
  {
    slug: "taru-garden-villa",
    name: "Taru Garden Villa",
    pricePerNight: 4200000,
    maxGuests: 2,
    bedrooms: 1,
    sizeSqm: 120,
    totalUnits: 6,
  },
  {
    slug: "taru-river-villa",
    name: "Taru River Villa",
    pricePerNight: 6800000,
    maxGuests: 4,
    bedrooms: 2,
    sizeSqm: 210,
    totalUnits: 4,
  },
  {
    slug: "taru-sky-estate",
    name: "Taru Sky Estate",
    pricePerNight: 12500000,
    maxGuests: 6,
    bedrooms: 3,
    sizeSqm: 380,
    totalUnits: 2,
  },
];

async function main() {
  for (const villa of villas) {
    await prisma.villa.upsert({
      where: { slug: villa.slug },
      update: villa,
      create: villa,
    });
  }
  console.log("Seeded", villas.length, "villas");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
