# luci-app-lucky

OpenWrt LuCI support package for Lucky.

本仓库当前只面向 OpenWrt x86_64 构建 `lucky` 版本，不再维护多架构包。

## 当前版本

- Lucky 本体: `3.0.0_beta8`（仓库内的包版本；自动更新会创建新版本 PR）
- 上游下载源: `https://release.66666.host`
- 上游目录: `v3.0.0beta8/3.0.0_lucky`
- 上游文件: `lucky_3.0.0_Linux_x86_64.tar.gz`
- LuCI 界面: `luci-app-lucky`
- 翻译包: `luci-i18n-lucky-zh-cn`

注意: 上游目录中的 `beta8` 和无序号的 `beta` 分别转换为 OpenWrt APK 包版本后缀 `_beta8` 和 `_beta`。

## Release 产物

GitHub Release 中应包含以下三个包:

```text
lucky-*_x86_64.apk
luci-app-lucky-*_x86_64.apk
luci-i18n-lucky-zh-cn-*_x86_64.apk
```

依赖包不会作为 Release 附件发布。

## 安装

上传三个 `.apk` 包到 OpenWrt 后安装:

```sh
apk add --allow-untrusted lucky-*_x86_64.apk
apk add --allow-untrusted luci-app-lucky-*_x86_64.apk
apk add --allow-untrusted luci-i18n-lucky-zh-cn-*_x86_64.apk
```

安装后可在 LuCI 菜单中找到 Lucky。

## 卸载

```sh
apk del luci-i18n-lucky-zh-cn
apk del luci-app-lucky
apk del lucky
```

升级大版本前建议先在 Lucky 后台备份配置。

## 自动更新

`.github/workflows/update-lucky-version.yml` 会在每周日北京时间 05:00 运行。

流程:

1. 读取 `https://release.66666.host/` 的目录，每级请求添加唯一查询参数以避免 CDN 返回缓存的 HTML；若仍返回 HTML，则解析页面中的文件链接
2. 查找最新 `lucky` 版本，兼容正式版、`beta8` 和无序号的 `beta`；同版本下正式版优先于 beta
3. 校验 `Linux_x86_64.tar.gz` 是否存在
4. 更新 `lucky/Makefile`
5. 创建版本更新 PR
6. 编译 OpenWrt x86_64 APK
7. 上传 artifact
8. 发布 GitHub Release，并设为 Latest

手动运行时可以修改 `openwrt_release`，默认是 `25.12.2`。

修复同步工作流后，需要将修改推送到默认分支，再手动运行 `Update Lucky Version`。重新运行旧的失败任务会继续使用旧脚本。

上游目录解析逻辑直接写在工作流的 `Resolve latest upstream release` 步骤中。

## 手动构建

GitHub Actions 中可以手动运行 `Build OpenWrt APK`。

该 workflow 会:

- 使用 OpenWrt x86/64 SDK
- 编译 `lucky`
- 编译 `luci-app-lucky`
- 收集 `lucky`、`luci-app-lucky`、`luci-i18n-lucky-zh-cn`
- 自动发布 GitHub Release

## 加入 OpenWrt SDK 或源码树

进入 OpenWrt SDK 或源码根目录:

```sh
git clone https://github.com/levi882/luci-app-lucky.git package/lucky
```

更新 feeds:

```sh
./scripts/feeds update -a
./scripts/feeds install -a
make defconfig
```

编译:

```sh
make package/lucky/lucky/compile V=s
make package/lucky/luci-app-lucky/compile V=s
```

## 截图

![](./previews/001.png)
![](./previews/002.png)
