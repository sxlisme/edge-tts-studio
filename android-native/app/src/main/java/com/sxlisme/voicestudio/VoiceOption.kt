package com.sxlisme.voicestudio

data class VoiceOption(
    val shortName: String,
    val displayName: String,
    val localeName: String,
    val genderName: String,
) {
    override fun toString(): String = "$displayName · $localeName · $genderName"
}

object VoiceCatalog {
    val voices = listOf(
        VoiceOption("zh-CN-XiaoxiaoNeural", "晓晓", "普通话", "女声"),
        VoiceOption("zh-CN-XiaoyiNeural", "晓伊", "普通话", "女声"),
        VoiceOption("zh-CN-YunjianNeural", "云健", "普通话", "男声"),
        VoiceOption("zh-CN-YunxiNeural", "云希", "普通话", "男声"),
        VoiceOption("zh-CN-YunxiaNeural", "云夏", "普通话", "男声"),
        VoiceOption("zh-CN-YunyangNeural", "云扬", "普通话", "男声"),
        VoiceOption("zh-CN-liaoning-XiaobeiNeural", "晓北", "东北话", "女声"),
        VoiceOption("zh-CN-shaanxi-XiaoniNeural", "晓妮", "陕西话", "女声"),
        VoiceOption("zh-HK-HiuGaaiNeural", "晓佳", "香港粤语", "女声"),
        VoiceOption("zh-HK-HiuMaanNeural", "晓曼", "香港粤语", "女声"),
        VoiceOption("zh-HK-WanLungNeural", "云龙", "香港粤语", "男声"),
        VoiceOption("zh-TW-HsiaoChenNeural", "晓臻", "台湾普通话", "女声"),
        VoiceOption("zh-TW-HsiaoYuNeural", "晓雨", "台湾普通话", "女声"),
        VoiceOption("zh-TW-YunJheNeural", "云哲", "台湾普通话", "男声"),
        VoiceOption("en-US-JennyNeural", "Jenny", "美式英语", "女声"),
        VoiceOption("ja-JP-NanamiNeural", "Nanami", "日语", "女声"),
        VoiceOption("ko-KR-SunHiNeural", "SunHi", "韩语", "女声"),
        VoiceOption("fr-FR-DeniseNeural", "Denise", "法语", "女声"),
    )
}
