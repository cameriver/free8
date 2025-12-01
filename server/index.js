const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(express.static(path.join(PUBLIC_DIR, 'html')));
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));

// ゲーム状態管理
const rooms = new Map();

// カード点数表
const CARD_POINTS = {
  'A': 0.1,
  '2': 4,
  '3': 0.3,
  '4': 0.4,
  '5': 2,
  '6': 0.6,
  '7': 2,
  '8': 4,
  '9': 0.9,
  '10': 1,
  'J': 1,
  'Q': 1,  // Q♠は別処理
  'K': 1
};

// Q♠の点数
const QUEEN_SPADE_POINTS = 5;

// カードデッキ生成（2デック = 104枚）
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  
  // 2デック分生成
  for (let d = 0; d < 2; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(rank + suit);
      }
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCardInfo(card) {
  const suit = (card.match(/[♠♥♦♣]/) || [''])[0];
  const rank = card.replace(/[♠♥♦♣]/g, '');
  return { suit, rank };
}

// カードの点数を取得
function getCardPoints(card) {
  const { suit, rank } = getCardInfo(card);
  // Q♠は5点
  if (rank === 'Q' && suit === '♠') {
    return QUEEN_SPADE_POINTS;
  }
  return CARD_POINTS[rank] || 0;
}

// 手札の合計点数を計算
function calculateHandPoints(hand) {
  return hand.reduce((sum, card) => sum + getCardPoints(card), 0);
}

// 手札の数字合計を計算（ロン判定用）
function calculateHandValue(hand) {
  return hand.reduce((sum, card) => {
    const { rank } = getCardInfo(card);
    if (rank === 'A') return sum + 1;
    if (rank === 'J') return sum + 11;
    if (rank === 'Q') return sum + 12;
    if (rank === 'K') return sum + 13;
    return sum + parseInt(rank, 10);
  }, 0);
}

// カードの数字を取得（ロン判定用）
function getCardValue(card) {
  const { rank } = getCardInfo(card);
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

// カードが出せるかチェック
function canPlayCard(card, topCard, requiredSuit, attackState) {
  const { suit, rank } = getCardInfo(card);
  const top = getCardInfo(topCard);

  // 攻撃中の場合
  if (attackState && attackState.active) {
    // 2攻撃中は2か8のみ
    if (attackState.type === '2') {
      return rank === '2' || rank === '8';
    }
    // Q♠攻撃中はQ♠か8のみ
    if (attackState.type === 'Q♠') {
      return (rank === 'Q' && suit === '♠') || rank === '8';
    }
  }

  // 8はいつでも出せる
  if (rank === '8') return true;

  // マーク指定がある場合
  if (requiredSuit) {
    return suit === requiredSuit;
  }

  // 同じマークか同じ数字
  return suit === top.suit || rank === top.rank;
}

// 特殊カードの効果をチェック
function getCardEffect(card) {
  const { suit, rank } = getCardInfo(card);
  
  if (rank === '2') {
    return { type: 'attack', attackType: '2', drawCount: 2 };
  }
  if (rank === 'Q' && suit === '♠') {
    return { type: 'attack', attackType: 'Q♠', drawCount: 5 };
  }
  if (rank === '5' || rank === '7') {
    return { type: 'extraTurn' };
  }
  if (rank === '8') {
    return { type: 'wild' };
  }
  return { type: 'normal' };
}

function createRoom(roomId) {
  return {
    roomId,
    players: [],
    deck: [],
    discardPile: [],
    discardTop: null,
    currentTurn: 0,
    started: false,
    finished: false,
    requiredSuit: null,
    pendingSuitChooser: null,
    attackState: null,  // { active: true, type: '2' or 'Q♠', totalDraw: 2 }
    sessionScores: [],
    lastRoundScores: [],
    lastWinnerSeat: null,  // 前回の勝者
    ronPending: null,  // ロン待ち状態
    start: { awaiting: false, voteCount: 0, total: 0, voters: [] },
    restart: { awaiting: false, voteCount: 0, total: 0, voters: [] }
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  return rooms.get(roomId);
}

function dealCards(room) {
  room.deck = createDeck();
  room.discardPile = [];
  room.discardTop = room.deck.pop();
  room.discardPile.push(room.discardTop);
  room.requiredSuit = null;
  room.pendingSuitChooser = null;
  room.attackState = null;
  room.ronPending = null;
  room.finished = false;
  room.lastRoundScores = room.players.map(() => 0);

  // 前回の勝者からスタート、いなければ0番目
  if (room.lastWinnerSeat !== null) {
    const winnerIdx = room.players.findIndex(p => p.seat === room.lastWinnerSeat);
    room.currentTurn = winnerIdx >= 0 ? winnerIdx : 0;
  } else {
    room.currentTurn = 0;
  }

  // 各プレイヤーに5枚配る
  for (const player of room.players) {
    player.hand = [];
    for (let i = 0; i < 5; i++) {
      if (room.deck.length > 0) {
        player.hand.push(room.deck.pop());
      }
    }
  }
}

function getPublicState(room) {
  return {
    roomId: room.roomId,
    started: room.started,
    finished: room.finished,
    deckCount: room.deck.length,
    discardTop: room.discardTop,
    requiredSuit: room.requiredSuit,
    pendingSuitChooser: room.pendingSuitChooser,
    attackState: room.attackState,
    currentTurn: room.currentTurn,
    players: room.players.map((p, idx) => ({
      seat: p.seat,
      name: p.name,
      handCount: p.hand ? p.hand.length : 0,
      isTurn: room.started && !room.finished && idx === room.currentTurn
    })),
    sessionScores: room.sessionScores,
    lastRoundScores: room.lastRoundScores,
    start: room.start,
    restart: room.restart
  };
}

function getPlayableIndices(hand, topCard, requiredSuit, attackState) {
  const indices = [];
  for (let i = 0; i < hand.length; i++) {
    if (canPlayCard(hand[i], topCard, requiredSuit, attackState)) {
      indices.push(i);
    }
  }
  return indices;
}

function nextTurn(room) {
  room.currentTurn = (room.currentTurn + 1) % room.players.length;
}

function broadcastState(room) {
  const state = getPublicState(room);
  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit('state', state);
      if (player.hand) {
        io.to(player.socketId).emit('hand', { hand: player.hand });

        const puttableIdx = getPlayableIndices(
          player.hand,
          room.discardTop,
          room.requiredSuit,
          room.attackState
        );
        const playerIdx = room.players.findIndex(p => p.seat === player.seat);
        const isMyTurn = room.started && !room.finished && playerIdx === room.currentTurn;

        io.to(player.socketId).emit('playHints', {
          puttableIdx: isMyTurn ? puttableIdx : [],
          canDraw: isMyTurn && !room.pendingSuitChooser,
          mustChoose: room.pendingSuitChooser === player.seat
        });
      }
    }
  }
}

