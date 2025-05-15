# VuePress Plugin: Fetch Remote Images

A VuePress 2 plugin that automatically fetches remote images referenced in your content and frontmatter, saves them locally, and updates the source files to use these local copies. This helps improve site performance, reduce external dependencies, and ensures images are always available.

## Features

-   **Local Caching:** Downloads remote images and stores them in your `public` directory.
-   **Source File Updates:** Modifies your original Markdown/HTML files to point to the locally saved images.
-   **Format Conversion:** Optionally converts images to WebP format for better compression and quality.
-   **Content Scanning:** Scans Markdown image syntax (`![]()`), HTML `<img>` tags, and Vue `:src` bindings.
-   **Frontmatter Support:** Extracts image URLs from specified frontmatter keys.
-   **Configurable:** Offers options for image subdirectory, WebP conversion, quality, file types to scan, frontmatter keys, and fetch timeout.
-   **Duplicate Prevention:** Uses URL hashing for filenames to avoid re-downloading and ensure unique local paths.
-   **Debug Mode:** Provides detailed logging for troubleshooting.
-   **Respects `base` path:** Correctly generates public image paths considering your VuePress site's `base` configuration.

## Installation

First, install the plugin and its peer dependencies if you haven't already:

```bash
npm install --save-dev sharp fs-extra gray-matter
# or
yarn add --dev sharp fs-extra gray-matter
```

Then, place the plugin file (e.g., index.mjs from this directory) into your VuePress project structure if you are distributing it, or ensure it's correctly referenced if used locally as in .vuepress/plugins/fetch-remote-images/index.mjs .

## Usage

Add the plugin to your VuePress configuration file ( .vuepress/config.ts or .vuepress/config.js ):

```js
// .vuepress/config.ts
import { defineUserConfig } from 'vuepress';
import fetchRemoteImagesPlugin from './plugins/fetch-remote-images/index.mjs'; // Adjust path if needed

export default defineUserConfig({
  // ... other configurations
  plugins: [
    fetchRemoteImagesPlugin({
      // Optional: configure plugin options here
      // See "Configuration Options" section below
      imageSubDirName: 'remote-assets/images', // Example: store images in public/remote-assets/images
      convertToWebP: true,
      webPQuality: 75,
      // userFileExtensions: ['.md', '.vue'], // Example: process .md and .vue files
      // frontmatterKeys: ['cover', 'image', 'hero'], // Example: check these 
      frontmatter keys
    }),
  ],
});
```
## Configuration Options

| Option               | Type      | Default                                                                                                | Description                                                                                                                               |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `imageSubDirName`    | `string`  | `'fetched-images'`                                                                                     | Subdirectory name within `.vuepress/public` where images will be saved.                                                                   |
| `convertToWebP`      | `boolean` | `true`                                                                                                 | Whether to convert downloaded images to WebP format. If `false`, original format is kept.                                                 |
| `webPQuality`        | `number`  | `80`                                                                                                   | Quality for WebP conversion (1-100).                                                                                                      |
| `userFileExtensions` | `string[]`| `['.md', '.html']`                                                                                     | Array of file extensions (e.g., `.md`, `.vue`) to scan for remote images.                                                                 |
| `frontmatterKeys`    | `string[]`| `['cover', 'banner', 'thumbnail', 'image', 'feature', 'heroImage', 'ogImage', 'twitterImage', 'galleryImages', 'images', 'photos']` | Array of frontmatter keys to check for image URLs. Supports direct URLs and arrays of URLs/objects with a `url` property.                 |
| `fetchTimeout`       | `number`  | `15000`                                                                                                | Timeout in milliseconds for fetching each remote image.                                                                                   |
| `debug`              | `boolean` | `false`                                                                                                | Set to `true` to enable detailed console logging for debugging.                                                                           |


## How It Works

1. Initialization ( onInitialized ):
   - Determines the absolute path for storing images (e.g., .vuepress/public/fetched-images ).
   - Calculates the public base path for these images (e.g., /your-base/fetched-images/ ).
   - Ensures the target directory exists.
2. Preparation ( onPrepared ):
   - Scans all pages matching userFileExtensions .
   - Reads the raw content and frontmatter of each page using gray-matter .
   - Extracts all unique remote image URLs from the page body (Markdown, HTML, Vue bindings) and specified frontmatterKeys .
   - For each unique remote URL:
     - Generates a local filename (MD5 hash of URL + extension).
     - If the local file doesn't exist, it downloads the image using fetch .
     - If convertToWebP is true, it converts the image to WebP using sharp ; otherwise, it saves the original.
     - Maps the remote URL to its new local public path.
   - After processing all images, it re-reads the source files of pages that contained remote URLs.
   - Replaces all occurrences of the remote URLs with their corresponding local paths in both the frontmatter and the body content.
   - Saves the modified source files using fs-extra and gray-matter .

## Important Notes

- Modifies Source Files: **This plugin directly modifies your original source files (e.g., .md files) to update image paths**. Ensure you have a version control system (like Git) in place.
- Development Server ( docs:dev ):
  - On the first run of npm run docs:dev after clearing caches or adding new remote images, you might initially see remote image links in your browser.
  - The plugin processes images asynchronously during the onPrepared hook. Once processing is complete and source files are updated, VuePress's Hot Module Replacement (HMR) should refresh the content with local image paths.
  - If HMR doesn't pick up the change immediately, a manual browser refresh or a second run of docs:dev (after the first one has fully processed and modified files) will show the local images.
- Build Process ( docs:build ): The build process will wait for the onPrepared hook to complete, ensuring all images are local and paths are updated in the final static output.
- Dependencies: sharp is a powerful image processing library but can sometimes have complex installation requirements depending on your OS and Node.js version. Ensure it's installed correctly in your project.

## License

MIT