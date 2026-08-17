from __future__ import annotations

import asyncio
import io
import json
import os
import re
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import edge_tts
from flask import Flask, jsonify, render_template, request, send_file


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024

APP_VERSION = "1.1.0"
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_TEXT_LENGTH = 10_000
SYNTHESIS_TIMEOUT_SECONDS = 180
VOICE_CACHE_SECONDS = 6 * 60 * 60
MAX_HISTORY_ITEMS = 50

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "audio"
HISTORY_PATH = DATA_DIR / "history.json"

VOICE_DISPLAY_NAMES = {
    "zh-CN-XiaoxiaoNeural": "晓晓",
    "zh-CN-XiaoyiNeural": "晓伊",
    "zh-CN-YunjianNeural": "云健",
    "zh-CN-YunxiNeural": "云希",
    "zh-CN-YunxiaNeural": "云夏",
    "zh-CN-YunyangNeural": "云扬",
    "zh-CN-liaoning-XiaobeiNeural": "晓北",
    "zh-CN-shaanxi-XiaoniNeural": "晓妮",
    "zh-HK-HiuGaaiNeural": "晓佳",
    "zh-HK-HiuMaanNeural": "晓曼",
    "zh-HK-WanLungNeural": "云龙",
    "zh-TW-HsiaoChenNeural": "晓臻",
    "zh-TW-HsiaoYuNeural": "晓雨",
    "zh-TW-YunJheNeural": "云哲",
}

LOCALE_DISPLAY_NAMES = {
    "zh-CN": "普通话",
    "zh-CN-liaoning": "东北话",
    "zh-CN-shaanxi": "陕西话",
    "zh-HK": "粤语",
    "zh-TW": "中文（台湾）",
    "en-US": "英语（美国）",
    "en-GB": "英语（英国）",
    "ja-JP": "日语",
    "ko-KR": "韩语",
}

_voice_cache: Tuple[float, List[Dict[str, Any]]] = (0.0, [])
_voice_lock = threading.Lock()
_history_lock = threading.RLock()
_voice_name_pattern = re.compile(r"^[A-Za-z0-9-]+$")
_history_id_pattern = re.compile(r"^[0-9a-f]{32}$")
_percent_pattern = re.compile(r"^([+-])(\d{1,3})%$")
_pitch_pattern = re.compile(r"^([+-])(\d{1,3})Hz$")


def _run_async(coroutine: Any, timeout: int) -> Any:
    async def runner() -> Any:
        return await asyncio.wait_for(coroutine, timeout=timeout)

    return asyncio.run(runner())


async def _fetch_voices() -> List[Dict[str, Any]]:
    voices = await edge_tts.list_voices()
    return sorted(
        voices,
        key=lambda item: (item.get("Locale", ""), item.get("ShortName", "")),
    )


def _get_voices() -> List[Dict[str, Any]]:
    global _voice_cache
    cached_at, cached_voices = _voice_cache
    if cached_voices and time.monotonic() - cached_at < VOICE_CACHE_SECONDS:
        return cached_voices

    with _voice_lock:
        cached_at, cached_voices = _voice_cache
        if cached_voices and time.monotonic() - cached_at < VOICE_CACHE_SECONDS:
            return cached_voices
        voices = _run_async(_fetch_voices(), timeout=30)
        _voice_cache = (time.monotonic(), voices)
        return voices


def _compact_voice(voice: Dict[str, Any]) -> Dict[str, str]:
    short_name = voice.get("ShortName", "")
    locale = voice.get("Locale", "")
    gender = voice.get("Gender", "")
    return {
        "shortName": short_name,
        "displayName": _voice_display_name(short_name),
        "friendlyName": voice.get("FriendlyName", short_name),
        "locale": locale,
        "localeName": LOCALE_DISPLAY_NAMES.get(locale, locale),
        "gender": gender,
        "genderName": "女声" if gender == "Female" else "男声" if gender == "Male" else gender,
    }


