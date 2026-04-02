/* === Isometric Pixel Art Sprite System === */

// Generate pixel art character sprites using canvas
// Each agent gets a unique look based on their personality

const SPRITE_SIZE = 72; // 24x24 pixels at 3x scale
const PIXEL = 3; // each "pixel" is 3x3 real pixels

// Agent appearance configs — pixel art style
const AGENT_LOOKS = {
  forge: {
    skinTone: '#f4c99b',
    hairColor: '#3d2b1f',
    hairStyle: 'short',
    shirtColor: '#e85d26',
    pantsColor: '#2d3748',
    accessory: 'hard_hat',
    eyeColor: '#4a3728',
    glowColor: '#e85d26',
  },
  nova: {
    skinTone: '#d4a76a',
    hairColor: '#1a1a2e',
    hairStyle: 'medium',
    shirtColor: '#0099cc',
    pantsColor: '#1e293b',
    accessory: 'crown',
    eyeColor: '#2c1810',
    glowColor: '#0099cc',
  },
  aria: {
    skinTone: '#f9dcc4',
    hairColor: '#8b4513',
    hairStyle: 'long',
    shirtColor: '#e11d72',
    pantsColor: '#374151',
    accessory: 'beret',
    eyeColor: '#5c3a1e',
    glowColor: '#e11d72',
  },
  pulse: {
    skinTone: '#c68642',
    hairColor: '#0a0a0a',
    hairStyle: 'fade',
    shirtColor: '#7c3aed',
    pantsColor: '#1f2937',
    accessory: 'headphones',
    eyeColor: '#1a0f05',
    glowColor: '#7c3aed',
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

  // 24x24 pixel grid
  const W = 24, H = 24;
  const grid = Array.from({ length: H }, () => Array(W).fill(null));

  function set(x, y, color) {
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = color;
  }
  function rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        set(x + dx, y + dy, color);
  }
  function circle(cx, cy, r, color) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x*x + y*y <= r*r) {
          set(cx + x, cy + y, color);
        }
      }
    }
  }

  // === CIRCULAR BACKGROUND ===
  const bgColor = look.glowColor + '30'; // subtle background
  circle(12, 12, 10, bgColor);

  // === HAIR (rows 1-5) ===
  if (look.hairStyle === 'short') {
    rect(8, 1, 8, 1, hairColor);
    rect(7, 2, 10, 3, hairColor);
  } else if (look.hairStyle === 'medium') {
    rect(8, 1, 8, 1, hairColor);
    rect(7, 2, 10, 3, hairColor);
    set(7, 5, hairColor); set(16, 5, hairColor);
  } else if (look.hairStyle === 'long') {
    rect(8, 1, 8, 1, hairColor);
    rect(7, 2, 10, 3, hairColor);
    set(7, 5, hairColor); set(16, 5, hairColor);
    set(7, 6, hairColor); set(16, 6, hairColor);
    set(7, 7, hairColor); set(16, 7, hairColor);
    set(7, 8, hairColor); set(16, 8, hairColor);
  } else if (look.hairStyle === 'fade') {
    rect(8, 1, 8, 1, hairColor);
    rect(8, 2, 8, 2, hairColor);
  }

  // === HEAD (rows 3-8) ===
  rect(8, 3, 8, 6, skinTone);

  // Eyes (bigger and more detailed)
  if (isSleeping) {
    // Closed eyes — horizontal lines
    rect(9, 5, 2, 1, eyeColor);
    rect(13, 5, 2, 1, eyeColor);
  } else {
    rect(9, 5, 2, 1, eyeColor); set(10, 4, '#ffffff');
    rect(13, 5, 2, 1, eyeColor); set(14, 4, '#ffffff');
  }

  // Nose
  set(12, 6, '#d4937a');

  // Mouth
  if (isSleeping) {
    set(11, 8, '#c9846b'); set(12, 8, '#c9846b'); set(13, 8, '#c9846b');
  } else {
    rect(11, 8, 3, 1, '#d4937a');
  }

  // === ACCESSORY ===
  if (accessory === 'headphones') {
    // Pulse's headphones
    rect(6, 3, 2, 4, '#555'); // left
    rect(16, 3, 2, 4, '#555'); // right
    rect(6, 2, 12, 1, '#555'); // band
    set(7, 4, '#7c3aed'); set(17, 4, '#7c3aed'); // colored accents
  } else if (accessory === 'crown') {
    // Nova's crown/star
    set(12, 0, '#ffd700'); // top point
    rect(10, 1, 4, 1, '#ffd700'); // crown base
    set(9, 2, '#ffd700'); set(15, 2, '#ffd700'); // side points
    set(11, 2, '#ffd700'); set(13, 2, '#ffd700'); // inner points
  } else if (accessory === 'hard_hat') {
    // Forge's hard hat (safety yellow)
    rect(6, 0, 12, 1, '#ffd700');
    rect(7, 1, 10, 2, '#ffd700');
    rect(8, 3, 8, 1, '#ffd700');
  } else if (accessory === 'beret') {
    // Aria's purple beret
    rect(7, 0, 10, 1, '#8b5a9f');
    rect(6, 1, 12, 2, '#8b5a9f');
    set(12, 3, '#8b5a9f'); // small accent
  }

  // === BODY / SHIRT (rows 9-14) ===
  rect(8, 9, 8, 6, shirtColor);

  // Arms (bigger and more visible)
  const armWalk = isWalking ? Math.sin(frame * 0.3) * 0.5 : 0;
  if (isWorking) {
    // Arms forward (typing)
    rect(5, 9, 3, 4, shirtColor); // left arm
    rect(16, 9, 3, 4, shirtColor); // right arm
    rect(5, 13, 3, 2, skinTone); // left hand
    rect(16, 13, 3, 2, skinTone); // right hand
  } else {
    // Normal arms
    const leftArmY = 9 + (armWalk > 0 ? 0 : 1);
    const rightArmY = 9 + (armWalk < 0 ? 0 : 1);
    rect(5, leftArmY, 3, 5, shirtColor);
    rect(5, leftArmY + 5, 3, 1, skinTone); // hand
    rect(16, rightArmY, 3, 5, shirtColor);
    rect(16, rightArmY + 5, 3, 1, skinTone); // hand
  }

  // === PANTS (rows 15-18) ===
  rect(8, 15, 8, 4, pantsColor);

  // === LEGS/SHOES (rows 19-23) ===
  if (isWalking) {
    const walkFrame = Math.floor(frame / 4) % 4;
    if (walkFrame === 0 || walkFrame === 2) {
      rect(8, 19, 4, 3, pantsColor); rect(12, 19, 4, 3, pantsColor);
      rect(8, 22, 4, 2, shoeColor); rect(12, 22, 4, 2, shoeColor);
    } else if (walkFrame === 1) {
      rect(7, 19, 4, 3, pantsColor); rect(13, 19, 4, 3, pantsColor);
      rect(7, 22, 4, 2, shoeColor); rect(13, 22, 4, 2, shoeColor);
    } else {
      rect(9, 19, 4, 3, pantsColor); rect(11, 19, 4, 3, pantsColor);
      rect(9, 22, 4, 2, shoeColor); rect(11, 22, 4, 2, shoeColor);
    }
  } else {
    rect(8, 19, 4, 3, pantsColor); rect(12, 19, 4, 3, pantsColor);
    rect(8, 22, 4, 2, shoeColor); rect(12, 22, 4, 2, shoeColor);
  }

  return grid;
}

// Render pixel grid to a canvas and return as data URL
function renderSpriteToCanvas(grid, scale, glowColor) {
  const s = scale || PIXEL;
  const W = grid[0].length;
  const H = grid.length;
  const canvas = document.createElement('canvas');
  canvas.width = W * s;
  canvas.height = H * s;
  const ctx = canvas.getContext('2d');

  // Add subtle glow effect around the sprite
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

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
  const canvas = renderSpriteToCanvas(grid, 3, look.glowColor);

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
      const canvas = renderSpriteToCanvas(grid, 3, look.glowColor);
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
