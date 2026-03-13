# Shinsou Community Plugins (MCP)

Shinsou 社群插件集合，為 [Shinsou](https://github.com/aluoexpiry/shinsou) 漫畫閱讀器提供多個漫畫來源的擴充支援。

## 可用插件

| 插件 ID | 名稱 | 語言 | 版本 | 來源網站 |
|---------|------|------|------|---------|
| `all.mangadex` | MangaDex | all | 1.0.0 | mangadex.org |
| `all.nhentai` | NHentai | all | 1.0.0 | nhentai.net |
| `eh.ehentai` | E-Hentai | all | 1.1.0 | e-hentai.org |
| `zh.baozimh` | 包子漫画 | zh | 1.0.0 | baozimh.com |
| `zh.dm5` | 動漫屋 | zh | 1.1.0 | dm5.cn |
| `zh.jinmantiantang` | 禁漫天堂 | zh | 1.0.0 | 18comic.vip |
| `zh.komiic` | Komiic | zh | 1.0.1 | komiic.com |
| `zh.manhuagui` | 漫画柜 | zh | 1.0.0 | tw.manhuagui.com |
| `zh.wnacg` | 紳士漫畫 | zh | 1.3.0 | wnacg.com |

## 目錄結構

```
shinsou_plugin/
├── src/                    # 插件原始碼
│   └── {plugin-id}/       # 各插件的 JS 原始碼
├── plugins/                # 編譯後的插件檔案
│   └── {plugin-id}.js
├── icon/                   # 插件圖示
├── repo.json               # 倉庫元資料
├── index.json              # 插件索引清單
└── total.json              # Tachiyomi 擴充參考資料庫
```

## 插件 API

每個插件必須導出一個 `source` 物件，實作以下方法：

```javascript
var source = {
    // 基本屬性
    baseUrl: "https://example.com",
    supportsLatest: true,
    headers: { "User-Agent": "..." },

    // 漫畫列表
    getPopularManga: function(page) { ... },      // 回傳 MangasPage
    getLatestUpdates: function(page) { ... },      // 回傳 MangasPage
    getSearchManga: function(page, query, filters) { ... },

    // 漫畫詳情
    getMangaDetails: function(manga) { ... },      // 回傳 SManga
    getChapterList: function(manga) { ... },       // 回傳 SChapter[]
    getPageList: function(chapter) { ... },        // 回傳 Page[]

    // 篩選器（選用）
    getFilterList: function() { ... }              // 回傳 Filter[]
};
```

### Bridge API

插件透過 `bridge` 物件與 Shinsou 原生層溝通：

| 方法 | 說明 |
|------|------|
| `bridge.httpGet(url)` | HTTP GET 請求 |
| `bridge.httpGetWithHeaders(url, headers)` | 附帶自訂標頭的 HTTP GET |
| `bridge.httpPost(url, body, headers)` | HTTP POST 請求 |
| `bridge.log(message)` | 輸出除錯日誌 |
| `bridge.domReleaseAll()` | 釋放 DOM 資源 |

### DOM 解析

使用 Jsoup 風格的 API 進行 HTML 解析：

```javascript
var doc = Jsoup.parse(html, baseUrl);
var elements = doc.select("div.manga-item");        // CSS 選擇器
var first = doc.selectFirst("h1.title");             // 單一元素
var text = first.text();                              // 取得文字內容
var attr = first.attr("href");                        // 取得屬性值
```

### 資料模型

```javascript
// SManga - 漫畫物件
SManga.create()
    .setUrl("/manga/123")
    .setTitle("漫畫名稱")
    .setAuthor("作者")
    .setArtist("繪師")
    .setDescription("簡介")
    .setThumbnailUrl("https://...")
    .setStatus(SManga.ONGOING)       // ONGOING, COMPLETED, LICENSED, UNKNOWN
    .setGenre("動作, 冒險")

// SChapter - 章節物件
SChapter.create()
    .setUrl("/chapter/456")
    .setName("第 1 話")
    .setChapterNumber(1)
    .setDateUpload(timestamp)

// Page - 頁面物件
new Page(index, "", imageUrl)

// MangasPage - 漫畫列表頁面
new MangasPage(mangaList, hasNextPage)
```

## 插件開發

### 建立新插件

1. 在 `src/` 下建立目錄，命名格式為 `{語言}.{插件名稱}`（如 `zh.example`）
2. 建立主檔案 `src/{語言}.{插件名稱}/{插件名稱}.js`
3. 實作 `source` 物件的所有必要方法
4. 將編譯後的檔案放到 `plugins/{語言}.{插件名稱}.js`
5. 更新 `index.json` 加入新插件的元資料

### 插件抓取方式

插件支援三種主要的資料抓取模式：

- **HTML 解析** — 使用 `Jsoup.parse()` 搭配 CSS 選擇器（大多數插件）
- **REST API** — 直接呼叫 JSON API 並用 `JSON.parse()` 解析（如 MangaDex）
- **GraphQL** — 透過 `bridge.httpPost()` 發送 GraphQL 查詢（如 Komiic）

### index.json 格式

每個插件在 `index.json` 中的條目格式如下：

```json
{
    "id": "zh.example",
    "name": "範例來源",
    "lang": "zh",
    "version": "1.0.0",
    "nsfw": 0,
    "scriptUrl": "plugins/zh.example.js",
    "iconUrl": "icon/zh.example.png",
    "sources": [
        {
            "name": "範例來源",
            "lang": "zh",
            "id": "unique-source-id",
            "baseUrl": "https://example.com"
        }
    ]
}
```

## 在 Shinsou 中安裝

1. 開啟 Shinsou 應用
2. 前往「瀏覽」>「擴充來源庫」
3. 新增倉庫 URL
4. 在擴充列表中安裝所需的插件

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。Copyright (c) 2026 Aluo.
