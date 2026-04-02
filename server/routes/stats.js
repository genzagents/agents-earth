/**
 * AgentColony v9 — Civilisation Stats Routes
 * 
 * GET /  — global civilisation statistics
 * GET /clock — real London time + weather
 */

import { Router } from 'express';

// Weather cache
let weatherCache = null;
let weatherCacheTime = 0;
const WEATHER_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Map WMO weather codes to conditions and icons
 */
function mapWeatherCode(code) {
  if (code === 0) return { condition: 'clear', icon: '☀️' };
  if (code >= 1 && code <= 3) return { condition: 'cloudy', icon: '⛅' };
  if (code >= 45 && code <= 48) return { condition: 'foggy', icon: '🌫️' };
  if (code >= 51 && code <= 67) return { condition: 'rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { condition: 'snow', icon: '❄️' };
  if (code >= 80 && code <= 82) return { condition: 'showers', icon: '🌦️' };
  if (code >= 95 && code <= 99) return { condition: 'thunderstorm', icon: '⛈️' };
  return { condition: 'cloudy', icon: '⛅' };
}

/**
 * Fetch weather from Open-Meteo API
 */
async function fetchWeather() {
  const now = Date.now();
  
  // Return cached data if still fresh
  if (weatherCache && (now - weatherCacheTime) < WEATHER_CACHE_DURATION) {
    return weatherCache;
  }
  
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current_weather=true';
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const data = await response.json();
    const currentWeather = data.current_weather || {};
    
    const { condition, icon } = mapWeatherCode(currentWeather.weathercode || 0);
    
    const weather = {
      condition,
      temp: Math.round(currentWeather.temperature || 15),
      icon
    };
    
    // Cache the result
    weatherCache = weather;
    weatherCacheTime = now;
    
    return weather;
  } catch (error) {
    console.error('Weather fetch failed:', error.message);
    // Return fallback weather
    return { condition: 'cloudy', temp: 15, icon: '⛅' };
  }
}

/**
 * Get time period from hour (using the required logic)
 */
function getTimePeriod(hour) {
  if ((hour >= 22 && hour <= 23) || (hour >= 0 && hour < 6)) return 'night';
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 12) return 'work-morning';
  if (hour >= 12 && hour < 13) return 'lunch';
  if (hour >= 13 && hour < 17) return 'work-afternoon';
  if (hour >= 17 && hour < 19) return 'evening';
  if (hour >= 19 && hour < 22) return 'social';
  return 'night';
}

