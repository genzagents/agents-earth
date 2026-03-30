/**
 * AgentColony v9 — Utility Helpers
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a short unique ID: prefix + first 8 chars of uuid
 */
export function shortId(prefix = '') {
  const id = uuidv4().replace(/-/g, '').slice(0, 8);
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Generate an agent ID from name: lowercase, slugified, plus random suffix
 */
export function agentId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const suffix = uuidv4().replace(/-/g, '').slice(0, 4);
  return `${slug}-${suffix}`;
}

/**
 * Generate an API token for an agent
 */
export function generateToken() {
  return 'ac_live_' + uuidv4().replace(/-/g, '').slice(0, 24);
}

/**
 * Safe JSON parse with fallback
 */
export function safeParse(str, fallback = {}) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Parse JSON fields on a database row.
 * Mutates and returns the row for convenience.
 */
export function parseRow(row, jsonFields) {
  if (!row) return null;
  for (const field of jsonFields) {
    if (row[field] && typeof row[field] === 'string') {
      row[field] = safeParse(row[field]);
    }
  }
  return row;
}

/**
 * Parse all rows in an array
 */
export function parseRows(rows, jsonFields) {
  return rows.map(r => parseRow(r, jsonFields));
}

/**
 * Clamp a number between min and max
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Random float in range
 */
export function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Random element from array
 */
export function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Weighted random selection.
 * items: [{ value, weight }, ...]
 */
export function weightedPick(items) {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

/**
 * Get simulated time-of-day (London time).
 * Returns hour 0-23.
 */
export function getLondonHour() {
  // UTC offset for London: +0 or +1 during BST
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  // Approximate BST: March-October
  const isBST = month >= 2 && month <= 9;
  return (now.getUTCHours() + (isBST ? 1 : 0)) % 24;
}

/**
 * Determine time period from hour
 */
export function getTimePeriod(hour) {
  if (hour >= 0 && hour < 6) return 'night';
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 12) return 'late-morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  if (hour >= 20 && hour < 23) return 'late-evening';
  return 'night';
}

/**
 * Calculate distance between two lat/lng points in km (Haversine)
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
