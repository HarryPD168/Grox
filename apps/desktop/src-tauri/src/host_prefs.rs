//! Host-attested operator preferences (native app data).
//!
//! Computer Use opt-in and Bypass permission mode must not live only in
//! webview localStorage (XSS / DevTools can flip them). Source of truth is
//! `%APPDATA%/…/host_prefs.json` written via Tauri commands.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};

const PREFS_FILE: &str = "host_prefs.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostPrefs {
    /// Operator enabled Computer Use (desktop control) in Settings.
    #[serde(default)]
    pub computer_use_enabled: bool,
    /// Permission mode: default | auto | bypass (host-attested for bypass).
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    /// Optional override for FE first-event-after mid-turn idle (minutes).
    #[serde(default)]
    pub prompt_idle_minutes: Option<u32>,
    /// Optional override for absolute turn ceiling (hours).
    #[serde(default)]
    pub prompt_absolute_hours: Option<u32>,
}

fn default_permission_mode() -> String {
    "auto".into()
}

static PREFS_CACHE: Mutex<Option<HostPrefs>> = Mutex::new(None);

fn prefs_path_from_dir(app_data: &Path) -> PathBuf {
    app_data.join(PREFS_FILE)
}

pub fn load_prefs(app_data: &Path) -> HostPrefs {
    if let Ok(guard) = PREFS_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }
    let path = prefs_path_from_dir(app_data);
    let prefs = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => HostPrefs::default(),
    };
    if let Ok(mut guard) = PREFS_CACHE.lock() {
        *guard = Some(prefs.clone());
    }
    prefs
}

pub fn save_prefs(app_data: &Path, prefs: &HostPrefs) -> Result<(), String> {
    fs::create_dir_all(app_data).map_err(|e| format!("无法创建 app data 目录：{e}"))?;
    let path = prefs_path_from_dir(app_data);
    let raw = serde_json::to_string_pretty(prefs).map_err(|e| format!("序列化 host_prefs：{e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw.as_bytes()).map_err(|e| format!("写入 host_prefs 失败：{e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("提交 host_prefs 失败：{e}"))?;
    if let Ok(mut guard) = PREFS_CACHE.lock() {
        *guard = Some(prefs.clone());
    }
    Ok(())
}

pub fn normalize_permission_mode(mode: &str) -> Option<&'static str> {
    match mode.trim() {
        "default" => Some("default"),
        "auto" => Some("auto"),
        "bypass" => Some("bypass"),
        _ => None,
    }
}
