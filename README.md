# Shinsou Community Plugins (MCP)

Shinsou 社群插件集合，為 [Shinsou](https://github.com/aluoexpiry/shinsou) 漫畫閱讀器提供多個漫畫來源的擴充支援。

## 可用插件

| 插件 ID | 名稱 | 語言 | 版本 | 來源網站 |
|---------|------|------|------|---------|
| `all.mangadex` | MangaDex | all | 1.2.0 | mangadex.org |
| `eh.ehentai` | E-Hentai | all | 1.1.2 | e-hentai.org |
| `zh.baozimh` | 包子漫画 | zh | 1.0.0 | baozimh.com |
| `zh.dm5` | 動漫屋 | zh | 1.3.0 | dm5.cn |
| `zh.jinmantiantang` | 禁漫天堂 | zh | 1.0.0 | 18comic.vip |
| `zh.komiic` | Komiic | zh | 1.2.0 | komiic.com |
| `zh.manhuagui` | 漫画柜 | zh | 1.1.2 | tw.manhuagui.com |
| `zh.wnacg` | 紳士漫畫 | zh | 1.3.0 | wnacg.com |

## 目錄結構

```
shinsou_plugin/
├── src/                    # 插件原始碼
│   ├── {plugin-id}/       # 各插件的 JS 原始碼
│   └── example.login/     # 範例插件（登入 / Cookie / 偏好設定）
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
    supportsLogin: false,       // 設為 true 啟用登入 UI
    headers: { "User-Agent": "..." },

    // 登入 / 登出（需 supportsLogin: true）
    login: function(username, password) { ... },  // 回傳 boolean
    logout: function() { ... },

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

## Bridge API

插件透過 `bridge` 物件與 Shinsou 原生層溝通。

### HTTP 請求

所有 HTTP 請求會自動攜帶此來源的 cookies，回應的 `Set-Cookie` 也會自動儲存。

| 方法 | 說明 |
|------|------|
| `bridge.httpGet(url)` | HTTP GET 請求 |
| `bridge.httpGetWithHeaders(url, headers)` | 附帶自訂標頭的 HTTP GET |
| `bridge.httpPost(url, body, headers)` | HTTP POST 請求 |

### Cookie 管理

每個來源有獨立的 cookie jar，cookies 持久化至 UserDefaults，App 重啟後仍有效。

| 方法 | 說明 |
|------|------|
| `bridge.getCookie(name, url)` | 取得指定 cookie 的值 |
| `bridge.getCookies(url)` | 取得該 URL 所有 cookies（回傳 `{name: value}` 物件） |
| `bridge.setCookie(name, value, domain, path, expirySeconds)` | 設定 cookie。`expirySeconds=0` 為 session cookie |
| `bridge.deleteCookie(name, domain)` | 刪除指定 cookie |
| `bridge.clearCookies()` | 清除此來源所有 cookies |

**自動行為：**
- `httpGet()` / `httpPost()` 會自動攜帶 cookies
- 伺服器回應的 `Set-Cookie` 會自動存入此來源的 cookie jar
- 使用者也可在 App 設定畫面手動新增、匯入或刪除 cookies

### 憑證存取

使用者可在 App「來源設定」畫面儲存帳號密碼。插件可透過以下 API 讀取。

| 方法 | 說明 |
|------|------|
| `bridge.getCredentialUsername()` | 取得已儲存帳號 |
| `bridge.getCredentialPassword()` | 取得已儲存密碼 |
| `bridge.setCredential(username, password)` | 儲存帳密 |
| `bridge.clearCredential()` | 清除帳密 |
| `bridge.hasCredential()` | 是否已儲存帳密 |

**說明：**
- 無論插件是否宣告 `supportsLogin`，使用者都可在設定畫面儲存帳密
- 當 `supportsLogin: true` 時，App 會呼叫 `source.login()` 並在成功後自動儲存帳密
- 當 `supportsLogin: false` 時，App 僅儲存帳密，插件可自行在 `getPopularManga` 等方法中讀取使用

### 偏好設定

每個來源可定義偏好設定，存取 UserDefaults（key 自動加上 `source.<id>.` 前綴）。

| 方法 | 說明 |
|------|------|
| `bridge.getPreference(key)` | 讀取偏好設定值 |
| `bridge.setPreference(key, value)` | 寫入偏好設定值 |

搭配 `ConfigurableSource` 的 `getPreferenceDefinitions()` 可在 App 設定畫面顯示 UI 控制項。

### DOM 解析

| 方法 | 說明 |
|------|------|
| `bridge.log(message)` | 輸出除錯日誌 |
| `bridge.domReleaseAll()` | 釋放 DOM 資源（每次呼叫結束前務必呼叫） |

## DOM 解析（Jsoup 風格）

使用 Jsoup 風格的 API 進行 HTML 解析：

```javascript
var doc = Jsoup.parse(html, baseUrl);
var elements = doc.select("div.manga-item");        // CSS 選擇器
var first = doc.selectFirst("h1.title");             // 單一元素
var text = first.text();                              // 取得文字內容
var attr = first.attr("href");                        // 取得屬性值
var absUrl = first.absUrl("href");                    // 取得絕對 URL
var html = first.html();                              // 取得內部 HTML
var ownText = first.ownText();                        // 僅自身文字（不含子元素）
```

### Element API

| 方法 | 說明 |
|------|------|
| `el.select(css)` | CSS 選擇器查詢（回傳 Elements） |
| `el.selectFirst(css)` | 查詢第一個匹配元素 |
| `el.text()` | 取得文字（含子元素） |
| `el.ownText()` | 取得自身文字（不含子元素） |
| `el.html()` | 取得內部 HTML |
| `el.outerHtml()` | 取得外部 HTML |
| `el.attr(name)` | 取得屬性值 |
| `el.hasAttr(name)` | 是否有該屬性 |
| `el.absUrl(name)` | 取得絕對 URL |
| `el.tagName()` | 標籤名稱 |
| `el.className()` | class 名稱 |
| `el.id()` | id 屬性 |
| `el.children()` | 子元素列表 |
| `el.parent()` | 父元素 |
| `el.nextElementSibling()` | 下一個兄弟元素 |
| `el.previousElementSibling()` | 上一個兄弟元素 |
| `el.remove()` | 從 DOM 中移除 |

## 資料模型

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

## 登入流程

### 方式一：插件實作登入方法（推薦）

適用於有 API 登入端點的網站。

```javascript
var source = {
    supportsLogin: true,

    login: function(username, password) {
        var result = bridge.httpPost(this.baseUrl + "/login",
            "user=" + encodeURIComponent(username) + "&pass=" + encodeURIComponent(password),
            { "Content-Type": "application/x-www-form-urlencoded" }
        );
        // 回應的 Set-Cookie 會自動儲存
        var json = JSON.parse(result);
        return json.success === true;
    },

    logout: function() {
        bridge.clearCookies();
    }
};
```

使用者操作：設定 → 帳號密碼 → 輸入帳密 → 登入

### 方式二：手動匯入 Cookie

適用於需要 Cloudflare 驗證、瀏覽器登入後取得 cookie 的網站。

1. 在瀏覽器登入目標網站
2. 使用瀏覽器擴充（如 EditThisCookie、Get cookies.txt）匯出 cookies
3. 在 App 設定 → Cookies → 匯入 Cookie 檔案
4. 支援格式：Netscape cookies.txt、JSON

### 方式三：僅儲存帳密

即使插件未宣告 `supportsLogin`，使用者仍可在設定畫面儲存帳密，插件在需要時讀取：

```javascript
var source = {
    // 不需要 supportsLogin: true

    getPopularManga: function(page) {
        // 如果有帳密，在 URL 中帶入認證參數
        if (bridge.hasCredential()) {
            var token = bridge.getCookie("session", this.baseUrl);
            if (!token) {
                // 自行執行登入
                this._doLogin();
            }
        }
        // ...
    },

    _doLogin: function() {
        var user = bridge.getCredentialUsername();
        var pass = bridge.getCredentialPassword();
        bridge.httpPost(this.baseUrl + "/login",
            "u=" + encodeURIComponent(user) + "&p=" + encodeURIComponent(pass),
            {}
        );
        // cookies 自動儲存
    }
};
```

## 插件開發

### 建立新插件

1. 在 `src/` 下建立目錄，命名格式為 `{語言}.{插件名稱}`（如 `zh.example`）
2. 建立主檔案 `src/{語言}.{插件名稱}/{插件名稱}.js`
3. 實作 `source` 物件的所有必要方法
4. 將編譯後的檔案放到 `plugins/{語言}.{插件名稱}.js`
5. 更新 `index.json` 加入新插件的元資料

### 範例插件

- **`src/example.login/`** — 展示登入、Cookie、憑證、偏好設定等進階 API 用法
- **`src/zh.baozimh/`** — HTML 解析方式（CSS 選擇器）
- **`src/all.mangadex/`** — REST API 方式（JSON.parse）
- **`src/zh.komiic/`** — GraphQL API 方式（httpPost）

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

## App 設定畫面

每個來源的設定畫面（長按來源 → 來源設定）包含以下區塊：

| 區塊 | 說明 | 條件 |
|------|------|------|
| **網路** | DoH / Cloudflare Workers Proxy 獨立開關（跟隨全域/強制開/強制關） | 所有來源 |
| **帳號密碼** | 儲存或登入帳密 | JSSourceProxy |
| **Cookies** | 檢視 / 新增 / 匯入 / 刪除 cookies | JSSourceProxy |
| **偏好設定** | 插件自訂的 toggle / text / select / multi-select | ConfigurableSource |

### Cookie 匯入支援格式

| 格式 | 來源擴充 | 副檔名 |
|------|---------|--------|
| Netscape cookies.txt | Get cookies.txt、cookies.txt | `.txt` |
| JSON | EditThisCookie、Cookie-Editor | `.json` |

## 在 Shinsou 中安裝

1. 開啟 Shinsou 應用
2. 前往「瀏覽」>「擴充來源庫」
3. 新增倉庫 URL
4. 在擴充列表中安裝所需的插件

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。Copyright (c) 2026 Aluo.
