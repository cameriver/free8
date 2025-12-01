# Free Eight アカウント機能 実装計画書

**作成モデル**: Claude Opus 4 (claude-opus-4-20250514)  
**作成日**: 2025年11月28日  
**対象**: Free Eight オンラインカードゲーム

---

## 1. 現状分析

### 1.1 現在の技術スタック

| 項目 | 現状 |
|------|------|
| フロントエンド | Vanilla JavaScript (IIFE パターン) |
| バックエンド | Node.js + Express (`server.js` 867行) |
| リアルタイム通信 | Socket.IO |
| データ永続化 | なし（インメモリ、LocalStorage ID のみ） |
| 認証 | なし |
| ホスティング | Heroku |

### 1.2 現在の課題

- サーバー再起動でゲーム状態・スコアが消失
- ユーザーアカウント機能なし
- 対戦履歴の永続化なし
- `server.js` が867行の単一ファイルで保守性が低い

---

## 2. 提案する技術構成

### 2.1 認証方式：Googleログインのみ（ソーシャルログイン）

**選定理由**:

| 観点 | メリット |
|------|---------|
| セキュリティ | パスワード管理不要、漏洩リスク低減 |
| 運用負荷 | パスワード忘れ対応・メール送信システム不要 |
| ユーザー体験 | ボタン1つでログイン完了 |
| 実装コスト | Supabase なら設定のみで実装可能 |

**将来の拡張性**: 必要に応じてメール+パスワード認証を追加可能

### 2.2 バックエンド構成：Supabase + Railway

```
┌─────────────────────────────────────────────────────────┐
│                      クライアント                        │
│                  (Vercel / 静的ホスト)                   │
└─────────────────┬───────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────────┐         ┌─────────────────┐
│  Supabase   │         │    Railway      │
│ ─────────── │         │ ─────────────── │
│ • 認証(Auth)│         │ • Socket.IO     │
│ • PostgreSQL│◄────────│ • ゲームロジック │
│ • 管理画面  │         │ • リアルタイム   │
└─────────────┘         └─────────────────┘
```

**Supabase 選定理由**:
- Googleログインが管理画面から設定するだけで実装可能
- PostgreSQL が無料枠で利用可能（500MB）
- 非エンジニアでもブラウザから管理可能
- 日本語ドキュメントあり

**Railway 選定理由**:
- Socket.IO（WebSocket）に対応
- GitHub連携で自動デプロイ
- 従量課金で小規模なら月$5程度

---

## 3. ディレクトリ構造

### 3.1 現状

```
free-eight/
├── package.json
├── server.js              ← 867行の単一ファイル
├── README.md
├── GAME_MANUAL.md
└── public/
    ├── index.html         ← HTML + CSS + JS が混在
    └── standalone.html
```

### 3.2 提案構造

```
free-eight/
├── package.json
├── README.md
├── GAME_MANUAL.md
├── .env.example                    # 環境変数サンプル
│
├── src/                            # サーバーサイド
│   ├── index.js                    # エントリーポイント（10行程度）
│   ├── app.js                      # Express + Socket.IO 初期化
│   │
│   ├── config/
│   │   ├── env.js                  # 環境変数読み込み
│   │   └── supabase.js             # Supabase クライアント初期化
│   │
│   ├── game/                       # ゲームロジック（純粋関数）
│   │   ├── deck.js                 # デッキ生成・シャッフル
│   │   ├── cards.js                # カード情報・点数計算
│   │   ├── room.js                 # ルーム状態管理
│   │   ├── rules.js                # プレイ可否判定
│   │   └── scoring.js              # 勝敗・スコア計算
│   │
│   ├── socket/                     # WebSocket 処理
│   │   ├── index.js                # Socket.IO イベント登録
│   │   ├── auth.js                 # JWT 検証ミドルウェア
│   │   ├── room-handlers.js        # 入室・退室・投票
│   │   └── game-handlers.js        # ゲーム操作（play, draw, ron）
│   │
│   └── db/                         # データベース操作
│       ├── users.js                # ユーザー CRUD
│       └── games.js                # 対戦履歴 CRUD
│
├── public/                         # フロントエンド
│   ├── index.html                  # メインページ（構造のみ）
│   ├── standalone.html
│   │
│   ├── css/
│   │   └── style.css               # スタイル分離
│   │
│   └── js/
│       ├── main.js                 # アプリ初期化・状態管理
│       ├── auth.js                 # Supabase 認証処理
│       ├── socket.js               # WebSocket 通信
│       ├── game.js                 # ゲームUI操作
│       └── components/
│           ├── card.js             # カード描画
│           ├── modal.js            # モーダル表示
│           └── scoreboard.js       # スコアボード
│
└── docs/                           # ドキュメント
    └── IMPLEMENTATION_PLAN_claude-opus-4.md
```

### 3.3 ファイル分割の方針

| ディレクトリ | 責務 | 変更頻度 |
|-------------|------|---------|
| `src/game/` | ゲームルール・計算ロジック | ルール変更時のみ |
| `src/socket/` | WebSocket イベント処理 | 機能追加時 |
| `src/db/` | データベース操作 | スキーマ変更時 |
| `public/js/` | UI・ユーザー操作 | UI改善時 |

---

## 4. データベース設計

### 4.1 テーブル構成