def _voice_display_name(short_name: str) -> str:
    if short_name in VOICE_DISPLAY_NAMES:
        return VOICE_DISPLAY_NAMES[short_name]
    name = short_name.rsplit("-", 1)[-1]
    return re.sub(r"Neural$", "", name) or short_name


def _ensure_data_dirs() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def _read_history_unlocked() -> List[Dict[str, Any]]:
    if not HISTORY_PATH.exists():
        return []
    try:
        payload = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        app.logger.exception("Unable to read conversion history")
        return []
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _write_history_unlocked(items: List[Dict[str, Any]]) -> None:
    _ensure_data_dirs()
    temporary_path = HISTORY_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.replace(temporary_path, HISTORY_PATH)


def _remove_audio_unlocked(record: Dict[str, Any]) -> None:
    record_id = str(record.get("id", ""))
    if not _history_id_pattern.fullmatch(record_id):
        return
    try:
        (AUDIO_DIR / f"{record_id}.mp3").unlink()
    except FileNotFoundError:
        pass


def _save_history(audio: bytes, options: Dict[str, str]) -> Dict[str, Any]:
    record_id = uuid.uuid4().hex
    record = {
        "id": record_id,
        "createdAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "text": options["text"],
        "voice": options["voice"],
        "voiceName": _voice_display_name(options["voice"]),
        "rate": options["rate"],
        "volume": options["volume"],
        "pitch": options["pitch"],
        "size": len(audio),
    }

    with _history_lock:
        _ensure_data_dirs()
        audio_path = AUDIO_DIR / f"{record_id}.mp3"
        audio_path.write_bytes(audio)
        try:
            items = _read_history_unlocked()
            items.insert(0, record)
            expired = items[MAX_HISTORY_ITEMS:]
            items = items[:MAX_HISTORY_ITEMS]
            _write_history_unlocked(items)
            for old_record in expired:
                _remove_audio_unlocked(old_record)
        except Exception:
            audio_path.unlink(missing_ok=True)
            raise
    return record


def _get_history_record(record_id: str) -> Dict[str, Any]:
    if not _history_id_pattern.fullmatch(record_id):
        raise KeyError(record_id)
    with _history_lock:
        for record in _read_history_unlocked():
            if record.get("id") == record_id:
                return record
    raise KeyError(record_id)


def _parse_bounded_value(value: Any, pattern: re.Pattern[str], label: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label}格式不正确")
    match = pattern.fullmatch(value)
    if not match or int(match.group(2)) > 100:
        raise ValueError(f"{label}必须在 -100 到 +100 之间")
    return value


def _validate_payload(payload: Any) -> Dict[str, str]:
    if not isinstance(payload, dict):
        raise ValueError("请求体必须是 JSON 对象")

    text = payload.get("text", "")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("请输入需要转换的文字")
    text = text.strip()
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(f"文字不能超过 {MAX_TEXT_LENGTH} 个字符")

    voice = payload.get("voice", DEFAULT_VOICE)
    if not isinstance(voice, str) or not _voice_name_pattern.fullmatch(voice):
        raise ValueError("音色名称格式不正确")

    rate = _parse_bounded_value(payload.get("rate", "+0%"), _percent_pattern, "语速")
    volume = _parse_bounded_value(
        payload.get("volume", "+0%"), _percent_pattern, "音量"
    )
    pitch = _parse_bounded_value(
        payload.get("pitch", "+0Hz"), _pitch_pattern, "音调"
    )
    return {
        "text": text,
        "voice": voice,
        "rate": rate,
        "volume": volume,
        "pitch": pitch,
    }


async def _synthesize_audio(options: Dict[str, str]) -> bytes:
    communicator = edge_tts.Communicate(**options)
    chunks = []
    async for chunk in communicator.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    return b"".join(chunks)


