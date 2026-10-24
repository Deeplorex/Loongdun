# Loongdun（龙盾）

个人密码、密钥与使用关系管理器，由 Deeplorex 出品。把分散的凭证放在一起，也记住它们用在什么地方。

> 允许个人及企业免费使用、修改和分享；未经授权禁止销售软件或收费提供下载。源码可查看，具体条件见 [LICENSE](LICENSE)。

## 能做什么

- 管理网站账号、API Key / AK-SK、服务器、数据库、恢复凭证及密钥文件。
- 为不同类型提供标准字段，也支持自定义字段；密钥文件加密保存，单文件最多 10 MB。
- 记录凭证之间的注册、登录、找回和签发关系。
- 将凭证关联到产品、产品组成或环境。例如「产品 AAA → 国内版小程序」使用一组 Key，海外版使用另一组。
- 在新建、编辑时管理关联，也可通过详情和关系图谱查看使用位置。
- 搜索、文件夹、标签、收藏、回收站及加密备份。
- 中英文、浅色/深色主题；Windows Hello 快速解锁及关闭到托盘选项。

## 数据与隐私

凭证库在本机加密保存，应用不提供云同步、遥测或浏览器自动填充。主密码或恢复密钥用于解锁和恢复；备份也是加密文件。

请妥善保管恢复密钥。主密码与恢复密钥均丢失时，开发者无法代为恢复数据。第三方平台名称和图标仅用于识别，不代表合作或背书。

- [隐私政策](docs/legal/privacy-policy.zh-CN.md)
- [用户协议](docs/legal/terms-of-use.zh-CN.md)
- [第三方组件声明](THIRD-PARTY-NOTICES.md)

## 下载与平台

当前提供 Windows x64 安装包，未签名。构建输出位于：

`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`

仓库不包含安装包或用户凭证库。macOS 的原生打包及系统解锁仍需在 Mac 上验证。

## 本地开发

需要 Node.js 24.18.0、pnpm 11.24.0 和 Rust 1.98.0。Windows 还需要 Visual C++ Build Tools、Windows SDK、WebView2，以及构建内置 OpenSSL 所需的 Perl。详见[工程指南](docs/engineering/README.md)。

```sh
git clone https://github.com/Deeplorex/Loongdun.git
cd Loongdun
corepack pnpm install --frozen-lockfile
corepack pnpm tauri dev
```

运行检查及构建 Windows 安装包：

```sh
corepack pnpm quality
corepack pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis --no-sign
```

技术实现：Tauri 2、Rust、React、TypeScript、SQLCipher。Rust 负责加密、存储、备份、剪贴板与系统集成。

## 文档

- [产品说明](docs/product/README.md)
- [架构说明](docs/architecture/README.md)
- [变更记录](docs/changes.md)
- [发布说明](docs/engineering/release.md)

## 使用许可

个人、企业及其他组织均可免费使用龙盾（Loongdun），包括工作和内部业务用途。Loongdun No-Sale License 1.0 允许修改和免费分享；未经相关权利人书面授权，不得销售原版或修改版、收费授予使用许可、收费分发或收费提供下载。独立的安装、技术支持及托管服务不因收费而被一概禁止，但不得变相收取软件副本、使用许可或下载费用。完整条件以随附 LICENSE 为准。第三方组件仍适用各自许可证。

本许可不改变第三方软件的许可证，也不授予第三方商标权。详见 [LICENSE](LICENSE) 和[第三方组件声明](THIRD-PARTY-NOTICES.md)。限制销售不符合 [OSI 开源定义](https://opensource.org/osd)，因此请勿将本项目标注为 OSI 开源软件。

## English

Loongdun (龙盾) is a local desktop vault for personal credentials and their usage relationships. It manages accounts, API keys, servers, databases, recovery credentials, and encrypted key files. Credentials can be linked to other credentials, products, product compositions, and environments.

Windows x64 is the current packaging target. Native macOS packaging and system unlock still require verification on a Mac. The interface supports Chinese and English.

Individuals, companies, and other organizations may use Loongdun free of charge, including for work and internal business. The Loongdun No-Sale License 1.0 permits modification and free sharing; selling original or modified copies, paid use licenses, paid distribution, or charging for downloads requires written permission from the relevant rights holders. Separate installation, support, and hosting services are not prohibited merely because they are paid, but must not disguise charges for software copies, use licenses, or downloads. See the accompanying LICENSE for full conditions. Third-party components retain their own licenses. This is not an OSI open-source license.
