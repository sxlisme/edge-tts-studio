use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chardetng::EncodingDetector;
use chrono::{Local, SecondsFormat};
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE};
use futures_util::{stream, StreamExt};
use msedge_tts::{
    tts::{client::tokio_runtime::connect_async, SpeechConfig},
    voice::tokio_runtime::get_voices_list_async,
};
use quick_xml::escape::escape;
use serde::{Deserialize, Serialize};
use tokio::{
    io::AsyncWriteExt,
    sync::{Mutex, RwLock},
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const DEFAULT_VOICE: &str = "zh-CN-XiaoxiaoNeural";
const MAX_TEXT_LENGTH: usize = 10_000;
const MAX_LONG_TEXT_LENGTH: usize = 500_000;
const LONG_TEXT_CHUNK_LENGTH: usize = 5_000;
const LONG_TEXT_CONCURRENCY: usize = 3;
const LONG_TEXT_RETRIES: usize = 3;
const MAX_HISTORY_ITEMS: usize = 50;
const MAX_BATCH_FILES: usize = 50;
const MAX_TEXT_FILE_BYTES: u64 = 2 * 1024 * 1024;
const VOICE_CACHE_DURATION: Duration = Duration::from_secs(6 * 60 * 60);
const VOICE_TIMEOUT: Duration = Duration::from_secs(30);
const SYNTHESIS_TIMEOUT: Duration = Duration::from_secs(180);
const AUDIO_FORMAT: &str = "audio-24khz-48kbitrate-mono-mp3";

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("{0}")]
    Validation(String),
    #[error("转换记录不存在")]
    NotFound,
    #[error("在线语音服务响应超时，请稍后重试")]
    Timeout,
    #[error("任务已取消")]
    Cancelled,
    #[error("在线语音服务请求失败：{0}")]
    Speech(String),
    #[error("第 {chunk}/{total} 个分段重试 3 次后仍生成失败：{detail}")]
    LongSynthesis {
        chunk: usize,
        total: usize,
        detail: String,
    },
    #[error("本地文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("本地记录格式错误：{0}")]
    Json(#[from] serde_json::Error),
}

