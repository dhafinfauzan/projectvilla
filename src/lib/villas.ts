export type VillaContent = {
  slug: string;
  /**
   * QloApps room_type id this villa maps to (backend is QloApps; the rich
   * marketing content here stays custom). Adjust these to match the real
   * room_type ids in your QloApps install — confirm via GET /api/room-types.
   */
  qloRoomTypeId: number;
  name: string;
  tagline: { en: string; id: string };
  description: { en: string; id: string };
  longDescription: { en: string; id: string };
  pricePerNight: number; // IDR
  maxGuests: number;
  bedrooms: number;
  sizeSqm: number;
  features: { en: string; id: string }[];
  heroImage: string;
  images: string[];
};

const u = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const villas: VillaContent[] = [
  {
    slug: "taru-garden-villa",
    qloRoomTypeId: 1,
    name: "Taru Garden Villa",
    tagline: {
      en: "A private sanctuary wrapped in tropical gardens",
      id: "Sanktuari privat berbalut taman tropis",
    },
    description: {
      en: "One-bedroom villa with a private plunge pool, hidden among frangipani trees and lush heliconia gardens.",
      id: "Villa satu kamar dengan kolam renang privat, tersembunyi di antara pohon kamboja dan taman heliconia yang rimbun.",
    },
    longDescription: {
      en: "The Taru Garden Villa is an intimate retreat designed for couples seeking stillness. Floor-to-ceiling glass walls dissolve the boundary between the air-conditioned bedroom and your own walled garden, where a four-metre plunge pool waits beneath the frangipani. Mornings begin with a floating breakfast; evenings end with the sound of cicadas and the scent of incense from the villa's private shrine.",
      id: "Taru Garden Villa adalah peristirahatan intim yang dirancang untuk pasangan yang mencari ketenangan. Dinding kaca dari lantai ke langit-langit meleburkan batas antara kamar tidur dan taman privat Anda, di mana kolam sepanjang empat meter menanti di bawah pohon kamboja. Pagi dimulai dengan floating breakfast; malam ditutup dengan suara jangkrik dan aroma dupa dari pelinggih privat villa.",
    },
    pricePerNight: 4200000,
    maxGuests: 2,
    bedrooms: 1,
    sizeSqm: 120,
    features: [
      { en: "Private plunge pool", id: "Kolam renang privat" },
      { en: "Walled tropical garden", id: "Taman tropis privat" },
      { en: "King-size canopy bed", id: "Tempat tidur kanopi king-size" },
      { en: "Outdoor rain shower", id: "Shower hujan outdoor" },
      { en: "Daily floating breakfast", id: "Floating breakfast setiap hari" },
      { en: "Butler service", id: "Layanan butler" },
    ],
    heroImage: u("photo-1582719508461-905c673771fd"),
    images: [
      u("photo-1582719508461-905c673771fd"),
      u("photo-1590490360182-c33d57733427"),
      u("photo-1540541338287-41700207dee6"),
      u("photo-1571896349842-33c89424de2d"),
    ],
  },
  {
    slug: "taru-river-villa",
    qloRoomTypeId: 2,
    name: "Taru River Villa",
    tagline: {
      en: "Two bedrooms above the sacred Ayung river",
      id: "Dua kamar di atas sungai Ayung yang sakral",
    },
    description: {
      en: "Two-bedroom villa perched on the river valley's edge, with an infinity pool that pours into the jungle canopy.",
      id: "Villa dua kamar di tepi lembah sungai, dengan infinity pool yang seolah tumpah ke kanopi hutan.",
    },
    longDescription: {
      en: "Suspended above the Ayung river gorge, the Taru River Villa offers the resort's most dramatic vantage. Two pavilion bedrooms flank an open-air living bale, and an eight-metre infinity pool traces the cliff line. Fall asleep to the river's murmur; wake to mist rising through ancient banyan trees. Ideal for families or two couples travelling together.",
      id: "Menggantung di atas ngarai sungai Ayung, Taru River Villa menawarkan pemandangan paling dramatis di resor. Dua paviliun kamar tidur mengapit bale ruang keluarga terbuka, dan infinity pool sepanjang delapan meter mengikuti garis tebing. Tertidur dengan gemericik sungai; terbangun dengan kabut yang naik di antara pohon beringin tua. Ideal untuk keluarga atau dua pasangan.",
    },
    pricePerNight: 6800000,
    maxGuests: 4,
    bedrooms: 2,
    sizeSqm: 210,
    features: [
      { en: "8m infinity pool", id: "Infinity pool 8 meter" },
      { en: "River valley view", id: "Pemandangan lembah sungai" },
      { en: "Open-air living bale", id: "Bale ruang keluarga terbuka" },
      { en: "Two pavilion bedrooms", id: "Dua paviliun kamar tidur" },
      { en: "Private dining pavilion", id: "Paviliun makan privat" },
      { en: "Butler & private chef on request", id: "Butler & koki privat sesuai permintaan" },
    ],
    heroImage: u("photo-1571896349842-33c89424de2d"),
    images: [
      u("photo-1571896349842-33c89424de2d"),
      u("photo-1578683010236-d716f9a3f461"),
      u("photo-1566073771259-6a8506099945"),
      u("photo-1544644181-1484b3fdfc62"),
    ],
  },
  {
    slug: "taru-sky-estate",
    qloRoomTypeId: 3,
    name: "Taru Sky Estate",
    tagline: {
      en: "The crown of the resort — panoramic jungle estate",
      id: "Mahkota resor — estate dengan panorama hutan",
    },
    description: {
      en: "Three-bedroom hilltop estate with a 15-metre pool, private spa room, and 270° views over the Ubud canopy.",
      id: "Estate tiga kamar di puncak bukit dengan kolam 15 meter, ruang spa privat, dan pemandangan 270° kanopi Ubud.",
    },
    longDescription: {
      en: "The Taru Sky Estate occupies the resort's highest ridge — a private compound of three bedroom pavilions, a glass-walled living house, a 15-metre lap pool, and a dedicated spa room with two treatment beds. A full-time butler team, private chef, and chauffeured car are included. Sunrise over the Campuhan ridge from your pool deck is the resort's most photographed moment.",
      id: "Taru Sky Estate menempati punggung bukit tertinggi resor — kompleks privat berisi tiga paviliun kamar tidur, rumah keluarga berdinding kaca, kolam 15 meter, dan ruang spa khusus dengan dua tempat perawatan. Tim butler penuh waktu, koki privat, dan mobil dengan sopir sudah termasuk. Matahari terbit di atas punggung bukit Campuhan dari dek kolam Anda adalah momen paling difoto di resor ini.",
    },
    pricePerNight: 12500000,
    maxGuests: 6,
    bedrooms: 3,
    sizeSqm: 380,
    features: [
      { en: "15m private lap pool", id: "Kolam privat 15 meter" },
      { en: "270° jungle panorama", id: "Panorama hutan 270°" },
      { en: "Private spa room", id: "Ruang spa privat" },
      { en: "Full-time butler team", id: "Tim butler penuh waktu" },
      { en: "Private chef included", id: "Termasuk koki privat" },
      { en: "Chauffeured car included", id: "Termasuk mobil dengan sopir" },
    ],
    heroImage: u("photo-1613977257363-707ba9348227"),
    images: [
      u("photo-1613977257363-707ba9348227"),
      u("photo-1613490493576-7fde63acd811"),
      u("photo-1611892440504-42a792e24d32"),
      u("photo-1600596542815-ffad4c1539a9"),
    ],
  },
];

