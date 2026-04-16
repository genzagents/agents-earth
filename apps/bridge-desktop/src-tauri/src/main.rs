// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge_ws;
mod state;
mod tray;

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use tokio::sync::Mutex;

use state::{AgentPermissions, AppState, BridgeStatus};

// ─────────────────────────────────────────────
// Tauri commands (callable from the React UI)
// ─────────────────────────────────────────────

/// Returns current connection status + agent list.
#[tauri::command]
async fn get_bridge_status(state: State<'_, Arc<Mutex<AppState>>>) -> Result<BridgeStatus, String> {
    let s = state.lock().await;
    Ok(BridgeStatus {
        connected: s.connected,
        user_id: s.user_id.clone(),
        server_url: s.server_url.clone(),
        agent_ids: s.agent_ids.clone(),
    })
}

/// Returns the permissions for all agents known to this bridge session.
#[tauri::command]
async fn list_agent_permissions(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<serde_json::Value>, String> {
    let s = state.lock().await;
    let list: Vec<serde_json::Value> = s
        .permissions
        .iter()
        .map(|(agent_id, perms)| {
            serde_json::json!({
                "agentId": agent_id,
                "permissions": perms,
            })
        })
        .collect();
    Ok(list)
}

/// Called by the UI to pause/resume or update capabilities for an agent.
#[tauri::command]
async fn set_agent_permissions(
    agent_id: String,
    permissions: AgentPermissions,
    state: State<'_, Arc<Mutex<AppState>>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut s = state.lock().await;
        if permissions.bridge_enabled {
            s.paused_agents.remove(&agent_id);
        } else {
            s.paused_agents.insert(agent_id.clone());
        }
        s.permissions.insert(agent_id.clone(), permissions.clone());
    }

    // Sync to server (fire-and-forget; don't block the UI)
    let server_url = {
        let s = state.lock().await;
        s.server_url.clone()
    };
    let auth_token = {
        let s = state.lock().await;
        s.auth_token.clone()
    };
    let perms_clone = permissions.clone();
    let agent_id_clone = agent_id.clone();
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let url = format!("{server_url}/api/bridge/{agent_id_clone}/permissions");
        let _ = client
            .put(&url)
            .bearer_auth(&auth_token)
            .json(&perms_clone)
            .send()
            .await;
    });

    // Notify the UI about the change
    let _ = app.emit(
        "bridge:permissions_updated",
        serde_json::json!({ "agentId": agent_id, "permissions": permissions }),
    );

    Ok(())
}

/// Returns pending approvals from server.
#[tauri::command]
async fn list_pending_approvals(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<serde_json::Value, String> {
    let (server_url, auth_token) = {
        let s = state.lock().await;
        (s.server_url.clone(), s.auth_token.clone())
    };

    let client = reqwest::Client::new();
    let url = format!("{server_url}/api/bridge/approvals");
    let resp = client
        .get(&url)
        .bearer_auth(&auth_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct ResolvePayload {
    status: String,
}

/// Resolves a pending approval (approved | denied).
#[tauri::command]
async fn resolve_approval(
    approval_id: String,
    status: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let (server_url, auth_token) = {
        let s = state.lock().await;
        (s.server_url.clone(), s.auth_token.clone())
    };

    let client = reqwest::Client::new();
    let url = format!("{server_url}/api/bridge/approvals/{approval_id}/resolve");
    client
        .post(&url)
        .bearer_auth(&auth_token)
        .json(&ResolvePayload { status })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ─────────────────────────────────────────────
// App entry point
// ─────────────────────────────────────────────

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("genz_bridge=debug".parse().unwrap()),
        )
        .init();

    let app_state = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state.clone())
        .setup(|app| {
            let handle = app.handle().clone();

            // System tray
            tray::setup_tray(&handle)?;

            // Spawn WebSocket loop
            bridge_ws::spawn_ws_loop(handle.clone(), app_state.clone());

            // On first launch, load auth token from env / secure store
            // (In production this comes from the user's web login session stored
            //  via the Tauri secure storage plugin or keyring crate.)
            let token = std::env::var("GENZ_BRIDGE_TOKEN").unwrap_or_default();
            let server_url = std::env::var("GENZ_SERVER_URL")
                .unwrap_or_else(|_| "https://genzagents.io".to_string());

            let state_clone = app_state.clone();
            tauri::async_runtime::spawn(async move {
                let mut s = state_clone.lock().await;
                s.auth_token = token;
                s.server_url = server_url;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bridge_status,
            list_agent_permissions,
            set_agent_permissions,
            list_pending_approvals,
            resolve_approval,
        ])
        .on_window_event(|window, event| {
            // Intercept close → hide to tray instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running GenZ Bridge");
}
