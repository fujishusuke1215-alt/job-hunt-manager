# 開発タイムライン

実際に完了した内容だけを追記します。時刻は日本時間です。

| Phase | 目的 | 結果 | 主な変更 | 問題と解決 |
|---|---|---|---|---|
| 0 要件復元 | 過去会話と最新指示を統合 | 中難度の必須機能と対象外を確定 | `docs/01_REQUIREMENTS.md` | 過去案に外部DB等があったため、最新の無課金・最小構成条件を優先 |
| 1 環境確認 | 既存物を保護し必要物を確認 | 新規フォルダ、Gitあり、Nodeは通常PATHになし、VS Codeあり | 証跡Phase 1 | Codex同梱Node.jsを開発に使い、不要なインストールを回避 |
| 2 設計 | データと画面の境界を決定 | React単体、保存サービス分離、デモ/本人モード分離 | `docs/02_ARCHITECTURE.md`, `03_TECH_STACK.md` | 複雑さと成果物価値を比較し、バックエンドを将来拡張へ移動 |
| 3 初回起動 | ブラウザーで最初の画面を表示 | 公開デモのダッシュボードを起動 | `src/App.tsx`, `src/styles.css` | 依存取得制限とesbuild安全承認を、公式取得と限定設定で解決 |
| 4 企業管理 | 企業CRUDと評価を実装 | 登録・一覧・詳細・編集・削除、100点換算 | `CompanyForm.tsx`, `CompanyList.tsx`, `scoring.ts` | LAN内HTTPでrandomUUIDが使えず、機能検出付きID生成へ修正 |
| 5 選考管理 | 1社に複数予定を管理 | ES・テスト・面接のCRUDと状態変更 | `CompanyDetail.tsx`, `deadlines.ts` | 日時空欄を保存せず画面エラーで通知 |
| 6 検索・集計 | 次の行動を見つけやすくする | 検索、4軸絞り込み、並び替え、ダッシュボード | `companyFilters.ts`, `Dashboard.tsx` | 内蔵操作面の空文字入力差を全選択+削除で確認 |
| 7 保存 | 再読み込み後も本人用を保持 | localStorage、JSON、モード分離 | `storage.ts`, `DataTools.tsx` | 外部DBを初版から外し保存境界を分離 |
| 8 UI/UX | PCと狭い画面で情報を読めるようにする | 390px幅、下部ナビ、警告色、ARIA | `styles.css`, `AppShell.tsx` | 短縮ラベルのアクセシブル名をARIAで補完 |
| 9 テスト | 必須機能と回帰を確認 | lint/build成功、18 unit/component、3 E2E成功 | `src/*.test.*`, `e2e/` | VitestがE2Eも読んだため探索範囲を分離 |
| 10 リリース準備 | GitHub・面接・学習の入口を作る | README、5ポートフォリオ資料、最終監査 | `README.md`, `docs/portfolio/`, `FINAL_AUDIT.md` | 課金可能性を避け、外部公開せずローカル成果物で完了 |
| 11 v2データモデル | 企業情報と本人情報を分離 | schema v2、v1非破壊migration、Research Fact | `src/domain/types.ts`, `migration.ts` | 型一括置換を避け、旧型を互換層として残し段階移行 |
| 12 動的評価 | 固定weightを廃止 | profile/criterion、暫定score、coverage、比例変換 | `scoring.ts`, `profileManagement.ts`, `ScoringSettings.tsx` | 未評価を0点にせず評価済みweightだけで計算 |
| 13 Company Master | 名称を主キーにしない | 恒久ID、alias/domain候補、custom/link | `companyMatching.ts`, `catalogData.ts` | 曖昧候補の自動mergeを禁止 |
| 14 AI Sync / Watch | ChatGPT調査結果を安全に扱う | Zod、diff preview、個別承認、dedup、Watch Center | `aiSync.ts`, `watch.ts`, `AiSync.tsx` | AI読込即反映をtransaction flowへ変更 |
| 15 Auth / Drive | 複数端末用の保存境界を作る | GIS Token model、appDataFolder、version+revision競合停止 | `googleAuth.ts`, `googleDriveStorage.ts` | 本人認証はせずMock/contract 28件まで確認 |
| 16 v2テスト | 回帰とAcceptance Criteriaを確認 | unit/component 119件、Edge機能E2E 6件、lint/type/build成功 | `src/**/*.test.*`, `e2e/core-flow.spec.ts` | selector重複をrole指定へ修正、Node PATH差は同梱Nodeで実行 |
| 17 v2リリース監査 | テスト、docs、画像、security、Gitを整合 | Edge機能E2E 6件＋撮影2件、Phase 11〜17、portfolio、最終監査 | `README.md`, `docs/`, `e2e/screenshots.spec.ts` | 過去画像を保護し、新Phaseだけへ架空データを撮影 |
| 18 公開デモ | URLだけで架空デモを共有 | GitHub PagesでHTTPS公開、本人用停止、build 4ファイルだけ配信 | `vite.config.ts`, Phase 18証跡 | 全source pushを安全審査で停止し、公開payloadを最小化 |
| 19 Pages + Google本人用 | 静的URLから各自のDriveを使う | 公開入口、Actions Variable、401再接続、local v1/v2選択、account分離 | `App.tsx`, workflow, Google E2E, Phase 19証跡 | 実Google本人試験は残し、Mock/E2Eと公開コードを先に完成 |

Phase 0〜10は初版として歴史を保持しています。Phase 11以降が、実際に使って見えた「複数端末、企業表記、固定ランキング、情報源、AI差分」の課題へ対応したv2です。
