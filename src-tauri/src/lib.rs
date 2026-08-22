mod core;

#[cfg(desktop)]
mod api;

use std::{path::PathBuf, sync::Arc};

use core::{
    AppCore, AudioPayload, BatchTextFile, HistoryRecord, HistoryResponse, LongSynthesisProgress,
    LongTextFileInfo, SynthesisOptions, SynthesisResult, VoicesResponse,
};
use serde::Serialize;
use tauri::{ipc::Channel, Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInformation {
    system_version: String,
    app_version: String,
    desktop: bool,
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
async fn synthesize_batch_item(
    core: State<'_, Arc<AppCore>>,
    batch_id: String,
    options: SynthesisOptions,
) -> Result<HistoryRecord, String> {
    core.synthesize_batch_and_store(&batch_id, options)
        .await
        .map(|result| result.record)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cancel_batch(core: State<'_, Arc<AppCore>>, batch_id: String) -> Result<bool, String> {
    core.cancel_batch(&batch_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cancel_long_text(core: State<'_, Arc<AppCore>>, job_id: String) -> Result<bool, String> {
    core.cancel_active_batch(&job_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn finish_batch(core: State<'_, Arc<AppCore>>, batch_id: String) -> Result<(), String> {
    core.finish_batch(&batch_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_batch_text_files(paths: Vec<String>) -> Result<Vec<BatchTextFile>, String> {
    core::read_text_files(paths)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn inspect_long_text_file(path: String) -> Result<LongTextFileInfo, String> {
    core::read_long_text_file(&path)
        .await
        .map(|file| file.info)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn synthesize_long_text(
    core: State<'_, Arc<AppCore>>,
    path: String,
    job_id: String,
    mut options: SynthesisOptions,
    on_progress: Channel<LongSynthesisProgress>,
) -> Result<HistoryRecord, String> {
    let file = core::read_long_text_file(&path)
        .await
        .map_err(|error| error.to_string())?;
    options.text = file.text;
    core.synthesize_long_and_store(
        &job_id,
        options,
        Arc::new(move |progress| {
            let _ = on_progress.send(progress);
        }),
    )
    .await
    .map(|result| result.record)
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
async fn export_history_to_directory(
    core: State<'_, Arc<AppCore>>,
    id: String,
    directory: String,
) -> Result<String, String> {
    core.export_history_to_directory(&id, &PathBuf::from(directory))
        .await
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn validate_export_directory(directory: String) -> Result<String, String> {
    core::validate_export_directory(&PathBuf::from(directory))
        .await
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn app_information() -> AppInformation {
    AppInformation {
        system_version: sysinfo::System::long_os_version()
            .unwrap_or_else(|| std::env::consts::OS.to_owned()),
        app_version: format!("v{}", env!("CARGO_PKG_VERSION")),
        desktop: cfg!(desktop),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
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
            synthesize_batch_item,
            cancel_batch,
            cancel_long_text,
            finish_batch,
            read_batch_text_files,
            inspect_long_text_file,
            synthesize_long_text,
            list_history,
            read_history_audio,
            delete_history,
            clear_history,
            export_history_audio,
            export_history_to_directory,
            validate_export_directory,
            app_information
        ])
        .run(tauri::generate_context!())
        .expect("unable to run voice studio");
}
