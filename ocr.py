"""本地 OCR（纯本机、零云端、零推理费用）。

引擎策略：
  1. Windows 内置 OCR（Windows.Media.Ocr，Win10/11 自带中文引擎）——
     通过 PowerShell 子进程调用，零额外安装，本机验证可用；
  2. RapidOCR（rapidocr_onnxruntime，可选安装）——非 Windows 或
     未装中文语言包时的兜底，pip 装上即自动启用。

扫描 PDF 处理：pypdfium2 把无文本层的页栅格化为位图（约 200 DPI），
再交给上述引擎识别。整条链路数据不出本机。

对外接口：
  engine_status()            -> {"available": bool, "engine": str, "detail": str}
  ocr_image_bytes(data, ext) -> str        单张图片识别文本
  ocr_pdf_pages(raw)         -> list[str]  扫描 PDF 逐页识别
  ocr_text_is_usable(text)   -> bool       识别结果是否有内容
"""
from __future__ import annotations

import io
import os
import re
import subprocess
import tempfile
import threading

_BASE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 结果清洗
_CJK = (
    r"\u2e80-\u2eff\u3000-\u303f\u31c0-\u31ef\u3200-\u32ff\u3400-\u4dbf"
    r"\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef"
)


def clean_ocr_text(text: str) -> str:
    """Windows OCR 会在每个字符间插空格：合并 CJK 之间、数字之间、
    CJK 与数字/字母之间的粘连空格，保留换行结构。"""
    if not text:
        return ""
    out = re.sub(r"\r\n?", "\n", text)
    out = re.sub(r"[ \t\u00a0]+(?=[%s])|(?<=[%s])[ \t\u00a0]+" % (_CJK, _CJK), "", out)
    out = re.sub(r"(?<=\d)[ \t]+(?=\d)", "", out)
    # 金额小数点：Windows OCR 在中文语境常把「.」误读为「，」或「．」
    out = out.replace("．", ".")
    out = re.sub(r"(?<=\d)，(?=\d{2}(?!\d))", ".", out)
    out = re.sub(r"([\u4e00-\u9fff])[ \t]+(?=\d)", r"\1", out)
    out = re.sub(r"(\d)[ \t]+(?=[\u4e00-\u9fff])", r"\1", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


# ------------------------------------------------------------- 引擎状态缓存
_STATUS: dict | None = None
_LOCK = threading.Lock()


def _try_rapidocr():
    try:
        from rapidocr_onnxruntime import RapidOCR  # noqa: F401
        return True
    except Exception:
        return False


def _probe_windows_engine() -> bool:
    """探测 Windows.Media.Ocr 是否有可用识别引擎（含中文包判断）。"""
    script = (
        "$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime];"
        "$null=[Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime];"
        "$e=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage("
        "[Windows.Globalization.Language]::new('zh-Hans-CN'));"
        "if(-not $e){$e=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()};"
        "if($e){'OK'}else{'NO_ENGINE'}"
    )
    try:
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return "OK" in (r.stdout or "")
    except Exception:
        return False


def engine_status() -> dict:
    global _STATUS
    with _LOCK:
        if _STATUS is None:
            if _probe_windows_engine():
                _STATUS = {"available": True, "engine": "windows",
                           "detail": "Windows 内置 OCR（中文）"}
            elif _try_rapidocr():
                _STATUS = {"available": True, "engine": "rapidocr",
                           "detail": "RapidOCR（onnxruntime）"}
            else:
                _STATUS = {"available": False, "engine": "none",
                           "detail": "未检测到可用 OCR 引擎"}
        return dict(_STATUS)


def _reset_status_cache():
    global _STATUS
    with _LOCK:
        _STATUS = None


# ----------------------------------------------------------- Windows OCR 调用
_PS_SCRIPT = r"""
param([string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
if (-not $asTaskGeneric) { Write-Output 'ERR_NO_ASTASK'; exit 3 }
function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage(
    [Windows.Globalization.Language]::new('zh-Hans-CN'))
if (-not $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if (-not $engine) { Write-Output 'NO_ENGINE'; exit 2 }

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output (($result.Lines | ForEach-Object { $_.Text }) -join "`n")
"""

_PS_PATH = os.path.join(tempfile.gettempdir(), "docdesk_winocr.ps1")
_PS_READY = False


def _ps_script_file() -> str:
    global _PS_READY
    if not _PS_READY:
        with open(_PS_PATH, "w", encoding="utf-8-sig") as f:
            f.write(_PS_SCRIPT)
        _PS_READY = True
    return _PS_PATH


def _windows_ocr_file(path: str) -> str | None:
    """返回识别文本；引擎不可用返回 None。"""
    try:
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive",
             "-ExecutionPolicy", "Bypass",
             "-File", _ps_script_file(), "-Path", path],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        out = (r.stdout or "").strip()
        if r.returncode == 2 or out == "NO_ENGINE":
            _reset_status_cache()
            return None
        if out == "ERR_NO_ASTASK":
            return None
        return out
    except Exception:
        return None


