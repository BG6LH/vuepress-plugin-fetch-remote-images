import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import fse from 'fs-extra';
import matter from 'gray-matter'; // <-- 新增 gray-matter 依赖

const PLUGIN_NAME = 'vuepress-plugin-fetch-remote-images';

// Helper function: Decode basic HTML entities
const decodeHtmlEntities = (text) => {
  if (typeof text !== 'string') return text;
  return text.replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#039;/g, "'");
};

// Helper function: Extract image URLs from content
const extractImageUrls = (content) => {
  const urls = new Set();
  // Regex for Markdown: ![alt](url)
  const markdownRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  // Regex for HTML <img>: <img src="url">
  const htmlRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
  // Regex for Vue bindings like :src="url" (less common in raw content before render)
  const vueBindingRegex = /(?::src|v-bind:src)="([^"]+)"/g;

  let match;
  [markdownRegex, htmlRegex, vueBindingRegex].forEach(regex => {
    while ((match = regex.exec(content))) {
      let url = match[1];
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        url = decodeHtmlEntities(url); // Decode entities early
        urls.add(url);
      }
    }
  });
  return Array.from(urls);
};

// This function might be useful if you decide to generate <picture> elements later
const determineImageTypeFromPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream'; // Fallback
  }
};

const downloadAndProcessImage = async (remoteUrl, localFileAbsPath, convertToWebP, webPQuality, originalFileExt, fetchTimeout, debugLog) => {
  try {
    if (debugLog) console.log(`[${PLUGIN_NAME}-DEBUG] Downloading: ${remoteUrl} to ${localFileAbsPath}`);
    const res = await fetch(remoteUrl, { timeout: fetchTimeout });
    if (!res.ok) {
      console.error(`[${PLUGIN_NAME}] DOWNLOAD FAILED (HTTP error): Status ${res.status} for ${remoteUrl}`);
      return false;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fse.ensureDir(path.dirname(localFileAbsPath));

    if (convertToWebP) {
      if (debugLog) console.log(`[${PLUGIN_NAME}-DEBUG] Converting to WebP: ${localFileAbsPath}`);
      await sharp(buffer).webp({ quality: webPQuality }).toFile(localFileAbsPath);
    } else {
      const targetPath = localFileAbsPath.endsWith(originalFileExt) ? localFileAbsPath : localFileAbsPath.replace(path.extname(localFileAbsPath), originalFileExt);
      if (debugLog) console.log(`[${PLUGIN_NAME}-DEBUG] Saving original format to: ${targetPath}`);
      await fse.writeFile(targetPath, buffer);
    }
    return true;
  } catch (e) {
    console.error(`[${PLUGIN_NAME}] DOWNLOAD/PROCESS FAILED (Exception): Error processing ${remoteUrl}: ${e.message}`);
    return false;
  }
};

const extractUrlsFromFrontmatter = (frontmatter, keys) => {
  const urls = new Set();
  if (!frontmatter) return Array.from(urls);

  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
      urls.add(decodeHtmlEntities(value));
    } else if (Array.isArray(value)) {
      value.forEach(item => {
        if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
          urls.add(decodeHtmlEntities(item));
        } else if (typeof item === 'object' && item !== null && typeof item.url === 'string' && (item.url.startsWith('http://') || item.url.startsWith('https://'))) {
          urls.add(decodeHtmlEntities(item.url)); // Assuming structure like { url: "..." }
        }
      });
    }
  }
  return Array.from(urls);
};


