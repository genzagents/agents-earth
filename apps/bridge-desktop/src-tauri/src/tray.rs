//! System tray icon management.
//!
//! The tray icon toggles between:
//!  - Green dot overlay  → connected
//!  - Grey / dim         → disconnected
//!
//! Clicking the tray icon shows/hides the main window.
//! Right-click shows a context menu with Quit.

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItemBuilder::with_id("quit", "Quit GenZ Bridge").build(app)?;
    let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &separator, &quit])
        .build()?;

    let _tray = TrayIconBuilder::new()
        .id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("GenZ Bridge — Disconnected")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                toggle_window(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(&tray.app_handle().clone());
            }
        })
        .build(app)?;

    Ok(())
}

/// Show the window if hidden; hide it if visible.
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Update the tray tooltip and (optionally) icon based on connection state.
pub fn update_tray_status(app: &AppHandle, connected: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let tooltip = if connected {
            "GenZ Bridge — Connected"
        } else {
            "GenZ Bridge — Disconnected"
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}