// ロン可能かチェック
function checkRonPossible(room, playedCard, playerSeat) {
  const cardValue = getCardValue(playedCard);
  const ronCandidates = [];

  for (const p of room.players) {
    if (p.seat === playerSeat) continue;  // 出した人はロンできない
    if (!p.hand || p.hand.length === 0) continue;

    const handValue = calculateHandValue(p.hand);
    if (handValue === cardValue) {
      ronCandidates.push({
        seat: p.seat,
        socketId: p.socketId,
        handValue
      });
    }
  }

  return ronCandidates;
}

// ロン返しチェック
function checkRonGaeshi(room, ronnerSeat, loserSeat) {
  const ronner = room.players.find(p => p.seat === ronnerSeat);
  const loser = room.players.find(p => p.seat === loserSeat);
  
  if (!ronner || !loser) return false;

  const ronnerHandValue = calculateHandValue(ronner.hand);
  const loserHandValue = calculateHandValue(loser.hand);

  return ronnerHandValue === loserHandValue;
}

// ゲーム終了処理（ツモ）
function handleTsumo(room, winner) {
  room.finished = true;
  room.lastWinnerSeat = winner.seat;

  const reveals = [];
  const scores = [];

  // 勝者以外の手札ポイント合計を計算
  let totalPoints = 0;
  for (const p of room.players) {
    if (p.seat !== winner.seat) {
      const points = Math.ceil(calculateHandPoints(p.hand));
      totalPoints += points;
      
      scores.push({
        fromSeat: p.seat - 1,
        toSeat: winner.seat - 1,
        amount: points,
        reason: 'ツモ'
      });

      // セッションスコア更新
      if (!room.sessionScores[p.seat - 1]) room.sessionScores[p.seat - 1] = 0;
      room.sessionScores[p.seat - 1] -= points;
      room.lastRoundScores[p.seat - 1] = -points;

      reveals.push({
        seat: p.seat,
        role: 'loser',
        hand: [...p.hand]
      });
    }
  }

  // 勝者の得点
  if (!room.sessionScores[winner.seat - 1]) room.sessionScores[winner.seat - 1] = 0;
  room.sessionScores[winner.seat - 1] += totalPoints;
  room.lastRoundScores[winner.seat - 1] = totalPoints;

  reveals.unshift({
    seat: winner.seat,
    role: 'tsumo_winner',
    hand: [...winner.hand]
  });

  const payload = {
    reason: 'ツモ',
    winnerSeat: winner.seat,
    scores,
    reveals,
    sessionScores: room.sessionScores,
    lastRoundScores: room.lastRoundScores
  };

  for (const p of room.players) {
    if (p.socketId) {
      io.to(p.socketId).emit('gameOver', payload);
    }
  }

  // リスタート投票を有効化
  room.restart = {
    awaiting: true,
    voteCount: 0,
    total: room.players.length,
    voters: []
  };

  return true;
}

