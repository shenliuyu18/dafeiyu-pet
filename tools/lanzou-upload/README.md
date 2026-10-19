# 蓝奏云上传辅助

给正式版发布使用的半自动上传脚本。它不会读取、打印或保存账号密码、Cookie 或登录令牌。

## 首次准备

```bash
cd tools/lanzou-upload
npm install
```

## 检查环境

```bash
node upload.js --check
```

会用无头 Edge 打开蓝奏云页面，确认 Edge 与网络可用，不登录、不读取登录态。

## 上传正式版

```bash
# 在仓库根目录
node tools/lanzou-upload/upload.js \
  dist/dafeiyu-pet-<版本>-setup.exe \
  dist/dafeiyu-pet-lite-<版本>-setup.exe
```

或者：

```bash
npm run lanzou:upload -- dist/dafeiyu-pet-<版本>-setup.exe dist/dafeiyu-pet-lite-<版本>-setup.exe
```

流程：

1. 脚本用独立的 Edge 配置目录打开蓝奏云登录页。首次运行时在这个窗口里**手动登录**，之后独立 profile 会记住登录态。
2. 进入要上传的目标文件夹（目录 <https://wwaql.lanzouu.com/b01i5xmkri>，密码 `5meo`）。
3. 回到终端按 Enter；然后在网页点击“上传 / 添加文件”。
4. Playwright 拦截文件选择器，一次填入完整版和 Lite 安装包。
5. 网页上传完成后回到终端按 Enter 退出，确认蓝奏云文件列表与分享链接已更新。

## 发布清单

正式版必须同时更新：

- GitHub Release：上传完整版 + Lite 安装包
- 蓝奏云网盘：上传完整版 + Lite 安装包

本脚本只负责蓝奏云上传，不会上传 GitHub。用户设置、浏览器 profile、密码和 Cookie 都不会进入仓库（profile 保存在 `%LOCALAPPDATA%\dafeiyu-lanzou-profile`）。
