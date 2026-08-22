use std::{collections::HashMap, sync::Arc};

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::core::{AppCore, CoreError, SynthesisOptions};

const API_ADDRESS: &str = "127.0.0.1:8765";

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Serialize)]
struct DeletedResponse<T> {
    deleted: T,
}

#[derive(Deserialize)]
struct VoiceQuery {
    locale: Option<String>,
}

pub fn spawn(core: Arc<AppCore>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = serve(core).await {
            eprintln!("Local API unavailable on {API_ADDRESS}: {error}");
        }
    });
}

async fn serve(core: Arc<AppCore>) -> Result<(), std::io::Error> {
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/voices", get(voices))
        .route("/api/synthesize", axum::routing::post(synthesize))
        .route("/api/history", get(history).delete(clear_history))
        .route("/api/history/{id}", axum::routing::delete(delete_history))
        .route("/api/history/{id}/audio", get(history_audio))
        .with_state(core);
    let listener = tokio::net::TcpListener::bind(API_ADDRESS).await?;
    axum::serve(listener, app).await
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn voices(State(core): State<Arc<AppCore>>, Query(query): Query<VoiceQuery>) -> Response {
    match core.list_voices(query.locale.as_deref()).await {
        Ok(response) => Json(response).into_response(),
        Err(error) => api_error(error),
    }
}

async fn synthesize(
    State(core): State<Arc<AppCore>>,
    Json(options): Json<SynthesisOptions>,
) -> Response {
    match core.synthesize_and_store(options).await {
        Ok(synthesized) => {
            let mut response = Response::new(Body::from(synthesized.audio));
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static("audio/mpeg"));
            response.headers_mut().insert(
                "X-History-Id",
                HeaderValue::from_str(&synthesized.record.id)
                    .unwrap_or_else(|_| HeaderValue::from_static("")),
            );
            response
        }
        Err(error) => api_error(error),
    }
}

async fn history(State(core): State<Arc<AppCore>>) -> Response {
    match core.history().await {
        Ok(response) => Json(response).into_response(),
        Err(error) => api_error(error),
    }
}

async fn history_audio(
    State(core): State<Arc<AppCore>>,
    Path(id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    match core.history_audio(&id).await {
        Ok((record, audio)) => {
            let mut response = Response::new(Body::from(audio));
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static("audio/mpeg"));
            if query.get("download").is_some_and(|value| value == "1") {
                let filename = format!("voice-studio-{}.mp3", record.id);
                if let Ok(value) =
                    HeaderValue::from_str(&format!("attachment; filename={filename}"))
                {
                    response
                        .headers_mut()
                        .insert(header::CONTENT_DISPOSITION, value);
                }
            }
            response
        }
        Err(error) => api_error(error),
    }
}

async fn delete_history(State(core): State<Arc<AppCore>>, Path(id): Path<String>) -> Response {
    match core.delete_history(&id).await {
        Ok(deleted) => Json(DeletedResponse { deleted }).into_response(),
        Err(error) => api_error(error),
    }
}

async fn clear_history(State(core): State<Arc<AppCore>>) -> Response {
    match core.clear_history().await {
        Ok(deleted) => Json(DeletedResponse { deleted }).into_response(),
        Err(error) => api_error(error),
    }
}

fn api_error(error: CoreError) -> Response {
    let status = match &error {
        CoreError::Validation(_) => StatusCode::BAD_REQUEST,
        CoreError::NotFound => StatusCode::NOT_FOUND,
        CoreError::Timeout => StatusCode::GATEWAY_TIMEOUT,
        CoreError::Cancelled => StatusCode::REQUEST_TIMEOUT,
        CoreError::Speech(_) | CoreError::LongSynthesis { .. } => StatusCode::BAD_GATEWAY,
        CoreError::Io(_) | CoreError::Json(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (
        status,
        Json(ErrorResponse {
            error: error.to_string(),
        }),
    )
        .into_response()
}
