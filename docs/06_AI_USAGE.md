# AI利用の記録 v2

## 前提

このプロジェクトはAI協働開発です。「全コードを人間が手書きした」とは説明しません。ユーザーが実務課題、v2仕様、安全/無課金条件、Acceptance Criteriaを決め、Codexが監査、設計補完、実装、テスト、修正、文書初稿を支援しました。

## ユーザーが決めたもの

- 中心価値は企業検索ではなく、登録後の選考・変化・締切・優先順位の継続管理。
- 既存UI、Git履歴、Phase 0〜10を保持し、ゼロから作り直さない。
- Company Master/User Company/Research Fact/Scoring/Watch/Storage/Authの分離。
- 固定ランキング廃止、未評価を0点にしない計算、coverage。
- v1原文・ID・event・memoを失わないmigration。
- AI差分preview/個別承認とWatch、Google Drive appDataFolder。
- Gmail scope、有料API、Billing、カード、外部公開、実データを禁止。
- 実Google試験ができない場合はMockまでで、確認済みと誇張しない。

## Codexが設計補完したもの

- Zodをruntime validatorとして1依存追加。
- production未設定時を`disabled`、dev localを画面に明示するruntime config。
- Driveの同名複数ファイルを競合として停止。
- Drive versionとAppData revisionのopaque token契約。
- 保存をform submit等の明示操作単位でqueue。
- 一般評価テンプレートと決定的tie-break。
- AI Sync diffの表示形式、import history、provider contract。
- Watchの期限帯→severity→score→企業名→IDという透明な順序。

## Codexが実装したもの

- schema v2、v1 migration、Company matching、scoring、Research Fact。
- AI Sync/Watch、Local/Drive repository、GIS Auth provider。
- 既存React/CSSへの画面統合、responsive navigation。
- unit/component/E2E、架空データ、evidence、portfolioの更新。
- Gitをv2の主要phase単位で追加。

## 実際に検証できたもの

- TypeScript、ESLint、production build。
- unit/component 119件（24ファイル）。
- Edge機能E2E 6件: demo、検索、詳細、選考、本人用CRUD/保存、dynamic scoring、AI Sync、Watch、v1 migration、v2 download。証跡撮影2件も合わせ、Playwrightは計8件成功。
- Mock Google Auth/Drive 28件: login states、scope allowlist、load/save、retry、permanent failure、conflict、v1原文退避。
- 既存4commitとPhase 0〜10の保持、秘密情報pattern監査。

## 実環境で未確認のもの

- Google CloudのClient ID作成とconsent画面。
- 本人Googleログイン/2FA。
- 実Drive appDataFolderのPC→別端末同期。
- 実Drive API responseに対する競合raceの挙動。
- 外部hosting/GitHub push/OAuth本番verification。

よって「Google Drive実同期確認済み」とは説明しません。「公式仕様に基づくコードとMock/contractまで完成、本人アカウント試験は未実施」と説明します。

## AIをブラックボックスにしない確認方法

1. `docs/01_REQUIREMENTS.md`でユーザー決定とAI補完を区別する。
2. `src/domain/`で計算、matching、validationを読む。
3. 対応する`.test.ts(x)`で期待動作を確認する。
4. `git log --oneline`とphase evidenceで変更順を見る。
5. UIでsource、verification、coverage、diff、sync statusを見る。
6. 未実装をroadmapと現在機能に分ける。

## 面接30秒説明

「実際の就活管理課題と安全条件は自分で定義し、Codexを設計レビュー、実装、テスト作成に使いました。生成物をそのまま採用せず、要件対応表、Zod検証、119件のunit/component、6件のEdge機能E2Eと2件の撮影テスト、Git差分で確認しました。特にAI取込は即時更新させず、差分previewと人の承認を必須にしています。実Google接続など未確認部分も明記しています。」

## ユーザーが今後すること

- Phase 11〜17の理解度チェックへ、READMEを見ずに答える。
- `Company → UserCompany/Master/Fact`の変更を紙に描く。
- 30秒説明を自分の言葉へ直し、追質問へ答える。
- Google設定をするなら本人が公式画面と料金を再確認し、秘密情報を入力しない。
