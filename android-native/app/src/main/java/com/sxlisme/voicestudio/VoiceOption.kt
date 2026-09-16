package com.sxlisme.voicestudio

import java.util.Locale
import org.json.JSONArray

data class VoiceOption(
    val shortName: String,
    val displayName: String,
    val locale: String,
    val localeName: String,
    val genderName: String,
) {
    val languageCode: String = locale.substringBefore('-').lowercase(Locale.ROOT)

    override fun toString(): String = "$displayName · $genderName · $localeName"
}

data class LanguageOption(
    val languageCode: String,
    val displayName: String,
    val voiceCount: Int,
) {
    override fun toString(): String = "$displayName（$voiceCount）"
}

object VoiceCatalog {
    fun parse(json: String): List<VoiceOption> {
        val payload = JSONArray(json)
        val voices = ArrayList<VoiceOption>(payload.length())
        for (index in 0 until payload.length()) {
            val item = payload.optJSONObject(index) ?: continue
            val shortName = item.optString("ShortName").trim()
            val locale = item.optString("Locale").trim()
            if (shortName.isEmpty() || locale.isEmpty()) continue
            val gender = when (item.optString("Gender")) {
                "Female" -> "女声"
                "Male" -> "男声"
                else -> item.optString("Gender").ifBlank { "未知" }
            }
            voices += VoiceOption(
                shortName = shortName,
                displayName = localizedVoiceName(shortName),
                locale = locale,
                localeName = localizedLocaleName(locale),
                genderName = gender,
            )
        }
        return voices
            .distinctBy { it.shortName }
            .sortedWith(compareBy(VoiceOption::languageCode, VoiceOption::locale, VoiceOption::displayName))
    }

    fun languages(voices: List<VoiceOption>): List<LanguageOption> = voices
        .groupBy(VoiceOption::languageCode)
        .map { (languageCode, entries) ->
            val displayName = Locale.forLanguageTag(languageCode)
                .getDisplayLanguage(Locale.SIMPLIFIED_CHINESE)
                .ifBlank { languageCode.uppercase(Locale.ROOT) }
            LanguageOption(languageCode, displayName, entries.size)
        }
        .sortedWith(compareBy(LanguageOption::displayName, LanguageOption::languageCode))

    private fun localizedLocaleName(locale: String): String = when (locale) {
        "zh-CN" -> "普通话"
        "zh-CN-liaoning" -> "东北话"
        "zh-CN-shaanxi" -> "陕西话"
        "zh-HK" -> "香港粤语"
        "zh-TW" -> "台湾普通话"
        else -> Locale.forLanguageTag(locale)
            .getDisplayName(Locale.SIMPLIFIED_CHINESE)
            .ifBlank { locale }
    }

    private fun localizedVoiceName(shortName: String): String = when (shortName) {
        "zh-CN-XiaoxiaoNeural" -> "晓晓"
        "zh-CN-XiaoyiNeural" -> "晓伊"
        "zh-CN-YunjianNeural" -> "云健"
        "zh-CN-YunxiNeural" -> "云希"
        "zh-CN-YunxiaNeural" -> "云夏"
        "zh-CN-YunyangNeural" -> "云扬"
        "zh-CN-liaoning-XiaobeiNeural" -> "晓北"
        "zh-CN-shaanxi-XiaoniNeural" -> "晓妮"
        "zh-HK-HiuGaaiNeural" -> "晓佳"
        "zh-HK-HiuMaanNeural" -> "晓曼"
        "zh-HK-WanLungNeural" -> "云龙"
        "zh-TW-HsiaoChenNeural" -> "晓臻"
        "zh-TW-HsiaoYuNeural" -> "晓雨"
        "zh-TW-YunJheNeural" -> "云哲"
        else -> shortName.substringAfterLast('-').removeSuffix("Neural")
    }
}
