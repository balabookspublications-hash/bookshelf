export type BookMotif =
  | "lattice"
  | "corrosion"
  | "efficiency"
  | "network"
  | "boom"
  | "organization"
  | "schematic"
  | "flight"
  | "circuit"
  | "orbit"
  | "branches"
  | "wave"
  | "runner"
  | "gather"
  | "maze"
  | "fracture"
  | "continuum"
  | "windows"
  | "steps";

export type CatalogBook = {
  id: string;
  title: string;
  shortTitle: string;
  author: string;
  description: string;
  quote: string;
  quoteBy: string;
  format: string;
  availability: string;
  url: string;
  cover: string;
  accent: string;
  ink: string;
  motif: BookMotif;
  height: number;
  thickness: number;
  coverImage?: string;
  linkLabel?: string;
  living?: boolean;
};

export const catalog: CatalogBook[] = ([
  {
    id: "bilam",
    title: "బిలం",
    shortTitle: "బిలం",
    author: "సన్నపురెడ్డి వెంకటరామిరెడ్డి",
    description:
      "రాయలసీమ నేలను, రైతు జీవితాన్ని, గ్రామీణ సంబంధాలను మరియు మారుతున్న సమాజాన్ని ఆవిష్కరించే 19 కథల సంపుటి.",
    quote:
      "నేల, మనుషులు, జీవితం — రాయలసీమ కథల ప్రపంచం.",
    quoteBy: "Bala Books",
    format: "Paperback · 212 pages",
    availability: "Available now · ₹250",
    url: "https://balabooks.in/products/bilam-sannapureddy-venkataramireddy-telugu-stories",
    cover: "#5b241b",
    accent: "#d5a640",
    ink: "#f5ead8",
    motif: "branches",
    height: 2.18,
    thickness: 0.26,
    height: 2.18,
thickness: 0.26,
coverImage: "/books/bilam/BIlamOriginalfront.jpg",
linkLabel: "Buy from Bala Books",
height: 2.18,
thickness: 0.26,
coverImage: "/books/bilam/BIlam%20Original%20front.jpg",
linkLabel: "Buy from Bala Books",
  },

  {
    id: "co-vaidurya-puram",
    title: "C/O వైఢూర్యపురం",
    shortTitle: "వైఢూర్యపురం",
    author: "రమాకాంత్ బుకా",
    description:
      "చరిత్ర, గుప్తనిధి, రహస్యం, సస్పెన్స్ కలిసిన ఆసక్తికరమైన తెలుగు నవల. 1724లో మొదలైన రహస్యం శతాబ్దాల తర్వాత కొత్త మలుపులు తీసుకుంటుంది.",
    quote:
      "కాలాన్ని దాటి వచ్చిన ఒక రహస్యం.",
    quoteBy: "Bala Books",
    format: "Paperback",
    availability: "Available now · ₹170",
    url: "https://balabooks.in/products/untitled-12may_18-38",
    cover: "#172f49",
    accent: "#c89b3c",
    ink: "#f3ead7",
    motif: "maze",
    height: 2.10,
    thickness: 0.22,
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "keekaranyamlo-jinka",
    title: "కీకారణ్యంలో జింక",
    shortTitle: "కీకారణ్యంలో జింక",
    author: "తెలుగు అనువాదం: సింగం మల్లికార్జున రెడ్డి",
    description:
      "ఈశాన్య భారతదేశంలోని బోడో సమాజపు జీవితం, సంస్కృతి, అస్తిత్వం మరియు మానవ సంబంధాలను పరిచయం చేసే 12 కథల తెలుగు సంకలనం.",
    quote:
      "బ్రహ్మపుత్రా ఒడ్డున జీవించే మనుషుల కథలు.",
    quoteBy: "Bala Books",
    format: "Paperback · 110 pages",
    availability: "Available now · ₹150",
    url: "https://balabooks.in/products/keekaranyamlo-jinka-bodo-kathalu-telugu",
    cover: "#334c39",
    accent: "#c9a34c",
    ink: "#f2ead9",
    motif: "lattice",
    height: 2.04,
    thickness: 0.20,
    linkLabel: "Buy from Bala Books",
  },
] satisfies CatalogBook[]).sort(
  (left, right) => right.height - left.height,
);
