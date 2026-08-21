# 技術選定 v2

| 技術 | 用途 | v2で採用した理由 | 今回見送った代替 |
|---|---|---|---|
| React 19 | 既存UI、状態、画面 | 良好なUIと履歴を維持し、追加画面をcomponent化できる | 全面Next.js移行は公開SEOが主目的でない |
| TypeScript 5 | domain/interface | Company/User/Fact/Storageの境界を開発時に検査 | JavaScriptだけでは多いmodelの取り違えが増える |
| Vite 7 | dev/build | SPAとDrive RESTをブラウザーで扱え、既存構成を保てる | backend frameworkは定期処理をしない今回不要 |
| Zod 4 | runtime validation | backup、AI、DriveはTypeScript型だけでは守れない | 手書きvalidationの重複を避ける |
| pnpm 11 | 依存固定 | 既存lockfile/packageManagerを維持 | npmへの変更は履歴と再現性を崩す |
| localStorage | 明示的dev、v1互換 | Google設定なしでMock/E2E可能 | productionの黙ったfallbackにはしない |
| Google GIS Token model | browser認可境界 | backendなしSPA向けの現行公式手段 | deprecatedなgapi.auth2を採用しない |
| Drive REST appDataFolder | 個人cloud正本候補 | 非表示のapp専用領域、`drive.appdata`限定 | Spreadsheet、中央DB、広いDrive scopeを使わない |
| Vitest/Testing Library | domain/component | 移行、計算、UIを高速に分離検証 | E2Eだけでは原因特定が遅い |
| Playwright + Edge | E2E/画像 | Windows既存ブラウザーで主要flowとWeb部分撮影 | desktop全体撮影は個人情報リスク |
| 独自CSS | UI維持/モバイル | 現行デザインを保ち、追加依存を避ける | UI framework全面導入は不要 |
| Git | 学習証跡 | 初版4commitを残し、v2をphase単位で追加 | squash/re-initは禁止 |

## React/Viteを維持した判断

既存のDashboard、一覧、詳細、form、CSSが完成しており、今回の手動AI SyncとDrive RESTはSPAで実装できます。SEO向け公開企業ページも、browserを閉じた後の定期処理も今回の主目的ではありません。そのためframework移行より、Auth/Storage/Catalog/Watchと将来用AiProvider contractの境界へ時間を使いました。AiProviderの実装クラスや有料AI API呼出しは今回ありません。

## Zodを1つ追加した理由

型注釈はbuild時だけで、利用者が選んだJSONやDriveから来るJSONの中身を保証しません。Zodにより`parse → validate → preview → commit`を実装し、invalid inputで現データを変えないテストを書けます。依存を過剰に増やさず、この目的に必要な1つだけ追加しました。

## 無料・課金方針

React等はOSSです。今回Billing、カード、有料hosting、有料DB、有料AI APIは使いません。架空データの公開demoは公開repository向けの無料GitHub Pagesを使い、カスタムドメインも購入していません。Google Drive APIは標準利用が現時点で追加費用なしと公式案内されていますが、quota超過課金方針は変更され得ます。設定時に公式情報を再確認し、Billing accountを紐付けず、要求されたら作業を止めます。

## 開発環境で実際に起きたこと

ZIP由来の`node_modules`はpnpm link/ACLを信用せず、lockfileから再構築しました。Codex shellでNodeが通常PATHに見えない場面は、同梱の公式ワークスペースNode実行ファイルからCLIを直接起動して検証しました。これはアプリのbugではなく実行環境差です。

## 将来の再評価条件

- Gmail/採用Webの定期監視: backend、scheduler、OAuth審査を追加検討。
- 一般企業検索/SEOが中心: SSG/SSR/Next.jsまたは別public frontendを検討。
- 複雑な共有編集: server DBと原子的な競合制御を検討。

それまではFastAPI、PostgreSQL、Docker、Kubernetes、Redis、AWS、Firebase central DB、microservicesを追加しません。
