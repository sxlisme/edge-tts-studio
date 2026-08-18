mod core;

#[cfg(desktop)]
mod api;

use std::{path::PathBuf, sync::Arc};

use core::{
    AppCore, AudioPayload, HistoryResponse, SynthesisOptions, SynthesisResult, VoicesResponse,
};
use serde::Serialize;
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInformation {
    system_version: String,
    app_version: String,
}

#[tauri::command]
async fn list_voices(
    core: State<'_, Arc<AppCore>>,
    locale: Option<String>,
) -> Result<VoicesResponse, String> {
    core.list_voices(locale.as_deref())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn synthesize(
    core: State<'_, Arc<AppCore>>,
    options: SynthesisOptions,
) -> Result<SynthesisResult, String> {
    core.synthesize(options)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_history(core: State<'_, Arc<AppCore>>) -> Result<HistoryResponse, String> {
    core.history().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_history_audio(
    core: State<'_, Arc<AppCore>>,
    id: String,
) -> Result<AudioPayload, String> {
    core.audio_payload(&id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_history(core: State<'_, Arc<AppCore>>, id: String) -> Result<String, String> {
    core.delete_history(&id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn clear_history(core: State<'_, Arc<AppCore>>) -> Result<usize, String> {
    core.clear_history()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn export_history_audio(
    core: State<'_, Arc<AppCore>>,
    id: String,
    destination: String,
) -> Result<(), String> {
    core.export_history(&id, &PathBuf::from(destination))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn app_information() -> AppInformation {
    AppInformation {
        system_version: sysinfo::System::long_os_version()
            .unwrap_or_else(|| std::env::consts::OS.to_owned()),
        app_version: format!("v{}", env!("CARGO_PKG_VERSION")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let core = Arc::new(AppCore::new(data_dir));
            #[cfg(desktop)]
            api::spawn(core.clone());
            app.manage(core);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_voices,
            synthesize,
            list_history,
            read_history_audio,
            delete_history,
            clear_history,
            export_history_audio,
            app_information
        ])
        .run(tauri::generate_context!())
        .expect("unable to run voice studio");
}