// ゲーム終了処理（ロン）
function handleRon(room, ronner, loser, playedCard, isRonGaeshi = false) {
  room.finished = true;
  room.lastWinnerSeat = ronner.seat;

  const reveals = [];
  const scores = [];

  // ポイント計算：放銃者手札 + 出札 + ロン者手札
  const loserHandPoints = calculateHandPoints(loser.hand);
  const cardPoints = getCardPoints(playedCard);
  const ronnerHandPoints = calculateHandPoints(ronner.hand);
  
  const basePoints = loserHandPoints + cardPoints + ronnerHandPoints;
  const multiplier = isRonGaeshi ? 4 : 2;
  const totalPoints = Math.ceil(basePoints * multiplier);

  scores.push({
    fromSeat: loser.seat - 1,
    toSeat: ronner.seat - 1,
    amount: totalPoints,
    reason: isRonGaeshi ? 'ロン返し' : 'ロン'
  });

  // セッションスコア更新
  if (!room.sessionScores[loser.seat - 1]) room.sessionScores[loser.seat - 1] = 0;
  if (!room.sessionScores[ronner.seat - 1]) room.sessionScores[ronner.seat - 1] = 0;
  
  room.sessionScores[loser.seat - 1] -= totalPoints;
  room.sessionScores[ronner.seat - 1] += totalPoints;
  
  room.lastRoundScores[loser.seat - 1] = -totalPoints;
  room.lastRoundScores[ronner.seat - 1] = totalPoints;

  // 他プレイヤーは0点
  for (const p of room.players) {
    if (p.seat !== loser.seat && p.seat !== ronner.seat) {
      room.lastRoundScores[p.seat - 1] = 0;
    }
  }

  reveals.push({
    seat: ronner.seat,
    role: isRonGaeshi ? 'ron_gaeshi_winner' : 'ron_winner',
    hand: [...ronner.hand]
  });

  reveals.push({
    seat: loser.seat,
    role: isRonGaeshi ? 'ron_gaeshi_loser' : 'loser',
    hand: [...loser.hand]
  });

  const payload = {
    reason: isRonGaeshi ? 'ロン返し' : 'ロン',
    winnerSeat: ronner.seat,
    loserSeat: loser.seat,
    playedCard,
    scores,
    reveals,
    sessionScores: room.sessionScores,
    lastRoundScores: room.lastRoundScores,
    pointBreakdown: {
      loserHand: Math.ceil(loserHandPoints),
      playedCard: Math.ceil(cardPoints),
      ronnerHand: Math.ceil(ronnerHandPoints),
      base: Math.ceil(basePoints),
      multiplier,
      total: totalPoints
    }
  };

  for (const p of room.players) {
    if (p.socketId) {
      io.to(p.socketId).emit('gameOver', payload);
    }
  }

  // リスタート投票を有効化
  room.restart = {
    awaiting: true,
    voteCount: 0,
    total: room.players.length,
    voters: []
  };

  return true;
}

