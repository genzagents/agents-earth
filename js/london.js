/* === London District Data v3 ===
   Full London mapped with real districts, landmarks, and building data.
   Each district has building density, landmark info, and proper boundaries.
*/

const LONDON_DISTRICTS = [
  // === CENTRAL LONDON (North of Thames) ===
  {
    id: 'city-of-london', name: 'City of London', x: 0, z: -2, w: 6, d: 5,
    claimed: true, owner: 'Manraj Singh Dhillon', type: 'financial',
    buildings: 18, landmark: 'Bank of England', density: 'high',
    desc: 'The Square Mile. Heart of London\'s financial district.'
  },
  {
    id: 'westminster', name: 'Westminster', x: -8, z: -2, w: 7, d: 6,
    claimed: false, type: 'government', buildings: 14, landmark: 'Houses of Parliament',
    density: 'high', desc: 'Seat of government. Big Ben, Westminster Abbey, Buckingham Palace.'
  },
  {
    id: 'covent-garden', name: 'Covent Garden', x: -3, z: -6, w: 4, d: 3,
    claimed: false, type: 'cultural', buildings: 10, landmark: 'Royal Opera House',
    density: 'high', desc: 'Theatre district. Markets, restaurants, street performers.'
  },
  {
    id: 'soho', name: 'Soho', x: -7, z: -7, w: 4, d: 3,
    claimed: false, type: 'creative', buildings: 12, landmark: 'Carnaby Street',
    density: 'high', desc: 'Creative heartland. Media, nightlife, Chinatown.'
  },
  {
    id: 'mayfair', name: 'Mayfair', x: -12, z: -6, w: 4, d: 4,
    claimed: false, type: 'luxury', buildings: 10, landmark: 'The Ritz',
    density: 'medium', desc: 'London\'s most exclusive neighbourhood. Luxury hotels and galleries.'
  },
  {
    id: 'bloomsbury', name: 'Bloomsbury', x: -2, z: -10, w: 5, d: 4,
    claimed: false, type: 'academic', buildings: 10, landmark: 'British Museum',
    density: 'medium', desc: 'Academic quarter. UCL, SOAS, British Museum.'
  },
  {
    id: 'holborn', name: 'Holborn', x: -2, z: -6, w: 3, d: 3,
    claimed: false, type: 'legal', buildings: 8, landmark: 'Lincoln\'s Inn',
    density: 'high', desc: 'Legal London. Inns of Court, barristers\' chambers.'
  },

  // === EAST LONDON ===
  {
    id: 'shoreditch', name: 'Shoreditch', x: 5, z: -7, w: 5, d: 4,
    claimed: false, type: 'tech', buildings: 14, landmark: 'Silicon Roundabout',
    density: 'high', desc: 'London\'s tech hub. Startups, coworking, street art.'
  },
  {
    id: 'whitechapel', name: 'Whitechapel', x: 6, z: -2, w: 4, d: 4,
    claimed: false, type: 'mixed', buildings: 10, landmark: 'Royal London Hospital',
    density: 'medium', desc: 'Historic East End. Markets, curry houses, hospitals.'
  },
  {
    id: 'bethnal-green', name: 'Bethnal Green', x: 8, z: -6, w: 4, d: 3,
    claimed: false, type: 'creative', buildings: 8, landmark: 'V&A Museum of Childhood',
    density: 'medium', desc: 'Artsy and evolving. Galleries, parks, markets.'
  },
  {
    id: 'canary-wharf', name: 'Canary Wharf', x: 12, z: 2, w: 6, d: 5,
    claimed: false, type: 'financial', buildings: 16, landmark: 'One Canada Square',
    density: 'high', desc: 'London\'s second financial centre. Skyscrapers and banks.'
  },
  {
    id: 'stratford', name: 'Stratford', x: 14, z: -6, w: 5, d: 5,
    claimed: false, type: 'olympic', buildings: 10, landmark: 'Olympic Park',
    density: 'medium', desc: 'Olympic legacy. Westfield, Queen Elizabeth Park.'
  },
  {
    id: 'hackney', name: 'Hackney', x: 7, z: -11, w: 5, d: 4,
    claimed: false, type: 'creative', buildings: 10, landmark: 'Broadway Market',
    density: 'medium', desc: 'Creative hub. Markets, breweries, parks.'
  },
  {
    id: 'mile-end', name: 'Mile End', x: 10, z: -3, w: 4, d: 3,
    claimed: false, type: 'academic', buildings: 6, landmark: 'Queen Mary University',
    density: 'medium', desc: 'Student area. Canal walks, Mile End Park.'
  },
  {
    id: 'docklands', name: 'Docklands', x: 10, z: 1, w: 4, d: 3,
    claimed: false, type: 'mixed', buildings: 8, landmark: 'ExCeL Centre',
    density: 'medium', desc: 'Regenerated docks. Conference centres, river walks.'
  },

  // === NORTH LONDON ===
  {
    id: 'islington', name: 'Islington', x: 1, z: -10, w: 4, d: 3,
    claimed: false, type: 'residential', buildings: 8, landmark: 'Angel Station',
    density: 'medium', desc: 'Affluent north. Gastropubs, antique shops, Upper Street.'
  },
  {
    id: 'kings-cross', name: "King's Cross", x: -4, z: -13, w: 5, d: 4,
    claimed: false, type: 'transport', buildings: 12, landmark: 'St Pancras Station',
    density: 'high', desc: 'Transport hub. Google HQ, Coal Drops Yard, Eurostar.'
  },
  {
    id: 'camden', name: 'Camden Town', x: -8, z: -13, w: 5, d: 4,
    claimed: false, type: 'creative', buildings: 10, landmark: 'Camden Market',
    density: 'medium', desc: 'Alternative culture. Markets, music venues, canal.'
  },
  {
    id: 'hampstead', name: 'Hampstead', x: -10, z: -17, w: 6, d: 5,
    claimed: false, type: 'residential', buildings: 6, landmark: 'Hampstead Heath',
    density: 'low', desc: 'Village feel. Heath, ponds, literary history.'
  },
  {
    id: 'finsbury-park', name: 'Finsbury Park', x: 3, z: -15, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 6, landmark: 'Finsbury Park',
    density: 'low', desc: 'Green spaces. Park, diverse community.'
  },
  {
    id: 'highgate', name: 'Highgate', x: -4, z: -18, w: 4, d: 3,
    claimed: false, type: 'residential', buildings: 4, landmark: 'Highgate Cemetery',
    density: 'low', desc: 'Historic hilltop village. Cemetery, panoramic views.'
  },
  {
    id: 'stoke-newington', name: 'Stoke Newington', x: 5, z: -14, w: 4, d: 3,
    claimed: false, type: 'residential', buildings: 5, landmark: 'Church Street',
    density: 'low', desc: 'Quiet charm. Independent shops, Clissold Park.'
  },

  // === WEST LONDON ===
  {
    id: 'kensington', name: 'Kensington', x: -15, z: -3, w: 5, d: 5,
    claimed: false, type: 'residential', buildings: 10, landmark: 'Natural History Museum',
    density: 'medium', desc: 'Museum quarter. V&A, Science Museum, Albert Hall.'
  },
  {
    id: 'chelsea', name: 'Chelsea', x: -14, z: 2, w: 5, d: 4,
    claimed: false, type: 'luxury', buildings: 8, landmark: 'King\'s Road',
    density: 'medium', desc: 'Affluent SW London. Boutiques, Sloane Square.'
  },
  {
    id: 'notting-hill', name: 'Notting Hill', x: -16, z: -9, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 6, landmark: 'Portobello Market',
    density: 'medium', desc: 'Colourful townhouses. Carnival, antique market.'
  },
  {
    id: 'paddington', name: 'Paddington', x: -12, z: -10, w: 4, d: 3,
    claimed: false, type: 'transport', buildings: 8, landmark: 'Paddington Station',
    density: 'medium', desc: 'Transport hub. Heathrow Express, canal basin.'
  },
  {
    id: 'marylebone', name: 'Marylebone', x: -10, z: -10, w: 3, d: 3,
    claimed: false, type: 'residential', buildings: 7, landmark: 'Baker Street',
    density: 'medium', desc: 'Elegant village. Marylebone High St, Regent\'s Park.'
  },
  {
    id: 'hammersmith', name: 'Hammersmith', x: -20, z: -2, w: 5, d: 5,
    claimed: false, type: 'mixed', buildings: 6, landmark: 'Hammersmith Bridge',
    density: 'medium', desc: 'River frontage. Theatres, riverside pubs.'
  },
  {
    id: 'fulham', name: 'Fulham', x: -20, z: 3, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 5, landmark: 'Craven Cottage',
    density: 'low', desc: 'Residential SW. Football grounds, parks.'
  },

  // === SOUTH OF THAMES ===
  {
    id: 'southwark', name: 'Southwark', x: 0, z: 4, w: 5, d: 4,
    claimed: false, type: 'cultural', buildings: 12, landmark: 'Tate Modern',
    density: 'high', desc: 'Cultural powerhouse. Shakespeare\'s Globe, Borough Market.'
  },
  {
    id: 'lambeth', name: 'Lambeth', x: -7, z: 4, w: 5, d: 4,
    claimed: false, type: 'government', buildings: 10, landmark: 'London Eye',
    density: 'high', desc: 'South Bank. County Hall, Waterloo, Imperial War Museum.'
  },
  {
    id: 'bermondsey', name: 'Bermondsey', x: 6, z: 4, w: 5, d: 4,
    claimed: false, type: 'industrial', buildings: 8, landmark: 'Maltby Street Market',
    density: 'medium', desc: 'Warehouse conversions. Craft beer, food markets.'
  },
  {
    id: 'elephant-castle', name: 'Elephant & Castle', x: -2, z: 8, w: 4, d: 3,
    claimed: false, type: 'mixed', buildings: 8, landmark: 'Elephant Park',
    density: 'medium', desc: 'Major regeneration. New developments, Latin quarter.'
  },
  {
    id: 'brixton', name: 'Brixton', x: -6, z: 12, w: 5, d: 4,
    claimed: false, type: 'creative', buildings: 8, landmark: 'Brixton Academy',
    density: 'medium', desc: 'Vibrant culture. Markets, music, Caribbean food.'
  },
  {
    id: 'peckham', name: 'Peckham', x: 4, z: 12, w: 5, d: 4,
    claimed: false, type: 'creative', buildings: 6, landmark: 'Peckham Levels',
    density: 'medium', desc: 'Up-and-coming. Rooftop bars, galleries, community.'
  },
  {
    id: 'greenwich', name: 'Greenwich', x: 14, z: 6, w: 6, d: 5,
    claimed: false, type: 'heritage', buildings: 8, landmark: 'Royal Observatory',
    density: 'medium', desc: 'Maritime heritage. Cutty Sark, Prime Meridian, park.'
  },
  {
    id: 'battersea', name: 'Battersea', x: -14, z: 5, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 8, landmark: 'Battersea Power Station',
    density: 'medium', desc: 'Iconic regeneration. Power station, park, dogs home.'
  },
  {
    id: 'clapham', name: 'Clapham', x: -11, z: 10, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 5, landmark: 'Clapham Common',
    density: 'low', desc: 'Young professionals. Common, bars, brunch spots.'
  },
  {
    id: 'lewisham', name: 'Lewisham', x: 10, z: 12, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 5, landmark: 'Lewisham Centre',
    density: 'low', desc: 'South-east residential. Market, DLR connections.'
  },
  {
    id: 'wandsworth', name: 'Wandsworth', x: -17, z: 8, w: 5, d: 4,
    claimed: false, type: 'residential', buildings: 5, landmark: 'Wandsworth Common',
    density: 'low', desc: 'Family-friendly. Good schools, riverside walks.'
  },
  {
    id: 'vauxhall', name: 'Vauxhall', x: -8, z: 7, w: 3, d: 3,
    claimed: false, type: 'mixed', buildings: 8, landmark: 'MI6 Building',
    density: 'medium', desc: 'Emerging district. New towers, nightlife, river.'
  },
  {
    id: 'rotherhithe', name: 'Rotherhithe', x: 9, z: 5, w: 4, d: 3,
    claimed: false, type: 'residential', buildings: 4, landmark: 'Brunel Museum',
    density: 'low', desc: 'Thames-side village. Historic tunnels, Canada Water.'
  },
  {
    id: 'woolwich', name: 'Woolwich', x: 18, z: 8, w: 5, d: 4,
    claimed: false, type: 'heritage', buildings: 5, landmark: 'Woolwich Arsenal',
    density: 'low', desc: 'Military heritage. Elizabeth line, riverside development.'
  },
  {
    id: 'camberwell', name: 'Camberwell', x: 2, z: 9, w: 4, d: 3,
    claimed: false, type: 'academic', buildings: 5, landmark: 'Camberwell College of Arts',
    density: 'low', desc: 'Art school area. Green spaces, period architecture.'
  },
];

