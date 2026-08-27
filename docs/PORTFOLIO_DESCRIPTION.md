# Job Hunt Manager — Portfolio Description

## 30秒説明

Job Hunt Managerは、就活で散らばるGmail、MyPage、選考予定、締切、企業評価を「次にやること」へ集約する本人用Webアプリです。Owner専用のGmail Collectorが本文をルール解析し、明確なWebテスト期限・面接予約・提出完了だけを根拠付きActionと選考履歴へ自動反映します。ホームでは優先度だけでなく、日程重複時の企業評価も比較できます。

## 1〜2分説明

課題は情報不足ではなく、メール、採用サイト、MyPage、カレンダー、評価メモを毎日探し直すことでした。このアプリは、企業・選考・評価を本人データとして管理し、Owner Apps Scriptが採用メールを収集します。メール本文から対応種別と日本時間の日時を抽出し、企業一致が高確度の場合だけActionを作成します。受付完了や提出完了は履歴、期限や予約はホームの要対応として分けるため、「ありがとうメール」がTodoに混ざりません。

面接・説明会・テストセンターの予定は開始／終了時刻から重複を検出します。アプリは辞退判断を自動化せず、企業名、順位、総合点、評価充足率、現在の選考段階を比較する情報だけを表示します。

## 開発課題と工夫

- 日本語採用メールの日時表現、年またぎ、添付付きメールを扱い、曖昧な内容は推測で確定しない
- Gmail message IDを保持して、安定したGmail検索リンクから元メールを開けるようにした
- Actionは種別・期限／開始／終了・根拠・MyPage URL・確信度を保持し、再処理でも重複しない
- 新規企業だけを名前・別名・送信元ドメインで限定検索するbackfill queueを用意し、全メール再検索を避けた
- Rankingは未評価を0点として扱わず、未評価であることを明示した

## 本人用自動化と公開Demo

公開Demoは完全に架空データのみです。本人用のGmail AutomationはOwner Apps Script、Supabase Edge Function、RLSで分離しています。通常のGoogle LoginはGmail権限を要求せず、ブラウザがRestricted Gmail APIを直接呼ぶこともありません。

## Architecture

```text
Gmail (Owner Apps Script) / Web Collector
  → Supabase Edge Function
  → Finding・監査ログ・企業解決
  → canonical Action / 選考履歴
  → Dashboard（Today / Upcoming / Conflict comparison）
```

## セキュリティ

- Supabase RLSで本人ごとにデータを分離
- OAuth secret、service role、collector tokenを公開コードやブラウザに置かない
- Gmail本文全文、password、認証コードを保存しない
- MyPage Login IDは本人用RLS領域だけに保存し、private CSVはGit管理から除外
- Demoに実在企業・メール識別子・Login IDを含めない

## 難しかった点

自動化の便利さと誤判定・個人情報のリスクを両立する点です。明示的な事実は自動化し、曖昧な合否や企業一致は例外として残すことで、毎日確認する量を減らしながら誤った選考更新を避けています。

## 今後の改善

- 企業別ルールを本人画面で調整する機能
- 複数メールの根拠を1件のActionカードで時系列表示する機能
- カレンダーとの任意連携（本人の明示操作時のみ）
