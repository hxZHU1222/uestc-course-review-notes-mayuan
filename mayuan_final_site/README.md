# 马原复习系统

这是一个离线生成的静态网站，数据来自当前项目 `source/` 目录中的 Word、PDF 和 PPTX 文件。

## 本地运行

```bash
cd mayuan_final_site
python -m http.server 8000
```

打开：

```text
http://127.0.0.1:8000/
```

默认密码：

```text
mayuan
```

## 重新抽取数据

建议使用 Codex 桌面运行时的 Python，或安装 `pypdf`、`Pillow` 后使用系统 Python：

```bash
python scripts/build_all.py
```

生成的数据在 `data/`，思维导图图片在 `assets/mindmap/`。

## 说明

- 源文件实际位于项目根目录的 `source/`，脚本也兼容 `sources/` 和根目录。
- `coverage_report.json` 会记录 Word 非空段落覆盖情况。
- `choice_questions.json` 保留每道选择题的 `raw` 原始题块，解析失败项会在“资料/检查”页显示。
- `manual_links.json` 为空对象，后续可以人工覆盖节点、题目和知识点之间的自动关联。