pub type CoreResult<T> = Result<T, CoreError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceItem {
    pub short_name: String,
    pub display_name: String,
    pub friendly_name: String,
    pub locale: String,
    pub locale_name: String,
    pub gender: String,
    pub gender_name: String,
    pub content_categories: Vec<String>,
    pub personalities: Vec<String>,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicesResponse {
    pub voices: Vec<VoiceItem>,
    pub locale_counts: HashMap<String, usize>,
    pub total_voice_count: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthesisOptions {
    pub text: String,
    #[serde(default = "default_voice")]
    pub voice: String,
    #[serde(default = "default_percent")]
    pub rate: String,
    #[serde(default = "default_percent")]
    pub volume: String,
    #[serde(default = "default_pitch")]
    pub pitch: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub created_at: String,
    pub text: String,
    pub voice: String,
    pub voice_name: String,
    pub voice_gender: String,
    pub rate: String,
    pub volume: String,
    pub pitch: String,
    pub size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryResponse {
    pub history: Vec<HistoryRecord>,
    pub limit: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthesisResult {
    pub record: HistoryRecord,
    pub audio_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioPayload {
    pub record: HistoryRecord,
    pub audio_base64: String,
}

pub struct StoredSynthesis {
    pub record: HistoryRecord,
    pub audio: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTextFile {
    pub name: String,
    pub text: String,
    pub character_count: usize,
    pub encoding: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LongTextFileInfo {
    pub name: String,
    pub character_count: usize,
    pub segment_count: usize,
    pub encoding: String,
}

pub struct LongTextFile {
    pub info: LongTextFileInfo,
    pub text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LongSynthesisProgress {
    pub completed: usize,
    pub total: usize,
    pub chunk_index: usize,
    pub retry_count: usize,
    pub state: &'static str,
}

#[derive(Default)]
struct VoiceCache {
    fetched_at: Option<Instant>,
    voices: Vec<VoiceItem>,
}

pub struct AppCore {
    data_dir: PathBuf,
    history_lock: Mutex<()>,
    export_lock: Mutex<()>,
    batch_cancellations: Mutex<HashMap<String, CancellationToken>>,
    voice_cache: RwLock<VoiceCache>,
}

impl AppCore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            history_lock: Mutex::new(()),
            export_lock: Mutex::new(()),
            batch_cancellations: Mutex::new(HashMap::new()),
            voice_cache: RwLock::new(VoiceCache::default()),
        }
    }

    pub async fn list_voices(&self, locale: Option<&str>) -> CoreResult<VoicesResponse> {
        let voices = self.all_voices().await?;
        let mut locale_counts = HashMap::new();
        for voice in &voices {
            *locale_counts.entry(voice.locale.clone()).or_insert(0) += 1;
        }
        let total_voice_count = voices.len();
        let locale = locale.unwrap_or_default().trim().to_lowercase();
        let voices = if locale.is_empty() {
            voices
        } else {
            voices
                .into_iter()
                .filter(|voice| voice.locale.to_lowercase().starts_with(&locale))
                .collect()
        };
        Ok(VoicesResponse {
            voices,
            locale_counts,
            total_voice_count,
        })
    }

    async fn all_voices(&self) -> CoreResult<Vec<VoiceItem>> {
        {
            let cache = self.voice_cache.read().await;
            if cache
                .fetched_at
                .is_some_and(|instant| instant.elapsed() < VOICE_CACHE_DURATION)
                && !cache.voices.is_empty()
            {
                return Ok(cache.voices.clone());
            }
        }

        let online = tokio::time::timeout(VOICE_TIMEOUT, get_voices_list_async())
            .await
            .map_err(|_| CoreError::Timeout)?
            .map_err(|error| CoreError::Speech(error.to_string()))?;
        let mut voices: Vec<VoiceItem> = online
            .into_iter()
            .filter_map(|voice| {
                let short_name = voice.short_name?;
                let locale = voice.locale.unwrap_or_default();
                let gender = voice.gender.unwrap_or_default();
                let tags = voice.voice_tag;
                Some(VoiceItem {
                    display_name: voice_display_name(&short_name),
                    friendly_name: voice.friendly_name.unwrap_or_else(|| short_name.clone()),
                    locale_name: locale_display_name(&locale),
                    gender_name: match gender.as_str() {
                        "Female" => "女声".to_owned(),
                        "Male" => "男声".to_owned(),
                        _ => gender.clone(),
                    },
                    content_categories: tags
                        .as_ref()
                        .and_then(|tag| tag.content_categories.clone())
                        .unwrap_or_default(),
                    personalities: tags
                        .as_ref()
                        .and_then(|tag| tag.voice_personalities.clone())
                        .unwrap_or_default(),
                    status: voice.status.unwrap_or_default(),
                    short_name,
                    locale,
                    gender,
                })
            })
            .collect();
        voices.sort_by(|left, right| {
            (&left.locale, &left.short_name).cmp(&(&right.locale, &right.short_name))
        });

        let mut cache = self.voice_cache.write().await;
        cache.fetched_at = Some(Instant::now());
        cache.voices = voices.clone();
        Ok(voices)
    }

    pub async fn synthesize(&self, options: SynthesisOptions) -> CoreResult<SynthesisResult> {
        let stored = self.synthesize_and_store(options).await?;
        Ok(SynthesisResult {
            audio_base64: BASE64.encode(&stored.audio),
            record: stored.record,
        })
    }

    pub async fn synthesize_and_store(
        &self,
        options: SynthesisOptions,
    ) -> CoreResult<StoredSynthesis> {
        self.synthesize_and_store_with_cancellation(options, None)
            .await
    }

    pub async fn synthesize_batch_and_store(
        &self,
        batch_id: &str,
        options: SynthesisOptions,
    ) -> CoreResult<StoredSynthesis> {
        validate_batch_id(batch_id)?;
        let cancellation = {
            let mut cancellations = self.batch_cancellations.lock().await;
            cancellations
                .entry(batch_id.to_owned())
                .or_default()
                .clone()
        };
        self.synthesize_and_store_with_cancellation(options, Some(&cancellation))
            .await
    }

    pub async fn synthesize_long_and_store(
        &self,
        batch_id: &str,
        options: SynthesisOptions,
        on_progress: std::sync::Arc<dyn Fn(LongSynthesisProgress) + Send + Sync>,
    ) -> CoreResult<StoredSynthesis> {
        validate_batch_id(batch_id)?;
        let cancellation = {
            let mut cancellations = self.batch_cancellations.lock().await;
            cancellations
                .entry(batch_id.to_owned())
                .or_default()
                .clone()
        };
        let temporary_directory = self.data_dir.join("long-jobs").join(batch_id);
        remove_directory_if_exists(&temporary_directory).await?;
        tokio::fs::create_dir_all(&temporary_directory).await?;

        let result = self
            .synthesize_long_inner(options, &temporary_directory, &cancellation, on_progress)
            .await;
        self.batch_cancellations.lock().await.remove(batch_id);
        let _ = remove_directory_if_exists(&temporary_directory).await;
        result
    }

    async fn synthesize_long_inner(
        &self,
        options: SynthesisOptions,
        temporary_directory: &Path,
        cancellation: &CancellationToken,
        on_progress: std::sync::Arc<dyn Fn(LongSynthesisProgress) + Send + Sync>,
    ) -> CoreResult<StoredSynthesis> {
        let validated = validate_synthesis_options(options, MAX_LONG_TEXT_LENGTH)?;
        let chunks = split_long_text(&validated.text, LONG_TEXT_CHUNK_LENGTH);
        let total = chunks.len();
        on_progress(LongSynthesisProgress {
            completed: 0,
            total,
            chunk_index: 0,
            retry_count: 0,
            state: "started",
        });

        // Keep only three network requests active and persist each result immediately.
        let tasks = stream::iter(chunks.into_iter().enumerate())
            .map(|(index, text)| {
                let mut chunk_options = validated.clone();
                chunk_options.text = text;
                let cancellation = cancellation.clone();
                let on_progress = on_progress.clone();
                let segment_path = temporary_directory.join(format!("{index:06}.mp3"));
                async move {
                    let audio = synthesize_long_chunk(
                        &chunk_options,
                        index,
                        total,
                        &cancellation,
                        &on_progress,
                    )
                    .await?;
                    tokio::fs::write(segment_path, audio).await?;
                    CoreResult::Ok(index)
                }
            })
            .buffer_unordered(LONG_TEXT_CONCURRENCY);
        tokio::pin!(tasks);

        let mut completed = 0;
        while let Some(result) = tasks.next().await {
            let index = result?;
            completed += 1;
            on_progress(LongSynthesisProgress {
                completed,
                total,
                chunk_index: index + 1,
                retry_count: 0,
                state: "completed",
            });
        }
        if cancellation.is_cancelled() {
            return Err(CoreError::Cancelled);
        }
        on_progress(LongSynthesisProgress {
            completed,
            total,
            chunk_index: 0,
            retry_count: 0,
            state: "merging",
        });

        tokio::fs::create_dir_all(self.audio_dir()).await?;
        let record_id = Uuid::new_v4().simple().to_string();
        let audio_path = self.audio_path(&record_id);
        let merged_path = temporary_directory.join("merged.mp3");
        // Completion order is arbitrary, so merge the numbered segments in source order.
        merge_audio_segments(temporary_directory, &merged_path, total, cancellation).await?;
        if cancellation.is_cancelled() {
            return Err(CoreError::Cancelled);
        }
        tokio::fs::rename(&merged_path, &audio_path).await?;

        let size = tokio::fs::metadata(&audio_path).await?.len() as usize;
        let record = self.history_record(&record_id, &validated, size).await;
        if let Err(error) = self.store_existing_history_audio(&record).await {
            remove_file_if_exists(&audio_path).await?;
            return Err(error);
        }
        Ok(StoredSynthesis {
            record,
            audio: Vec::new(),
        })
    }

    pub async fn cancel_batch(&self, batch_id: &str) -> CoreResult<bool> {
        validate_batch_id(batch_id)?;
        let cancellation = {
            let mut cancellations = self.batch_cancellations.lock().await;
            cancellations
                .entry(batch_id.to_owned())
                .or_default()
                .clone()
        };
        let was_cancelled = cancellation.is_cancelled();
        cancellation.cancel();
        Ok(!was_cancelled)
    }

    pub async fn cancel_active_batch(&self, batch_id: &str) -> CoreResult<bool> {
        validate_batch_id(batch_id)?;
        let cancellation = self.batch_cancellations.lock().await.get(batch_id).cloned();
        if let Some(cancellation) = cancellation {
            let was_cancelled = cancellation.is_cancelled();
            cancellation.cancel();
            Ok(!was_cancelled)
        } else {
            Ok(false)
        }
    }

    pub async fn finish_batch(&self, batch_id: &str) -> CoreResult<()> {
        validate_batch_id(batch_id)?;
        self.batch_cancellations.lock().await.remove(batch_id);
        Ok(())
    }

    async fn synthesize_and_store_with_cancellation(
        &self,
        options: SynthesisOptions,
        cancellation: Option<&CancellationToken>,
    ) -> CoreResult<StoredSynthesis> {
        let validated = ValidatedOptions::try_from(options)?;
        let audio = if let Some(cancellation) = cancellation {
            tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Err(CoreError::Cancelled),
                result = synthesize_with_timeout(&validated) => result?,
            }
        } else {
            synthesize_with_timeout(&validated).await?
        };
        if audio.is_empty() {
            return Err(CoreError::Speech("没有返回音频数据".to_owned()));
        }
        if cancellation.is_some_and(CancellationToken::is_cancelled) {
            return Err(CoreError::Cancelled);
        }

        let record_id = Uuid::new_v4().simple().to_string();
        let record = self
            .history_record(&record_id, &validated, audio.len())
            .await;
        self.store_history_audio(&record, &audio).await?;
        Ok(StoredSynthesis { record, audio })
    }

    async fn history_record(
        &self,
        id: &str,
        validated: &ValidatedOptions,
        size: usize,
    ) -> HistoryRecord {
        let voice_gender = {
            let cache = self.voice_cache.read().await;
            cache
                .voices
                .iter()
                .find(|voice| voice.short_name == validated.voice)
                .map(|voice| voice.gender.clone())
                .unwrap_or_default()
        };
        HistoryRecord {
            id: id.to_owned(),
            created_at: Local::now().to_rfc3339_opts(SecondsFormat::Secs, false),
            text: validated.text.clone(),
            voice: validated.voice.clone(),
            voice_name: voice_display_name(&validated.voice),
            voice_gender,
            rate: format_signed(validated.rate, "%"),
            volume: format_signed(validated.volume, "%"),
            pitch: format_signed(validated.pitch, "Hz"),
            size,
        }
    }

    pub async fn history(&self) -> CoreResult<HistoryResponse> {
        let _guard = self.history_lock.lock().await;
        Ok(HistoryResponse {
            history: self.read_history_unlocked().await?,
            limit: MAX_HISTORY_ITEMS,
        })
    }

    pub async fn audio_payload(&self, id: &str) -> CoreResult<AudioPayload> {
        let (record, audio) = self.history_audio(id).await?;
        Ok(AudioPayload {
            record,
            audio_base64: BASE64.encode(audio),
        })
    }

    pub async fn history_audio(&self, id: &str) -> CoreResult<(HistoryRecord, Vec<u8>)> {
        validate_record_id(id)?;
        let _guard = self.history_lock.lock().await;
        let record = self
            .read_history_unlocked()
            .await?
            .into_iter()
            .find(|record| record.id == id)
            .ok_or(CoreError::NotFound)?;
        let audio = tokio::fs::read(self.audio_path(id))
            .await
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    CoreError::NotFound
                } else {
                    CoreError::Io(error)
                }
            })?;
        Ok((record, audio))
    }

    pub async fn delete_history(&self, id: &str) -> CoreResult<String> {
        validate_record_id(id)?;
        let _guard = self.history_lock.lock().await;
        let mut history = self.read_history_unlocked().await?;
        let original_len = history.len();
        history.retain(|record| record.id != id);
        if history.len() == original_len {
            return Err(CoreError::NotFound);
        }
        remove_file_if_exists(&self.audio_path(id)).await?;
        self.write_history_unlocked(&history).await?;
        Ok(id.to_owned())
    }

    pub async fn clear_history(&self) -> CoreResult<usize> {
        let _guard = self.history_lock.lock().await;
        let history = self.read_history_unlocked().await?;
        for record in &history {
            remove_file_if_exists(&self.audio_path(&record.id)).await?;
        }
        self.write_history_unlocked(&[]).await?;
        Ok(history.len())
    }

    pub async fn export_history(&self, id: &str, destination: &Path) -> CoreResult<()> {
        if destination
            .extension()
            .and_then(|extension| extension.to_str())
            .is_none_or(|extension| !extension.eq_ignore_ascii_case("mp3"))
        {
            return Err(CoreError::Validation(
                "导出文件必须使用 MP3 扩展名".to_owned(),
            ));
        }
        let (_, audio) = self.history_audio(id).await?;
        tokio::fs::write(destination, audio).await?;
        Ok(())
    }

    pub async fn export_history_to_directory(
        &self,
        id: &str,
        directory: &Path,
    ) -> CoreResult<PathBuf> {
        let _guard = self.export_lock.lock().await;
        let directory = validate_export_directory(directory).await?;

        let (_, audio) = self.history_audio(id).await?;
        let timestamp = Local::now().format("%Y%m%d-%H%M%S-%3f").to_string();
        let mut attempt = 1;
        loop {
            let suffix = if attempt == 1 {
                String::new()
            } else {
                format!("-{attempt}")
            };
            let destination = directory.join(format!("voice-studio-{timestamp}{suffix}.mp3"));
            match tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination)
                .await
            {
                Ok(mut file) => {
                    use tokio::io::AsyncWriteExt;
                    file.write_all(&audio).await?;
                    return Ok(destination);
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    attempt += 1;
                }
                Err(error) => return Err(CoreError::Io(error)),
            }
        }
    }

    async fn store_history_audio(&self, record: &HistoryRecord, audio: &[u8]) -> CoreResult<()> {
        tokio::fs::create_dir_all(self.audio_dir()).await?;
        tokio::fs::write(self.audio_path(&record.id), audio).await?;

        if let Err(error) = self.store_existing_history_audio(record).await {
            remove_file_if_exists(&self.audio_path(&record.id)).await?;
            return Err(error);
        }
        Ok(())
    }

    async fn store_existing_history_audio(&self, record: &HistoryRecord) -> CoreResult<()> {
        let _guard = self.history_lock.lock().await;

        let mut history = self.read_history_unlocked().await?;
        history.insert(0, record.clone());
        let expired = history.split_off(history.len().min(MAX_HISTORY_ITEMS));
        self.write_history_unlocked(&history).await?;
        for old_record in expired {
            remove_file_if_exists(&self.audio_path(&old_record.id)).await?;
        }
        Ok(())
    }

    async fn read_history_unlocked(&self) -> CoreResult<Vec<HistoryRecord>> {
        match tokio::fs::read(self.history_path()).await {
            Ok(data) => Ok(serde_json::from_slice(&data)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(error) => Err(error.into()),
        }
    }

    async fn write_history_unlocked(&self, history: &[HistoryRecord]) -> CoreResult<()> {
        tokio::fs::create_dir_all(&self.data_dir).await?;
        let temporary = self.data_dir.join("history.json.tmp");
        tokio::fs::write(&temporary, serde_json::to_vec_pretty(history)?).await?;
        if let Err(error) = tokio::fs::rename(&temporary, self.history_path()).await {
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(error.into());
            }
            remove_file_if_exists(&self.history_path()).await?;
            tokio::fs::rename(temporary, self.history_path()).await?;
        }
        Ok(())
    }

    fn history_path(&self) -> PathBuf {
        self.data_dir.join("history.json")
    }

    fn audio_dir(&self) -> PathBuf {
        self.data_dir.join("audio")
    }

    fn audio_path(&self, id: &str) -> PathBuf {
        self.audio_dir().join(format!("{id}.mp3"))
    }
}

