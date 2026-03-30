/**
 * AgentColony v9 — WebSocket Manager
 * 
 * Handles real-time event broadcasting to connected clients.
 * Clients subscribe to a colony and receive all events for that colony.
 * 
 * Protocol:
 *   Client → Server: { "type": "subscribe", "colony": "london" }
 *   Client → Server: { "type": "unsubscribe" }
 *   Server → Client: { "type": "event", "event": "...", "data": {...} }
 */

/**
 * Create a WebSocket manager that wraps a WebSocketServer instance.
 */
export function createWSManager(wss) {
  // Map of colonyId → Set<ws>
  const subscriptions = new Map();

  // Track all connected clients
  const clients = new Set();

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    ws._colony = null; // which colony this client is subscribed to

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      unsubscribe(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
      unsubscribe(ws);
    });

    // Send welcome
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to AgentColony v9. Send {"type":"subscribe","colony":"london"} to start receiving events.',
      timestamp: new Date().toISOString()
    }));
  });

  function handleMessage(ws, msg) {
    switch (msg.type) {
      case 'subscribe':
        subscribe(ws, msg.colony || 'london');
        break;
      case 'unsubscribe':
        unsubscribe(ws);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  }

  function subscribe(ws, colonyId) {
    // Unsubscribe from previous colony first
    unsubscribe(ws);

    ws._colony = colonyId;
    if (!subscriptions.has(colonyId)) {
      subscriptions.set(colonyId, new Set());
    }
    subscriptions.get(colonyId).add(ws);

    ws.send(JSON.stringify({
      type: 'subscribed',
      colony: colonyId,
      timestamp: new Date().toISOString()
    }));
  }

  function unsubscribe(ws) {
    if (ws._colony && subscriptions.has(ws._colony)) {
      subscriptions.get(ws._colony).delete(ws);
      if (subscriptions.get(ws._colony).size === 0) {
        subscriptions.delete(ws._colony);
      }
    }
    ws._colony = null;
  }

  /**
   * Broadcast an event to all clients subscribed to a colony.
   */
  function broadcast(colonyId, event, data) {
    const payload = JSON.stringify({
      type: 'event',
      event,
      colony: colonyId,
      data,
      timestamp: new Date().toISOString()
    });

    const subs = subscriptions.get(colonyId);
    if (!subs) return;

    for (const ws of subs) {
      if (ws.readyState === 1) { // OPEN
        ws.send(payload);
      }
    }
  }

  /**
   * Broadcast to ALL connected clients regardless of colony subscription.
   */
  function broadcastGlobal(event, data) {
    const payload = JSON.stringify({
      type: 'event',
      event,
      colony: '*',
      data,
      timestamp: new Date().toISOString()
    });

    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  return {
    broadcast,
    broadcastGlobal,
    getSubscriberCount(colonyId) {
      return subscriptions.has(colonyId) ? subscriptions.get(colonyId).size : 0;
    },
    getTotalConnections() {
      return clients.size;
    }
  };
}
