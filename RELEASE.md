# Release Guide

本文档说明如何使用 GitHub Actions 里的 `Build and Release Apps` workflow 发布手机 Android APK 和 Windows 安装包。

## 本次修复了什么

- 修复 Windows 打包失败：不再在 workflow 里临时 `npm init -y`，避免生成根级 `directories` 字段导致 electron-builder 报错。
- 固定 `package.json`、`package-lock.json`、`electron/main.cjs` 和 `capacitor.config.json`，让 CI 构建可复现。
- Windows App 使用 `app://local/` 协议加载静态文件，打包后 `fetch("data/*.json")` 仍能读取数据。
- Android 和 Windows 产物会统一命名为：
  - `mayuan-android-vX.Y.Z.apk`
  - `mayuan-windows-vX.Y.Z.exe`

## 推荐发布方式

1. 确保 release 分支代码已经提交并推送到 GitHub。

2. 打开 GitHub 仓库页面：
   `Actions` -> `Build and Release Apps` -> `Run workflow`

3. 选择 `release` 分支，填写版本号，例如：

   ```text
   v1.0.1
   ```

4. 点击 `Run workflow`。

5. 等待三个 job 完成：
   - `Build Android APK`
   - `Build Windows App`
   - `Publish GitHub Release`

6. 完成后进入仓库右侧或顶部的 `Releases` 页面，下载：
   - 手机安装包：`mayuan-android-v1.0.1.apk`
   - Windows 安装包：`mayuan-windows-v1.0.1.exe`

## 也可以用 tag 发布

在本地执行：

```bash
git tag v1.0.1
git push origin v1.0.1
```

推送 `v*` tag 后，workflow 会自动发布同名 Release。

如果 tag 已经存在但发布失败，需要先删除旧 tag 后重新推送：

```bash
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1
git tag v1.0.1
git push origin v1.0.1
```

## Android 签名说明

workflow 支持两种方式：

### 临时签名

如果没有配置任何 secret，workflow 会生成临时 keystore 并打包 APK。

这种 APK 可以安装，但以后不能稳定覆盖升级，因为每次 CI 生成的签名可能不同。用于自己临时安装测试可以，正式发布不推荐。

### 固定签名

正式发布建议在 GitHub 仓库配置这些 secrets：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

生成 keystore 示例：

```bash
keytool -genkeypair -v \
  -keystore mayuan-release.keystore \
  -alias mayuan-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

把 keystore 转成 base64 后填入 `ANDROID_KEYSTORE_BASE64`。

Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("mayuan-release.keystore"))
```

GitHub secret 配置入口：

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

## 本地测试

只测试配置，不下载依赖：

```bash
python -m pytest tests/test_release_config.py
```

如果本机没有 pytest，可以用：

```bash
python -c "import importlib.util; spec=importlib.util.spec_from_file_location('release_config','tests/test_release_config.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); m.test_package_json_has_electron_builder_config_without_root_directories(); m.test_electron_main_serves_static_files_through_app_protocol(); m.test_build_release_workflow_uses_committed_app_config(); m.test_package_lock_uses_official_npm_registry(); print('release config checks passed')"
```

如需本地测试 Windows 打包，避免把 npm 缓存写到 C 盘：

```powershell
$env:npm_config_cache = "$PWD\.npm-cache"
$env:ELECTRON_CACHE = "$PWD\.electron-cache"
$env:ELECTRON_BUILDER_CACHE = "$PWD\.electron-builder-cache"
npm.cmd ci --cache .npm-cache
npm.cmd run build:windows
```

当前项目的构建配置写在 `package.json` 的 `build` 字段里。

本地测试完成后删除生成目录：

```powershell
Remove-Item -Recurse -Force node_modules, build-out, dist, android, release, .npm-cache, .electron-cache, .electron-builder-cache -ErrorAction SilentlyContinue
```

## 常见失败点

- `directories in the root is deprecated...`：说明又在 CI 里临时生成了 package.json，应该使用仓库里的固定 `package.json`。
- `No Windows installer was produced in build-out.`：Windows 构建没有产出 `.exe`，需要打开 `Build Windows App` 的日志看 electron-builder 报错。
- Android APK 不能覆盖安装：通常是签名不同，请配置固定 Android signing secrets。
- Release 没有附件：检查 `Publish GitHub Release` job，确认 Android 和 Windows artifact 都上传成功。