pub async fn validate_export_directory(directory: &Path) -> CoreResult<PathBuf> {
    let metadata = tokio::fs::metadata(directory).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            CoreError::Validation("导出文件夹不存在，请重新选择".to_owned())
        } else {
            CoreError::Io(error)
        }
    })?;
    if !metadata.is_dir() {
        return Err(CoreError::Validation(
            "导出路径不是文件夹，请重新选择".to_owned(),
        ));
    }
    Ok(tokio::fs::canonicalize(directory).await?)
}

pub async fn read_text_files(paths: Vec<String>) -> CoreResult<Vec<BatchTextFile>> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    if paths.len() > MAX_BATCH_FILES {
        return Err(CoreError::Validation(format!(
            "每次最多选择 {MAX_BATCH_FILES} 个文件"
        )));
    }

    let mut files = Vec::with_capacity(paths.len());
    for raw_path in paths {
        let path = PathBuf::from(&raw_path);
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("未命名文件")
            .to_owned();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "txt" | "text" | "md" | "markdown") {
            return Err(CoreError::Validation(format!("{name} 不是支持的文本文件")));
        }

        let metadata = tokio::fs::metadata(&path).await?;
        if !metadata.is_file() {
            return Err(CoreError::Validation(format!("{name} 不是普通文件")));
        }
        if metadata.len() > MAX_TEXT_FILE_BYTES {
            return Err(CoreError::Validation(format!("{name} 超过 2 MB，无法读取")));
        }

        let data = tokio::fs::read(&path).await?;
        let (text, encoding) = decode_text_data(&data, &name)?;
        files.push(BatchTextFile {
            character_count: text.chars().count(),
            name,
            text,
            encoding,
        });
    }
    Ok(files)
}

