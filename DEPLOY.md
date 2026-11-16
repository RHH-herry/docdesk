# 文档台 · 免费服务器部署手册

面向「零成本、长期可用」的公开部署。代码已就绪，只需一个 GitHub 仓库 + 一个平台账号。

---

## 一、先说清楚：2026 年的免费层现状

免费政策变化很快，以下是本手册编写时（2026-11）的实际情况，避免踩坑：

| 平台 | 是否长期免费 | 需要信用卡 | 冷启动 | 适合本项目 |
|---|---|---|---|---|
| **Render**（首选） | ✅ 免费 Web Service 750 小时/月 | 否 | 空闲 15 分钟后休眠，唤醒约 30–60 秒 | ✅ 最稳，原生支持 Python，一键部署 |
| **Hugging Face Spaces** | ✅ 免费 CPU Basic（约 48h 无活动休眠） | 否 | 有 | ✅ 适合 Demo 展示，支持 Docker |
| **Koyeb** | ⚠️ 官方仍有免费层，但 2026 起新账号流程收紧 | 视注册情况 | 空闲约 1 小时 | 可用作备选 |
| Railway | ❌ 已改为试用额度（约 $5 用完即止） | 否 | — | 不建议当免费方案 |
| Fly.io | ❌ 已取消永久免费层 | 是 | — | 不建议 |
| PythonAnywhere | ⚠️ 免费账号网络受限 | 否 | — | 仅教学，不适合 |

**结论**：想要长期稳定 + 零成本 + 无信用卡，用 **Render**。想要展示给同行看、偏 Demo 气质，用 **Hugging Face Spaces**。

> ⚠️ 免费层的共同代价：**休眠**。访客第一次打开要等 30–60 秒是正常现象，不是故障。可用免费的 UptimeRobot 每 10–14 分钟 ping 一次 `/api/health` 保持唤醒（见第四节）。

---

## 二、部署前准备：建一个 GitHub 仓库

Render / Koyeb / HF Spaces 都从 Git 仓库拉取代码。本目录 `deploy/` 已是一个干净、可独立推送的仓库内容（606K，不含虚拟环境与数据）。

```bash
cd deploy
git init
git add .
git commit -m "DocDesk deploy 1.6"
git branch -M main
git remote add origin https://github.com/<你的用户名>/docdesk.git
git push -u origin main
```

**怕手敲命令？** 用仓库根目录的 `push.bat`：在 GitHub 网页建好空仓库后双击它，按提示粘贴仓库 URL 与你的 GitHub 用户名 / 邮箱，自动完成 init → commit → push。

> 说明：WorkBuddy 的 GitHub 连接当前只有读权限，无法代你建仓或推送，所以这一步需你本人执行（脚本已把流程简化到最小）。

---

## 三、平台部署步骤

### 方案 A：Render（推荐）

1. 注册并登录 https://render.com（可用 GitHub 账号直接登录，无需信用卡）。
2. 顶部 **New + → Blueprint**。
3. 连接上一步的 GitHub 仓库，Render 会自动识别根目录的 `render.yaml`。
4. 确认服务名为 `docdesk`、区域 Singapore、计划 Free，点击 **Apply**。
5. 等待构建完成（约 2–5 分钟），获得地址 `https://docdesk-xxxx.onrender.com`。

`render.yaml` 已预置构建/启动命令与 Python 3.12，**无需手动填写**。若想手动建 Web Service 而非 Blueprint，则填：

