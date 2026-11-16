# 文档台 · DocDesk

本地优先的单据结构化工作台。上传 PDF / Word / Excel / 图片 / CSV，自动抽取字段、逐页溯源、校验复核，导出 Excel / 对账单 / 交付包。**文件只在服务端临时处理，不留存。**

在线环境为「试用模式」：解析结果仅存当前浏览器，不同访客互不干扰；云端无系统 OCR，扫描件识别请用本地版。

## 一键部署

| 平台 | 方式 | 说明 |
|---|---|---|
| **Render**（推荐） | 连接本仓库 → New Web Service → 用默认配置 | 免费 750 小时/月，无需信用卡；`render.yaml` 已预置 |
| Koyeb / HF Spaces | 用根目录 `Dockerfile` 构建 | 容器方式，端口由 `PORT` 注入 |

- 启动命令：`python app.py`（自动读取平台注入的 `PORT` 并绑定 `0.0.0.0`）
- 健康检查：`GET /api/health`
- Python 版本：3.12

详细步骤、免费层限制与注意事项见 [`DEPLOY.md`](DEPLOY.md)。

## 技术栈

FastAPI · pypdf · pypdfium2 · openpyxl · Pillow · 原生 HTML/CSS/JS（无前端构建）

## 目录

```
app.py / ocr.py / store.py / voucher.py / exportmap.py / commerce.py
extractors/     解析与抽取规则
static/         前端页面与品牌资产
requirements.txt / render.yaml / Dockerfile
```
