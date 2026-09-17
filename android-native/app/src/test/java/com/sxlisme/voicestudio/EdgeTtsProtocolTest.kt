package com.sxlisme.voicestudio

import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EdgeTtsProtocolTest {
    @Test
    fun escapesUserTextInsideSsml() {
        val message = EdgeTtsProtocol.ssml(
            text = "A & B < C's \"voice\"",
            voice = "zh-CN-XiaoxiaoNeural",
            rate = 5,
            pitch = -10,
            volume = 0,
            timestamp = "timestamp",
        )
        assertTrue(message.contains("A &amp; B &lt; C&apos;s &quot;voice&quot;"))
        assertTrue(message.contains("pitch='-10Hz'"))
        assertTrue(message.contains("rate='+5%'"))
        assertTrue(message.contains("volume='+0%'"))
    }

    @Test
    fun extractsOnlyAudioWebSocketPayloads() {
        val header = "Content-Type:audio/mpeg\r\nPath:audio\r\n".toByteArray()
        val audio = byteArrayOf(0x49, 0x44, 0x33, 0x04)
        val frame = ByteBuffer.allocate(2 + header.size + audio.size)
            .putShort(header.size.toShort())
            .put(header)
            .put(audio)
            .array()
        assertArrayEquals(audio, EdgeTtsProtocol.audioPayload(frame))

        val metadataHeader = "Path:audio.metadata\r\n".toByteArray()
        val metadataFrame = ByteBuffer.allocate(2 + metadataHeader.size)
            .putShort(metadataHeader.size.toShort())
            .put(metadataHeader)
            .array()
        assertEquals(null, EdgeTtsProtocol.audioPayload(metadataFrame))
    }

    @Test
    fun securityTokenIsStableWithinFiveMinuteWindow() {
        val now = 1_800_000_000_000L
        val first = EdgeTtsProtocol.securityToken(now)
        val second = EdgeTtsProtocol.securityToken(now + 1_000L)
        assertEquals(first, second)
        assertEquals(64, first.length)
        assertTrue(first.all { it.isDigit() || it in 'A'..'F' })
    }

    @Test
    fun splitsFiftyThousandChineseCharactersNearFiveHundredCharacters() {
        val text = "你好，欢迎使用语音工作台。".repeat(4_000).take(50_000)
        val chunks = EdgeTtsProtocol.splitText(text)
        assertTrue(chunks.size >= 100)
        assertTrue(chunks.all { it.codePointCount(0, it.length) <= 500 })
        assertTrue(chunks.dropLast(1).all { it.codePointCount(0, it.length) >= 300 })
        assertEquals(text, chunks.joinToString(""))
        assertEquals(3, EdgeTtsClient.MAX_CHUNK_RETRIES)
    }

    @Test
    fun groupsMainlandHongKongAndTaiwanVoicesUnderChinese() {
        val voices = VoiceCatalog.parse(
            """[
                {"ShortName":"zh-CN-XiaoxiaoNeural","Gender":"Female","Locale":"zh-CN"},
                {"ShortName":"zh-HK-WanLungNeural","Gender":"Male","Locale":"zh-HK"},
                {"ShortName":"zh-TW-HsiaoYuNeural","Gender":"Female","Locale":"zh-TW"},
                {"ShortName":"en-US-JennyNeural","Gender":"Female","Locale":"en-US"}
            ]""",
        )
        val languages = VoiceCatalog.languages(voices)
        assertEquals(2, languages.size)
        assertEquals(3, languages.single { it.languageCode == "zh" }.voiceCount)
        assertTrue(voices.single { it.shortName == "zh-HK-WanLungNeural" }.localeName.contains("香港"))
    }

    @Test
    fun loadsCompleteOnlineVoiceCatalog() {
        val latch = CountDownLatch(1)
        var result: List<VoiceOption>? = null
        var failed = false
        val call = EdgeTtsClient().loadVoices(object : EdgeTtsClient.VoiceCallback {
            override fun onSuccess(voices: List<VoiceOption>) {
                result = voices
                latch.countDown()
            }

            override fun onFailure() {
                failed = true
                latch.countDown()
            }
        })
        assertTrue("voice catalog request timed out", latch.await(45, TimeUnit.SECONDS))
        call.cancel()
        assertTrue("voice catalog request failed", !failed)
        assertTrue("voice catalog was unexpectedly small", (result?.size ?: 0) > 100)
        assertTrue(result.orEmpty().any { it.shortName == "zh-CN-XiaoxiaoNeural" })
        assertTrue(result.orEmpty().any { it.locale == "zh-HK" })
        assertTrue(result.orEmpty().any { it.locale == "zh-TW" })
    }

    @Test
    fun synthesizesShortMandarinAudio() {
        val latch = CountDownLatch(1)
        var result: ByteArray? = null
        var failure: String? = null
        var started = false
        var completed = false
        val handle = EdgeTtsClient().synthesizeText(
            text = "你好",
            voice = "zh-CN-XiaoxiaoNeural",
            rate = 0,
            pitch = 0,
            volume = 0,
            callback = object : EdgeTtsClient.Callback {
                override fun onProgress(current: Int, total: Int) {
                    started = current == 1 && total == 1
                }

                override fun onChunkComplete(completedCount: Int, total: Int) {
                    completed = completedCount == 1 && total == 1
                }

                override fun onSuccess(audio: ByteArray) {
                    result = audio
                    latch.countDown()
                }

                override fun onFailure(message: String) {
                    failure = message
                    latch.countDown()
                }
            },
        )
        assertTrue("TTS request timed out", latch.await(45, TimeUnit.SECONDS))
        handle.cancel()
        assertEquals(failure, null)
        assertTrue("synthesis progress did not start", started)
        assertTrue("synthesis progress did not complete", completed)
        assertTrue("TTS returned no audio", result != null && result!!.isNotEmpty())
        assertTrue("audio was unexpectedly small", result!!.size > 1_000)
    }
}