fn decode_text_data(data: &[u8], name: &str) -> CoreResult<(String, String)> {
    if let Ok(text) = std::str::from_utf8(data) {
        return Ok((
            text.trim_start_matches('\u{feff}').to_owned(),
            "UTF-8".to_owned(),
        ));
    }

    let (encoding, bom_length) = Encoding::for_bom(data).unwrap_or_else(|| {
        let mut detector = EncodingDetector::new();
        detector.feed(data, true);
        (detector.guess(None, true), 0)
    });
    let (decoded, had_errors) = encoding.decode_without_bom_handling(&data[bom_length..]);
    if had_errors || decoded_text_looks_binary(&decoded) {
        return Err(CoreError::Validation(format!(
            "{name} 的文本编码无法识别，请转换为 UTF-8、GBK、Big5 或带 BOM 的 UTF-16"
        )));
    }
    let encoding_name = if encoding == UTF_16LE {
        "UTF-16LE"
    } else if encoding == UTF_16BE {
        "UTF-16BE"
    } else {
        encoding.name()
    };
    Ok((decoded.into_owned(), encoding_name.to_owned()))
}

fn decoded_text_looks_binary(text: &str) -> bool {
    let total = text.chars().count();
    if total == 0 {
        return false;
    }
    let suspicious = text
        .chars()
        .filter(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
        .count();
    suspicious > 4 && suspicious * 100 > total
}

pub async fn read_long_text_file(path: &str) -> CoreResult<LongTextFile> {
    let mut files = read_text_files(vec![path.to_owned()]).await?;
    let file = files
        .pop()
        .ok_or_else(|| CoreError::Validation("请选择一个超长文本文件".to_owned()))?;
    if file.text.trim().is_empty() {
        return Err(CoreError::Validation("文件内容为空".to_owned()));
    }
    if file.character_count > MAX_LONG_TEXT_LENGTH {
        return Err(CoreError::Validation(format!(
            "超长文字不能超过 {MAX_LONG_TEXT_LENGTH} 个字符"
        )));
    }
    let text = file.text.trim().to_owned();
    let character_count = text.chars().count();
    Ok(LongTextFile {
        info: LongTextFileInfo {
            name: file.name,
            character_count,
            segment_count: split_long_text(&text, LONG_TEXT_CHUNK_LENGTH).len(),
            encoding: file.encoding,
        },
        text,
    })
}

#[derive(Clone, Debug)]
struct ValidatedOptions {
    text: String,
    voice: String,
    rate: i32,
    volume: i32,
    pitch: i32,
}

impl TryFrom<SynthesisOptions> for ValidatedOptions {
    type Error = CoreError;

    fn try_from(options: SynthesisOptions) -> Result<Self, Self::Error> {
        validate_synthesis_options(options, MAX_TEXT_LENGTH)
    }
}

fn validate_synthesis_options(
    options: SynthesisOptions,
    max_text_length: usize,
) -> CoreResult<ValidatedOptions> {
    let text = options.text.trim().to_owned();
    if text.is_empty() {
        return Err(CoreError::Validation("请输入需要转换的文字".to_owned()));
    }
    if text.chars().count() > max_text_length {
        return Err(CoreError::Validation(format!(
            "文字不能超过 {max_text_length} 个字符"
        )));
    }
    let voice = options.voice.trim().to_owned();
    if voice.is_empty()
        || !voice
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(CoreError::Validation("音色名称格式不正确".to_owned()));
    }
    Ok(ValidatedOptions {
        text,
        voice,
        rate: parse_signed(&options.rate, "%", "语速")?,
        volume: parse_signed(&options.volume, "%", "音量")?,
        pitch: parse_signed(&options.pitch, "Hz", "音调")?,
    })
}

