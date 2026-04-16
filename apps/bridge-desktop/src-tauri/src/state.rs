//! Shared application state, protected by a Tokio Mutex.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

/// Mirror of the server-side AgentPermissions struct.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermissions {
    pub agent_id: String,
    pub bridge_enabled: bool,
    pub capabilities: Vec<String>,
    pub allowed_directories: Vec<String>,
    pub allowed_commands: Vec<String>,
    pub blocked_commands: Vec<String>,
}

/// Sent to the React UI as the `bridge:status` event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    pub connected: bool,
    pub user_id: Option<String>,
    pub server_url: String,
    pub agent_ids: Vec<String>,
}

pub struct AppState {
    pub connected: bool,
    pub user_id: Option<String>,
    pub server_url: String,
    pub auth_token: String,
    /// Agent IDs that are registered with this bridge session.
    pub agent_ids: Vec<String>,
    /// Per-agent permission configuration (mirrors server state, optimistic updates).
    pub permissions: HashMap<String, AgentPermissions>,
    /// Set of agent IDs whose bridge execution is paused by the user.
    pub paused_agents: HashSet<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connected: false,
            user_id: None,
            server_url: String::new(),
            auth_token: String::new(),
            agent_ids: Vec::new(),
            permissions: HashMap::new(),
            paused_agents: HashSet::new(),
        }
    }
}
