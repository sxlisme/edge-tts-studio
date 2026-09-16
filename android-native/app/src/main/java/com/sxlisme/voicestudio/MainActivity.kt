package com.sxlisme.voicestudio

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import okhttp3.WebSocket

class MainActivity : android.app.Activity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val ttsClient = EdgeTtsClient()

    private lateinit var textInput: EditText
    private lateinit var voiceSpinner: Spinner
    private lateinit var rateInput: SeekBar
    private lateinit var pitchInput: SeekBar
    private lateinit var volumeInput: SeekBar
    private lateinit var generateButton: Button
    private lateinit var playButton: Button
    private lateinit var saveButton: Button
    private lateinit var playerProgress: SeekBar
    private lateinit var playerTime: TextView
    private lateinit var statusText: TextView
    private lateinit var generationProgress: ProgressBar

    private var mediaPlayer: MediaPlayer? = null
    private var activeSocket: WebSocket? = null
    private var generatedFile: File? = null
    private var generatedAudio: ByteArray? = null
    private var generatedVoice: VoiceOption? = null
    private var generationId = 0
    private var pendingLegacySave = false

    private val progressUpdater = object : Runnable {
        override fun run() {
            val player = mediaPlayer ?: return
            if (player.isPrepared()) {
                playerProgress.max = player.duration.coerceAtLeast(1)
                playerProgress.progress = player.currentPosition
                playerTime.text = "${formatTime(player.currentPosition)} / ${formatTime(player.duration)}"
            }
            if (player.isPlaying) mainHandler.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = PAGE_COLOR

        val scrollView = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setBackgroundColor(PAGE_COLOR)
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(18), dp(16), dp(30))
        }
        scrollView.addView(content, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        ViewCompat.setOnApplyWindowInsetsListener(scrollView) { view, insets ->
            val safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            view.setPadding(0, safe.top, 0, safe.bottom)
            insets
        }

        content.addView(createHeader())
        content.addView(createInputSection())
        content.addView(createVoiceSection())
        content.addView(createActionSection())
        content.addView(createPlayerSection())
        setContentView(scrollView)
    }

    private fun createHeader(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(2), dp(4), dp(2), dp(18))
        }
        row.addView(ImageView(this).apply {
            setImageResource(R.mipmap.ic_launcher)
            contentDescription = null
        }, linearParams(dp(42), dp(42)).apply { marginEnd = dp(12) })
        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(label("声工坊", 20f, TEXT_COLOR, Typeface.BOLD))
            addView(label("原生 Android 版 · v1.6.0", 12f, MUTED_COLOR))
        })
        return row
    }

    private fun createInputSection(): View {
        val section = section("输入文字")
        textInput = EditText(this).apply {
            hint = "粘贴或输入需要转换成语音的内容"
            gravity = Gravity.TOP or Gravity.START
            minHeight = dp(190)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setTextColor(TEXT_COLOR)
            setHintTextColor(MUTED_COLOR)
            setTextSize(16f)
            background = roundedDrawable(Color.WHITE, BORDER_COLOR, 1, 8)
            filters = arrayOf(InputFilter.LengthFilter(MAX_TEXT_LENGTH))
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        section.addView(textInput, matchWrapParams().apply { topMargin = dp(10) })
        return section
    }

    private fun createVoiceSection(): View {
        val section = section("音色与参数")
        section.addView(label("音色", 13f, MUTED_COLOR, Typeface.BOLD), matchWrapParams().apply {
            topMargin = dp(10)
        })
        voiceSpinner = Spinner(this, Spinner.MODE_DIALOG).apply {
            minimumHeight = dp(52)
            adapter = ArrayAdapter(
                this@MainActivity,
                android.R.layout.simple_spinner_item,
                VoiceCatalog.voices,
            ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
            contentDescription = "选择音色"
        }
        section.addView(voiceSpinner, matchWrapParams())

        rateInput = addParameter(section, "语速", "%")
        pitchInput = addParameter(section, "音调", " Hz")
        volumeInput = addParameter(section, "音量", "%")
        return section
    }

    private fun createActionSection(): View {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(2), 0, dp(12))
        }
        generateButton = Button(this).apply {
            text = "生成语音"
            isAllCaps = false
            textSize = 16f
            setTextColor(Color.WHITE)
            minimumHeight = dp(54)
            backgroundTintList = ColorStateList.valueOf(ACCENT_COLOR)
            setOnClickListener { generateSpeech() }
        }
        generationProgress = ProgressBar(this).apply {
            visibility = View.GONE
            isIndeterminate = true
        }
        statusText = label("请输入文字并选择音色", 13f, MUTED_COLOR).apply {
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(10), dp(8), 0)
        }
        container.addView(generateButton, matchWrapParams())
        container.addView(generationProgress, linearParams(dp(36), dp(36)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            topMargin = dp(8)
        })
        container.addView(statusText, matchWrapParams())
        return container
    }

    private fun createPlayerSection(): View {
        val section = section("试听与保存")
        playerProgress = SeekBar(this).apply {
            isEnabled = false
            max = 1
            progress = 0
            contentDescription = "播放进度"
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                    if (fromUser) mediaPlayer?.seekTo(progress)
                }
                override fun onStartTrackingTouch(seekBar: SeekBar) = Unit
                override fun onStopTrackingTouch(seekBar: SeekBar) = Unit
            })
        }
        playerTime = label("00:00 / 00:00", 12f, MUTED_COLOR).apply { gravity = Gravity.END }

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        playButton = Button(this).apply {
            text = "播放"
            isAllCaps = false
            isEnabled = false
            minimumHeight = dp(50)
            setOnClickListener { togglePlayback() }
        }
        saveButton = Button(this).apply {
            text = "保存到下载目录"
            isAllCaps = false
            isEnabled = false
            minimumHeight = dp(50)
            setOnClickListener { saveGeneratedAudio() }
        }
        actions.addView(playButton, LinearLayout.LayoutParams(0, dp(52), 1f).apply { marginEnd = dp(6) })
        actions.addView(saveButton, LinearLayout.LayoutParams(0, dp(52), 1.5f).apply { marginStart = dp(6) })

        section.addView(playerProgress, matchWrapParams().apply { topMargin = dp(8) })
        section.addView(playerTime, matchWrapParams())
        section.addView(actions, matchWrapParams().apply { topMargin = dp(10) })
        return section
    }

    private fun addParameter(parent: LinearLayout, name: String, suffix: String): SeekBar {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val nameLabel = label(name, 13f, TEXT_COLOR, Typeface.BOLD)
        val valueLabel = label("0$suffix", 13f, ACCENT_COLOR, Typeface.BOLD).apply {
            gravity = Gravity.END
        }
        header.addView(nameLabel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(valueLabel, LinearLayout.LayoutParams(dp(84), ViewGroup.LayoutParams.WRAP_CONTENT))

        val slider = SeekBar(this).apply {
            max = 200
            progress = 100
            minimumHeight = dp(40)
            contentDescription = name
            progressTintList = ColorStateList.valueOf(ACCENT_COLOR)
            thumbTintList = ColorStateList.valueOf(ACCENT_COLOR)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                    val value = progress - 100
                    valueLabel.text = "${if (value > 0) "+" else ""}$value$suffix"
                }
                override fun onStartTrackingTouch(seekBar: SeekBar) = Unit
                override fun onStopTrackingTouch(seekBar: SeekBar) = Unit
            })
        }
        parent.addView(header, matchWrapParams().apply { topMargin = dp(14) })
        parent.addView(slider, matchWrapParams())
        return slider
    }

    private fun generateSpeech() {
        val text = textInput.text.toString().trim()
        if (text.isEmpty()) {
            textInput.error = "请输入需要转换的文字"
            textInput.requestFocus()
            return
        }

        val voice = VoiceCatalog.voices[voiceSpinner.selectedItemPosition]
        val requestId = ++generationId
        activeSocket?.cancel()
        setGenerating(true)
        statusText.text = "正在生成 ${voice.displayName} 的语音…"

        val timeout = Runnable {
            if (requestId != generationId) return@Runnable
            generationId++
            activeSocket?.cancel()
            setGenerating(false)
            statusText.setTextColor(ERROR_COLOR)
            statusText.text = "生成超时，请检查网络后重试"
        }
        mainHandler.postDelayed(timeout, GENERATION_TIMEOUT_MS)

        activeSocket = ttsClient.synthesize(
            text = text,
            voice = voice.shortName,
            rate = rateInput.progress - 100,
            pitch = pitchInput.progress - 100,
            volume = volumeInput.progress - 100,
            callback = object : EdgeTtsClient.Callback {
                override fun onSuccess(audio: ByteArray) = runOnUiThread {
                    if (requestId != generationId) return@runOnUiThread
                    mainHandler.removeCallbacks(timeout)
                    setGenerating(false)
                    prepareAudio(audio, voice)
                }

                override fun onFailure(message: String) = runOnUiThread {
                    if (requestId != generationId) return@runOnUiThread
                    mainHandler.removeCallbacks(timeout)
                    setGenerating(false)
                    statusText.setTextColor(ERROR_COLOR)
                    statusText.text = "生成失败：$message"
                }
            },
        )
    }

    private fun prepareAudio(audio: ByteArray, voice: VoiceOption) {
        try {
            releasePlayer()
            generatedFile?.delete()
            generatedFile = File(cacheDir, "voice-studio-preview.mp3").apply { writeBytes(audio) }
            generatedAudio = audio
            generatedVoice = voice

            mediaPlayer = MediaPlayer().apply {
                setDataSource(generatedFile!!.absolutePath)
                prepare()
                setOnCompletionListener {
                    playButton.text = "播放"
                    playerProgress.progress = playerProgress.max
                }
                start()
            }
            playButton.isEnabled = true
            saveButton.isEnabled = true
            playerProgress.isEnabled = true
            playButton.text = "暂停"
            statusText.setTextColor(SUCCESS_COLOR)
            statusText.text = "生成成功，正在试听 ${voice.displayName}"
            mainHandler.post(progressUpdater)
        } catch (error: Exception) {
            statusText.setTextColor(ERROR_COLOR)
            statusText.text = "音频播放失败：${error.message ?: "文件不可用"}"
        }
    }

    private fun togglePlayback() {
        val player = mediaPlayer ?: return
        if (player.isPlaying) {
            player.pause()
            playButton.text = "播放"
            mainHandler.removeCallbacks(progressUpdater)
        } else {
            if (player.currentPosition >= player.duration - 100) player.seekTo(0)
            player.start()
            playButton.text = "暂停"
            mainHandler.post(progressUpdater)
        }
    }

    private fun saveGeneratedAudio() {
        if (generatedAudio == null) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingLegacySave = true
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), STORAGE_PERMISSION_REQUEST)
            return
        }

        saveButton.isEnabled = false
        val audio = generatedAudio!!.copyOf()
        val voice = generatedVoice ?: VoiceCatalog.voices.first()
        Thread {
            runCatching { writeToDownloads(audio, voice) }
                .onSuccess { location -> runOnUiThread {
                    saveButton.isEnabled = true
                    statusText.setTextColor(SUCCESS_COLOR)
                    statusText.text = "保存成功：$location"
                    Toast.makeText(this, "已保存到 $location", Toast.LENGTH_LONG).show()
                } }
                .onFailure { error -> runOnUiThread {
                    saveButton.isEnabled = true
                    statusText.setTextColor(ERROR_COLOR)
                    statusText.text = "保存失败：${error.message ?: "无法写入下载目录"}"
                } }
        }.start()
    }

    private fun writeToDownloads(audio: ByteArray, voice: VoiceOption): String {
        val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(Date())
        val fileName = "声工坊-${voice.displayName}-$timestamp.mp3"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, "audio/mpeg")
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/声工坊")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("系统未创建下载文件")
            try {
                contentResolver.openOutputStream(uri, "w")?.use { it.write(audio) }
                    ?: error("无法打开下载文件")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
            } catch (error: Exception) {
                contentResolver.delete(uri, null, null)
                throw error
            }
        } else {
            @Suppress("DEPRECATION")
            val directory = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "声工坊",
            )
            check(directory.exists() || directory.mkdirs()) { "无法创建下载目录" }
            FileOutputStream(File(directory, fileName)).use { it.write(audio) }
        }
        return "下载/声工坊/$fileName"
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode != STORAGE_PERMISSION_REQUEST || !pendingLegacySave) return
        pendingLegacySave = false
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) saveGeneratedAudio()
        else statusText.text = "未获得存储权限，无法保存音频"
    }

    private fun setGenerating(generating: Boolean) {
        generateButton.isEnabled = !generating
        voiceSpinner.isEnabled = !generating
        generationProgress.visibility = if (generating) View.VISIBLE else View.GONE
        generateButton.text = if (generating) "正在生成…" else "生成语音"
        if (generating) {
            statusText.setTextColor(MUTED_COLOR)
            playButton.isEnabled = false
            saveButton.isEnabled = false
        } else if (generatedAudio != null) {
            playButton.isEnabled = true
            saveButton.isEnabled = true
        }
    }

    private fun section(title: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(15), dp(16), dp(16))
        background = roundedDrawable(Color.WHITE, BORDER_COLOR, 1, 10)
        elevation = dp(1).toFloat()
        addView(label(title, 17f, TEXT_COLOR, Typeface.BOLD))
        layoutParams = matchWrapParams().apply { bottomMargin = dp(12) }
    }

    private fun label(text: String, size: Float, color: Int, style: Int = Typeface.NORMAL): TextView =
        TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(color)
            setTypeface(typeface, style)
        }

    private fun roundedDrawable(fill: Int, stroke: Int, strokeWidth: Int, radius: Int) =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fill)
            setStroke(dp(strokeWidth), stroke)
            cornerRadius = dp(radius).toFloat()
        }

    private fun linearParams(width: Int, height: Int) = LinearLayout.LayoutParams(width, height)
    private fun matchWrapParams() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun formatTime(milliseconds: Int): String {
        val seconds = milliseconds.coerceAtLeast(0) / 1000
        return "%02d:%02d".format(seconds / 60, seconds % 60)
    }
    private fun MediaPlayer.isPrepared(): Boolean = runCatching { duration >= 0 }.getOrDefault(false)

    private fun releasePlayer() {
        mainHandler.removeCallbacks(progressUpdater)
        mediaPlayer?.release()
        mediaPlayer = null
    }

    override fun onDestroy() {
        generationId++
        activeSocket?.cancel()
        releasePlayer()
        generatedFile?.delete()
        super.onDestroy()
    }

    companion object {
        private const val MAX_TEXT_LENGTH = 5_000
        private const val GENERATION_TIMEOUT_MS = 60_000L
        private const val STORAGE_PERMISSION_REQUEST = 1001
        private val PAGE_COLOR = Color.rgb(244, 246, 250)
        private val TEXT_COLOR = Color.rgb(25, 32, 47)
        private val MUTED_COLOR = Color.rgb(100, 111, 132)
        private val BORDER_COLOR = Color.rgb(218, 224, 234)
        private val ACCENT_COLOR = Color.rgb(64, 91, 234)
        private val SUCCESS_COLOR = Color.rgb(26, 137, 92)
        private val ERROR_COLOR = Color.rgb(198, 49, 58)
    }
}