- Runtime: `Python 3`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python app.py`
- Instance Type: `Free`

### 方案 B：Hugging Face Spaces（Docker）

1. 登录 https://huggingface.co，点 **New → Space**。
2. SDK 选 **Docker**，可见性 Public（免费层），创建。
3. 把 `deploy/` 里的全部文件推送到该 Space 仓库（HF 会按根目录 `Dockerfile` 构建）。
4. 在 Space 的 **Settings → Variables** 无需额外配置（端口由平台注入 `PORT`，代码自动读取）。
5. 构建完成后打开 Space 页面即可使用。

> HF Spaces 默认会在 README.md 顶部要求一段 YAML frontmatter 来显示标题/图标。当前 README 是普通 Markdown，也能正常构建；如需美化 Space 卡片，在 README 最顶部加：
> ```yaml
> ---
> title: DocDesk 文档台
> emoji: 📄
> colorFrom: green
> colorTo: teal
> sdk: docker
> ---
> ```

### 方案 C：Koyeb（Docker，备选）

1. 登录 https://koyeb.com → **Create Service → GitHub**。
2. 选仓库与分支，构建方式选 **Dockerfile**（根目录已提供）。
3. 实例选 Free，端口填 `8080`（与 `Dockerfile` 的 `EXPOSE 8080` 一致；平台会注入 `PORT`，代码自动适配）。
4. 部署后获得 `https://xxx.koyeb.app`。

---

## 四、部署后验收清单

按顺序确认，每项都应通过：

| 检查 | 方法 | 预期 |
|---|---|---|
| 首页可打开 | 浏览器访问根地址 | 看到工作台界面，无白屏 |
| 健康检查 | 访问 `/api/health` | `{"status":"ok", ...}` |
| 静态资源 | 页面无破图、按钮可点 | LOGO、样式、脚本全部加载 |
| 上传解析 | 传一份文本型 PDF / TXT | 出来字段表和明细行 |
| 数据隔离 | 无痕窗口再开一次 | 两边数据互不干扰（在线模式设计如此） |

首次打开缓慢（30–60 秒）是免费层冷启动，属正常。

### 保持唤醒（可选）

免费服务空闲会休眠。用免费监控服务定时 ping 可显著改善首屏速度：

- UptimeRobot：新建 HTTP(s) 监控，地址填 `/api/health`，间隔选 10 或 14 分钟。
- 或 cron-job.org：同样设置定时任务。

---

## 五、在线模式的能力边界（务必了解）

在线部署版为了让「打开链接就能用」且「访客互不串数据」，与本地版有两点差异：

1. **数据只存当前浏览器**：解析结果与快照写入浏览器 localStorage，不写入服务器数据库。换设备/清缓存会丢失；正式交付请用本地版。
2. **云端没有系统 OCR**：Linux 容器里没有 Windows 内置 OCR，`engine_status()` 会显示不可用。**扫描 PDF / 图片识别请用本地 Windows 版**；文本型 PDF、Word、Excel、CSV、HTML、JSON 在线解析均正常。
3. **文件不留存**：上传的文件只在内存中临时处理，响应结束即释放，服务器不保存任何单据。

需要完整 OCR + 磁盘工作区 + 审计留痕的商用场景，请用本地版（`start.bat` 一键启动）。

---

## 六、常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 部署日志报 `No open ports detected` | 服务没监听平台注入的端口 | 确认启动命令是 `python app.py`（已内置读 `PORT`），不要改成硬编码端口 |
| 首次访问超时/转圈 | 免费层冷启动 | 等待 30–60 秒；配置第四节的心跳 |
| `/api/health` 里 `ocr.available` 为 false | 云端无系统 OCR | 正常现象，见第五节 |
| 上传后字段为空 | 文件是扫描件/图片 | 在线版无 OCR，改用文本型文件或本地版 |
| 构建失败 `ModuleNotFound` | 依赖没装全 | 确认用了根目录 `requirements.txt`（含 pypdfium2 等） |

---

## 七、从本地到线上的版本同步

本 `deploy/` 目录是发布快照。本地工作台（`doc-intel/` 根目录）升级后，需重新同步以下文件到 `deploy/`：

```bash
cd doc-intel
cp app.py ocr.py store.py voucher.py exportmap.py commerce.py requirements.txt deploy/
cp extractors/*.py deploy/extractors/
cp static/index.html static/style.css static/app.js deploy/static/
cp static/brand/* deploy/static/brand/
cd deploy && git add . && git commit -m "sync v1.x" && git push
```

推送后平台会自动重新构建部署。
