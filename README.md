# Shinsou Community Plugins

這個儲存庫現在只發布 `shinsou-extension-v2` 套件，v2 索引與所有可用腳本都位於專案根目錄。舊版 v1 根目錄套件（舊 `index.json`、`plugins/`、`src/`）已移除，不再維護或發布。

## 套件內容

- `index.json`：v2 套件索引（`contractVersion: 2`）
- `repo.json`：儲存庫資訊
- `plugins/`：具獨立 SHA-256／byte size 綁定的 v2 執行腳本
- `sidecars/`：權限、內容型別、SourceKey 與 system-event 宣告
- `merged-shuyue/`：僅供既有資料遷移與測試使用的 legacy fixture，不是可安裝的 v1 套件

套件包含 ShuYue 小說擴充：

- `zh.wenku8.api`：維護中的文庫 relay 來源
- `zh.biquge.tw`：筆趣閣來源
- `zh.wenku8`：只作舊資料相容遷移，不列入新安裝

`zh.bilimanga` 將 `tw.linovelib.com`（小說）與 `www.bilimanga.net`（漫畫）
整合為單一雙來源 reviewed v2 套件，分別提供 `PLAIN_TEXT` 與 `IMAGE_SEQUENCE`，並包含
站方的排行榜、搜尋、分類篩選、作品詳情、目錄、章節內容與漫畫圖片解析。兩個來源不實作
登入或帳號密碼欄位；宿主會依每個來源的內容型別建立文字或圖片閱讀內容。

`example.login` 是登入 API 參考實作，同樣標示為不可安裝。`example.dual` 是一個離線的小說／漫畫雙來源參考套件：同一個 package export `example.dual.novel`（`PLAIN_TEXT`）與 `example.dual.manga`（`IMAGE_SEQUENCE`），並示範來源篩選、章節與內容頁格式。它刻意標示為 `referenceOnly: true`、`installable: false`，因為目前 host 的 generic legacy adapter 與 reviewed ShuYue install path 尚不能保證 mixed package 的完整執行。所有套件的 executable artifact、sidecar 與權限宣告都由根目錄 `index.json` 綁定。

要讓其他使用者建立套件，可使用 [`skills/shinsou-extension-creator/SKILL.md`](skills/shinsou-extension-creator/SKILL.md)。這個通用 Codex skill 會引導建立 v2 script、sidecar、SourceKey、內容型別／權限宣告、digest 綁定與 smoke test；詳細欄位與雙平台範例位於 skill 的 `references/v2-package-schema.md`。

## 使用方式

本地測試時，從專案根目錄啟動靜態伺服器：

```bash
python3 -m http.server 18081 --directory .
```

Shinsou X 應加入：

```text
http://127.0.0.1:18081/index.json
```

區域網路測試時，將 `127.0.0.1` 換成主機的內網位址。舊的 `/v2/index.json` 路徑已不再提供。

## 驗證

```bash
node test/v2-migration-smoke.js
```

測試會驗證根目錄 v2 索引、腳本 digest、sidecar 綁定、權限與 ShuYue 對應；不會登入第三方網站或發送正式來源請求。

完整的 v2 欄位、sidecar digest、SourceKey 與 system-event 規則請參考
[`shinsou_kmp/docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md`](https://github.com/aluo96078/shinsoux/blob/master/docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md)。