export const getVilla = (slug: string) => villas.find((v) => v.slug === slug);

export const siteImages = {
  hero: [
    u("photo-1537996194471-e657df975ab4", 2000),
    u("photo-1540541338287-41700207dee6", 2000),
    u("photo-1518548419970-58e3b4079ab2", 2000),
  ],
  welcome: u("photo-1536152470836-b943b246224c"),
  riceTerrace: u("photo-1537996194471-e657df975ab4"),
  temple: u("photo-1518548419970-58e3b4079ab2"),
  spa: u("photo-1544161515-4ab6ce6db874"),
  dining: u("photo-1414235077428-338989a2e8c0"),
  yoga: u("photo-1545389336-cf090694435e"),
  pool: u("photo-1540541338287-41700207dee6"),
  beach: u("photo-1507525428034-b723cf961d3e"),
};

export type GalleryItem = {
  src: string;
  category: "villas" | "nature" | "dining" | "wellness";
  alt: { en: string; id: string };
};

export const galleryItems: GalleryItem[] = [
  { src: u("photo-1537996194471-e657df975ab4"), category: "nature", alt: { en: "Tegallalang rice terraces at dawn", id: "Terasering Tegallalang saat fajar" } },
  { src: u("photo-1582719508461-905c673771fd"), category: "villas", alt: { en: "Garden Villa bedroom", id: "Kamar tidur Garden Villa" } },
  { src: u("photo-1540541338287-41700207dee6"), category: "villas", alt: { en: "Main infinity pool", id: "Infinity pool utama" } },
  { src: u("photo-1518548419970-58e3b4079ab2"), category: "nature", alt: { en: "Temple gates at sunrise", id: "Gerbang pura saat matahari terbit" } },
  { src: u("photo-1414235077428-338989a2e8c0"), category: "dining", alt: { en: "Candlelit dinner at Taru Restaurant", id: "Makan malam romantis di Restoran Taru" } },
  { src: u("photo-1544161515-4ab6ce6db874"), category: "wellness", alt: { en: "Signature Balinese massage", id: "Pijat khas Bali" } },
  { src: u("photo-1571896349842-33c89424de2d"), category: "villas", alt: { en: "River Villa pool deck", id: "Dek kolam River Villa" } },
  { src: u("photo-1545389336-cf090694435e"), category: "wellness", alt: { en: "Morning yoga pavilion", id: "Paviliun yoga pagi" } },
  { src: u("photo-1536152470836-b943b246224c"), category: "nature", alt: { en: "Jungle canopy walk", id: "Jalan kanopi hutan" } },
  { src: u("photo-1613977257363-707ba9348227"), category: "villas", alt: { en: "Sky Estate at dusk", id: "Sky Estate saat senja" } },
  { src: u("photo-1590490360182-c33d57733427"), category: "villas", alt: { en: "Canopy bed suite", id: "Suite tempat tidur kanopi" } },
  { src: u("photo-1507525428034-b723cf961d3e"), category: "nature", alt: { en: "Day trip to hidden beaches", id: "Perjalanan ke pantai tersembunyi" } },
  { src: u("photo-1611892440504-42a792e24d32"), category: "villas", alt: { en: "Sky Estate master bedroom", id: "Kamar utama Sky Estate" } },
  { src: u("photo-1578683010236-d716f9a3f461"), category: "villas", alt: { en: "River Villa interior", id: "Interior River Villa" } },
  { src: u("photo-1566073771259-6a8506099945"), category: "villas", alt: { en: "Resort pool at golden hour", id: "Kolam resor saat golden hour" } },
  { src: u("photo-1600334129128-685c5582fd35"), category: "wellness", alt: { en: "Couples spa ritual", id: "Ritual spa pasangan" } },
];
