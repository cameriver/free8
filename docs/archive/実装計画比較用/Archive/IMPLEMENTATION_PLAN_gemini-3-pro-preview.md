# 実装計画書：アカウント機能導入と構造刷新

**タグ**: @実装計画比較用
**作成モデル**: gemini-3-pro-preview

---

## 1. 概要

本プロジェクト「Free Eight」において、将来的な複数人プレイ・アカウント登録機能の導入を見据え、アプリケーションのディレクトリ構造の刷新およびデータベース導入を行う計画です。

現状の `server.js` 単一ファイル構成から、機能ごとに責務を分離したモダンな MVC (Model-View-Controller) + Service 構成へと移行します。

## 2. 推奨技術スタック

| カテゴリ | 推奨技術 | 選定理由 |
| :--- | :--- | :--- |
| **ランタイム** | **Node.js** | 既存資産の活用。 |
| **フレームワーク** | **Express** | 既存資産の活用。 |
| **データベース** | **SQLite** (開発) <br> **PostgreSQL** (本番) | アカウント情報・戦績の永続化。開発の手軽さと本番の堅牢性を両立。 |
| **ORM** | **Prisma** | SQLを直接書かずに安全かつ直感的にDB操作が可能。スキーマ管理が容易。 |
| **認証** | **Passport.js** <br> + **express-session** | Node.jsにおける標準的な認証ミドルウェア。拡張性が高い。 |

## 3. 新ディレクトリ構造案

ルートディレクトリに `src` を新設し、バックエンドのロジックを集約します。

```text
Free Eight/
├── prisma/                # [新規] データベース設定・スキーマ定義
│   └── schema.prisma      # DBの設計図
├── public/                # [既存] フロントエンド静的ファイル
│   ├── css/               # スタイルシート (整理推奨)
│   ├── js/                # クライアントサイドJS (整理推奨)
│   └── index.html
├── src/                   # [新規] バックエンドソースコード
│   ├── config/            # 環境変数や定数設定 (passport設定など)
│   ├── controllers/       # リクエストハンドラ (司令塔)
│   │   ├── authController.js  # 認証関連
│   │   └── gameController.js  # ゲームAPI関連
│   ├── routes/            # ルーティング定義 (URLの設計)
│   │   ├── auth.js        # /auth/login, /auth/register 等
│   │   └── api.js         # /api/game 等
│   ├── services/          # ビジネスロジック (実務処理)
│   │   ├── gameService.js   # トランプのルール、勝敗判定ロジック
│   │   ├── socketService.js # Socket.IO イベントハンドリング
│   │   └── userService.js   # ユーザーデータの加工処理
│   ├── utils/             # 汎用ユーティリティ
│   └── app.js             # Expressアプリの初期化・構成
├── server.js              # [変更] エントリーポイント (src/app.jsを起動するのみに軽量化)
└── package.json
```

## 4. 実装ステップ

既存のゲーム機能を壊さずに移行するため、以下の4フェーズで進めます。

### Phase 1: 基盤整理 (Refactoring)
まず機能追加は行わず、既存コードを整理します。
1. `src` ディレクトリを作成。
2. `server.js` 内の定数（`CARD_POINTS` など）やユーティリティ関数（`shuffle` など）を `src/utils` や `src/services/gameService.js` に移動。
3. `server.js` を、これら読み込んで動くように修正。

### Phase 2: データベース導入 (Database Setup)
1. `Prisma` をインストール (`npm install prisma --save-dev`)。
2. `prisma/schema.prisma` を作成し、`User` (ユーザー), `GameResult` (戦績) モデルを定義。
3. データベースの初期化 (Migration)。

### Phase 3: 認証機能の実装 (Authentication)
1. ユーザー登録・ログイン用の API ルート (`src/routes/auth.js`) を作成。
2. `Passport.js` を設定し、ログイン処理を実装。
3. フロントエンドに「登録」「ログイン」画面 (HTML/JS) を追加。

### Phase 4: ゲームとユーザーの統合 (Integration)
1. Socket.IO の接続時に、セッションからログインユーザー情報を取得するように変更。
2. ゲーム開始時・終了時に、ゲスト名ではなく「登録ユーザー名」を使用。
3. ゲーム終了時、DBの `GameResult` テーブルに結果を保存する処理を追加。

## 5. データベース設計案 (schema.prisma)

```prisma
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  password  String   // ハッシュ化して保存
  createdAt DateTime @default(now())
  results   GameResult[]
}

model GameResult {
  id        Int      @id @default(autoincrement())
  playedAt  DateTime @default(now())
  score     Int
  rank      Int      // 1位, 2位...
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
}
```

## 6. 非エンジニアの方へのアドバイス

*   **バックアップ**: 作業前には必ずフォルダごとコピーを取るか、Gitでコミットしておきましょう。
*   **段階的なリリース**: 一気に全部やろうとせず、「まずはフォルダ分けだけ」「次はDB入れるだけ」とステップを区切るのが成功の鍵です。
*   **Prisma Studio**: `npx prisma studio` というコマンドを使うと、ブラウザ上でエクセルのようにデータベースの中身を見たり編集したりできるので便利です。


