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
    coverImage: "/books/C_O_vaiduryapuram/cover.png.png",
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
    coverImage: "/books/Keekaranyamlo%20jinka/cover.jpg.jpg",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "moon-light-killer",
    title: "మూన్‌లైట్ కిల్లర్",
    shortTitle: "మూన్‌లైట్ కిల్లర్",
    author: "సయ్యద్ ఆయేషా సుల్తానా",
    description:
      "హైదరాబాద్ నేపథ్యంలో సాగే ఉత్కంఠభరితమైన క్రైమ్ థ్రిల్లర్. ఒక రహస్య హత్యతో మొదలై పోలీసు దర్యాప్తు, అనుమానాలు, మానవ సంబంధాల చీకటి కోణాలతో చివరి వరకు సస్పెన్స్ కొనసాగించే నవల.",
    quote: "వెన్నెల రాత్రి… ఒక అంతుచిక్కని హత్య.",
    quoteBy: "Bala Books",
    format: "Paperback · 175 pages",
    availability: "Available now · ₹200",
    url: "https://balabooks.in/products/మూన్‌లైట్-కిల్లర్-సయ్యద్-ఆయేషా-సుల్తానా-తెలుగు-సస్పెన్స్-థ్రిల్లర్-నవల-bala-books",
    cover: "#182332",
    accent: "#d93632",
    ink: "#f5f1e8",
    motif: "fracture",
    height: 2.16,
    thickness: 0.23,
    coverImage: "/books/moon-light-killer.jpg",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "prashantha-pratyushalu",
    title: "ప్రశాంత ప్రత్యూషాలు",
    shortTitle: "ప్రశాంత ప్రత్యూషాలు",
    author: "బోరిస్ వసిల్యేవ్ · తెలుగు: నిడమర్తి ఉమారాజేశ్వరరావు",
    description:
      "ద్వితీయ ప్రపంచ యుద్ధ నేపథ్యంలో ఐదుగురు యువ సైనికురాళ్లు మరియు సార్జెంట్ మేజర్ వస్కోవ్ ఎదుర్కొనే అసాధారణ పోరాటాన్ని మానవీయ కోణంలో ఆవిష్కరించే రష్యన్ క్లాసిక్.",
    quote: "యుద్ధం వెనుక ఉన్న మనుషుల కథ.",
    quoteBy: "Bala Books",
    format: "Paperback · 170 pages",
    availability: "Available now · ₹200",
    url: "https://balabooks.in/products/prashantha-pratyushalu-telugu-novel",
    cover: "#6f593b",
    accent: "#d9a34c",
    ink: "#f5f2df",
    motif: "flight",
    height: 2.14,
    thickness: 0.23,
    coverImage: "/books/prashanta-pratyushalu.jpg",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "sulunthee",
    title: "సుళుందీ",
    shortTitle: "సుళుందీ",
    author: "రా. ముత్తు నాగు · తెలుగు: బొల్లి రామస్వామి రఘుపతి",
    description:
      "తమిళ సమాజపు మౌఖిక చరిత్ర, సామాజిక నిర్మాణం, అధికార సంబంధాలు మరియు ప్రజల ప్రతిఘటనను సృజనాత్మకంగా ఆవిష్కరించే విశిష్ట నవల.",
    quote: "చరిత్ర, మౌఖిక చరిత్ర, సృజనాత్మక కథనం కలిసిన నవల.",
    quoteBy: "Bala Books",
    format: "Paperback",
    availability: "Available now · ₹550",
    url: "https://balabooks.in/products/sulunthee-tamil-fiction-literature-by-ra-mutthu-nagu-translated-by-bolli-ramaswami-raghupati",
    cover: "#17483f",
    accent: "#ef8929",
    ink: "#f3eee0",
    motif: "branches",
    height: 2.12,
    thickness: 0.34,
    coverImage: "/books/sulunthee.jpg",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "sahajeevanam",
    title: "సహజీవనం మరికొన్ని అనువాద కథలు",
    shortTitle: "సహజీవనం",
    author: "తెలుగు అనువాదం: ఏ.ఎన్. నాగేశ్వరరావు",
    description:
      "20 దేశాలకు చెందిన ప్రముఖ రచయితల 20 ప్రపంచ కథలను తెలుగు పాఠకులకు పరిచయం చేసే ప్రపంచకథాకరచాలనం సిరీస్ మూడవ భాగం.",
    quote: "20 దేశాలు. 20 కథలు. 20 జీవితాలు.",
    quoteBy: "Bala Books",
    format: "Paperback · 135 pages",
    availability: "Available now · ₹150",
    url: "https://balabooks.in/products/products-sahahajeevanam-world-literature-telugu-stories",
    cover: "#8c6a43",
    accent: "#d8c82e",
    ink: "#fff9e7",
    motif: "gather",
    height: 2.06,
    thickness: 0.21,
    coverImage: "/books/sahajeevanam.png",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "sultana-kala",
    title: "సుల్తానా కల మరికొన్ని కథలు",
    shortTitle: "సుల్తానా కల",
    author: "తెలుగు అనువాదం: అచ్యుతుని రాజ్యశ్రీ",
    description:
      "ప్రపంచ సాహిత్యంలోని 30 వైవిధ్యభరితమైన కథలను తెలుగు పాఠకుల ముందుకు తీసుకొచ్చే ప్రత్యేక అనువాద కథా సంకలనం.",
    quote: "ఒకే పుస్తకంలో ముప్పై విభిన్న ప్రపంచాలు.",
    quoteBy: "Bala Books",
    format: "Paperback · 151 pages",
    availability: "Available now · ₹175",
    url: "https://balabooks.in/products/sultana-kala-marikonni-kathalu-telugu-translated-short-stories",
    cover: "#d8e5e5",
    accent: "#c3a91e",
    ink: "#172c34",
    motif: "windows",
    height: 2.08,
    thickness: 0.22,
    coverImage: "/books/sultana-kala.png",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "rupadharuni-yatralu",
    title: "రూపధరుడి యాత్రలు",
    shortTitle: "రూపధరుడి యాత్రలు",
    author: "హోమర్ · తెలుగు రూపం: కొడవటిగంటి కుటుంబరావు",
    description:
      "హోమర్ అమర మహాకావ్యం The Odyssey ఆధారంగా, ట్రాయ్ యుద్ధం తర్వాత రూపధరుడు తన స్వదేశానికి చేరుకునే పదేళ్ల సాహసయాత్రకు కొడవటిగంటి కుటుంబరావు అందించిన తెలుగు రూపం.",
    quote: "సముద్రాలు, ప్రమాదాలు, మాయాజాలాల మధ్య ఒక అపూర్వ సాహసయాత్ర.",
    quoteBy: "Bala Books",
    format: "Paperback",
    availability: "Available now · ₹150",
    url: "https://balabooks.in/products/రూపధరుడి-యాత్రలు-the-odyssey-telugu-book-bala-books",
    cover: "#1d2930",
    accent: "#bc8b42",
    ink: "#f4f1e8",
    motif: "wave",
    height: 2.18,
    thickness: 0.24,
    coverImage: "/books/rupadharuni-yatralu.png",
    linkLabel: "Buy from Bala Books",
  },

  {
    id: "bhuvana-sundari",
    title: "భువన సుందరి",
    shortTitle: "భువన సుందరి",
    author: "హోమర్ ఇతిహాసం · తెలుగు రూపం: కొడవటిగంటి కుటుంబరావు",
    description:
      "The Iliad మరియు Trojan War నేపథ్యంతో భువనసుందరి, ట్రోయ్ నగరం, గ్రీకు వీరుల యుద్ధగాథకు కొడవటిగంటి కుటుంబరావు అందించిన ఆసక్తికరమైన తెలుగు రూపం.",
    quote: "ట్రోయ్ యుద్ధం — ప్రేమ, పరాక్రమం, వ్యూహం కలిసిన అమరగాథ.",
    quoteBy: "Bala Books",
    format: "Paperback",
    availability: "Available now · ₹85",
    url: "https://balabooks.in/products/భువన-సుందరి-helen-of-troy-telugu-book-bala-books",
    cover: "#5c2d21",
    accent: "#d6a347",
    ink: "#f9f0df",
    motif: "flight",
    height: 2.20,
    thickness: 0.22,
    coverImage: "/books/bhuvana-sundari.png",
    linkLabel: "Buy from Bala Books",
  },
] satisfies CatalogBook[]).sort(
  (left, right) => right.height - left.height,
);