// Thames path — more detailed, following real bends
const THAMES_PATH = [
  { x: -24, z: 2 },
  { x: -20, z: 1.5 },
  { x: -17, z: 2.5 },
  { x: -14, z: 2 },
  { x: -11, z: 1.5 },
  { x: -8, z: 1.8 },
  { x: -5, z: 1.5 },
  { x: -3, z: 1.2 },
  { x: 0, z: 1.5 },
  { x: 2, z: 1.8 },
  { x: 4, z: 2.2 },
  { x: 6, z: 2.5 },
  { x: 8, z: 2.8 },
  { x: 10, z: 2.5 },
  { x: 12, z: 3.5 },
  { x: 14, z: 4.0 },
  { x: 16, z: 4.5 },
  { x: 18, z: 5.0 },
  { x: 20, z: 5.5 },
  { x: 24, z: 6.0 },
];

// Known London landmarks for placing visual markers
const LANDMARKS = [
  { name: 'Tower Bridge', x: 4, z: 2, h: 2.5, icon: '🌉' },
  { name: 'Big Ben', x: -8, z: 0.5, h: 3.5, icon: '🕐' },
  { name: 'London Eye', x: -6, z: 2.5, h: 3, icon: '🎡' },
  { name: 'The Shard', x: 1, z: 3.5, h: 4.5, icon: '🏗️' },
  { name: 'St Paul\'s', x: -1, z: -1, h: 2.8, icon: '⛪' },
  { name: 'Buckingham Palace', x: -10, z: -1, h: 1.5, icon: '👑' },
  { name: 'Gherkin', x: 2, z: -3, h: 3, icon: '🥒' },
  { name: 'One Canada Sq', x: 12, z: 2, h: 4, icon: '🏢' },
  { name: 'Olympic Stadium', x: 14, z: -6, h: 2, icon: '🏟️' },
  { name: 'Tate Modern', x: 0, z: 3, h: 2, icon: '🎨' },
  { name: 'British Museum', x: -2, z: -10, h: 1.5, icon: '🏛️' },
  { name: 'Camden Market', x: -8, z: -13, h: 1, icon: '🎪' },
];

