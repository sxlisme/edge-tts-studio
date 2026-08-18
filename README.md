# 声工坊

使用 Tauri 2 和 Rust 开发的轻量文字转语音应用，支持 macOS、Windows、iOS 和 Android。应用直接连接在线语音服务，不需要 Python 环境，也不需要单独部署后端。

![声工坊界面](docs/screenshot.png)

## 功能

- 300+ 多语言音色，默认普通话晓晓音色
- 中文音色名称、语言数量、性别和适用场景展示
- 语速、音量、音调调节，以及输入语言与音色提示
- 真实音频频谱、试听、MP3 导出和最近 50 条本地记录
- 界面缩放、高对比度、减少动态效果等无障碍设置
- 桌面端提供仅监听本机的 HTTP API

音频生成需要联网。转换记录和 MP3 只保存在系统应用数据目录，删除记录时会同时删除对应音频。

## 本地开发

需要 Node.js 20+、Rust stable 和对应平台的 Tauri 2 系统依赖。

```bash
npm ci
npm run tauri -- dev
```

构建当前桌面平台安装包：

```bash
npm run tauri -- build
```

运行检查：

```bash
npm run build
cd src-tauri
cargo test --all-targets
cargo clippy --all-targets -- -D warnings
```

## 桌面 HTTP API

启动桌面应用后，本机 API 地址为 `http://127.0.0.1:8765`。移动端通过 Tauri IPC 使用同一套 Rust 核心，不开放监听端口。

```bash
curl -X POST http://127.0.0.1:8765/api/synthesize \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "你好，欢迎使用声工坊。",
    "voice": "zh-CN-XiaoxiaoNeural",
    "rate": "+0%",
    "volume": "+0%",
    "pitch": "+0Hz"
  }' \
  --output speech.mp3
```

其他接口：

- `GET /api/health`
- `GET /api/voices?locale=zh-CN`
- `GET /api/history`
- `GET /api/history/{id}/audio`
- `DELETE /api/history/{id}`
- `DELETE /api/history`

## 自动构建

GitHub Actions 的 `Desktop packages` 工作流生成 macOS DMG、Windows MSI 和 NSIS EXE；`Mobile packages` 工作流生成 Android APK/AAB 和未签名的 iOS 模拟器应用。推送 `v*` 标签时，桌面安装包还会自动附加到 GitHub Release。

iPhone 真机 IPA 和正式 Android 商店包仍需在仓库中配置对应开发者证书与签名密钥。

## 开发者

sxlisme · blackberrysxl@163.com
