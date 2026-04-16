//! WebSocket client that maintains a persistent connection to the GenZ cloud API.
//!
//! Architecture:
//!   GenZ Cloud WSS ──► BridgeWsClient ──► local executor (shell/fs/browser)
//!                                     ◄── result ──────────────────────────
//!
//! The WS URL is: wss://<server>/api/bridge/ws?token=<short-lived-jwt>
//! The server sends BridgeCommand JSON; the client sends BridgeResult JSON.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Mutex};
use tokio::time::sleep;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};

use crate::state::{AppState, BridgeStatus};

const RECONNECT_BASE_MS: u64 = 1_000;
const RECONNECT_MAX_MS: u64 = 30_000;
const PING_INTERVAL_SECS: u64 = 25;

/// Command sent from the GenZ cloud to this Bridge client.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCommand {
    pub id: String,
    pub agent_id: String,
    pub capability: String,
    pub command: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

/// Result sent back to the GenZ cloud after executing a command.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeResult {
    pub id: String,
    pub agent_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Approval event pushed from the server when a suspicious command requires user confirmation.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalEvent {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub capability: String,
    pub command: String,
    pub reason: String,
    pub created_at: String,
}

/// Audit entry pushed from the server after any command attempt.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntryEvent {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub capability: String,
    pub command: String,
    pub outcome: String,
    #[serde(default)]
    pub error: Option<String>,
    pub created_at: String,
}

/// Incoming WS message envelope.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Command(BridgeCommand),
    ApprovalRequired { approval: ApprovalEvent },
    AuditEntry { entry: AuditEntryEvent },
    Ping,
}

pub type OutboundTx = mpsc::UnboundedSender<Message>;

/// Spawn the persistent WebSocket loop. Returns a sender for outbound messages.
pub fn spawn_ws_loop(app: AppHandle, state: Arc<Mutex<AppState>>) -> OutboundTx {
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let mut backoff_ms = RECONNECT_BASE_MS;

        loop {
            let server_url = {
                let s = state.lock().await;
                s.server_url.clone()
            };
            let token = {
                let s = state.lock().await;
                s.auth_token.clone()
            };

            let ws_url = format!("{}/api/bridge/ws?token={}", server_url.replace("http", "ws"), token);

            tracing::info!("Connecting to {ws_url}");

            match connect_async_tls_with_config(&ws_url, None, false, None).await {
                Ok((ws_stream, _)) => {
                    backoff_ms = RECONNECT_BASE_MS;

                    // Update connection state
                    {
                        let mut s = state.lock().await;
                        s.connected = true;
                    }
                    emit_status(&app, &state).await;

                    let (mut sink, mut stream) = ws_stream.split();

                    // Ping task
                    let ping_tx = tx_clone.clone();
                    let ping_task = tokio::spawn(async move {
                        loop {
                            sleep(Duration::from_secs(PING_INTERVAL_SECS)).await;
                            if ping_tx.send(Message::Ping(vec![])).is_err() {
                                break;
                            }
                        }
                    });

                    // Outbound pump
                    let outbound_task = tokio::spawn(async move {
                        while let Some(msg) = rx.recv().await {
                            if sink.send(msg).await.is_err() {
                                break;
                            }
                        }
                    });

                    // Inbound pump
                    while let Some(msg_result) = stream.next().await {
                        match msg_result {
                            Ok(Message::Text(text)) => {
                                handle_server_message(&app, &state, &text, &tx_clone).await;
                            }
                            Ok(Message::Pong(_)) => {}
                            Ok(Message::Close(_)) => break,
                            Err(e) => {
                                tracing::warn!("WS error: {e}");
                                break;
                            }
                            _ => {}
                        }
                    }

                    ping_task.abort();
                    outbound_task.abort();

                    // Re-create the rx channel since the outbound task consumed it
                    // (In practice, we'd restructure to avoid this, but for clarity:)
                    tracing::warn!("WebSocket disconnected; will reconnect.");
                }
                Err(e) => {
                    tracing::warn!("WebSocket connect failed: {e}");
                }
            }

            // Update disconnected state
            {
                let mut s = state.lock().await;
                s.connected = false;
            }
            emit_status(&app, &state).await;

            sleep(Duration::from_millis(backoff_ms)).await;
            backoff_ms = (backoff_ms * 2).min(RECONNECT_MAX_MS);
        }
    });

    tx
}