// 山札0枚終了
function handleDeckEmpty(room) {
  room.finished = true;

  const reveals = [];
  for (const p of room.players) {
    reveals.push({
      seat: p.seat,
      role: 'draw',
      hand: [...p.hand]
    });
    room.lastRoundScores[p.seat - 1] = 0;
  }

  const payload = {
    reason: '山札切れ',
    winnerSeat: null,
    scores: [],
    reveals,
    sessionScores: room.sessionScores,
    lastRoundScores: room.lastRoundScores
  };

  for (const p of room.players) {
    if (p.socketId) {
      io.to(p.socketId).emit('gameOver', payload);
    }
  }

  // リスタート投票を有効化
  room.restart = {
    awaiting: true,
    voteCount: 0,
    total: room.players.length,
    voters: []
  };
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  let currentRoom = null;
  let currentPlayer = null;

  socket.on('joinRoom', ({ roomId, name, clientId }) => {
    const rid = roomId || 'room' + (100000 + Math.floor(Math.random() * 900000));
    const room = getRoom(rid);

    // 既存プレイヤーの復帰チェック
    let player = room.players.find(p => p.clientId === clientId);

    if (player) {
      // 復帰
      player.socketId = socket.id;
      player.name = name || player.name;
    } else if (!room.started) {
      // 新規参加
      player = {
        seat: room.players.length + 1,
        name: name || 'Guest',
        clientId,
        socketId: socket.id,
        hand: []
      };
      room.players.push(player);
      room.sessionScores.push(0);
    } else {
      // ゲーム中は参加不可
      socket.emit('error', { message: 'ゲーム進行中のため参加できません' });
      return;
    }

    currentRoom = room;
    currentPlayer = player;

    socket.join(rid);
    socket.emit('you', { seat: player.seat, name: player.name, roomId: rid });

    // 投票状態を更新
    room.start.total = room.players.length;
    room.start.awaiting = !room.started;

    broadcastState(room);
  });

  socket.on('requestStart', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.started) return;

    if (!room.start.voters.includes(currentPlayer?.seat)) {
      room.start.voters.push(currentPlayer.seat);
      room.start.voteCount = room.start.voters.length;
    }

    if (room.start.voteCount >= room.players.length && room.players.length >= 1) {
      room.started = true;
      room.start.awaiting = false;
      dealCards(room);
    }

    broadcastState(room);
  });

  socket.on('requestRestart', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.finished) return;

    if (!room.restart.voters.includes(currentPlayer?.seat)) {
      room.restart.voters.push(currentPlayer.seat);
      room.restart.voteCount = room.restart.voters.length;
    }

    if (room.restart.voteCount >= room.players.length) {
      room.restart = { awaiting: false, voteCount: 0, total: 0, voters: [] };
      dealCards(room);
      room.started = true;
    }

    broadcastState(room);
  });

  socket.on('move', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room || !currentPlayer) return;

    const playerIdx = room.players.findIndex(p => p.seat === currentPlayer.seat);

    // ロン応答処理
    if (move.type === 'ron') {
      if (room.ronPending && room.ronPending.candidates.some(c => c.seat === currentPlayer.seat)) {
        const loser = room.players.find(p => p.seat === room.ronPending.loserSeat);
        const ronner = currentPlayer;

        // ロン返しチェック
        if (checkRonGaeshi(room, ronner.seat, loser.seat)) {
          // ロン返し発生
          handleRon(room, loser, ronner, room.ronPending.card, true);
        } else {
          // 通常ロン
          handleRon(room, ronner, loser, room.ronPending.card, false);
        }
        room.ronPending = null;
        broadcastState(room);
      }
      return;
    }

    if (move.type === 'noRon') {
      if (room.ronPending) {
        // このプレイヤーを候補から除外
        room.ronPending.candidates = room.ronPending.candidates.filter(c => c.seat !== currentPlayer.seat);
        
        // 全員がロンを見送った場合、ゲーム続行
        if (room.ronPending.candidates.length === 0) {
          room.ronPending = null;
          nextTurn(room);
          broadcastState(room);
        }
      }
      return;
    }

    // マーク選択処理
    if (move.type === 'chooseSuit') {
      if (room.pendingSuitChooser === currentPlayer.seat) {
        room.requiredSuit = move.suit;
        room.pendingSuitChooser = null;

        // 8で上がりの場合（攻撃回避時のみツモ可能）
        const wasAttackEscape = room.attackState && room.attackState.escaped;
        
        if (currentPlayer.hand.length === 0 && wasAttackEscape) {
          // 攻撃回避時の8でツモ成立
          handleTsumo(room, currentPlayer);
        } else if (currentPlayer.hand.length === 0) {
          // 通常の8は1枚引いて終了
          if (room.deck.length > 0) {
            currentPlayer.hand.push(room.deck.pop());
          }
          nextTurn(room);
        } else {
          nextTurn(room);
        }
        
        room.attackState = null;
        broadcastState(room);
      }
      return;
    }

    // ターンチェック
    if (playerIdx !== room.currentTurn || room.finished) return;

    if (move.type === 'play') {
      const card = currentPlayer.hand[move.index];
      if (!card) return;

      if (!canPlayCard(card, room.discardTop, room.requiredSuit, room.attackState)) {
        return;
      }

      const effect = getCardEffect(card);

      // カードを出す
      currentPlayer.hand.splice(move.index, 1);
      room.discardPile.push(card);
      room.discardTop = card;
      room.requiredSuit = null;

      // 攻撃カード処理
      if (effect.type === 'attack') {
        if (room.attackState && room.attackState.active) {
          // 攻撃を回した
          room.attackState.totalDraw += effect.drawCount;
        } else {
          // 新しい攻撃開始
          room.attackState = {
            active: true,
            type: effect.attackType,
            totalDraw: effect.drawCount
          };
        }
        
        // ロンチェック
        const ronCandidates = checkRonPossible(room, card, currentPlayer.seat);
        if (ronCandidates.length > 0) {
          room.ronPending = {
            card,
            loserSeat: currentPlayer.seat,
            candidates: ronCandidates,
            deadline: Date.now() + 5000
          };
          
          for (const c of ronCandidates) {
            io.to(c.socketId).emit('ronOffer', {
              card,
              loserSeat: currentPlayer.seat,
              yourSeat: c.seat,
              deadline: room.ronPending.deadline
            });
          }
          return;  // ロン待ち
        }
        
        nextTurn(room);
        broadcastState(room);
        return;
      }

      // 8を出した場合
      if (effect.type === 'wild') {
        const wasEscaping = room.attackState && room.attackState.active;
        room.pendingSuitChooser = currentPlayer.seat;
        
        if (wasEscaping) {
          // 攻撃回避
          room.attackState = { escaped: true };
        }
        
        broadcastState(room);
        return;
      }

      // 5/7 追加行動カード
      if (effect.type === 'extraTurn') {
        // ロンチェック
        const ronCandidates = checkRonPossible(room, card, currentPlayer.seat);
        if (ronCandidates.length > 0) {
          room.ronPending = {
            card,
            loserSeat: currentPlayer.seat,
            candidates: ronCandidates,
            deadline: Date.now() + 5000,
            extraTurn: true
          };
          
          for (const c of ronCandidates) {
            io.to(c.socketId).emit('ronOffer', {
              card,
              loserSeat: currentPlayer.seat,
              yourSeat: c.seat,
              deadline: room.ronPending.deadline
            });
          }
          return;
        }

        // 手札0枚でも追加行動が必要（ツモ不可）
        if (currentPlayer.hand.length === 0) {
          if (room.deck.length > 0) {
            currentPlayer.hand.push(room.deck.pop());
          } else {
            handleDeckEmpty(room);
            return;
          }
        }
        // ターンは変わらない（追加行動）
        broadcastState(room);
        return;
      }

      // 通常カード
      // ロンチェック
      const ronCandidates = checkRonPossible(room, card, currentPlayer.seat);
      if (ronCandidates.length > 0) {
        room.ronPending = {
          card,
          loserSeat: currentPlayer.seat,
          candidates: ronCandidates,
          deadline: Date.now() + 5000
        };
        
        for (const c of ronCandidates) {
          io.to(c.socketId).emit('ronOffer', {
            card,
            loserSeat: currentPlayer.seat,
            yourSeat: c.seat,
            deadline: room.ronPending.deadline
          });
        }
        return;  // ロン待ち
      }

      // ツモチェック
      if (currentPlayer.hand.length === 0) {
        handleTsumo(room, currentPlayer);
        broadcastState(room);
        return;
      }

      // 攻撃状態クリア（攻撃カード以外を出した場合）
      room.attackState = null;

      nextTurn(room);
      broadcastState(room);

    } else if (move.type === 'draw') {
      // 攻撃中のドロー処理
      if (room.attackState && room.attackState.active) {
        const drawCount = room.attackState.totalDraw;
        for (let i = 0; i < drawCount; i++) {
          if (room.deck.length > 0) {
            currentPlayer.hand.push(room.deck.pop());
          }
        }
        room.attackState = null;
        nextTurn(room);
        broadcastState(room);
        
        // 山札チェック
        if (room.deck.length === 0) {
          handleDeckEmpty(room);
        }
        return;
      }

      // 通常ドロー
      if (room.deck.length > 0) {
        const card = room.deck.pop();
        currentPlayer.hand.push(card);
        nextTurn(room);
      } else {
        handleDeckEmpty(room);
        return;
      }
      
      broadcastState(room);
    }
  });

  // ロンタイムアウト処理
  socket.on('ronTimeout', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.ronPending) return;

    // ロンをスキップしてゲーム続行
    const wasExtraTurn = room.ronPending.extraTurn;
    room.ronPending = null;
    
    if (!wasExtraTurn) {
      nextTurn(room);
    }
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
