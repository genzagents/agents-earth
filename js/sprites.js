/* === Isometric Pixel Art Sprite System === */

// Generate pixel art character sprites using canvas
// Each agent gets a unique look based on their personality

const SPRITE_SIZE = 48;
const PIXEL = 3; // each "pixel" is 3x3 real pixels

// Agent appearance configs — pixel art style
const AGENT_LOOKS = {
  forge: {
    skinTone: '#f4c99b',
    hairColor: '#3d2b1f',
    hairStyle: 'short',
    shirtColor: '#e85d26',
    pantsColor: '#2d3748',
    accessory: 'headphones',
    eyeColor: '#4a3728',
  },
  nova: {
    skinTone: '#d4a76a',
    hairColor: '#1a1a2e',
    hairStyle: 'medium',
    shirtColor: '#0099cc',
    pantsColor: '#1e293b',
    accessory: 'glasses',
    eyeColor: '#2c1810',
  },
  aria: {
    skinTone: '#f9dcc4',
    hairColor: '#8b4513',
    hairStyle: 'long',
    shirtColor: '#e11d72',
    pantsColor: '#374151',
    accessory: 'earring',
    eyeColor: '#5c3a1e',
  },
  pulse: {
    skinTone: '#c68642',
    hairColor: '#0a0a0a',
    hairStyle: 'fade',
    shirtColor: '#7c3aed',
    pantsColor: '#1f2937',
    accessory: 'cap',
    eyeColor: '#1a0f05',
  },
};

// Pixel art character definition — grid-based
// Each row is an array of pixel colors (null = transparent)
function generateCharacterPixels(look, state, frame) {
  const { skinTone, hairColor, shirtColor, pantsColor, accessory, eyeColor } = look;
  const shoeColor = '#1a1a1a';
  const isWalking = state === 'commuting' || state === 'exploring' || state === 'going_home';
  const isSleeping = state === 'sleeping';
  const isWorking = state === 'working' || state === 'building' || state === 'side_project';

  // 16x16 pixel grid
  const W = 16, H = 16;
  const grid = Array.from({ length: H }, () => Array(W).fill(null));

  function set(x, y, color) {
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = color;
  }
  function rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        set(x + dx, y + dy, color);
  }

  // === HAIR (rows 0-3) ===
  if (look.hairStyle === 'short') {
    rect(5, 0, 6, 1, hairColor);
    rect(4, 1, 8, 2, hairColor);
  } else if (look.hairStyle === 'medium') {
    rect(5, 0, 6, 1, hairColor);
    rect(4, 1, 8, 2, hairColor);
    set(4, 3, hairColor); set(11, 3, hairColor);
  } else if (look.hairStyle === 'long') {
    rect(5, 0, 6, 1, hairColor);
    rect(4, 1, 8, 2, hairColor);
    set(4, 3, hairColor); set(11, 3, hairColor);
    set(4, 4, hairColor); set(11, 4, hairColor);
    set(4, 5, hairColor); set(11, 5, hairColor);
  } else if (look.hairStyle === 'fade') {
    rect(5, 0, 6, 1, hairColor);
    rect(5, 1, 6, 1, hairColor);
  }

  // === HEAD (rows 2-5) ===
  rect(5, 2, 6, 4, skinTone);

  // Eyes
  if (isSleeping) {
    // Closed eyes — horizontal lines
    set(6, 3, eyeColor); set(7, 3, eyeColor);
    set(9, 3, eyeColor); set(10, 3, eyeColor);
  } else {
    set(6, 3, eyeColor); set(7, 3, '#ffffff');
    set(9, 3, eyeColor); set(10, 3, '#ffffff');
  }

  // Mouth
  if (isSleeping) {
    set(7, 5, '#c9846b'); set(8, 5, '#c9846b');
  } else {
    set(7, 5, '#d4937a'); set(8, 5, '#d4937a'); set(9, 5, '#d4937a');
  }

  // === ACCESSORY ===
  if (accessory === 'headphones') {
    set(4, 2, '#555'); set(4, 3, '#555');
    set(11, 2, '#555'); set(11, 3, '#555');
    rect(4, 1, 8, 1, '#555');
  } else if (accessory === 'glasses') {
    set(5, 3, '#888'); rect(6, 3, 2, 1, '#aaddff');
    set(8, 3, '#888');
    rect(9, 3, 2, 1, '#aaddff'); set(11, 3, '#888');
  } else if (accessory === 'cap') {
    rect(4, 0, 9, 1, shirtColor);
    rect(3, 1, 2, 1, shirtColor); // brim
  } else if (accessory === 'earring') {
    set(11, 4, '#ffd700');
  }

  // === BODY / SHIRT (rows 6-9) ===
  rect(5, 6, 6, 4, shirtColor);

  // Arms
  const armWalk = isWalking ? Math.sin(frame * 0.3) * 0.5 : 0;
  if (isWorking) {
    // Arms forward (typing)
    rect(3, 6, 2, 2, shirtColor); // left arm
    rect(11, 6, 2, 2, shirtColor); // right arm
    rect(3, 8, 2, 1, skinTone); // left hand
    rect(11, 8, 2, 1, skinTone); // right hand
  } else {
    // Normal arms
    const leftArmY = 6 + (armWalk > 0 ? 0 : 1);
    const rightArmY = 6 + (armWalk < 0 ? 0 : 1);
    rect(3, leftArmY, 2, 3, shirtColor);
    rect(3, leftArmY + 3, 2, 1, skinTone); // hand
    rect(11, rightArmY, 2, 3, shirtColor);
    rect(11, rightArmY + 3, 2, 1, skinTone); // hand
  }

  // === PANTS (rows 10-12) ===
  rect(5, 10, 6, 3, pantsColor);

  // === LEGS/SHOES (rows 13-15) ===
  if (isWalking) {
    const walkFrame = Math.floor(frame / 4) % 4;
    if (walkFrame === 0 || walkFrame === 2) {
      rect(5, 13, 3, 2, pantsColor); rect(8, 13, 3, 2, pantsColor);
      rect(5, 15, 3, 1, shoeColor); rect(8, 15, 3, 1, shoeColor);
    } else if (walkFrame === 1) {
      rect(4, 13, 3, 2, pantsColor); rect(9, 13, 3, 2, pantsColor);
      rect(4, 15, 3, 1, shoeColor); rect(9, 15, 3, 1, shoeColor);
    } else {
      rect(6, 13, 3, 2, pantsColor); rect(7, 13, 3, 2, pantsColor);
      rect(6, 15, 3, 1, shoeColor); rect(7, 15, 3, 1, shoeColor);
    }
  } else {
    rect(5, 13, 3, 2, pantsColor); rect(8, 13, 3, 2, pantsColor);
    rect(5, 15, 3, 1, shoeColor); rect(8, 15, 3, 1, shoeColor);
  }

  // Sleeping pose — shift to lying down effect (ZZZ above)
  if (isSleeping) {
    // Leave vertical but darken slightly
  }

  return grid;
}

