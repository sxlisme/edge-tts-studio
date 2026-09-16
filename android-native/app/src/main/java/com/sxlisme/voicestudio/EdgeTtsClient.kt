package com.sxlisme.voicestudio

import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

object EdgeTtsProtocol {
    private const val TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
    private const val GEC_VERSION = "1-130.0.2849.68"
    private const val BASE_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"

    fun websocketUrl(nowMillis: Long = System.currentTimeMillis()): String {
        val connectionId = UUID.randomUUID().toString().replace("-", "")
        return "$BASE_URL?TrustedClientToken=$TOKEN&ConnectionId=$connectionId" +
            "&Sec-MS-GEC=${securityToken(nowMillis)}&Sec-MS-GEC-Version=$GEC_VERSION"
    }

    fun speechConfig(timestamp: String, format: String = "audio-24khz-48kbitrate-mono-mp3"): String {
        val json = """{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"$format"}}}}"""
        return "X-Timestamp:$timestamp\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n$json"
    }

    fun ssml(text: String, voice: String, rate: Int, pitch: Int, volume: Int, timestamp: String): String {
        val requestId = UUID.randomUUID().toString().replace("-", "")
        val body = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
            "<voice name='${escapeXml(voice)}'><prosody pitch='${signed(pitch)}Hz' rate='${signed(rate)}%' " +
            "volume='${signed(volume)}%'>${escapeXml(text)}</prosody></voice></speak>"
        return "X-RequestId:$requestId\r\nContent-Type:application/ssml+xml\r\n" +
            "X-Timestamp:$timestamp\r\nPath:ssml\r\n\r\n$body"
    }

    fun audioPayload(frame: ByteArray): ByteArray? {
        if (frame.size < 3) return null
        val headerLength = ((frame[0].toInt() and 0xff) shl 8) or (frame[1].toInt() and 0xff)
        val audioStart = headerLength + 2
        if (audioStart > frame.size) return null
        val header = frame.copyOfRange(2, audioStart).toString(Charsets.UTF_8)
        val isAudioFrame = header.lineSequence().any { it.trim().equals("Path:audio", ignoreCase = true) }
        if (!isAudioFrame) return null
        return frame.copyOfRange(audioStart, frame.size)
    }

    internal fun securityToken(nowMillis: Long): String {
        val windowsEpochMillis = nowMillis + 11_644_473_600_000L
        var ticks = windowsEpochMillis * 10_000L
        ticks -= ticks % 3_000_000_000L
        val digest = MessageDigest.getInstance("SHA-256").digest("$ticks$TOKEN".toByteArray())
        return digest.joinToString("") { "%02X".format(it) }
    }

    internal fun escapeXml(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")

    private fun signed(value: Int): String = if (value >= 0) "+$value" else value.toString()
}

class EdgeTtsClient {
    interface Callback {
        fun onSuccess(audio: ByteArray)
        fun onFailure(message: String)
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    fun synthesize(
        text: String,
        voice: String,
        rate: Int,
        pitch: Int,
        volume: Int,
        callback: Callback,
    ): WebSocket {
        val request = Request.Builder()
            .url(EdgeTtsProtocol.websocketUrl())
            .header("Pragma", "no-cache")
            .header("Cache-Control", "no-cache")
            .header("User-Agent", USER_AGENT)
            .header("Origin", ORIGIN)
            .build()

        return client.newWebSocket(request, object : WebSocketListener() {
            private val audio = ByteArrayOutputStream()
            private val completed = AtomicBoolean(false)

            override fun onOpen(webSocket: WebSocket, response: Response) {
                val timestamp = DateTimeFormatter.RFC_1123_DATE_TIME.format(ZonedDateTime.now())
                webSocket.send(EdgeTtsProtocol.speechConfig(timestamp))
                webSocket.send(EdgeTtsProtocol.ssml(text, voice, rate, pitch, volume, timestamp))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("Path:turn.end", ignoreCase = true)) {
                    finish(webSocket)
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                EdgeTtsProtocol.audioPayload(bytes.toByteArray())?.let { audio.write(it) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                finish(webSocket)
            }

            override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
                if (completed.compareAndSet(false, true)) {
                    callback.onFailure(error.message ?: "无法连接在线语音服务")
                }
            }

            private fun finish(webSocket: WebSocket) {
                if (!completed.compareAndSet(false, true)) return
                val result = audio.toByteArray()
                if (result.isEmpty()) callback.onFailure("语音服务未返回音频，请稍后重试")
                else callback.onSuccess(result)
                webSocket.close(1000, "complete")
            }
        })
    }

    companion object {
        private const val USER_AGENT = "Mozilla/5.0 (Linux; Android 10; HD1913) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/143.0.7499.193 Mobile Safari/537.36 EdgA/143.0.3650.125"
        private const val ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
    }
}
