# Watch基盤設計

更新日: 2026-08-21

## 今回できること

ChatGPT等から手動で取り込んだWatch Findingを保存し、新規・要対応・完了・企業・severityで整理します。今回のReact SPA自身はGmailや採用ページを巡回しません。

```ts
interface WatchProvider {
  preview(input: unknown, context: WatchContext): Promise<WatchPreview>
}
```

実装するproviderは`ManualAiImportWatchProvider`だけです。`GmailWatchProvider`と`RecruitmentWebWatchProvider`は将来のcontract名として記録しますが、動作中に見せるUIは作りません。

## WatchFinding

- `id`
- `userCompanyId`
- `masterCompanyId`
- `type`
- `severity: high | medium | low`
- `title` / `summary`
- `detectedAt` / `deadline`
- `source`
- `status: new | seen | completed | dismissed`
- `fingerprint`

## 重複防止

`operationId`と`fingerprint`を使います。同じ内容を再取込しても追加せず、completedをnewへ戻しません。締切や本文の意味が変わった場合は別fingerprintまたは更新差分として扱います。

## 今日の要対応

企業適合度ランキングとは別の、透明な規則で並べます。

1. 期限超過
2. 24時間以内
3. 3日以内
4. 7日以内
5. severity high
6. 同条件なら企業適合度
7. さらに同じなら企業表示名とFinding ID

AIに順位を直接決めさせません。利用者は「なぜ上にあるか」を説明できます。

## Gmail/Web監視が将来扱いである理由

Gmail本文を一般公開サービスで扱うにはRestricted OAuth scope、Google verification、token管理、プライバシー、セキュリティ評価の検討が必要です。ブラウザーを閉じている間の毎朝処理にはバックエンドまたはschedulerも必要です。

今回はGmail scope、Gmail本文取得、Web定期巡回、`setInterval`による偽の毎朝監視を実装しません。

