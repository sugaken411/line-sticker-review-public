# LINE画像検証 - 要目視キュー拡張

既存index.htmlのv8/v9検証機能と保存領域は維持し、Gen用の要目視キューを追加する。
`gen-review.html` は `audit-core.js` と `audit-ui.js` を使用。
画像はDrive原本の縮小プレビューで、原本のDrive ID・SHA256を保持する。
画像/台帳の削除・改名・採用状態反映は行わない。

機械検査は文字の意味や文字欠けを完全判定しない。検出なしは内容QA合格ではない。
類似群はpHash距離6以下の辺の連結成分で、全要素の同一性を示さない。
採用指定は候補として記録し、群内の未選択は予備とする。削除しない。
保存は端末localStorage、JSONバックアップ/復元、任意のGoogle Drive OAuth同期。
OAuth設定・接続前はDriveへ自動保存されない。旧ツールと同じクライアントIDを利用可能。

実装・検証の詳細は `AUDIT_IMPLEMENTATION.md` を参照。
