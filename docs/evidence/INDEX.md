# 開発証跡インデックス

| Phase | 内容 | 画像 | 学べること | 状態 |
|---|---|---|---|---|
| 0 | 要件復元 | `phase-00-requirements/requirements-map.svg` | 要件と対象外の分け方 | 完了 |
| 1 | 環境・Git | `phase-01-setup/environment.svg` | 必要最小限の環境 | 完了 |
| 2 | 設計 | `phase-02-design/architecture.svg` | ブラウザーから保存まで | 完了 |
| 3 | 最初の画面 | `phase-03-first-app/01-dashboard.png` | localhostとReact | 完了 |
| 4 | 企業管理 | `phase-04-company-management/01-company-list.png` | CRUDと実ブラウザーバグ修正 | 完了 |
| 5 | 選考管理 | `phase-05-selection-management/01-company-detail.png` | 1対多のデータ | 完了 |
| 6 | 検索・ダッシュボード | `phase-06-dashboard-search/01-search-result.png` | 派生データとフィルター | 完了 |
| 7 | 保存・モード分離 | `phase-07-storage/02-personal-mode.png` | localStorageと安全なデモ | 完了 |
| 8 | UI/UX | `phase-08-ui-ux/01-mobile-dashboard.png` | 見落としを減らす設計 | 完了 |
| 9 | テスト | `phase-09-testing/01-validation-error.png` | 自動テストと修正 | 完了 |
| 10 | リリース準備 | `../portfolio/screenshots/dashboard.png` | READMEと最終監査 | 完了 |
| 11 | v2データモデル | `phase-11-v2-data-model/README.md` | v1を失わないschema migration | 完了 |
| 12 | 動的評価 | `phase-12-configurable-scoring/screenshots/01-scoring-settings.png` | weight・scale・coverage | 完了 |
| 13 | Company Master | `phase-13-company-master/screenshots/01-master-candidate.png` | 恒久IDと安全な候補照合 | 完了 |
| 14 | AI Sync・Watch | `phase-14-ai-sync-watch/screenshots/01-ai-diff-preview.png` | JSON検証・差分承認・重複排除 | 完了 |
| 15 | Google Auth・Drive境界 | `phase-15-google-drive/screenshots/01-local-development-mode.png` | 限定scope・競合停止・Mock | Mock完了／実Google未確認 |
| 16 | v2テスト | `phase-16-v2-testing/README.md` | 119 unit/component・6機能E2E | 完了 |
| 17 | v2リリース監査 | `phase-17-v2-release/screenshots/01-v2-dashboard.png` | 証跡保護・安全監査・公開準備 | 完了 |
| 18 | 無料公開デモ | `phase-18-public-deployment/screenshots/01-live-public-demo.png` | GitHub Pages・最小公開payload・無料条件 | 公開中 |

## v2を学ぶ順番

1. Phase 11で、なぜ`Company[]`を`AppDataV2`へ分けたか確認します。
2. Phase 12〜14で、評価・企業照合・AI差分・Watchの規則を追います。
3. Phase 15で、Google実接続済みではなくMock/contractまでであることを確認します。
4. Phase 16でテストの守備範囲、Phase 17で最終画面と監査結果を確認します。
5. Phase 18で、全ソースではなくbuildだけを安全に公開した判断を確認します。

Phase 0〜10は初版の歴史的証跡です。v2に合わせて過去を書き換えず、「初版から何を改善したか」を説明する材料として残しています。
