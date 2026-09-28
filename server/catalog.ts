export type Category = {
  id: string;
  name: string;
  emoji: string;
  artists: string[];
  /** Free-text searches that widen the pool beyond the fixed artist list. */
  terms: string[];
};

export const CATEGORIES: Category[] = [
  {
    id: "rock-nacional",
    name: "Rock Nacional",
    emoji: "🎸",
    artists: [
      "Soda Stereo",
      "Charly Garcia",
      "Gustavo Cerati",
      "Los Redonditos de Ricota",
      "Divididos",
      "Fito Paez",
      "Andres Calamaro",
      "Babasonicos",
      "La Renga",
      "Los Fabulosos Cadillacs",
      "Luis Alberto Spinetta",
      "Attaque 77",
    ],
    terms: ["rock nacional argentino", "clasicos rock argentino", "rock argentino 90"],
  },
  {
    id: "trap-argento",
    name: "Trap & Urbano Argento",
    emoji: "🧊",
    artists: [
      "Duki",
      "Bizarrap",
      "Nicki Nicole",
      "Trueno",
      "Maria Becerra",
      "Tini",
      "Paulo Londra",
      "Emilia",
      "Wos",
      "Cazzu",
      "Lit Killah",
      "Khea",
    ],
    terms: ["trap argentino", "rkt argentino", "urbano argentino hits"],
  },
  {
    id: "reggaeton",
    name: "Reggaetón",
    emoji: "🔥",
    artists: [
      "Daddy Yankee",
      "Bad Bunny",
      "J Balvin",
      "Ozuna",
      "Karol G",
      "Don Omar",
      "Wisin y Yandel",
      "Anuel AA",
      "Rauw Alejandro",
      "Feid",
      "Myke Towers",
      "Nicky Jam",
    ],
    terms: ["reggaeton hits", "reggaeton clasico", "perreo"],
  },
  {
    id: "pop-global",
    name: "Pop Global",
    emoji: "✨",
    artists: [
      "Taylor Swift",
      "Dua Lipa",
      "The Weeknd",
      "Billie Eilish",
      "Ariana Grande",
      "Harry Styles",
      "Ed Sheeran",
      "Bruno Mars",
      "Olivia Rodrigo",
      "Doja Cat",
      "Miley Cyrus",
      "Sabrina Carpenter",
    ],
    terms: ["pop hits", "top pop songs", "pop 2020s"],
  },
  {
    id: "rock-clasico",
    name: "Rock Clásico",
    emoji: "🤘",
    artists: [
      "Queen",
      "The Beatles",
      "Nirvana",
      "Guns N Roses",
      "AC/DC",
      "Led Zeppelin",
      "Metallica",
      "Pink Floyd",
      "The Rolling Stones",
      "Red Hot Chili Peppers",
      "Oasis",
      "Radiohead",
    ],
    terms: ["classic rock hits", "80s rock anthems", "90s alternative rock"],
  },
  {
    id: "hits-2010s",
    name: "Hits 2010s",
    emoji: "📀",
    artists: [
      "Rihanna",
      "Katy Perry",
      "Maroon 5",
      "Coldplay",
      "Imagine Dragons",
      "Adele",
      "Justin Bieber",
      "Lady Gaga",
      "Shakira",
      "Sia",
      "David Guetta",
      "OneRepublic",
    ],
    terms: ["2010s hits", "throwback 2012 hits", "dance pop 2015"],
  },
  {
    id: "latinos-clasicos",
    name: "Latinos Clásicos",
    emoji: "🌎",
    artists: [
      "Juan Luis Guerra",
      "Mana",
      "Cafe Tacvba",
      "Julieta Venegas",
      "Ricky Martin",
      "Enrique Iglesias",
      "Gilberto Santa Rosa",
      "Los Auténticos Decadentes",
      "Molotov",
      "Chayanne",
      "Carlos Vives",
      "Marc Anthony",
    ],
    terms: ["rock en espanol clasicos", "baladas latinas", "salsa clasica"],
  },
  {
    id: "cuarteto-cumbia",
    name: "Cuarteto & Cumbia",
    emoji: "🪗",
    artists: [
      "Rodrigo",
      "La Mona Jimenez",
      "Ulises Bueno",
      "Damas Gratis",
      "Los Palmeras",
      "Q Lokura",
      "La Konga",
      "Los Angeles Azules",
      "Gilda",
      "Antonio Rios",
      "Marama",
      "Rombai",
    ],
    terms: ["cuarteto cordobes", "cumbia argentina", "cumbia villera"],
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Pool used by the daily puzzle: widely known tracks across categories. */
export const DAILY_POOL_CATEGORIES = [
  "rock-nacional",
  "pop-global",
  "rock-clasico",
  "reggaeton",
  "hits-2010s",
  "trap-argento",
];