def _rapidocr_image(path: str) -> str | None:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception:
        return None
    try:
        result, _ = RapidOCR()(path)
        if not result:
            return ""
        return "\n".join(str(item[1]) for item in result)
    except Exception:
        return ""


def ocr_image_bytes(data: bytes, ext: str = ".png") -> str:
    """识别单张图片，返回清洗后的文本；引擎不可用抛 RuntimeError。"""
    status = engine_status()
    if not status["available"]:
        raise RuntimeError("本地 OCR 引擎不可用")
    suffix = ext if ext.startswith(".") else "." + ext
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        if status["engine"] == "windows":
            text = _windows_ocr_file(tmp)
            if text is None:
                text = _rapidocr_image(tmp)
        else:
            text = _rapidocr_image(tmp)
        if text is None:
            raise RuntimeError("OCR 识别失败")
        return clean_ocr_text(text)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


# ------------------------------------------------------------- 扫描 PDF 栅格化
_PDFIUM = None
_PDFIUM_CHECKED = False


def _pdfium():
    global _PDFIUM, _PDFIUM_CHECKED
    if not _PDFIUM_CHECKED:
        try:
            import pypdfium2 as pdfium
            _PDFIUM = pdfium
        except Exception:
            _PDFIUM = None
        _PDFIUM_CHECKED = True
    return _PDFIUM


def _worker_count(n_pages: int, workers: int | None = None) -> int:
    """并发上限：默认 4，可用 DOCINTEL_OCR_WORKERS 调整（1–8）。"""
    if workers is None:
        try:
            workers = int(os.environ.get("DOCINTEL_OCR_WORKERS", "4"))
        except ValueError:
            workers = 4
    return max(1, min(int(workers or 1), 8, n_pages))


def ocr_pdf_pages(raw: bytes, scale: float = 2.8,
                  only_pages: list[int] | None = None,
                  workers: int | None = None) -> list[str]:
    """栅格化 PDF 并 OCR，返回文本列表（索引对齐页码-1）。

    栅格化在主线程完成（pypdfium2 文档对象非线程安全），识别阶段按页
    并行：每页一个独立 PowerShell 进程，线程只负责调度与收结果，页序不变。
    4 页及以下默认最多 4 并发；可用 DOCINTEL_OCR_WORKERS 覆盖。
    """
    pdfium = _pdfium()
    if pdfium is None:
        raise RuntimeError("缺少 pypdfium2，无法栅格化扫描 PDF")
    status = engine_status()
    if not status["available"]:
        raise RuntimeError("本地 OCR 引擎不可用")
    # 提前初始化共享资源，避免工作线程并发创建脚本文件
    if status["engine"] == "windows":
        _ps_script_file()

    doc = pdfium.PdfDocument(io.BytesIO(raw))
    try:
        page_count = len(doc)
        targets = set(only_pages) if only_pages else range(1, page_count + 1)
        images: dict[int, bytes] = {}
        for i in range(1, page_count + 1):
            if i not in targets:
                continue
            page = doc[i - 1]
            try:
                bitmap = page.render(scale=scale)
                buf = io.BytesIO()
                bitmap.to_pil().save(buf, format="PNG")
                images[i] = buf.getvalue()
            finally:
                page.close()
    finally:
        doc.close()

    if not images:
        return [""] * page_count

    def recognize(item: tuple[int, bytes]) -> tuple[int, str]:
        idx, png = item
        try:
            text = ocr_image_bytes(png, ".png")
        except Exception:
            text = ""
        return idx, text

    out = [""] * page_count
    n = _worker_count(len(images), workers)
    if n <= 1:
        results = [recognize(item) for item in images.items()]
    else:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=n) as pool:
            results = list(pool.map(recognize, images.items()))
    for idx, text in results:
        out[idx - 1] = text
    return out


def ocr_text_is_usable(text: str) -> bool:
    return bool(re.search(r"[%s\d]" % _CJK, text or ""))
