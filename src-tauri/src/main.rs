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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
    modified_at: Option<u64>,
    size: Option<u64>,
}

/// 一次性读取目录下一层的条目及其元数据（是否目录、修改时间、大小），
/// 供画廊使用，避免前端对每个条目再单独发起 IPC 取元数据。
#[tauri::command]
fn read_dir_with_metadata(path: String) -> Result<Vec<DirEntryInfo>, String> {
    use std::time::UNIX_EPOCH;

    let read = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for entry in read {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        // 跟随符号链接取元数据，保证 is_dir 对目录链接同样准确
        let metadata = match std::fs::metadata(entry.path()) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = metadata.is_dir();
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64);
        result.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            modified_at,
            size: if is_dir { None } else { Some(metadata.len()) },
        });
    }
    Ok(result)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
          network::network_fetch,
          network::network_get_system_proxy_url,
          filesystem_metadata,
          read_dir_with_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
