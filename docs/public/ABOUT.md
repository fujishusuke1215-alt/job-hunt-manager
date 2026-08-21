# Job Hunt Managerについて（公開用ドラフト）

最終更新日: 2026-08-21

> **公開前ドラフト**
> サービス紹介ページへ掲載できるようにした草案です。一般公開前に運営者本人が名称、連絡先、実Google試験結果、法的文書を確認してください。

公開デモ: <https://fujishusuke1215-alt.github.io/job-hunt-manager/>

このURLは架空データ専用で、本人用保存を無効化しています。

## サービスの目的

Job Hunt Managerは、企業を検索して終わるサービスではありません。

中心にあるのは、利用者が応募・検討する企業を登録した後、選考状況、締切、企業評価、採用情報の変化を1か所で管理し、「次に何をするか」を自分で説明できる状態を作ることです。

## 現在できること

- 企業と選考予定の登録、編集、削除
- 期限超過、24時間・3日・7日以内の予定確認
- 検索、絞り込み、並び替え
- 利用者が項目、最大点、重み、順番を変えられる企業評価
- 総合点と評価充足率を分けたランキング
- 出典、確認日、対象年度、検証状態を持つResearch Fact
- JSONバックアップとv1/v2 import preview
- ChatGPT等で作ったAI Sync JSONの差分確認と、承認後の反映
- 手動import等で得たWatch Findingの整理
- 完全な架空企業だけを使う公開デモ
- Google設定時のDrive appDataFolder保存基盤
- Googleなしで開発・E2Eを行う明示的なローカル開発モード

## 情報をブラックボックスにしない設計

ランキングは固定のAI判断ではなく、利用者自身が設定した項目と重みから再計算します。未評価を0点にせず、暫定点と評価充足率を表示します。

企業情報は値だけでなく、出典、確認日、対象年度、確認状態、AI整理の有無を分けます。AIは一次情報として扱いません。情報は変更される可能性があるため、応募前に公式情報を確認してください。

## Google Driveとプライバシー

Googleモードでは、Personal dataの正本を利用者自身のDrive appDataFolderへ保存します。要求するscopeは`openid`、`email`、`profile`、`drive.appdata`だけです。通常のDriveファイル全体やGmailへアクセスする権限は要求しません。

OAuth access tokenはメモリだけに保持し、localStorageやJSONへ保存しません。利用者はv2 JSONを自分の端末へ書き出せます。詳しくは[プライバシーポリシー（ドラフト）](PRIVACY_POLICY_DRAFT.md)と[Googleデータ利用方針（ドラフト）](GOOGLE_DATA_USAGE.md)を確認してください。

## WatchとAI Syncの現在地

現在の運用は次のとおりです。

```text
ChatGPT等で調査・整理
  ↓
AI Sync JSONを手動で渡す
  ↓
Job Hunt Managerでvalidationと差分preview
  ↓
本人が選択・承認
  ↓
企業情報・Watch Findingへ反映
```

AI JSONを読み込んだだけでは本データを書き換えません。曖昧な企業照合やdeleteは追加確認なしに実行しません。

## 現在できないこと

- Gmailの読取やメール自動監視
- 採用Webページの定期自動巡回
- ブラウザーを閉じている間の毎朝監視
- 一般向けの大量企業検索・SEO企業ページ
- 広告表示やPersonal dataを使う広告最適化
- 有料AI APIによる自動判断

Gmail/Webの自動監視には、将来、追加scope、Google verification、token管理、プライバシー対応、バックエンドまたはschedulerが必要です。動いていない機能を動作中には見せません。

## Google連携の検証状況

Mock/contractテストでは、Driveのempty/existing、save/load、有限retry、permanent failure、version/revision conflict、v1原文退避と、認証の未ログイン、成功・失敗、logout、account switchを確認しています。Storage/Auth担当のMockテストは28件成功しました。

実Googleアカウント、本人のOAuth Client ID、2FA、別端末を使った確認は未実施です。公開前に本人が確認し、それまでは実Drive同期済みとは表示しません。保存前の競合検知とPATCHの間にはrace windowが残るため、原子的な競合防止も保証しません。

## 料金と広告

現在、有料サービスと広告は実装していません。Google APIの標準利用は現時点で追加費用なしと案内されていますが、quotaや将来の超過課金方針は変わり得ます。本プロジェクトはBilling account、カード、quota引上げ、有料trialを設定せず、Billing接続を求められた場合は停止して最新公式情報を本人が確認します。

## 運営者情報

運営者: `[公開前に氏名または事業者名を記入]`

サービスURL: `[公開後にURLを記入]`

連絡先: `[公開前に問い合わせ用メールアドレスまたはフォームURLを記入]`

利用条件は[利用規約（ドラフト）](TERMS_OF_SERVICE_DRAFT.md)を確認してください。各文書は公開前の草案であり、本人確認と必要な法的レビューが終わるまで正式版ではありません。
