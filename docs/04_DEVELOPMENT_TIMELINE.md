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
| 9 テスト | 必須機能と回帰を確認 | lint/build成功、17 unit/component、3 E2E成功 | `src/*.test.*`, `e2e/` | VitestがE2Eも読んだため探索範囲を分離 |
