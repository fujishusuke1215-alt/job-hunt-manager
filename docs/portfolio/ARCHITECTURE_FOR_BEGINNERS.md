# 初心者向け構成説明

## 画面で登録したとき何が起きるか

```text
入力欄へ企業名を書く
  ↓
CompanyForm が必須項目を確認
  ↓
App が Company という1社分のデータを作る
  ↓
本人用なら storage がJSON文字列に変換
  ↓
ブラウザーのlocalStorageへ保存
  ↓
CompanyList と Dashboard が同じデータから再表示
```

## 主なファイル

| ファイル | 一言でいうと |
|---|---|
| `src/types.ts` | データの設計図 |
| `src/App.tsx` | 操作とデータをつなぐ司令塔 |
| `src/components/CompanyForm.tsx` | 企業の入力・編集画面 |
| `src/components/CompanyDetail.tsx` | 企業詳細と選考予定CRUD |
| `src/services/storage.ts` | 保存・復元・バックアップ検証 |
| `src/utils/scoring.ts` | 100点の計算 |
| `src/utils/deadlines.ts` | 締切までの日数 |
| `src/utils/companyFilters.ts` | 検索・絞り込み・並び替え |

## CompanyとSelectionEvent

Companyは1社分、SelectionEventは1つのES・テスト・面接です。Companyの中に `events: SelectionEvent[]` があるため、1社が何件でも予定を持てます。

## 状態と保存値

Reactのstateは、今画面で使うデータです。本人用モードではstateが変わるたびlocalStorageへ保存します。検索語や開いている画面は一時的な状態なので企業データへ保存しません。

## ダッシュボードは別データではない

登録企業数、状態別件数、直近締切、ランキングはCompany配列から毎回計算します。同じ値を二重保存しないため、更新忘れによる矛盾を減らせます。

## なぜAPIとDBがないか

APIはブラウザーとサーバーの受付、DBはサーバー側の保存庫です。複数端末・複数利用者には有効ですが、初版の1人・1ブラウザーには必須ではありません。今回は保存を `storage.ts` に隔離したため、将来必要になったらここをAPI呼び出しへ置き換えられます。

## まず説明できればよい5点

1. Reactが画面、TypeScriptがデータ形を担当する。
2. Companyが複数SelectionEventを持つ。
3. Appが状態を持ち、部品へ渡す。
4. 本人用だけlocalStorageへ保存する。
5. 検索とダッシュボードは保存値から都度計算する。