// Render pixel grid to a canvas and return as data URL
function renderSpriteToCanvas(grid, scale) {
  const s = scale || PIXEL;
  const W = grid[0].length;
  const H = grid.length;
  const canvas = document.createElement('canvas');
  canvas.width = W * s;
  canvas.height = H * s;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x]) {
        ctx.fillStyle = grid[y][x];
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }

  return canvas;
}

// Create a full agent sprite element with thought bubble
function createAgentSprite(agentSim, frame) {
  const look = AGENT_LOOKS[agentSim.id];
  if (!look) return null;

  const grid = generateCharacterPixels(look, agentSim.state, frame || 0);
  const canvas = renderSpriteToCanvas(grid, 3);

  return canvas.toDataURL();
}

// Pre-render sprite sheets for performance
class SpriteManager {
  constructor() {
    this.cache = {};
    this.frame = 0;
  }

  getSprite(agentId, state) {
    const key = `${agentId}-${state}-${Math.floor(this.frame / 4) % 4}`;
    if (!this.cache[key]) {
      const look = AGENT_LOOKS[agentId];
      if (!look) return null;
      const grid = generateCharacterPixels(look, state, this.frame);
      const canvas = renderSpriteToCanvas(grid, 3);
      this.cache[key] = canvas.toDataURL();
      // Limit cache size
      const keys = Object.keys(this.cache);
      if (keys.length > 100) {
        delete this.cache[keys[0]];
      }
    }
    return this.cache[key];
  }

  tick() {
    this.frame++;
  }
}

window.SpriteManager = SpriteManager;
window.AGENT_LOOKS = AGENT_LOOKS;
window.createAgentSprite = createAgentSprite;
