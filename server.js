const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ゲーム状態管理
const rooms = new Map();

// カードデッキ生成
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(rank + suit);
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

function canPlayCard(card, topCard, requiredSuit) {
  const { suit, rank } = getCardInfo(card);
  const top = getCardInfo(topCard);

  // 8はいつでも出せる
  if (rank === '8') return true;

  // マーク指定がある場合
  if (requiredSuit) {
    return suit === requiredSuit;
  }

  // 同じマークか同じ数字
  return suit === top.suit || rank === top.rank;
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
    forcedAttack: null,
    sessionScores: [],
    lastRoundScores: [],
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
  room.forcedAttack = null;
  room.currentTurn = 0;
  room.finished = false;
  room.lastRoundScores = room.players.map(() => 0);

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
    forcedAttack: room.forcedAttack,
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

function getPlayableIndices(hand, topCard, requiredSuit) {
  const indices = [];
  for (let i = 0; i < hand.length; i++) {
    if (canPlayCard(hand[i], topCard, requiredSuit)) {
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
          room.requiredSuit
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

function checkWin(room, player, isTsumo) {
  if (player.hand.length === 0) {
    room.finished = true;

    const winType = isTsumo ? 'ツモ' : 'ロン';
    const scores = [];
    const reveals = [];

    // スコア計算（簡易版）
    const baseScore = 30;
    for (const p of room.players) {
      if (p.seat !== player.seat) {
        scores.push({
          fromSeat: p.seat - 1,
          toSeat: player.seat - 1,
          amount: baseScore,
          reason: winType
        });

        // セッションスコア更新
        if (!room.sessionScores[p.seat - 1]) room.sessionScores[p.seat - 1] = 0;
        if (!room.sessionScores[player.seat - 1]) room.sessionScores[player.seat - 1] = 0;
        room.sessionScores[p.seat - 1] -= baseScore;
        room.sessionScores[player.seat - 1] += baseScore;

        room.lastRoundScores[p.seat - 1] = -baseScore;
      }
    }
    room.lastRoundScores[player.seat - 1] = baseScore * (room.players.length - 1);

    // 手札開示
    reveals.push({
      seat: player.seat,
      role: isTsumo ? 'tsumo_winner' : 'ron_winner',
      hand: [...player.hand, room.discardTop]
    });

    const payload = {
      reason: winType,
      winnerSeat: player.seat,
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
  return false;
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

    if (move.type === 'chooseSuit') {
      if (room.pendingSuitChooser === currentPlayer.seat) {
        room.requiredSuit = move.suit;
        room.pendingSuitChooser = null;
        nextTurn(room);
        broadcastState(room);
      }
      return;
    }

    // ターンチェック
    if (playerIdx !== room.currentTurn || room.finished) return;

    if (move.type === 'play') {
      const card = currentPlayer.hand[move.index];
      if (!card) return;

      if (!canPlayCard(card, room.discardTop, room.requiredSuit)) {
        return;
      }

      // カードを出す
      currentPlayer.hand.splice(move.index, 1);
      room.discardPile.push(card);
      room.discardTop = card;
      room.requiredSuit = null;

      // 8を出した場合
      const { rank } = getCardInfo(card);
      if (rank === '8') {
        room.pendingSuitChooser = currentPlayer.seat;
        broadcastState(room);
        return;
      }

      // 勝利チェック
      if (checkWin(room, currentPlayer, false)) {
        broadcastState(room);
        return;
      }

      nextTurn(room);
      broadcastState(room);

    } else if (move.type === 'draw') {
      if (room.deck.length > 0) {
        const card = room.deck.pop();
        currentPlayer.hand.push(card);

        // ツモチェック（引いたカードで上がれるか）
        if (currentPlayer.hand.length === 1 && canPlayCard(card, room.discardTop, room.requiredSuit)) {
          // 自動で出してツモ
          currentPlayer.hand.pop();
          room.discardPile.push(card);
          room.discardTop = card;
          checkWin(room, currentPlayer, true);
        }

        nextTurn(room);
      }
      broadcastState(room);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
