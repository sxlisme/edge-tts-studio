# 语音工作台

本地文字转语音工具，包含中文浏览器操作界面和 HTTP API。支持中文音色名称、在线试听、MP3 下载和最近 50 条本地转换记录。

## 启动

在 macOS 中双击 `run.command`，或在终端执行：

```bash
./run.command
```

服务默认只监听本机：<http://127.0.0.1:8765>

## API

生成 MP3：

```bash
curl -X POST http://127.0.0.1:8765/api/synthesize \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "你好，欢迎使用语音工作台。",
    "voice": "zh-CN-XiaoxiaoNeural",
    "rate": "+0%",
    "volume": "+0%",
    "pitch": "+0Hz"
  }' \
  --output speech.mp3
```

查询音色：

```bash
curl 'http://127.0.0.1:8765/api/voices?locale=zh-CN'
```

查询转换记录：

```bash
curl http://127.0.0.1:8765/api/history
```

转换记录和 MP3 保存在项目的 `data` 目录，只在本机使用。界面中删除记录时，对应 MP3 也会删除。

健康检查：

```bash
curl http://127.0.0.1:8765/api/health
```

## 配置

- `VOICE_STUDIO_HOST`：监听地址，默认 `127.0.0.1`
- `VOICE_STUDIO_PORT`：监听端口，默认 `8765`

该工具依赖在线语音服务，生成语音时需要联网。

## 多端规划

当前界面已经适配桌面和手机浏览器，UI 与 HTTP API 相互独立。后续可以在同一代码基础上增加 PWA 安装能力，并使用 Tauri 封装 Windows 和 macOS 客户端；正式开放给手机或公网使用前，需要增加账号、HTTPS、访问限流和服务端存储策略。
