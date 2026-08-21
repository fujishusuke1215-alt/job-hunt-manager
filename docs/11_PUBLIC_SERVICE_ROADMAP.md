# 公開サービス化ロードマップ

## 現在の中心価値

受ける企業を登録した後、選考・評価・採用情報の変化・次の行動を継続管理することです。企業検索サイトや広告サービスは今回の実装範囲ではありません。

## v2で作る境界

- Auth Provider
- Storage Repository
- Catalog Repository
- Watch Provider
- AI import service

この境界により、将来バックエンドを追加しても既存UI全体を書き直さずに済むことを目指します。

## 将来再評価するもの

1. Gmail/Web定期監視が必要になった時点で安全なバックエンドとscheduler。
2. 公開企業ページが主機能になった時点でSSG/SSR/Next.jsまたは別public frontend。
3. 複数利用者向け中央Catalogの運営・修正・出典管理。
4. 公開企業情報/記事だけを対象とする広告。

個人の応募状況、面接、メモ、評価、Watch Findingを広告事業者へ送らない方針です。

## 今回未実装

- 一般企業検索・SEO企業ページ
- Gmail自動監視
- 採用Web定期巡回
- OpenAI/Gemini等の有料API
- バックエンドpush通知
- 広告

