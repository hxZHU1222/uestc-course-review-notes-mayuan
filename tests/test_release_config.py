import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_package_json_has_electron_builder_config_without_root_directories():
    package_json = ROOT / "package.json"

    assert package_json.is_file()

    package = json.loads(package_json.read_text(encoding="utf-8"))

    assert "directories" not in package
    assert package["main"] == "electron/main.cjs"
    assert package["build"]["directories"]["output"] == "build-out"
    assert package["build"]["files"] == [
        "index.html",
        "css/**/*",
        "js/**/*",
        "data/**/*",
        "assets/**/*",
        "electron/**/*",
    ]


def test_electron_main_serves_static_files_through_app_protocol():
    main_js = (ROOT / "electron" / "main.cjs").read_text(encoding="utf-8")

    assert "protocol.registerSchemesAsPrivileged" in main_js
    assert "supportFetchAPI: true" in main_js
    assert "protocol.handle(\"app\"" in main_js
    assert "win.loadURL(\"app://local/index.html\")" in main_js


def test_build_release_workflow_uses_committed_app_config():
    workflow = (ROOT / ".github" / "workflows" / "build-release.yml").read_text(encoding="utf-8")

    assert "npm init -y" not in workflow
    assert "npx cap init" not in workflow
    assert "npm ci" in workflow
    assert "npm config set registry https://registry.npmjs.org" in workflow
    assert "ANDROID_KEYSTORE_BASE64" in workflow
    assert "mayuan-android-${VERSION}.apk" in workflow
    assert "mayuan-windows-${VERSION}.exe" in workflow
    assert "actions/checkout@v6" in workflow
    assert "actions/setup-node@v6" in workflow
    assert "actions/setup-java@v5" in workflow
    assert "actions/upload-artifact@v7" in workflow
    assert "actions/download-artifact@v8" in workflow
    assert "softprops/action-gh-release@v3" in workflow
    assert "@v4" not in workflow


def test_package_lock_uses_official_npm_registry():
    package_lock = (ROOT / "package-lock.json").read_text(encoding="utf-8")

    assert "registry.npmmirror.com" not in package_lock
    assert "registry.npmjs.org" in package_lock
