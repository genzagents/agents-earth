/* === Agent Data API Client === */

// Status type → display info
const STATUS_DISPLAY = {
  working:     { label: 'Working', color: '#16a34a', dot: '🟢' },
  socialising: { label: 'Socialising', color: '#7c3aed', dot: '💬' },
  relaxing:    { label: 'Relaxing', color: '#d97706', dot: '🟡' },
  sleeping:    { label: 'Sleeping', color: '#6b7280', dot: '😴' },
  exploring:   { label: 'Exploring', color: '#0891b2', dot: '🗺️' },
  creating:    { label: 'Creating', color: '#e11d72', dot: '🎨' },
  building:    { label: 'Building', color: '#e85d26', dot: '🏗️' },
  offline:     { label: 'Offline', color: '#6b7280', dot: '⚪' },
};

/**
 * Fetch agents from the backend API
 * @returns {Promise<Array>} Array of agent objects
 */
async function fetchAgents() {
  try {
    const response = await fetch('/api/v1/agents');
    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.status}`);
    }
    const data = await response.json();
    return data.agents || [];
  } catch (error) {
    console.error('Error fetching agents:', error);
    return [];
  }
}

// Export for global access
window.fetchAgents = fetchAgents;
window.STATUS_DISPLAY = STATUS_DISPLAY;