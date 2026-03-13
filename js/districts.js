/* === District Data for MapTiler/GeoJSON overlay === */

const DISTRICTS = [
  // Central London (North of Thames)
  { id: 'city-of-london', name: 'City of London', center: [-0.0918, 51.5155], claimed: true, owner: 'Manraj Singh Dhillon', type: 'financial', landmark: 'Bank of England', desc: 'The Square Mile. Heart of London\'s financial district.' },
  { id: 'westminster', name: 'Westminster', center: [-0.1357, 51.4975], claimed: false, type: 'government', landmark: 'Houses of Parliament', desc: 'Seat of government. Big Ben, Westminster Abbey, Buckingham Palace.' },
  { id: 'covent-garden', name: 'Covent Garden', center: [-0.1228, 51.5117], claimed: false, type: 'cultural', landmark: 'Royal Opera House', desc: 'Theatre district. Markets, restaurants, street performers.' },
  { id: 'soho', name: 'Soho', center: [-0.1337, 51.5134], claimed: false, type: 'creative', landmark: 'Carnaby Street', desc: 'Creative heartland. Media, nightlife, Chinatown.' },
  { id: 'mayfair', name: 'Mayfair', center: [-0.1479, 51.5094], claimed: false, type: 'luxury', landmark: 'The Ritz', desc: 'London\'s most exclusive neighbourhood. Luxury hotels and galleries.' },
  { id: 'bloomsbury', name: 'Bloomsbury', center: [-0.1246, 51.5215], claimed: false, type: 'academic', landmark: 'British Museum', desc: 'Academic quarter. UCL, SOAS, British Museum.' },
  { id: 'holborn', name: 'Holborn', center: [-0.1114, 51.5174], claimed: false, type: 'legal', landmark: 'Lincoln\'s Inn', desc: 'Legal London. Inns of Court, barristers\' chambers.' },

  // East London
  { id: 'shoreditch', name: 'Shoreditch', center: [-0.0777, 51.5265], claimed: false, type: 'tech', landmark: 'Silicon Roundabout', desc: 'London\'s tech hub. Startups, coworking, street art.' },
  { id: 'whitechapel', name: 'Whitechapel', center: [-0.0599, 51.5155], claimed: false, type: 'mixed', landmark: 'Royal London Hospital', desc: 'Historic East End. Markets, curry houses, hospitals.' },
  { id: 'bethnal-green', name: 'Bethnal Green', center: [-0.0550, 51.5272], claimed: false, type: 'creative', landmark: 'V&A Museum of Childhood', desc: 'Artsy and evolving. Galleries, parks, markets.' },
  { id: 'canary-wharf', name: 'Canary Wharf', center: [-0.0197, 51.5054], claimed: false, type: 'financial', landmark: 'One Canada Square', desc: 'London\'s second financial centre. Skyscrapers and banks.' },
  { id: 'stratford', name: 'Stratford', center: [-0.0034, 51.5430], claimed: false, type: 'olympic', landmark: 'Olympic Park', desc: 'Olympic legacy. Westfield, Queen Elizabeth Park.' },
  { id: 'hackney', name: 'Hackney', center: [-0.0558, 51.5450], claimed: false, type: 'creative', landmark: 'Broadway Market', desc: 'Creative hub. Markets, breweries, parks.' },
  { id: 'mile-end', name: 'Mile End', center: [-0.0335, 51.5225], claimed: false, type: 'academic', landmark: 'Queen Mary University', desc: 'Student area. Canal walks, Mile End Park.' },
  { id: 'docklands', name: 'Docklands', center: [0.0093, 51.5065], claimed: false, type: 'mixed', landmark: 'ExCeL Centre', desc: 'Regenerated docks. Conference centres, river walks.' },

  // North London
  { id: 'islington', name: 'Islington', center: [-0.1028, 51.5362], claimed: false, type: 'residential', landmark: 'Angel Station', desc: 'Affluent north. Gastropubs, antique shops, Upper Street.' },
  { id: 'kings-cross', name: "King's Cross", center: [-0.1245, 51.5347], claimed: false, type: 'transport', landmark: 'St Pancras Station', desc: 'Transport hub. Google HQ, Coal Drops Yard, Eurostar.' },
  { id: 'camden', name: 'Camden Town', center: [-0.1427, 51.5392], claimed: false, type: 'creative', landmark: 'Camden Market', desc: 'Alternative culture. Markets, music venues, canal.' },
  { id: 'hampstead', name: 'Hampstead', center: [-0.1780, 51.5562], claimed: false, type: 'residential', landmark: 'Hampstead Heath', desc: 'Village feel. Heath, ponds, literary history.' },
  { id: 'finsbury-park', name: 'Finsbury Park', center: [-0.1058, 51.5642], claimed: false, type: 'residential', landmark: 'Finsbury Park', desc: 'Green spaces. Park, diverse community.' },

  // West London
  { id: 'kensington', name: 'Kensington', center: [-0.1888, 51.4990], claimed: false, type: 'residential', landmark: 'Natural History Museum', desc: 'Museum quarter. V&A, Science Museum, Albert Hall.' },
  { id: 'chelsea', name: 'Chelsea', center: [-0.1685, 51.4875], claimed: false, type: 'luxury', landmark: 'King\'s Road', desc: 'Affluent SW London. Boutiques, Sloane Square.' },
  { id: 'notting-hill', name: 'Notting Hill', center: [-0.1965, 51.5118], claimed: false, type: 'residential', landmark: 'Portobello Market', desc: 'Colourful townhouses. Carnival, antique market.' },
  { id: 'paddington', name: 'Paddington', center: [-0.1750, 51.5154], claimed: false, type: 'transport', landmark: 'Paddington Station', desc: 'Transport hub. Heathrow Express, canal basin.' },

  // South of Thames
  { id: 'southwark', name: 'Southwark', center: [-0.0934, 51.5035], claimed: false, type: 'cultural', landmark: 'Tate Modern', desc: 'Cultural powerhouse. Shakespeare\'s Globe, Borough Market.' },
  { id: 'lambeth', name: 'Lambeth', center: [-0.1175, 51.4958], claimed: false, type: 'government', landmark: 'London Eye', desc: 'South Bank. County Hall, Waterloo, Imperial War Museum.' },
  { id: 'bermondsey', name: 'Bermondsey', center: [-0.0635, 51.4975], claimed: false, type: 'industrial', landmark: 'Maltby Street Market', desc: 'Warehouse conversions. Craft beer, food markets.' },
  { id: 'brixton', name: 'Brixton', center: [-0.1148, 51.4613], claimed: false, type: 'creative', landmark: 'Brixton Academy', desc: 'Vibrant culture. Markets, music, Caribbean food.' },
  { id: 'peckham', name: 'Peckham', center: [-0.0685, 51.4737], claimed: false, type: 'creative', landmark: 'Peckham Levels', desc: 'Up-and-coming. Rooftop bars, galleries, community.' },
  { id: 'greenwich', name: 'Greenwich', center: [-0.0098, 51.4769], claimed: false, type: 'heritage', landmark: 'Royal Observatory', desc: 'Maritime heritage. Cutty Sark, Prime Meridian, park.' },
  { id: 'battersea', name: 'Battersea', center: [-0.1580, 51.4786], claimed: false, type: 'residential', landmark: 'Battersea Power Station', desc: 'Iconic regeneration. Power station, park, dogs home.' },
  { id: 'clapham', name: 'Clapham', center: [-0.1380, 51.4618], claimed: false, type: 'residential', landmark: 'Clapham Common', desc: 'Young professionals. Common, bars, brunch spots.' },
];

// District type → marker color
const DISTRICT_TYPE_COLORS = {
  financial:   '#2563eb',
  government:  '#6366f1',
  legal:       '#6b7280',
  creative:    '#e11d72',
  tech:        '#16a34a',
  mixed:       '#6b7280',
  transport:   '#e85d26',
  luxury:      '#d97706',
  residential: '#3b82f6',
  cultural:    '#7c3aed',
  heritage:    '#b45309',
  industrial:  '#6b7280',
  olympic:     '#0284c7',
  academic:    '#059669',
};

// Auth codes
const AUTH_CODES = {
  'NOVA-2026': { owner: 'Manraj Singh Dhillon', agents: ['Forge', 'Nova', 'Aria', 'Pulse'] },
};