export default (options = {}) => {
  const pluginOptions = {
    imageSubDirName: 'fetched-images',
    convertToWebP: true,
    webPQuality: 80,
    userFileExtensions: ['.md', '.html'], // Default to .md and .html
    frontmatterKeys: ['cover', 'banner', 'thumbnail', 'image', 'feature', 'heroImage', 'ogImage', 'twitterImage', 'galleryImages', 'images', 'photos'],
    fetchTimeout: 15000, // Default fetch timeout 15 seconds
    debug: false, // Default debug logging to false
    ...options
  };

  const urlToLocalPathMap = new Map();
  // processedUrlsInDev can be useful if onPrepared is somehow triggered multiple times rapidly in dev before file writes fully settle.
  // However, the primary check is fs.existsSync(localFileAbsPath).
  const processedUrlsInDev = new Set(); 

  let outputDirAbsPath = '';      // Absolute path to the image subdirectory in public
  let publicBaseImagePath = '';   // Public base path for images (e.g., /base/fetched-images/)

  const logDebug = (message) => {
    if (pluginOptions.debug) {
      console.log(`[${PLUGIN_NAME}-DEBUG] ${message}`);
    }
  };

  return {
    name: PLUGIN_NAME, // Use the constant for plugin name

    onInitialized: (app) => {
      const base = app.options.base || '/';
      let tempBase = base;
      if (!tempBase.startsWith('/')) tempBase = '/' + tempBase;
      if (!tempBase.endsWith('/')) tempBase += '/';

      let tempImageSubDir = pluginOptions.imageSubDirName;
      if (tempImageSubDir.startsWith('/')) tempImageSubDir = tempImageSubDir.substring(1);
      if (tempImageSubDir.endsWith('/')) tempImageSubDir = tempImageSubDir.slice(0, -1);
      
      publicBaseImagePath = `${tempBase}${tempImageSubDir}/`.replace(/\/\//g, '/');
      outputDirAbsPath = path.join(app.dir.public(), pluginOptions.imageSubDirName);

      try {
        fse.ensureDirSync(outputDirAbsPath);
      } catch (err) {
        console.error(`[${PLUGIN_NAME}] CRITICAL: Error creating destination directory ${outputDirAbsPath}:`, err);
      }
      
      console.log(`[${PLUGIN_NAME}] Initialized. Mode: ${app.env.isDev ? 'dev' : 'build'}.`);
      logDebug(`Output directory: ${outputDirAbsPath}`);
      logDebug(`Public base image path: ${publicBaseImagePath}`);
      logDebug(`Options: ${JSON.stringify(pluginOptions)}`);
    },

    onPrepared: async (app) => {
      console.log(`[${PLUGIN_NAME}] Starting image discovery and processing.`);
      const allRemoteUrls = new Set();
      const pagesToUpdate = new Set(); // Store filePaths of pages that contain remote URLs

      for (const page of app.pages) {
        if (!page.filePath) { // Use page.filePath for original source file
            logDebug(`Skipping page (no filePath): ${page.key || 'Unknown page'}`);
            continue;
        }
        const pageFileExt = path.extname(page.filePath).toLowerCase();
        if (!pluginOptions.userFileExtensions.includes(pageFileExt)) continue;

        let pageHasRemoteUrl = false;
        // Read raw content for accurate URL extraction from original source
        const rawContent = fse.readFileSync(page.filePath, 'utf-8');
        const { data: frontmatterData, content: bodyContentString } = matter(rawContent);

        // Extract from page body content
        const urlsFromBody = extractImageUrls(bodyContentString);
        if (urlsFromBody.length > 0) {
            urlsFromBody.forEach(url => allRemoteUrls.add(url));
            pageHasRemoteUrl = true;
        }
        
        // Extract from page frontmatter (using parsed data from gray-matter)
        const urlsFromFM = extractUrlsFromFrontmatter(frontmatterData, pluginOptions.frontmatterKeys);
        if (urlsFromFM.length > 0) {
            urlsFromFM.forEach(url => allRemoteUrls.add(url));
            pageHasRemoteUrl = true;
        }

        if (pageHasRemoteUrl) {
            pagesToUpdate.add(page.filePath);
        }
      }

      console.log(`[${PLUGIN_NAME}] Found ${allRemoteUrls.size} unique remote URLs across ${pagesToUpdate.size} file(s).`);
      if (allRemoteUrls.size === 0) {
        console.log(`[${PLUGIN_NAME}] No remote URLs found to process.`);
        return;
      }
      if (pluginOptions.debug) {
        allRemoteUrls.forEach(url => logDebug(`Discovered remote URL: "${url}"`));
      }
      
      let successfulDownloads = 0;
      let existingImagesSkipped = 0;
      const downloadPromises = [];

      for (const remoteUrl of allRemoteUrls) {
        if (app.env.isDev && processedUrlsInDev.has(remoteUrl) && urlToLocalPathMap.has(remoteUrl)) {
          // If already processed in this dev session and mapped, skip download logic
          existingImagesSkipped++;
          continue;
        }

        let originalFileExt = '.jpg'; // Default
        try {
            const parsedUrl = new URL(remoteUrl);
            originalFileExt = path.extname(parsedUrl.pathname).toLowerCase();
            if (!originalFileExt || originalFileExt === '.') originalFileExt = '.jpg'; 
        } catch (e) {
            console.warn(`[${PLUGIN_NAME}] Could not parse URL for extension: ${remoteUrl}. Defaulting to .jpg`);
        }

        const hash = crypto.createHash('md5').update(remoteUrl).digest('hex');
        const localFileExtension = pluginOptions.convertToWebP ? '.webp' : originalFileExt;
        const localFileName = hash + localFileExtension;
        
        const localFileAbsPath = path.join(outputDirAbsPath, localFileName);
        const publicImageUrl = publicBaseImagePath + localFileName;

        if (fs.existsSync(localFileAbsPath)) {
          urlToLocalPathMap.set(remoteUrl, publicImageUrl);
          logDebug(`Mapped (existing local file): "${remoteUrl}" -> "${publicImageUrl}"`);
          if (app.env.isDev) processedUrlsInDev.add(remoteUrl);
          existingImagesSkipped++;
          continue;
        }

        downloadPromises.push(
          downloadAndProcessImage(remoteUrl, localFileAbsPath, pluginOptions.convertToWebP, pluginOptions.webPQuality, originalFileExt, pluginOptions.fetchTimeout, pluginOptions.debug)
            .then(success => {
              if (success) {
                urlToLocalPathMap.set(remoteUrl, publicImageUrl);
                logDebug(`Mapped (downloaded): "${remoteUrl}" -> "${publicImageUrl}"`);
                if (app.env.isDev) processedUrlsInDev.add(remoteUrl);
                successfulDownloads++;
              }
            })
        );
      }

      await Promise.all(downloadPromises);

      console.log(`[${PLUGIN_NAME}] Image download/processing summary:`);
      console.log(`  - Successfully downloaded/processed new: ${successfulDownloads}`);
      console.log(`  - Reused existing local or skipped in dev: ${existingImagesSkipped}`);
      console.log(`  - Total images mapped to local paths: ${urlToLocalPathMap.size}`);
      
      if (urlToLocalPathMap.size !== allRemoteUrls.size && (successfulDownloads + existingImagesSkipped) < allRemoteUrls.size) {
        console.warn(`[${PLUGIN_NAME}] WARNING: Not all remote URLs were successfully mapped. Check logs for download failures.`);
      }

      // --- Stage 3: Source File Content Update ---
      if (urlToLocalPathMap.size > 0) {
        console.log(`[${PLUGIN_NAME}] Starting source file updates for ${pagesToUpdate.size} candidate file(s)...`);
        let updatedFileCount = 0;

        for (const filePath of pagesToUpdate) {
            if (!fse.existsSync(filePath)) {
                logDebug(`Skipping update for non-existent file: ${filePath}`);
                continue;
            }

            let fileModifiedInThisPass = false;
            try {
                const rawFileContent = fse.readFileSync(filePath, 'utf-8');
                const { data: frontmatter, content: bodyContent } = matter(rawFileContent);
                
                let newFrontmatter = JSON.parse(JSON.stringify(frontmatter)); // Deep clone
                let frontmatterChanged = false;

                // 1. Update Frontmatter
                for (const key of pluginOptions.frontmatterKeys) {
                    if (newFrontmatter.hasOwnProperty(key)) {
                        const updateFmValue = (currentValue) => {
                            if (typeof currentValue === 'string' && urlToLocalPathMap.has(currentValue)) {
                                frontmatterChanged = true;
                                return urlToLocalPathMap.get(currentValue);
                            }
                            return currentValue;
                        };
                        
                        if (Array.isArray(newFrontmatter[key])) {
                            newFrontmatter[key] = newFrontmatter[key].map(item => {
                                if (typeof item === 'string' && urlToLocalPathMap.has(item)) {
                                    frontmatterChanged = true;
                                    return urlToLocalPathMap.get(item);
                                } else if (typeof item === 'object' && item !== null && typeof item.url === 'string' && urlToLocalPathMap.has(item.url)) {
                                    frontmatterChanged = true;
                                    return { ...item, url: urlToLocalPathMap.get(item.url) };
                                }
                                return item;
                            });
                        } else {
                            newFrontmatter[key] = updateFmValue(newFrontmatter[key]);
                        }
                    }
                }

                // 2. Update Body Content
                let newBodyContent = bodyContent;
                let bodyChanged = false;
                for (const [remoteUrl, localPath] of urlToLocalPathMap.entries()) {
                    const escapedRemoteUrl = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape for regex
                    const markdownImgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedRemoteUrl}\\)`, 'g');
                    const htmlImgRegex = new RegExp(`(<img[^>]*src=)(["'])${escapedRemoteUrl}\\2([^>]*>)`, 'gi');
                    const vueBindingRegex = new RegExp(`((?::src|v-bind:src)=)(["'])${escapedRemoteUrl}\\2`, 'gi');
                    
                    let tempBody = newBodyContent;
                    tempBody = tempBody.replace(markdownImgRegex, `![$1](${localPath})`);
                    tempBody = tempBody.replace(htmlImgRegex, `$1$2${localPath}$2$3`);
                    tempBody = tempBody.replace(vueBindingRegex, `$1$2${localPath}$2`);

                    if (tempBody !== newBodyContent) {
                        newBodyContent = tempBody;
                        bodyChanged = true;
                    }
                }
                
                fileModifiedInThisPass = frontmatterChanged || bodyChanged;

                if (fileModifiedInThisPass) {
                    const newFileContent = matter.stringify(newBodyContent, newFrontmatter);
                    if (newFileContent !== rawFileContent) {
                        fse.writeFileSync(filePath, newFileContent, 'utf-8');
                        console.log(`[${PLUGIN_NAME}] Updated source file: ${path.relative(app.dir.source(), filePath)}`);
                        updatedFileCount++;
                    } else {
                        logDebug(`Source file ${path.relative(app.dir.source(), filePath)} parsed and rebuilt but resulted in no textual change.`);
                    }
                }
            } catch (e) {
                console.error(`[${PLUGIN_NAME}] Error updating source file ${path.relative(app.dir.source(), filePath)}: ${e.message}`, e.stack);
            }
        }
        if (updatedFileCount > 0) {
            console.log(`[${PLUGIN_NAME}] Successfully updated ${updatedFileCount} source file(s).`);
        } else {
            console.log(`[${PLUGIN_NAME}] No source files required textual updating after processing.`);
        }
      }
      console.log(`[${PLUGIN_NAME}] onPrepared finished.`);
    },

    // onGenerated hook is removed as we modify source files directly.
  };
};