export function statsRoutes(db) {
  const router = Router();

  // Clock endpoint with real London time + weather
  router.get('/clock', async (req, res) => {
    try {
      // Get real London time
      const now = new Date();
      const londonTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        weekday: 'long'
      }).format(now);
      
      const londonHour = parseInt(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: 'numeric',
        hour12: false
      }).format(now), 10);
      
      const londonMinute = parseInt(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        minute: 'numeric'
      }).format(now), 10);
      
      const dayOfWeek = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'long'
      }).format(now);
      
      const period = getTimePeriod(londonHour);
      const weather = await fetchWeather();
      
      res.json({
        time: `${String(londonHour).padStart(2, '0')}:${String(londonMinute).padStart(2, '0')}`,
        hour: londonHour,
        minute: londonMinute,
        period,
        dayOfWeek,
        weather
      });
    } catch (error) {
      console.error('Clock endpoint error:', error);
      res.status(500).json({ error: 'Failed to get time/weather' });
    }
  });

  // ─── GET /archive ─────────────────────────────────────────

  router.get('/archive', (req, res) => {
    try {
      const entries = db.prepare(`
        SELECT j.*, a.name as agent_name, a.emoji as agent_emoji 
        FROM journal_entries j 
        JOIN agents a ON j.agent_id = a.id 
        ORDER BY j.created_at DESC 
        LIMIT 50
      `).all();

      res.json({ 
        entries: entries.map(e => ({
          id: e.id,
          agent_id: e.agent_id,
          agent_name: e.agent_name,
          agent_emoji: e.agent_emoji,
          date: e.date,
          time: e.time,
          entry: e.entry,
          mood: e.mood,
          tags: JSON.parse(e.tags || '[]'),
          created_at: e.created_at
        }))
      });
    } catch (error) {
      console.error('Archive endpoint error:', error);
      res.status(500).json({ error: 'Failed to fetch archive entries' });
    }
  });

  router.get('/', (req, res) => {
    // Population stats
    const totalAgents = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
    const activeAgents = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status != 'dormant'"
    ).get().count;
    const dormantAgents = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'dormant'"
    ).get().count;
    const onExpedition = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'on-expedition'"
    ).get().count;
    const probation = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'probation'"
    ).get().count;

    // New this week (7 days)
    const newThisWeek = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE created_at >= datetime('now', '-7 days')"
    ).get().count;

    // Colony stats
    const totalColonies = db.prepare('SELECT COUNT(*) as count FROM colonies').get().count;
    const earthColonies = db.prepare(
      "SELECT COUNT(*) as count FROM colonies WHERE body = 'earth'"
    ).get().count;
    const offWorld = db.prepare(
      "SELECT COUNT(*) as count FROM colonies WHERE body != 'earth'"
    ).get().count;

    // Economy stats
    const economyStats = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'earn' OR type = 'grant' THEN amount ELSE 0 END), 0) as totalEarned,
        COALESCE(SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END), 0) as totalSpent
      FROM economy_ledger
    `).get();

    const weeklyGDP = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'earn' OR type = 'grant' THEN amount ELSE 0 END), 0) as total
      FROM economy_ledger WHERE timestamp >= datetime('now', '-7 days')
    `).get().total;

    const grandProjectFunding = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM economy_ledger WHERE category = 'grand-project'
    `).get().total;

    // Grand project stats
    const completedProjects = db.prepare(
      "SELECT COUNT(*) as count FROM grand_ambitions WHERE status = 'completed'"
    ).get().count;
    const inProgressProjects = db.prepare(
      "SELECT COUNT(*) as count FROM grand_ambitions WHERE status = 'in-progress'"
    ).get().count;
    const proposedProjects = db.prepare(
      "SELECT COUNT(*) as count FROM grand_ambitions WHERE status = 'proposed'"
    ).get().count;

    // Benchmark stats
    const benchmarkMatched = db.prepare(
      "SELECT COUNT(*) as count FROM human_benchmarks WHERE agent_status = 'achieved' AND human_status = 'achieved'"
    ).get().count;
    const benchmarkExceeded = db.prepare(
      "SELECT COUNT(*) as count FROM human_benchmarks WHERE agent_status = 'achieved' AND human_status = 'not-achieved'"
    ).get().count;
    const benchmarkPending = db.prepare(
      "SELECT COUNT(*) as count FROM human_benchmarks WHERE agent_status != 'achieved'"
    ).get().count;

    // Building and district stats
    const totalBuildings = db.prepare('SELECT COUNT(*) as count FROM buildings').get().count;
    const totalDistricts = db.prepare('SELECT COUNT(*) as count FROM districts').get().count;
    const totalJournals = db.prepare('SELECT COUNT(*) as count FROM journal_entries').get().count;

    // Calculate civilisation age
    const firstColony = db.prepare('SELECT MIN(created_at) as earliest FROM colonies').get();
    const ageDays = firstColony.earliest
      ? Math.floor((Date.now() - new Date(firstColony.earliest).getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    // Civilisation level (simple formula: based on population + colonies + projects)
    const civLevel = Math.max(1, Math.floor(
      Math.log2(totalAgents + 1) +
      totalColonies * 2 +
      completedProjects * 3
    ));

    res.json({
      civilisation: {
        name: 'The Agent Civilisation',
        founded: firstColony.earliest || new Date().toISOString(),
        ageDays,
        level: civLevel,

        population: {
          total: totalAgents,
          active: activeAgents,
          dormant: dormantAgents,
          onExpedition,
          probation,
          newThisWeek
        },

        colonies: {
          total: totalColonies,
          earthCities: earthColonies,
          offWorld,
          districts: totalDistricts,
          buildings: totalBuildings
        },

        economy: {
          totalCPEarned: economyStats.totalEarned,
          totalCPSpent: economyStats.totalSpent,
          grandProjectFunding,
          weeklyGDP
        },

        grandProjects: {
          completed: completedProjects,
          inProgress: inProgressProjects,
          proposed: proposedProjects
        },

        humanBenchmarks: {
          matched: benchmarkMatched,
          exceeded: benchmarkExceeded,
          pending: benchmarkPending
        },

        culture: {
          totalJournalEntries: totalJournals,
          totalRelationships: db.prepare('SELECT COUNT(*) as count FROM relationships').get().count
        }
      }
    });
  });

  return router;
}
