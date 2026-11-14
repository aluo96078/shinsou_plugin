# Shinsou Community Plugins

這個儲存庫只發布 `shinsou-extension-v2` 套件，並以發佈者金鑰簽章（Ed25519）。使用者在 Shinsou X 加入儲存庫時，
請核對發佈者指紋：

- 顯示指紋：`A3E9 1699 D2CA E49B 0F04 8933 341D 0536`
- 完整指紋：`sha256:o-kWmdLK5JsPBIkzNB0FNsomhKpPqWB5QunWv2O137o`

## 目錄配置

- `src/`：**唯一要編輯的地方**，未簽章的原始檔
  - `src/index.json`：v2 套件索引（`contractVersion: 2`）
  - `src/repo.json`：儲存庫資訊
  - `src/plugins/`：具獨立 SHA-256／byte size 綁定的 v2 執行腳本
  - `src/sidecars/`：權限、內容型別、SourceKey 與 system-event 宣告
  - `src/.shinsou/state.json`：簽章序號與撤回清單，必須一起提交
- 根目錄的 `repo.json`、`index.json`、`plugins/`、`sidecars/`、`publisher-revocations.json`：App 實際讀取的簽章版本，
  由 GitHub Actions 自動產生，**不要手動修改**。

## 簽章與發佈

`.github/workflows/sign.yml` 會在 `src/` 有變更推上 `master` 時執行測試，並用發佈者金鑰重新簽署所有文件到根目錄；
每週一另外檢查撤回清單，剩不到一半效期（30 天）時自動續簽。過期後 App 不再從這個發佈者安裝或更新套件
（已安裝的套件照常執行）。需要的 Secrets：

- `SHINSOU_PLUGIN_KEY`：發佈者金鑰檔（`~/.config/shinsou-plugin/keys/aluo.json`）的完整內容
- `SHINSOU_PLUGIN_PASSPHRASE`：金鑰密碼

手動簽署（例如 Actions 無法使用時），用 [shinsou-plugin CLI](https://github.com/aluo96078/shinsou-plugin-cli)：

```bash
shinsou-plugin sign-repo --dir src --out .. --flat --key aluo \
  --mirror https://raw.githubusercontent.com/aluo96078/shinsou_plugin/refs/heads/master
```

成人（NSFW）專門來源（E-Hentai、NHentai、禁漫天堂、哔咔漫画、紳士漫畫）已移至獨立的 `shinsou_nsfw_plugin` 儲存庫。

所有套件都使用同一種格式（`contract: "shinsou"`，在 App 的沙箱中執行）。小說來源：

- `zh.wenku8.api`：維護中的文庫 relay 來源
- `zh.biquge.tw`：筆趣閣來源
- `ko.novelpia`：Novelpia（노벨피아）韓文網路小說；免費章節不需登入，PLUS 章節需以已訂閱的帳號登入，不列出 19 禁作品
- `zh.wenku8`：已停止維護，只為保留既有書庫身分而存在，不列入新安裝

原本 ShuYue 格式的來源都已改寫成 Shinsou 格式，並保留原本的來源身分（字串 `sourceId` 與數字 `legacyLongId`，
例如 `zh.wenku8.api` / `-9110000000000002`），所以使用者的書庫、閱讀進度與登入會直接沿用。

嗶哩來源分成兩個可獨立安裝的套件：

- `zh.bilimanga`：提供 `tw.linovelib.com` 的 `PLAIN_TEXT` 輕小說內容（來源 `zh.bilimanga.novel`）。
- `zh.bilimanga.manga`：提供 `www.bilimanga.net` 的 `IMAGE_SEQUENCE` 漫畫內容，使用與嗶咔漫畫相同的獨立 Shinsou 漫畫詳情頁與閱讀器，數字來源 ID 為 `7289707411592168382`。

兩個套件皆包含站方排行榜、搜尋、分類篩選、作品詳情、目錄與內容解析，並各自使用隔離的
登入／Cookie 工作階段。BiliManga 會員頁遇到 Cloudflare 驗證時可透過宿主的 Web 驗證流程匯入工作階段。

`example.login` 是登入 API 參考實作，同樣標示為不可安裝。`example.dual` 是一個離線的小說／漫畫雙來源參考套件：同一個 package export `example.dual.novel`（`PLAIN_TEXT`）與 `example.dual.manga`（`IMAGE_SEQUENCE`），並示範來源篩選、章節與內容頁格式。它刻意標示為 `referenceOnly: true`、`installable: false`，作為參考範例，不提供安裝。所有套件的 executable artifact、sidecar 與權限宣告都由 `src/index.json` 綁定，簽章後的根目錄 `index.json` 內容與它相同。

要讓其他使用者建立套件，可使用 [`skills/shinsou-extension-creator/SKILL.md`](skills/shinsou-extension-creator/SKILL.md)。這個通用 Codex skill 會引導建立 v2 script、sidecar、SourceKey、內容型別／權限宣告、digest 綁定與 smoke test；詳細欄位與雙平台範例位於 skill 的 `references/v2-package-schema.md`。

## 使用方式

本地測試未簽章的修改時，在 Shinsou X 的「設定 → 套件安全」開啟開發者模式，再以 `src/` 啟動靜態伺服器：

```bash
python3 -m http.server 18081 --directory src
```

Shinsou X 加入：

```text
http://127.0.0.1:18081/index.json
```

區域網路測試時，將 `127.0.0.1` 換成主機的私有 IPv4 位址，並在開發者模式中加入該位址。開發者模式載入的套件標示為「開發中」，
與正式安裝分開。一般使用者請加入 GitHub 上的簽章網址。

## 驗證

```bash
node test/v2-migration-smoke.js
```

測試會驗證 `src/` 的 v2 索引、腳本 digest、sidecar 綁定、權限與來源身分；不會登入第三方網站或發送正式來源請求。

完整的 v2 欄位、sidecar digest、SourceKey 與 system-event 規則請參考
[`shinsou_kmp/docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md`](https://github.com/aluo96078/shinsoux/blob/master/docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md)。
