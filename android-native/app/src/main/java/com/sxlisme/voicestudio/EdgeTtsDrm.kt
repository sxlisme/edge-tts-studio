package com.sxlisme.voicestudio

import java.security.MessageDigest

internal object EdgeTtsDrm {
    // Int overflow is intentional: CS64 is defined as wrapping 32-bit arithmetic.
    private const val TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
    private const val WINDOWS_EPOCH_MILLIS = 11_644_473_600_000L
    private const val FIVE_MINUTE_TICKS = 3_000_000_000L
    private const val HASH_PREFIX = "Copyright (C) Microsoft Corporation. All rights reserved."

    private val coefficients = arrayOf(
        intArrayOf(0xE82E91B1L.toInt(), 0xB32700D0L.toInt()),
        intArrayOf(0x44DE24C6, 0x88DFF51DL.toInt()),
        intArrayOf(0x3BEB65BC, 0x29514038),
        intArrayOf(0xC89C5933L.toInt(), 0xB328CBDFL.toInt()),
        intArrayOf(0x8D1EC211L.toInt(), 0xD405B4D5L.toInt()),
        intArrayOf(0x314EF5D5, 0x26E55F3C),
        intArrayOf(0xE92491B1L.toInt(), 0x607801C6),
        intArrayOf(0xF0A5B9D5L.toInt(), 0x82B2C1FBL.toInt()),
        intArrayOf(0x06064CF3, 0xFA51A3DAL.toInt()),
        intArrayOf(0xDA79FA60L.toInt(), 0x207CC464),
        intArrayOf(0xBED20560L.toInt(), 0x3C3C74F3),
        intArrayOf(0x89F9C9F8L.toInt(), 0xD2D14B61L.toInt()),
        intArrayOf(0x35FA38C6, 0xBB04A2C1L.toInt()),
        intArrayOf(0xCB49E3C6L.toInt(), 0xC5626167L.toInt()),
    )

    fun generate(nowMillis: Long): String {
        val ticks = (nowMillis + WINDOWS_EPOCH_MILLIS) * 10_000L
        val roundedTicks = ticks - ticks % FIVE_MINUTE_TICKS
        val data = "$roundedTicks$TOKEN".toByteArray(Charsets.US_ASCII)
        val sha256 = MessageDigest.getInstance("SHA-256").apply {
            update(HASH_PREFIX.toByteArray(Charsets.US_ASCII))
        }.digest(data)
        val checksum = cs64Digest(data, sha256)
        return "${checksum.toHex()}-${sha256.toHex()}"
    }

    private fun cs64Digest(data: ByteArray, sha256: ByteArray): ByteArray {
        val keyA = readIntLittleEndian(sha256, 0) or 1
        val keyB = readIntLittleEndian(sha256, 4) or 1
        val factors = intArrayOf(
            keyA * 0x82893933L.toInt(),
            keyB * 0x82893933L.toInt(),
        )
        val terms = coefficients.mapIndexedTo(mutableListOf()) { index, pair ->
            pair[0] * factors[index % 2]
        }
        val offsets = coefficients.mapTo(mutableListOf()) { it[1] }

        val padded = ByteArray(((data.size + 8) / 8) * 8)
        data.copyInto(padded, destinationOffset = 1)
        for (index in 0 until padded.size / 4) {
            val word = readIntLittleEndian(padded, index * 4)
            var term = word * if (index % 2 == 0) keyA else keyB
            var offset = rotate16(word) * if (index % 2 == 0) {
                0xEF0569FBL.toInt()
            } else {
                0xC31713DBL.toInt()
            }
            if (index == 0) {
                term += 0xF2F90B1AL.toInt() * factors[0]
                offset += 0x0B1A0000
            }
            terms += term
            offsets += offset
        }

        var swapAccumulator = 0
        var swapLast = 0
        var state = 0
        var accumulator = 0
        var index = 0
        while (index < terms.size) {
            val x = terms[index]
            val y = terms[index + 1]

            var value = rotate16(offsets[index] + x)
            var product = value * 0x76F50F34
            swapAccumulator += rotate16(product) * 0xC3EFEA97L.toInt() + product
            value = rotate16(offsets[index + 1] + y)
            product = value * 0x1881CE3C
            swapLast = rotate16(product) * 0x35BD1EC9 + product
            swapAccumulator += swapLast

            state = state * keyA + x
            state = rotate16(state) * 0xCF98B111L.toInt()
            state = rotate16(state) * 0x87085B9FL.toInt()
            state = rotate16(state) * 0x12CEB96D
            state = rotate16(state) * 0x257E1D83
            accumulator += state

            value = state * keyB + y
            value = rotate16(value) * 0xA27416F5L.toInt()
            value = rotate16(value) * 0xD38396FFL.toInt()
            state = rotate16(rotate16(value) * 0x7C932B89) * 0xBFA49F69L.toInt()
            accumulator += state
            index += 2
        }

        return ByteArray(8).also {
            writeIntLittleEndian(it, 0, swapLast xor state)
            writeIntLittleEndian(it, 4, swapAccumulator xor accumulator)
        }
    }

    private fun rotate16(value: Int): Int = Integer.rotateLeft(value, 16)

    private fun readIntLittleEndian(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xFF) or
            ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
            ((bytes[offset + 2].toInt() and 0xFF) shl 16) or
            ((bytes[offset + 3].toInt() and 0xFF) shl 24)

    private fun writeIntLittleEndian(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = value.toByte()
        bytes[offset + 1] = (value ushr 8).toByte()
        bytes[offset + 2] = (value ushr 16).toByte()
        bytes[offset + 3] = (value ushr 24).toByte()
    }

    private fun ByteArray.toHex(): String = buildString(size * 2) {
        for (byte in this@toHex) {
            append(HEX_DIGITS[(byte.toInt() ushr 4) and 0x0F])
            append(HEX_DIGITS[byte.toInt() and 0x0F])
        }
    }

    private const val HEX_DIGITS = "0123456789ABCDEF"
}