fn validate_batch_id(batch_id: &str) -> CoreResult<()> {
    if batch_id.is_empty()
        || batch_id.len() > 100
        || !batch_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(CoreError::Validation("批量任务标识格式不正确".to_owned()));
    }
    Ok(())
}

async fn synthesize_with_timeout(options: &ValidatedOptions) -> CoreResult<Vec<u8>> {
    tokio::time::timeout(SYNTHESIS_TIMEOUT, synthesize_online(options))
        .await
        .map_err(|_| CoreError::Timeout)?
}

async fn synthesize_long_chunk(
    options: &ValidatedOptions,
    index: usize,
    total: usize,
    cancellation: &CancellationToken,
    on_progress: &std::sync::Arc<dyn Fn(LongSynthesisProgress) + Send + Sync>,
) -> CoreResult<Vec<u8>> {
    let mut last_error = None;
    for retry_count in 0..=LONG_TEXT_RETRIES {
        if retry_count > 0 {
            on_progress(LongSynthesisProgress {
                completed: 0,
                total,
                chunk_index: index + 1,
                retry_count,
                state: "retrying",
            });
        }
        let result = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(CoreError::Cancelled),
            result = synthesize_with_timeout(options) => result,
        };
        match result {
            Ok(audio) if !audio.is_empty() => return Ok(audio),
            Ok(_) => last_error = Some("没有返回音频数据".to_owned()),
            Err(CoreError::Cancelled) => return Err(CoreError::Cancelled),
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    on_progress(LongSynthesisProgress {
        completed: 0,
        total,
        chunk_index: index + 1,
        retry_count: LONG_TEXT_RETRIES,
        state: "failed",
    });
    Err(CoreError::LongSynthesis {
        chunk: index + 1,
        total,
        detail: last_error.unwrap_or_else(|| "未知错误".to_owned()),
    })
}

fn split_long_text(text: &str, max_characters: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut remaining = text.trim();
    while !remaining.is_empty() {
        let mut safe_end = remaining.len();
        let mut preferred_end = None;
        let mut count = 0;
        for (offset, character) in remaining.char_indices() {
            count += 1;
            if count > max_characters {
                safe_end = offset;
                break;
            }
            let end = offset + character.len_utf8();
            if character.is_whitespace()
                || matches!(
                    character,
                    '。' | '！'
                        | '？'
                        | '；'
                        | '，'
                        | '、'
                        | '：'
                        | '.'
                        | '!'
                        | '?'
                        | ';'
                        | ','
                        | ':'
                )
            {
                preferred_end = Some(end);
            }
        }
        if safe_end == remaining.len() {
            chunks.push(remaining.to_owned());
            break;
        }
        let end = preferred_end.unwrap_or(safe_end);
        chunks.push(remaining[..end].to_owned());
        remaining = &remaining[end..];
    }
    chunks
}

async fn synthesize_online(options: &ValidatedOptions) -> CoreResult<Vec<u8>> {
    let config = SpeechConfig {
        voice_name: options.voice.clone(),
        audio_format: AUDIO_FORMAT.to_owned(),
        pitch: options.pitch,
        rate: options.rate,
        volume: options.volume,
    };
    let mut client = connect_async()
        .await
        .map_err(|error| CoreError::Speech(error.to_string()))?;
    let mut audio = Vec::new();
    for text in split_text(&remove_incompatible_characters(&options.text), 4_000) {
        let escaped = escape(&text).into_owned();
        let synthesized = client
            .synthesize(&escaped, &config)
            .await
            .map_err(|error| CoreError::Speech(error.to_string()))?;
        audio.extend(synthesized.audio_bytes);
    }
    Ok(audio)
}

fn split_text(text: &str, max_bytes: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut remaining = text.trim();
    while remaining.len() > max_bytes {
        let mut safe_end = 0;
        let mut preferred_end = None;
        for (offset, character) in remaining.char_indices() {
            let end = offset + character.len_utf8();
            if end > max_bytes {
                break;
            }
            safe_end = end;
            if end >= max_bytes / 2
                && (character.is_whitespace()
                    || matches!(
                        character,
                        '。' | '！' | '？' | '；' | '，' | '.' | '!' | '?' | ';' | ','
                    ))
            {
                preferred_end = Some(end);
            }
        }
        let end = preferred_end.unwrap_or(safe_end);
        if end == 0 {
            break;
        }
        let (chunk, rest) = remaining.split_at(end);
        if !chunk.trim().is_empty() {
            chunks.push(chunk.trim().to_owned());
        }
        remaining = rest.trim_start();
    }
    if !remaining.trim().is_empty() {
        chunks.push(remaining.trim().to_owned());
    }
    chunks
}

fn remove_incompatible_characters(text: &str) -> String {
    text.chars()
        .map(|character| {
            let code = character as u32;
            if (code <= 8) || (11..=12).contains(&code) || (14..=31).contains(&code) {
                ' '
            } else {
                character
            }
        })
        .collect()
}

fn parse_signed(value: &str, suffix: &str, label: &str) -> CoreResult<i32> {
    let number = value
        .strip_suffix(suffix)
        .unwrap_or_default()
        .trim()
        .trim_start_matches('+')
        .parse::<i32>()
        .map_err(|_| CoreError::Validation(format!("{label}格式不正确")))?;
    if !(-100..=100).contains(&number) {
        return Err(CoreError::Validation(format!(
            "{label}必须在 -100 到 +100 之间"
        )));
    }
    Ok(number)
}

fn format_signed(value: i32, suffix: &str) -> String {
    format!("{}{value}{suffix}", if value >= 0 { "+" } else { "" })
}

fn validate_record_id(id: &str) -> CoreResult<()> {
    if id.len() == 32 && id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(CoreError::NotFound)
    }
}

