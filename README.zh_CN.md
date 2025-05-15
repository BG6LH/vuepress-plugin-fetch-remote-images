# VuePress 插件：Fetch Remote Images (抓取远程图片)

一个 VuePress 2 插件，它可以自动抓取您内容和 frontmatter 中引用的远程图片，将它们保存到本地，并更新源文件以使用这些本地副本。这有助于提高网站性能、减少外部依赖，并确保图片始终可用。

## 功能特性

-   **本地缓存：** 下载远程图片并将其存储在您的 `public` 目录中。
-   **源文件更新：** 修改您的原始 Markdown/HTML 文件，使其指向本地保存的图片。
-   **格式转换：** 可选择将图片转换为 WebP 格式，以获得更好的压缩效果和质量。
-   **内容扫描：** 扫描 Markdown 图片语法 (`![]()`)、HTML `<img>` 标签和 Vue 的 `:src` 绑定。
-   **Frontmatter 支持：** 从指定的 frontmatter 键中提取图片 URL。
-   **可配置：** 提供图片子目录、WebP 转换、质量、要扫描的文件类型、frontmatter 键和抓取超时等选项。
-   **防止重复：** 使用 URL 哈希作为文件名，以避免重复下载并确保本地路径的唯一性。
-   **调试模式：** 提供详细的日志记录以供故障排除。
-   **遵循 `base` 路径：** 正确生成公共图片路径，会考虑您 VuePress 站点的 `base` 配置。

## 安装

首先，如果尚未安装，请安装插件及其对等依赖项：

```bash
npm install --save-dev sharp fs-extra gray-matter
# 或者
yarn add --dev sharp fs-extra gray-matter
```

然后，将插件文件（例如此目录中的 index.mjs ）放置到您的 VuePress 项目结构中（如果用于分发），或者如果像在 .vuepress/plugins/fetch-remote-images/index.mjs 中那样本地使用，请确保正确引用它。

## 使用方法

将插件添加到您的 VuePress 配置文件（ .vuepress/config.ts 或 .vuepress/config.js ）中：

```
// .vuepress/config.ts
import { defineUserConfig } from 'vuepress';
import fetchRemoteImagesPlugin from './plugins/fetch-remote-images/index.mjs'; // 如果
需要，请调整路径

export default defineUserConfig({
  // ... 其他配置
  plugins: [
    fetchRemoteImagesPlugin({
      // 可选：在此处配置插件选项
      // 请参阅下面的“配置选项”部分
      imageSubDirName: 'remote-assets/images', // 示例：图片存储在 public/remote-assets/
      images
      convertToWebP: true,                    // 转换为 WebP
      webPQuality: 75,                        // WebP 质量
      // userFileExtensions: ['.md', '.vue'], // 示例：处理 .md 和 .vue 文件
      // frontmatterKeys: ['cover', 'image', 'hero'], // 示例：检查这些 frontmatter 键
    }),
  ],
});
```
## 配置选项

| 选项                 | 类型      | 默认值                                                                                                 | 描述                                                                                                                                  |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `imageSubDirName`    | `string`  | `'fetched-images'`                                                                                     | 图片将保存到的 `.vuepress/public` 目录下的子目录名称。                                                                                    |
| `convertToWebP`      | `boolean` | `true`                                                                                                 | 是否将下载的图片转换为 WebP 格式。如果为 `false`，则保留原始格式。                                                                        |
| `webPQuality`        | `number`  | `80`                                                                                                   | WebP 转换质量（1-100）。                                                                                                              |
| `userFileExtensions` | `string[]`| `['.md', '.html']`                                                                                     | 要扫描远程图片的文件扩展名数组（例如 `.md`, `.vue`）。                                                                                  |
| `frontmatterKeys`    | `string[]`| `['cover', 'banner', 'thumbnail', 'image', 'feature', 'heroImage', 'ogImage', 'twitterImage', 'galleryImages', 'images', 'photos']` | 用于检查图片 URL 的 frontmatter 键数组。支持直接 URL 和 URL 数组/包含 `url` 属性的对象数组。                                                |
| `fetchTimeout`       | `number`  | `15000`                                                                                                | 抓取每个远程图片的超时时间（毫秒）。                                                                                                      |
| `debug`              | `boolean` | `false`                                                                                                | 设置为 `true` 以启用详细的控制台日志记录，方便调试。                                                                                      |


## 工作原理

1. 初始化 ( onInitialized ):
   - 确定用于存储图片的绝对路径（例如 .vuepress/public/fetched-images ）。
   - 计算这些图片的公共基础路径（例如 /your-base/fetched-images/ ）。
   - 确保目标目录存在。
2. 准备阶段 ( onPrepared ):
   - 扫描所有与 userFileExtensions 匹配的页面。
   - 使用 gray-matter 读取每个页面的原始内容和 frontmatter。
   - 从页面正文（Markdown、HTML、Vue 绑定）和指定的 frontmatterKeys 中提取所有唯一的远程图片 URL。
   - 对于每个唯一的远程 URL：
     - 生成一个本地文件名（URL 的 MD5 哈希 + 扩展名）。
     - 如果本地文件不存在，则使用 fetch 下载图片。
     - 如果 convertToWebP 为 true，则使用 sharp 将图片转换为 WebP；否则，保存原始图片。
     - 将远程 URL 映射到其新的本地公共路径。
   - 处理完所有图片后，它会重新读取包含远程 URL 的页面的源文件。
   - 在 frontmatter 和正文内容中，将所有出现的远程 URL 替换为其对应的本地路径。
   - 使用 fs-extra 和 gray-matter 保存修改后的源文件。

## 重要提示

- 修改源文件： 此插件会直接修改您的原始源文件（例如 .md 文件）以更新图片路径。 请确保您已使用版本控制系统（如 Git）。
- 开发服务器 ( docs:dev ):
  - 在清除缓存或添加新的远程图片后首次运行 npm run docs:dev 时，您最初可能会在浏览器中看到远程图片链接。
  - 插件会在 onPrepared 钩子期间异步处理图片。一旦处理完成并且源文件被更新，VuePress 的热模块替换（HMR）应该会刷新内容，显示本地图片路径。
  - 如果 HMR 没有立即捕获到更改，手动刷新浏览器或第二次运行 docs:dev （在第一次运行完全处理并修改文件之后）将会显示本地图片。
- 构建过程 ( docs:build ): 构建过程将等待 onPrepared 钩子完成，确保所有图片都是本地的，并且路径在最终的静态输出中已更新。
- 依赖项： sharp 是一个强大的图像处理库，但根据您的操作系统和 Node.js 版本，有时可能存在复杂的安装要求。请确保在您的项目中已正确安装。

## 许可证

MIT