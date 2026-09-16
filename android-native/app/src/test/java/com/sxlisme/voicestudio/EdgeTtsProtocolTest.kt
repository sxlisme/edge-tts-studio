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
    fun synthesizesShortMandarinAudio() {
        val latch = CountDownLatch(1)
        var result: ByteArray? = null
        var failure: String? = null
        val socket = EdgeTtsClient().synthesize(
            text = "你好",
            voice = "zh-CN-XiaoxiaoNeural",
            rate = 0,
            pitch = 0,
            volume = 0,
            callback = object : EdgeTtsClient.Callback {
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
        socket.cancel()
        assertEquals(failure, null)
        assertTrue("TTS returned no audio", result != null && result!!.isNotEmpty())
        assertTrue("audio was unexpectedly small", result!!.size > 1_000)
    }
}
