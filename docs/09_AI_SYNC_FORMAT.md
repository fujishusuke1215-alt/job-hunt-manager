# AI Sync JSON形式

更新日: 2026-08-21

## 目的

ChatGPT等が調査・整理した候補を、構造化JSONとしてJob Hunt Managerへ渡します。AI出力は候補であり、読込だけでは本データを変更しません。

```text
JSON選択/貼付 → parse → runtime validation → company match → 差分preview
→ 個別選択 → 利用者承認 → commit → import履歴
```

## Envelope

```ts
interface AiSyncEnvelopeV1 {
  schemaVersion: 1
  generatedAt: string
  provider: string
  operations: AiSyncOperation[]
}
```

Operation:

- `operationId`: 再取込時の重複防止ID
- `entityType`: `userCompany | researchFact | selectionEvent | watchFinding | scoringProfile`
- `action`: `upsert | delete`
- `companyRef`: `masterCompanyId`、`companyName`、`officialDomain`の任意組合せ
- `payload`: entityごとの候補値
- `evidence`: 情報源候補

`delete`は通常の承認だけでは実行せず、追加確認を必要とします。

## 完全なダミー例

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-21T00:00:00.000Z",
  "provider": "manual-ai-example",
  "operations": [
    {
      "operationId": "op_demo_fact_001",
      "entityType": "researchFact",
      "action": "upsert",
      "companyRef": {
        "companyName": "株式会社サンプルテック",
        "officialDomain": "example.com"
      },
      "payload": {
        "key": "eligibility_existing_graduate",
        "label": "既卒応募",
        "value": "応募可",
        "recruitingCycle": "架空28卒",
        "roleScope": "架空技術職",
        "checkedAt": "2026-08-21T00:00:00.000Z",
        "verificationLevel": "official_confirmed",
        "reviewStatus": "draft",
        "processedByAi": true
      },
      "evidence": [
        {
          "type": "official_web",
          "title": "架空採用ページ",
          "url": "https://example.com/recruit-demo",
          "retrievedAt": "2026-08-21T00:00:00.000Z",
          "publishedAt": null,
          "note": "説明用の架空URL"
        }
      ]
    }
  ]
}
```

## 差分preview

previewは、対象企業、項目、現在値、候補値、出典、確認日、曖昧さ、操作種別を人が読める形で表示します。巨大JSONだけを表示しません。

次の場合はcommit不可です。

- JSON構文エラー
- schema違反
- URLがhttp/https以外
- company候補が複数で曖昧
- payloadがentity typeと不一致
- 未確認delete

commit前は元のAppDataを変更しません。選択したoperationだけを新しいAppDataへ適用し、成功後に`operationId`と履歴を保存します。

## 重複

- 既処理`operationId`は再適用しない。
- Watch Findingは`fingerprint`も確認する。
- completed Findingと同一内容をnewへ戻さない。
- 内容や締切が変わった場合は更新候補としてpreviewする。

## verificationLevel

- `official_confirmed`: 公式ページ等に明記
- `official_interpreted`: 公式資料を解釈して整理
- `third_party_correlated`: 複数の第三者情報が一致
- `unverified`: 根拠不足または旧データ

AI自身は一次情報ではありません。`processedByAi`と実際のSource typeを分けます。

## ChatGPTへ渡すプロンプト例

```text
添付したJob Hunt ManagerのAI分析用JSONを読み、完全な架空例ではなく私が提供した範囲だけを対象にしてください。出力はAiSyncEnvelopeV1のみとし、operationIdを一意にしてください。公式情報を使った場合はsource.type=official_web、AIが整理した事実はprocessedByAi=trueにしてください。不明点を推測でofficial_confirmedにせずunverifiedとしてください。deleteは提案しないでください。
```

個人的な面接メモは、利用者がAI分析用exportで明示的に含めた場合だけ外へ渡します。