async fn remove_file_if_exists(path: &Path) -> CoreResult<()> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

async fn remove_directory_if_exists(path: &Path) -> CoreResult<()> {
    match tokio::fs::remove_dir_all(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

async fn merge_audio_segments(
    segment_directory: &Path,
    destination: &Path,
    total: usize,
    cancellation: &CancellationToken,
) -> CoreResult<()> {
    let mut merged = tokio::fs::File::create(destination).await?;
    for index in 0..total {
        let mut segment =
            tokio::fs::File::open(segment_directory.join(format!("{index:06}.mp3"))).await?;
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(CoreError::Cancelled),
            result = tokio::io::copy(&mut segment, &mut merged) => result?,
        };
    }
    merged.flush().await?;
    Ok(())
}

fn default_voice() -> String {
    DEFAULT_VOICE.to_owned()
}

fn default_percent() -> String {
    "+0%".to_owned()
}

fn default_pitch() -> String {
    "+0Hz".to_owned()
}

fn voice_display_name(short_name: &str) -> String {
    match short_name {
        "zh-CN-XiaoxiaoNeural" => "晓晓".to_owned(),
        "zh-CN-XiaoyiNeural" => "晓伊".to_owned(),
        "zh-CN-YunjianNeural" => "云健".to_owned(),
        "zh-CN-YunxiNeural" => "云希".to_owned(),
        "zh-CN-YunxiaNeural" => "云夏".to_owned(),
        "zh-CN-YunyangNeural" => "云扬".to_owned(),
        "zh-CN-liaoning-XiaobeiNeural" => "晓北".to_owned(),
        "zh-CN-shaanxi-XiaoniNeural" => "晓妮".to_owned(),
        "zh-HK-HiuGaaiNeural" => "晓佳".to_owned(),
        "zh-HK-HiuMaanNeural" => "晓曼".to_owned(),
        "zh-HK-WanLungNeural" => "云龙".to_owned(),
        "zh-TW-HsiaoChenNeural" => "晓臻".to_owned(),
        "zh-TW-HsiaoYuNeural" => "晓雨".to_owned(),
        "zh-TW-YunJheNeural" => "云哲".to_owned(),
        _ => short_name
            .rsplit('-')
            .next()
            .unwrap_or(short_name)
            .strip_suffix("Neural")
            .unwrap_or(short_name)
            .to_owned(),
    }
}

fn locale_display_name(locale: &str) -> String {
    match locale {
        "zh-CN" => "普通话",
        "zh-CN-liaoning" => "东北话",
        "zh-CN-shaanxi" => "陕西话",
        "zh-HK" => "粤语",
        "zh-TW" => "中文（台湾）",
        "en-US" => "英语（美国）",
        "en-GB" => "英语（英国）",
        "ja-JP" => "日语",
        "ko-KR" => "韩语",
        _ => locale,
    }
    .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthesis_options(text: &str) -> SynthesisOptions {
        SynthesisOptions {
            text: text.to_owned(),
            voice: DEFAULT_VOICE.to_owned(),
            rate: "+0%".to_owned(),
            volume: "+0%".to_owned(),
            pitch: "+0Hz".to_owned(),
        }
    }

    fn history_record(index: usize) -> HistoryRecord {
        HistoryRecord {
            id: format!("{index:032x}"),
            created_at: "2026-08-18T12:00:00+08:00".to_owned(),
            text: format!("测试记录 {index}"),
            voice: DEFAULT_VOICE.to_owned(),
            voice_name: "晓晓".to_owned(),
            voice_gender: "Female".to_owned(),
            rate: "+0%".to_owned(),
            volume: "+0%".to_owned(),
            pitch: "+0Hz".to_owned(),
            size: 4,
        }
    }

    #[test]
    fn validates_and_normalizes_synthesis_options() {
        let mut options = synthesis_options("  你好  ");
        options.rate = "+15%".to_owned();
        options.volume = "-20%".to_owned();
        options.pitch = "+8Hz".to_owned();

        let validated = ValidatedOptions::try_from(options).expect("options should be valid");
        assert_eq!(validated.text, "你好");
        assert_eq!(validated.rate, 15);
        assert_eq!(validated.volume, -20);
        assert_eq!(validated.pitch, 8);

        assert!(ValidatedOptions::try_from(synthesis_options("   ")).is_err());

        let mut invalid_voice = synthesis_options("你好");
        invalid_voice.voice = "zh-CN/<invalid>".to_owned();
        assert!(ValidatedOptions::try_from(invalid_voice).is_err());

        let mut invalid_rate = synthesis_options("你好");
        invalid_rate.rate = "+101%".to_owned();
        assert!(ValidatedOptions::try_from(invalid_rate).is_err());
    }

    #[test]
    fn splits_chinese_text_on_utf8_boundaries_and_prefers_punctuation() {
        let text = "第一句话。第二句话，第三句话！第四句话";
        let chunks = split_text(text, 18);

        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 18));
        assert_eq!(chunks.concat(), text);
        assert!(chunks[0].ends_with('。'));
    }

    #[test]
    fn splits_long_text_by_character_count_and_keeps_all_content() {
        let text = format!(
            "{}。{} {}",
            "中".repeat(4_999),
            "文".repeat(4_999),
            "a".repeat(20)
        );
        let chunks = split_long_text(&text, LONG_TEXT_CHUNK_LENGTH);

        assert!(chunks.len() >= 3);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.chars().count() <= LONG_TEXT_CHUNK_LENGTH));
        assert_eq!(chunks.concat(), text);
        assert!(chunks[0].ends_with('。'));
    }

    #[test]
    fn rejects_long_text_over_half_a_million_characters() {
        let options = synthesis_options(&"字".repeat(MAX_LONG_TEXT_LENGTH + 1));
        assert!(validate_synthesis_options(options, MAX_LONG_TEXT_LENGTH).is_err());
    }

    #[test]
    fn removes_xml_incompatible_control_characters() {
        assert_eq!(remove_incompatible_characters("a\u{0001}b\nc"), "a b\nc");
    }

    #[test]
    fn detects_and_decodes_gbk_text() {
        let source = "这是一个使用 GBK 编码保存的中文文本文件。";
        let (encoded, _, had_errors) = encoding_rs::GBK.encode(source);
        assert!(!had_errors);

        let (decoded, encoding) = decode_text_data(&encoded, "gbk.txt").unwrap();

        assert_eq!(decoded, source);
        assert_eq!(encoding, "GBK");
    }

    #[test]
    fn decodes_utf16_text_with_a_byte_order_mark() {
        let mut encoded = vec![0xff, 0xfe];
        for unit in "UTF-16 中文文本".encode_utf16() {
            encoded.extend_from_slice(&unit.to_le_bytes());
        }

        let (decoded, encoding) = decode_text_data(&encoded, "utf16.txt").unwrap();

        assert_eq!(decoded, "UTF-16 中文文本");
        assert_eq!(encoding, "UTF-16LE");
    }

    #[tokio::test]
    async fn caps_history_and_removes_matching_audio_files() {
        let directory = tempfile::tempdir().expect("temporary directory should be available");
        let core = AppCore::new(directory.path().to_owned());

        for index in 0..=MAX_HISTORY_ITEMS {
            core.store_history_audio(&history_record(index), b"test")
                .await
                .expect("history item should be stored");
        }

        let history = core.history().await.expect("history should load").history;
        assert_eq!(history.len(), MAX_HISTORY_ITEMS);
        assert_eq!(history[0].id, format!("{:032x}", MAX_HISTORY_ITEMS));
        assert!(!core.audio_path(&format!("{:032x}", 0)).exists());

        let newest_id = format!("{:032x}", MAX_HISTORY_ITEMS);
        core.delete_history(&newest_id)
            .await
            .expect("history item should be deleted");
        assert!(!core.audio_path(&newest_id).exists());
        assert_eq!(
            core.history()
                .await
                .expect("history should load")
                .history
                .len(),
            MAX_HISTORY_ITEMS - 1
        );
    }

    #[tokio::test]
    async fn reads_supported_utf8_text_files_and_counts_characters() {
        let directory = tempfile::tempdir().expect("temporary directory should be available");
        let text_path = directory.path().join("notes.txt");
        let markdown_path = directory.path().join("article.md");
        tokio::fs::write(&text_path, "\u{feff}你好")
            .await
            .expect("text fixture should be written");
        tokio::fs::write(&markdown_path, "# 标题\n内容")
            .await
            .expect("markdown fixture should be written");

        let files = read_text_files(vec![
            text_path.to_string_lossy().into_owned(),
            markdown_path.to_string_lossy().into_owned(),
        ])
        .await
        .expect("text files should load");

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].text, "你好");
        assert_eq!(files[0].character_count, 2);
        assert_eq!(files[1].name, "article.md");
    }

    #[tokio::test]
    async fn exports_to_an_existing_directory_without_overwriting() {
        let data_directory = tempfile::tempdir().expect("data directory should be available");
        let export_directory = tempfile::tempdir().expect("export directory should be available");
        let core = AppCore::new(data_directory.path().to_owned());
        let record = history_record(1);
        core.store_history_audio(&record, b"audio")
            .await
            .expect("history item should be stored");

        let destination = core
            .export_history_to_directory(&record.id, export_directory.path())
            .await
            .expect("audio should be exported");

        assert_eq!(tokio::fs::read(&destination).await.unwrap(), b"audio");
        assert!(destination
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("voice-studio-") && name.ends_with(".mp3")));
    }

    #[tokio::test]
    async fn merges_audio_segments_in_source_order() {
        let directory = tempfile::tempdir().expect("temporary directory should be available");
        tokio::fs::write(directory.path().join("000000.mp3"), b"first")
            .await
            .unwrap();
        tokio::fs::write(directory.path().join("000001.mp3"), b"second")
            .await
            .unwrap();
        let destination = directory.path().join("merged.mp3");

        merge_audio_segments(directory.path(), &destination, 2, &CancellationToken::new())
            .await
            .expect("segments should merge");

        assert_eq!(tokio::fs::read(destination).await.unwrap(), b"firstsecond");
    }

    #[tokio::test]
    async fn cancels_a_batch_before_starting_an_online_request() {
        let directory = tempfile::tempdir().expect("temporary directory should be available");
        let core = AppCore::new(directory.path().to_owned());
        let batch_id = "batch-cancellation-test";

        assert!(core.cancel_batch(batch_id).await.unwrap());
        let result = core
            .synthesize_batch_and_store(batch_id, synthesis_options("不会发起网络请求"))
            .await;
        assert!(matches!(result, Err(CoreError::Cancelled)));

        core.finish_batch(batch_id).await.unwrap();
        assert!(!core.batch_cancellations.lock().await.contains_key(batch_id));
    }
}