```sql
-- ユーザーテーブル（Supabase Auth と連携）
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name VARCHAR(50) NOT NULL,
  avatar_url TEXT,
  total_score INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 対戦履歴
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  winner_id UUID REFERENCES profiles(id),
  win_type VARCHAR(20), -- 'tsumo', 'ron', 'ron_gaeshi', 'draw'
  player_count INTEGER NOT NULL
);

-- 対戦参加者
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  seat_number INTEGER NOT NULL,
  score_change INTEGER DEFAULT 0,
  is_winner BOOLEAN DEFAULT FALSE
);

-- インデックス
CREATE INDEX idx_games_winner ON games(winner_id);
CREATE INDEX idx_games_ended ON games(ended_at DESC);
CREATE INDEX idx_game_players_user ON game_players(user_id);
```

### 4.2 Row Level Security (RLS)

```sql
-- プロフィールは本人のみ更新可能
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "プロフィール閲覧は全員可能"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "プロフィール更新は本人のみ"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- 対戦履歴は全員閲覧可能、挿入はサーバーのみ
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "対戦履歴は全員閲覧可能"
  ON games FOR SELECT USING (true);
```

---

## 5. 実装フェーズ

### Phase 1: コード分割（2-3日）

**目標**: 現在の `server.js` を保守しやすい構造に分割

| タスク | 詳細 | 工数 |
|--------|------|------|
| ディレクトリ作成 | `src/`, `public/js/`, `public/css/` | 0.5h |
| ゲームロジック分離 | `deck.js`, `cards.js`, `rules.js`, `scoring.js` | 4h |
| Socket処理分離 | `room-handlers.js`, `game-handlers.js` | 3h |
| フロントエンドJS分離 | `index.html` から JS を抽出 | 3h |
| 動作確認 | 既存機能が正常動作することを確認 | 2h |

**成果物**: 分割後も現在と同じ動作をするコード

---

### Phase 2: Supabase + 認証（3-4日）

**目標**: Googleログインでアカウント作成・ログインできる

| タスク | 詳細 | 工数 |
|--------|------|------|
| Supabase プロジェクト作成 | 管理画面から作成 | 0.5h |
| Google OAuth 設定 | GCP + Supabase 設定 | 1h |
| テーブル作成 | `profiles`, `games`, `game_players` | 1h |
| フロントエンド認証UI | ログインボタン、ユーザー表示 | 3h |
| Socket認証連携 | JWT でユーザー識別 | 2h |
| ゲスト互換維持 | ログインなしでもプレイ可能 | 2h |
| 動作確認 | ログイン→ゲーム→ログアウト | 2h |

**成果物**: Googleログインでプレイできるアプリ

---

### Phase 3: データ永続化（2-3日）

**目標**: 対戦履歴・スコアがDBに保存される

| タスク | 詳細 | 工数 |
|--------|------|------|
| ゲーム終了時のDB保存 | `games`, `game_players` への INSERT | 2h |
| ユーザースコア更新 | `profiles.total_score` 等の更新 | 1h |
| 対戦履歴画面 | 過去の対戦一覧表示 | 3h |
| ランキング画面 | スコア上位者表示 | 2h |
| 動作確認 | データが正しく保存・表示されるか | 2h |

**成果物**: 対戦履歴・ランキングが見られるアプリ

---

### Phase 4: デプロイ（1-2日）

**目標**: 本番環境で動作する

| タスク | 詳細 | 工数 |
|--------|------|------|
| Railway セットアップ | GitHub連携、環境変数設定 | 1h |
| Vercel セットアップ（オプション） | 静的ファイルホスティング | 0.5h |
| 本番環境変数設定 | `DATABASE_URL`, `SUPABASE_*` | 0.5h |
| DNS設定（オプション） | カスタムドメイン | 1h |
| 本番動作確認 | 全機能テスト | 2h |

**成果物**: 公開URL でアクセス可能なアプリ

---

## 6. 工数サマリー

| フェーズ | 工数目安 | 累計 |
|---------|---------|------|
| Phase 1: コード分割 | 2-3日 | 2-3日 |
| Phase 2: 認証 | 3-4日 | 5-7日 |
| Phase 3: データ永続化 | 2-3日 | 7-10日 |
| Phase 4: デプロイ | 1-2日 | **8-12日** |

※ 非エンジニアの方が AI アシスタントと一緒に進める場合の目安

---

## 7. リスクと対策

### 7.1 技術的リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| Supabase 無料枠超過 | サービス停止 | 使用量モニタリング、有料プラン検討 |
| Railway 従量課金増加 | コスト増 | 使用量アラート設定 |
| WebSocket 接続上限 | 同時接続制限 | ユーザー数に応じてプラン変更 |

### 7.2 運用リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| 不正アカウント | スパム、荒らし | Googleログインで抑制、通報機能 |
| データ損失 | ユーザー離脱 | Supabase 自動バックアップ有効化 |
| サービス障害 | プレイ不可 | ステータスページ確認、復旧手順文書化 |

---

## 8. 将来の拡張案（優先度順）

| 機能 | 概要 | 優先度 |
|------|------|--------|
| フレンド機能 | ユーザー同士の登録・招待 | 中 |
| 招待リンク | URLでルームに直接参加 | 高 |
| 観戦モード | ゲームを見るだけの参加 | 低 |
| リプレイ機能 | 過去の対戦を再生 | 低 |
| プッシュ通知 | フレンドがオンライン時に通知 | 低 |

---

## 9. 次のアクション

1. **この計画書の承認** → 修正点があればフィードバック
2. **Phase 1 開始** → `server.js` のコード分割から着手
3. **Supabase アカウント作成** → https://supabase.com で無料登録

---

**作成**: Claude Opus 4 (claude-opus-4-20250514)  
**最終更新**: 2025年11月28日


