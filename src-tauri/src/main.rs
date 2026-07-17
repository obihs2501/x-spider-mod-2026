// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod network;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PathMetadata {
    path: String,
    modified_at: Option<u64>,
}

#[tauri::command]
fn filesystem_metadata(paths: Vec<String>) -> Vec<PathMetadata> {
    use std::time::UNIX_EPOCH;

    paths
        .into_iter()
        .map(|path| {
            let modified_at = std::fs::metadata(&path)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64);
            PathMetadata { path, modified_at }
        })
        .collect()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
          network::network_fetch,
          network::network_get_system_proxy_url,
          filesystem_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