// District type colors — light theme
const DISTRICT_COLORS = {
  financial:   { main: 0xc8d8f0, glow: 0x2563eb, ground: 0xdde5f0, accent: 0x1d4ed8 },
  government:  { main: 0xd0d0e8, glow: 0x6366f1, ground: 0xddddf0, accent: 0x4f46e5 },
  legal:       { main: 0xd0d0dd, glow: 0x6b7280, ground: 0xddddea, accent: 0x4b5563 },
  creative:    { main: 0xe8d0e0, glow: 0xe11d72, ground: 0xf0dde8, accent: 0xbe185d },
  tech:        { main: 0xc8e8d8, glow: 0x16a34a, ground: 0xddf0e5, accent: 0x15803d },
  mixed:       { main: 0xd5d5e0, glow: 0x6b7280, ground: 0xe0e0ea, accent: 0x4b5563 },
  transport:   { main: 0xe0d5c8, glow: 0xe85d26, ground: 0xeaddd0, accent: 0xc2410c },
  luxury:      { main: 0xe0d8c0, glow: 0xd97706, ground: 0xeae0cc, accent: 0xb45309 },
  residential: { main: 0xd0d8e0, glow: 0x3b82f6, ground: 0xdde2ea, accent: 0x2563eb },
  cultural:    { main: 0xdcd0e8, glow: 0x7c3aed, ground: 0xe5ddf0, accent: 0x6d28d9 },
  heritage:    { main: 0xddd8cc, glow: 0xb45309, ground: 0xe5e0d5, accent: 0x92400e },
  industrial:  { main: 0xd5d5d5, glow: 0x6b7280, ground: 0xe0e0e0, accent: 0x4b5563 },
  olympic:     { main: 0xc8dde8, glow: 0x0284c7, ground: 0xd5e5f0, accent: 0x0369a1 },
  academic:    { main: 0xc8e0d5, glow: 0x059669, ground: 0xd5ead8, accent: 0x047857 },
};

// Agent status types
const AGENT_STATUS = {
  LIVE: 'live',       // Green dot, walking
  STUCK: 'stuck',     // Red ⚠ sign, stationary
  IDLE: 'idle',       // Yellow dot, stationary
  OFFLINE: 'offline', // Grey dot, invisible
};

// Auth codes (in real app = server-side)
const AUTH_CODES = {
  'NOVA-2026': { owner: 'Manraj Singh Dhillon', agents: ['Forge', 'Nova', 'Aria', 'Pulse'] },
};