@app.get("/")
def index() -> str:
    return render_template(
        "index.html",
        app_version=APP_VERSION,
        default_voice=DEFAULT_VOICE,
        max_text_length=MAX_TEXT_LENGTH,
    )


@app.get("/api/health")
def health() -> Any:
    return jsonify({"status": "ok", "version": APP_VERSION})


@app.get("/api/voices")
def voices() -> Any:
    locale = request.args.get("locale", "").strip().lower()
    try:
        available = _get_voices()
    except Exception as exc:
        app.logger.exception("Unable to fetch Edge TTS voices")
        return jsonify({"error": f"获取微软音色失败：{exc}"}), 502

    if locale:
        available = [
            voice
            for voice in available
            if voice.get("Locale", "").lower().startswith(locale)
        ]
    return jsonify({"voices": [_compact_voice(voice) for voice in available]})


@app.post("/api/synthesize")
def synthesize() -> Any:
    try:
        options = _validate_payload(request.get_json(silent=True))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        audio = _run_async(
            _synthesize_audio(options), timeout=SYNTHESIS_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        return jsonify({"error": "微软语音服务响应超时，请稍后重试"}), 504
    except Exception as exc:
        app.logger.exception("Edge TTS synthesis failed")
        return jsonify({"error": f"语音生成失败：{exc}"}), 502

    if not audio:
        return jsonify({"error": "微软语音服务没有返回音频"}), 502

    try:
        record = _save_history(audio, options)
    except OSError as exc:
        app.logger.exception("Unable to save conversion history")
        return jsonify({"error": f"音频已生成，但保存转换记录失败：{exc}"}), 500

    response = send_file(
        io.BytesIO(audio),
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="edge-tts.mp3",
        max_age=0,
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Voice"] = options["voice"]
    response.headers["X-History-Id"] = record["id"]
    return response


@app.get("/api/history")
def conversion_history() -> Any:
    with _history_lock:
        items = _read_history_unlocked()
    return jsonify({"history": items, "limit": MAX_HISTORY_ITEMS})


@app.get("/api/history/<record_id>/audio")
def history_audio(record_id: str) -> Any:
    try:
        record = _get_history_record(record_id)
    except KeyError:
        return jsonify({"error": "转换记录不存在"}), 404
    audio_path = AUDIO_DIR / f"{record_id}.mp3"
    if not audio_path.is_file():
        return jsonify({"error": "音频文件不存在"}), 404
    return send_file(
        audio_path,
        mimetype="audio/mpeg",
        as_attachment=request.args.get("download") == "1",
        download_name=f"edge-tts-{record['voiceName']}-{record_id[:8]}.mp3",
        max_age=0,
    )


@app.delete("/api/history/<record_id>")
def delete_history_record(record_id: str) -> Any:
    if not _history_id_pattern.fullmatch(record_id):
        return jsonify({"error": "转换记录不存在"}), 404
    with _history_lock:
        items = _read_history_unlocked()
        record = next((item for item in items if item.get("id") == record_id), None)
        if record is None:
            return jsonify({"error": "转换记录不存在"}), 404
        _remove_audio_unlocked(record)
        _write_history_unlocked([item for item in items if item.get("id") != record_id])
    return jsonify({"deleted": record_id})


@app.delete("/api/history")
def clear_conversion_history() -> Any:
    with _history_lock:
        items = _read_history_unlocked()
        for record in items:
            _remove_audio_unlocked(record)
        _write_history_unlocked([])
    return jsonify({"deleted": len(items)})


@app.errorhandler(413)
def request_too_large(_: Exception) -> Any:
    return jsonify({"error": "请求内容过大"}), 413


if __name__ == "__main__":
    host = os.environ.get("EDGE_TTS_HOST", "127.0.0.1")
    port = int(os.environ.get("EDGE_TTS_PORT", "8765"))
    app.run(host=host, port=port, debug=False, threaded=True)