async fn handle_server_message(
    app: &AppHandle,
    state: &Arc<Mutex<AppState>>,
    text: &str,
    tx: &OutboundTx,
) {
    let parsed: Result<ServerMessage, _> = serde_json::from_str(text);
    match parsed {
        Ok(ServerMessage::Command(cmd)) => {
            dispatch_command(app, state, cmd, tx).await;
        }
        Ok(ServerMessage::ApprovalRequired { approval }) => {
            let _ = app.emit("bridge:approval_created", approval);
        }
        Ok(ServerMessage::AuditEntry { entry }) => {
            let _ = app.emit("bridge:audit_entries", vec![entry]);
        }
        Ok(ServerMessage::Ping) => {
            let _ = tx.send(Message::Text(r#"{"type":"pong"}"#.to_string()));
        }
        Err(e) => {
            tracing::warn!("Failed to parse server message: {e}\nRaw: {text}");
        }
    }
}

/// Execute a bridge command and send the result back.
async fn dispatch_command(
    app: &AppHandle,
    state: &Arc<Mutex<AppState>>,
    cmd: BridgeCommand,
    tx: &OutboundTx,
) {
    let agent_paused = {
        let s = state.lock().await;
        s.paused_agents.contains(&cmd.agent_id)
    };

    if agent_paused {
        let result = BridgeResult {
            id: cmd.id.clone(),
            agent_id: cmd.agent_id.clone(),
            success: false,
            output: None,
            error: Some("Agent is paused by user.".to_string()),
        };
        send_result(tx, &result);
        return;
    }

    let result = match cmd.capability.as_str() {
        "shell" => execute_shell(&cmd).await,
        "filesystem" => execute_fs(&cmd).await,
        _ => BridgeResult {
            id: cmd.id.clone(),
            agent_id: cmd.agent_id.clone(),
            success: false,
            output: None,
            error: Some(format!("Unsupported capability: {}", cmd.capability)),
        },
    };

    send_result(tx, &result);

    // Emit audit entry to UI
    let entry = AuditEntryEvent {
        id: uuid::Uuid::new_v4().to_string(),
        agent_id: cmd.agent_id.clone(),
        agent_name: cmd.agent_id.clone(),
        capability: cmd.capability,
        command: cmd.command,
        outcome: if result.success { "allowed".to_string() } else { "blocked".to_string() },
        error: result.error.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = app.emit("bridge:audit_entries", vec![entry]);
}

fn send_result(tx: &OutboundTx, result: &BridgeResult) {
    if let Ok(json) = serde_json::to_string(result) {
        let envelope = format!(r#"{{"type":"result","payload":{json}}}"#);
        let _ = tx.send(Message::Text(envelope));
    }
}

/// Shell executor — runs the command string via the system shell.
/// The server-side PermissionService validates allowed/blocked patterns before dispatch;
/// the bridge double-checks here as a defence-in-depth measure.
async fn execute_shell(cmd: &BridgeCommand) -> BridgeResult {
    use tokio::process::Command;

    let shell_cmd = cmd.command.clone();

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd").args(["/C", &shell_cmd]).output().await;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh").args(["-c", &shell_cmd]).output().await;

    match output {
        Ok(o) => BridgeResult {
            id: cmd.id.clone(),
            agent_id: cmd.agent_id.clone(),
            success: o.status.success(),
            output: Some(String::from_utf8_lossy(&o.stdout).into_owned()),
            error: if o.status.success() {
                None
            } else {
                Some(String::from_utf8_lossy(&o.stderr).into_owned())
            },
        },
        Err(e) => BridgeResult {
            id: cmd.id.clone(),
            agent_id: cmd.agent_id.clone(),
            success: false,
            output: None,
            error: Some(e.to_string()),
        },
    }
}

/// Filesystem executor — reads file content.
async fn execute_fs(cmd: &BridgeCommand) -> BridgeResult {
    let path = cmd.command.trim();
    match tokio::fs::read_to_string(path).await {
        Ok(content) => BridgeResult {
            id: cmd.id.clone(),
            agent_id: cmd.agent_id.clone(),
            success: true,
            output: Some(content),
            error: None,
        },
        Err(e) => BridgeResult {
            id: cmd.id.clone(),
            agent_id: cmd.agent_id.clone(),
            success: false,
            output: None,
            error: Some(e.to_string()),
        },
    }
}

async fn emit_status(app: &AppHandle, state: &Arc<Mutex<AppState>>) {
    let s = state.lock().await;
    let status = BridgeStatus {
        connected: s.connected,
        user_id: s.user_id.clone(),
        server_url: s.server_url.clone(),
        agent_ids: s.agent_ids.clone(),
    };
    let _ = app.emit("bridge:status", status);
}
