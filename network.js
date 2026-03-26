// ==========================================
// Firebase ＆ PeerJS 初期設定
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBYX377gv9cx_yPwzBTbPvK4mWCoX4-z_s",
  authDomain: "homeless-survival.firebaseapp.com",
  databaseURL: "https://homeless-survival-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "homeless-survival",
  storageBucket: "homeless-survival.firebasestorage.app",
  messagingSenderId: "221306363708",
  appId: "1:221306363708:web:def9c3552a5d03d007c839",
  measurementId: "G-CDRNJEQCQ8"
};

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let peer = null;
let connections = {}; 
let hostConnection = null; 
let myUserId = Math.random().toString(36).substring(2, 10); 
let myRoomId = null; 
let isHost = false;
let isOnlineMode = false;
let lobbyPlayers = [];

// Firebase用の部屋参照キー
let currentHostRoomRef = null;

let hostRoomName = "";
let hostPassword = "";
let targetJoinRoomId = "";

let peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

function checkPeerJS() {
    if (typeof Peer === 'undefined') {
        showToast("⚠️ 通信ライブラリの読み込みに失敗しました。ページを再読み込みしてください。");
        return false;
    }
    return true;
}

window.copyRoomId = function(id) {
    const tempInput = document.createElement("input");
    tempInput.value = id;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    showToast("合言葉をコピーしました！");
};

function hideAllOnlineUIs() {
    ['setup-section-online-menu', 'create-room-ui', 'join-room-ui', 'online-lobby'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showCreateRoomUI() { 
    hideAllOnlineUIs(); 
    document.getElementById('create-room-ui').style.display = 'block'; 
    stopFirebaseRoomListener();
}

function showJoinRoomUI() { 
    hideAllOnlineUIs(); 
    document.getElementById('join-room-ui').style.display = 'block'; 
    stopFirebaseRoomListener();
}

function backToOnlineMenu() { 
    hideAllOnlineUIs(); 
    document.getElementById('setup-section-online-menu').style.display = 'block'; 
    startFirebaseRoomListener(); // メニューに戻ったら再度一覧を読み込み
}

function showConnectingStatus(msg, isError) {
    const ui = document.getElementById("connecting-ui");
    const msgEl = document.getElementById("connecting-msg");
    if (ui) ui.style.display = 'block';
    if (msgEl) msgEl.innerText = msg;
    const spinner = ui ? ui.querySelector('.connecting-spinner') : null;
    if (spinner) spinner.style.display = isError ? 'none' : 'block';
}

function hideConnectingStatus() {
    const ui = document.getElementById("connecting-ui");
    if (ui) ui.style.display = 'none';
}

// ==========================================
// Firebase 部屋一覧機能
// ==========================================
function startFirebaseRoomListener() {
    const listEl = document.getElementById('firebase-room-list');
    listEl.innerHTML = '<p style="text-align:center; font-size:12px; color:#bdc3c7;">通信中...</p>';
    
    db.ref('rooms').on('value', (snapshot) => {
        const rooms = snapshot.val();
        listEl.innerHTML = '';
        
        if (!rooms) {
            listEl.innerHTML = '<p style="text-align:center; font-size:13px; font-weight:bold; color:#e74c3c;">現在募集中の部屋はありません。<br>「部屋を作る」からホストになってください！</p>';
            return;
        }
        
        let roomCount = 0;
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            
            // 満員の部屋は表示しない (オプション)
            if (room.players >= 4) return;
            
            roomCount++;
            const btn = document.createElement('button');
            btn.className = 'room-item-btn';
            btn.innerHTML = `
                <div style="flex-grow:1;">
                    <span style="font-weight:bold; font-size:16px;">${room.name}</span><br>
                    <span style="font-size:12px; color:#555;">👑 ホスト: ${room.hostName}</span>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <span style="font-size:14px; font-weight:bold; color:#e74c3c;">👥 ${room.players}/4 人</span><br>
                    <span style="font-size:11px; background:#3498db; color:white; padding:3px 8px; border-radius:10px;">参加する 👉</span>
                </div>
            `;
            btn.onclick = () => {
                // リストクリックで直接参加処理へ
                executeJoin('hmlss-' + roomId, roomId);
            };
            listEl.appendChild(btn);
        });
        
        if (roomCount === 0) {
            listEl.innerHTML = '<p style="text-align:center; font-size:13px; font-weight:bold; color:#e74c3c;">現在募集中の部屋はありません。</p>';
        }
    });
}

function stopFirebaseRoomListener() {
    db.ref('rooms').off('value');
}

// ネットワークデータ送信
function broadcastNetworkData(data) {
    if (isHost) {
        Object.values(connections).forEach(conn => {
            if(conn.open) conn.send(data);
        });
    }
}

function sendGameStateToNetwork() {
    const state = window.extractGameState();
    const data = { type: 'state_update', state: state, lastUpdater: myUserId };
    
    if (isHost) {
        broadcastNetworkData(data);
    } else if (hostConnection && hostConnection.open) {
        hostConnection.send(data);
    }
}

function syncOnline() {
    if (isOnlineMode) sendGameStateToNetwork();
}

// ネットワークデータ受信処理
function handleNetworkData(data, senderPeerId = null, conn = null) {
    if (data.type === 'join' && isHost) {
        if (hostPassword !== "" && data.password !== hostPassword) {
            if (conn) conn.send({ type: 'join_error', message: '合言葉(パスワード)が間違っています' });
            return;
        }
        if (lobbyPlayers.length >= 4) {
            if (conn) conn.send({ type: 'join_error', message: '部屋が満員です' });
            return;
        }
        if (isOnlineMode) {
             if (conn) conn.send({ type: 'join_error', message: 'ゲームは既に進行中です' });
             return;
        }
        
        if (!lobbyPlayers.find(p => p.userId === data.user.userId)) {
            lobbyPlayers.push(data.user);
            if (conn) conn.send({ type: 'join_success', roomId: myRoomId, roomName: hostRoomName });
            broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
            updateLobbyUI(lobbyPlayers, myUserId);
        }
        return;
    } 
    
    if (data.type === 'join_error') {
        showToast(data.message);
        window.leaveRoom();
        return;
    }
    if (data.type === 'join_success') {
        hostRoomName = data.roomName;
        showLobbyUI();
        return;
    }

    if (data.type === 'leave' && isHost) {
        lobbyPlayers = lobbyPlayers.filter(p => p.userId !== data.userId);
        broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
        updateLobbyUI(lobbyPlayers, myUserId);
        return;
    }

    if (data.type === 'lobby_change' && isHost) {
        const idx = lobbyPlayers.findIndex(p => p.userId === data.user.userId);
        if (idx !== -1) {
            lobbyPlayers[idx] = data.user;
            broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
            updateLobbyUI(lobbyPlayers, myUserId);
        }
    }
    else if (data.type === 'lobby_update') {
        lobbyPlayers = data.players;
        if(data.roomName) hostRoomName = data.roomName;
        updateLobbyUI(data.players, data.hostId);
    }
    else if (data.type === 'game_start') {
        if (!isHost) {
            isOnlineMode = true;
            document.getElementById("online-lobby-modal").style.display = "none";
            document.getElementById("setup-screen").style.display = "none";
            document.getElementById("main-title").style.display = "none";
            document.getElementById("game-screen").style.display = "flex";
            
            window.applyGameState(data.state);
            log("🌐 オンライン対戦スタート！");
        }
    }
    else if (data.type === 'state_update') {
        if (data.lastUpdater !== myUserId) {
            window.applyGameState(data.state);
        }
        if (isHost) {
            Object.values(connections).forEach(conn => {
                if (conn.peer !== senderPeerId && conn.open) {
                    conn.send(data);
                }
            });
        }
    }
    else if (data.type === 'game_end') {
        gameOver = true;
        document.getElementById("win-title").innerText = data.winTitle;
        document.getElementById("win-ranking").innerHTML = data.rankHTML;
        document.getElementById("win-overlay").style.display = "flex";
        playSfx('win');
        if (isHost) {
            Object.values(connections).forEach(conn => {
                if (conn.peer !== senderPeerId && conn.open) conn.send(data);
            });
        }
    }
    else if (data.type === 'dice_start') {
        if (isHost) {
            Object.values(connections).forEach(conn => {
                if (conn.peer !== senderPeerId && conn.open) conn.send(data);
            });
        }
        
        setAnimating(true); // リモートのサイコロアニメーション開始時も保護
        window.netDiceOverlay = document.getElementById("dice-overlay");
        window.netD1E = document.getElementById("dice-1");
        window.netD2E = document.getElementById("dice-2");
        document.getElementById("dice-message").innerText = `${data.name}がサイコロを振っています...`;
        document.getElementById("dice-result").innerText = "";
        window.netDiceOverlay.style.display = "flex";
        window.netD1E.className = "dice";
        window.netD2E.className = "dice";
        
        if(window.netDiceInterval) clearInterval(window.netDiceInterval);
        window.netDiceInterval = setInterval(()=>{
            window.netD1E.innerText=Math.floor(Math.random()*6)+1;
            window.netD2E.innerText=Math.floor(Math.random()*6)+1;
            playSfx('dice');
        },100);
    }
    else if (data.type === 'dice_result') {
        if (isHost) {
            Object.values(connections).forEach(conn => {
                if (conn.peer !== senderPeerId && conn.open) conn.send(data);
            });
        }
        if(window.netDiceInterval) clearInterval(window.netDiceInterval);
        if(window.netD1E && window.netD2E) {
            window.netD1E.className = "dice stopped";
            window.netD2E.className = "dice stopped";
            window.netD1E.innerText = data.d1;
            window.netD2E.innerText = data.d2;
        }
        document.getElementById("dice-result").innerHTML = data.text;
        playSfx('success');
        
        setTimeout(() => {
            if(window.netDiceOverlay) window.netDiceOverlay.style.display = "none";
            setAnimating(false); // アニメーション終了
        }, 1800);
    }
    else if (data.type === 'ap_popup') {
        if (isHost) {
            Object.values(connections).forEach(conn => {
                if (conn.peer !== senderPeerId && conn.open) conn.send(data);
            });
        }
        triggerAPPopup(data.playerId, data.amount, data.reason, true);
    }
}

// 部屋作成 (Firebaseにも登録)
window.executeCreateRoom = function() {
    if (!checkPeerJS()) return;
    
    hostRoomName = document.getElementById("host-room-name").value.trim() || "誰でも歓迎！";
    hostPassword = document.getElementById("host-room-pass").value.trim();
    
    if (!hostPassword) {
        showToast("合言葉(短いルームID)を入力してください！");
        return;
    }
    
    isHost = true;
    lobbyPlayers = [{
        userId: myUserId,
        name: document.getElementById("my-online-name").value || "Player" + Math.floor(Math.random()*100),
        charType: document.getElementById("my-online-avatar").value || "athlete",
        isCPU: false
    }];
    
    showLobbyUI();
    updateLobbyUI(lobbyPlayers, myUserId);
    showConnectingStatus("サーバーに接続中...", false);
    
    const targetPeerId = 'hmlss-' + hostPassword;
    tryCreateRoomProcess(targetPeerId);
};

function tryCreateRoomProcess(targetId) {
    try {
        if (peer) { try { peer.destroy(); } catch(e) {} }
        peer = new Peer(targetId, peerConfig); 
    } catch(e) {
        showConnectingStatus("⚠️ 初期化エラー: " + e.message, true);
        return;
    }
    
    peer.on('open', (id) => {
        myRoomId = id;
        const displayId = id.replace('hmlss-', '');
        
        const idx = lobbyPlayers.findIndex(p => p.userId === myUserId);
        if (idx !== -1) {
            lobbyPlayers[idx].name = document.getElementById("my-online-name").value || lobbyPlayers[idx].name;
            lobbyPlayers[idx].charType = document.getElementById("my-online-avatar").value || lobbyPlayers[idx].charType;
        }
        
        hideConnectingStatus();
        showToast("✅ 部屋を作成しました！");
        updateLobbyUI(lobbyPlayers, myUserId);
        
        const nameDisplay = document.getElementById("lobby-room-name-display");
        if(nameDisplay) {
             nameDisplay.innerHTML = `${hostRoomName} <br><div style="font-size:16px; margin-top:5px;"><span style="color:#fff; background:#e74c3c; padding:4px 8px; border-radius:6px; user-select:all; cursor:pointer;" onclick="copyRoomId('${displayId}')">合言葉: ${displayId} 📋コピー</span></div>`;
        }

        // Firebaseの部屋一覧に登録！
        currentHostRoomRef = db.ref('rooms/' + hostPassword);
        currentHostRoomRef.set({
            name: hostRoomName,
            hostName: lobbyPlayers[0].name,
            players: lobbyPlayers.length,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        // ブラウザが閉じられたら自動的にFirebaseから削除するお掃除予約
        currentHostRoomRef.onDisconnect().remove();
    });

    peer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        conn.on('data', (data) => { handleNetworkData(data, conn.peer, conn); });
        conn.on('close', () => {
            delete connections[conn.peer];
            lobbyPlayers = lobbyPlayers.filter(p => p.userId !== conn.peer);
            broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
            updateLobbyUI(lobbyPlayers, myUserId);
        });
    });
    
    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            showConnectingStatus("⚠️ その合言葉は現在他の人が使用中です。別の合言葉に変えてください。", true);
            showToast("別の合言葉を入力して作り直してください。");
            if (currentHostRoomRef) { currentHostRoomRef.remove(); currentHostRoomRef = null; }
        } else {
            showConnectingStatus("⚠️ 通信エラー: " + err.type, true);
        }
    });
}

// 部屋に参加 (手動)
window.executeJoinByInputId = function() {
    const pass = document.getElementById("join-room-id-input").value.trim();
    if(!pass) { showToast("合言葉を入力してください"); return; }
    executeJoin('hmlss-' + pass, pass);
};

// 部屋に参加 (共通処理)
function executeJoin(roomId, password) {
    if (!checkPeerJS()) return;
    
    stopFirebaseRoomListener(); // ロビーリスナーを止める
    showLobbyUI();
    showConnectingStatus("部屋に接続中...", false);
    
    try {
        if (!peer || peer.disconnected || peer.destroyed) {
            peer = new Peer(undefined, peerConfig);
        }
    } catch(e) {
        showConnectingStatus("⚠️ 初期化エラー: " + e.message, true);
        return;
    }
    
    const connectToHost = () => {
        hostConnection = peer.connect(roomId, { reliable: true });
        hostConnection.on('open', () => {
            hostConnection.send({
                type: 'join',
                password: password,
                user: {
                    userId: myUserId,
                    name: document.getElementById("my-online-name").value || "Player",
                    charType: document.getElementById("my-online-avatar").value || "sales",
                    isCPU: false
                }
            });
            hideConnectingStatus();
        });
        hostConnection.on('data', (data) => { handleNetworkData(data, hostConnection.peer, hostConnection); });
        hostConnection.on('close', () => { showToast("ホストとの接続が切れました。"); window.leaveRoom(); });
        hostConnection.on('error', (err) => { showConnectingStatus("⚠️ 接続エラー", true); });
    };

    if (peer.open) connectToHost();
    else {
        peer.once('open', connectToHost);
        peer.once('error', (err) => {
            showConnectingStatus("⚠️ ルームが見つからないか、接続に失敗しました。", true);
            console.error(err);
        });
    }
}

// 退室処理 (Firebaseのお掃除込み)
window.leaveRoom = function() {
    const wasPlaying = isOnlineMode;
    
    if (!isHost && hostConnection && hostConnection.open) {
        try { hostConnection.send({ type: 'leave', userId: myUserId }); } catch(e) {}
    }
    
    // Firebaseから部屋を削除
    if (isHost && currentHostRoomRef) {
        currentHostRoomRef.remove();
        currentHostRoomRef.onDisconnect().cancel(); // キャンセルしておく
        currentHostRoomRef = null;
    }
    
    if (peer) {
        try { peer.destroy(); } catch(e) {}
        peer = null;
    }
    connections = {};
    hostConnection = null;
    myRoomId = null;
    isOnlineMode = false;
    isHost = false;
    lobbyPlayers = [];
    document.getElementById("online-lobby-modal").style.display = "none";
    
    if (wasPlaying) {
        executeReturnToTitleBase();
        document.getElementById('main-title').style.display = 'none';
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('mode-select-overlay').style.display = 'none';
        document.getElementById('title-screen-overlay').style.display = 'flex';
    } else {
        document.getElementById('main-title').style.display = 'none';
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('mode-select-overlay').style.display = 'flex';
    }
    
    // ロビー機能停止状態なら再開しないでおく（Titleに戻ったため）
    stopFirebaseRoomListener();
};

window.updateMyLobbyInfo = function() {
    const user = {
        userId: myUserId,
        name: document.getElementById("my-online-name").value || "Player",
        charType: document.getElementById("my-online-avatar").value || "athlete",
        isCPU: false
    };
    
    // 選択されたキャラの説明文を更新
    const descEl = document.getElementById("my-online-desc");
    if (descEl && charInfo[user.charType]) {
        descEl.innerText = charInfo[user.charType].desc;
    }
    
    if (isHost) {
        const idx = lobbyPlayers.findIndex(p => p.userId === myUserId);
        if (idx !== -1) lobbyPlayers[idx] = user;
        broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
        updateLobbyUI(lobbyPlayers, myUserId);
    } else if (hostConnection && hostConnection.open) {
        hostConnection.send({ type: 'lobby_change', user: user });
    }
};

window.addCpuPlayer = function() {
    if (lobbyPlayers.length >= 4) {
        showToast("部屋が満員です！");
        return;
    }
    lobbyPlayers.push({
        userId: "cpu-" + Math.random().toString(36).substring(2, 8),
        name: "CPU" + (lobbyPlayers.length + 1),
        charType: "athlete",
        isCPU: true
    });
    broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
    updateLobbyUI(lobbyPlayers, myUserId);
};

window.updateCpuInfo = function(cpuId, newName, newCharType) {
    const idx = lobbyPlayers.findIndex(p => p.userId === cpuId);
    if (idx !== -1) {
        lobbyPlayers[idx].name = newName || "CPU";
        lobbyPlayers[idx].charType = newCharType;
        broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
        updateLobbyUI(lobbyPlayers, myUserId);
    }
};

window.removeCpu = function(cpuId) {
    lobbyPlayers = lobbyPlayers.filter(p => p.userId !== cpuId);
    broadcastNetworkData({ type: 'lobby_update', players: lobbyPlayers, hostId: myUserId, roomName: hostRoomName });
    updateLobbyUI(lobbyPlayers, myUserId);
};

function showLobbyUI() {
    hideAllOnlineUIs();
    document.getElementById("online-lobby-modal").style.display = "flex";
    const lobbyEl = document.getElementById("online-lobby");
    lobbyEl.style.display = "block";
    
    if(!isHost || !myRoomId) {
        document.getElementById("lobby-room-name-display").innerText = hostRoomName || "ルーム";
    }
    
    const nameField = document.getElementById("my-online-name");
    if (!nameField.value || nameField.value.trim() === "") {
        nameField.value = "Player" + Math.floor(Math.random()*100);
    }
    
    if (isHost) {
        const idx = lobbyPlayers.findIndex(p => p.userId === myUserId);
        if (idx !== -1) {
            lobbyPlayers[idx].name = nameField.value;
            lobbyPlayers[idx].charType = document.getElementById("my-online-avatar").value || "athlete";
        }
        document.getElementById("host-settings").style.display = "block";
        document.getElementById("waiting-host-msg").style.display = "none";
    } else {
        document.getElementById("host-settings").style.display = "none";
        document.getElementById("waiting-host-msg").style.display = "block";
    }
}

function updateLobbyUI(lobbyPlayersList, hostId) {
    const list = document.getElementById("lobby-players-list");
    if (!list) return;
    list.innerHTML = "";
    
    lobbyPlayersList.forEach((p, idx) => {
        const isMe = (p.userId === myUserId);
        const isHostPlayer = (p.userId === hostId);
        const isCPU = p.isCPU;
        const emoji = (typeof charEmoji !== 'undefined' && charEmoji[p.charType]) ? charEmoji[p.charType] : '🏃';
        
        const div = document.createElement("div");
        div.style.cssText = "margin:5px 0; padding:10px; border-radius:8px; background:#4a3b32; display:flex; align-items:center; gap:8px; flex-wrap:wrap;";
        
        const numBadge = `<span style="background:${['#e74c3c','#3498db','#2ecc71','#f1c40f'][idx%4]};color:white;padding:2px 8px;border-radius:50%;font-size:12px;font-weight:bold;">${idx+1}</span>`;
        
        let roleBadge = '';
        if (isHostPlayer) roleBadge = '<span style="background:#e74c3c;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">HOST</span>';
        else if (isCPU) roleBadge = '<span style="background:#95a5a6;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">CPU</span>';
        else roleBadge = '<span style="background:#3498db;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">PLAYER</span>';
        
        if (isCPU && isHost) {
            div.innerHTML = `
                ${numBadge} ${roleBadge}
                <div class="cpu-row" style="flex:1;">
                    <input type="text" value="${p.name}" class="name-input" style="width:80px; padding:4px;" 
                        onchange="window.updateCpuInfo('${p.userId}', this.value, this.parentElement.querySelector('select').value)">
                    <select onchange="window.updateCpuInfo('${p.userId}', this.parentElement.querySelector('input').value, this.value)" style="padding:4px; font-size:12px;">
                        <option value="athlete" ${p.charType==='athlete'?'selected':''}>🏃 アスリート</option>
                        <option value="sales" ${p.charType==='sales'?'selected':''}>💼 営業マン</option>
                        <option value="survivor" ${p.charType==='survivor'?'selected':''}>🌿 サバイバー</option>
                        <option value="yankee" ${p.charType==='yankee'?'selected':''}>👊 元ヤン</option>
                    </select>
                    <button class="cpu-del-btn" onclick="window.removeCpu('${p.userId}')">✕ 削除</button>
                </div>
            `;
        } else if (isCPU && !isHost) {
            div.innerHTML = `${numBadge} <span style="font-size:18px;">${emoji}</span> ${roleBadge} <span style="font-weight:bold;">${p.name}</span>`;
        } else {
            div.innerHTML = `${numBadge} <span style="font-size:18px;">${emoji}</span> ${roleBadge} <span style="font-weight:bold;">${p.name}</span> ${isMe ? '<span style="color:#f1c40f;font-size:11px;">(あなた)</span>' : ''}`;
        }
        
        list.appendChild(div);
    });
    
    const me = lobbyPlayersList.find(p => p.userId === myUserId);
    if (me) {
        const nameField = document.getElementById("my-online-name");
        const avatarField = document.getElementById("my-online-avatar");
        if (nameField && document.activeElement !== nameField) nameField.value = me.name;
        if (avatarField) avatarField.value = me.charType;
    }
    
    // ホストの場合、人数の変更をFirebaseに同期
    if (isHost && currentHostRoomRef) {
        currentHostRoomRef.update({ players: lobbyPlayers.length });
    }
}

window.startOnlineGame = async function() {
    if (!isHost) return;
    if (!myRoomId || !peer || !peer.open) {
        showToast("⚠️ サーバーに接続されていません。接続完了をお待ちください。");
        return;
    }
    if (lobbyPlayers.length < 2) {
        showToast("最低2人必要です！"); return;
    }
    
    // ゲームが始まったら、Firebaseの募集リストからは削除する（乱入防止）
    if (currentHostRoomRef) {
        currentHostRoomRef.remove();
        currentHostRoomRef.onDisconnect().cancel();
        currentHostRoomRef = null;
    }
    
    const mapSizeStr = document.getElementById("online-map-size").value;
    maxRounds = parseInt(document.getElementById("online-max-rounds").value);
    
    if (mapSizeStr === "small") mapData = genSmallMap();
    else if (mapSizeStr === "medium") mapData = genMediumMap();
    else mapData = genLargeMap();
    
    truckPos = Math.floor(mapData.length * 0.1);
    unclePos = Math.floor(mapData.length * 0.2);
    animalPos = Math.floor(mapData.length * 0.3);
    policePos = Math.floor(mapData.length * 0.8);
    yakuzaPos = Math.floor(mapData.length * 0.5);
    loansharkPos = Math.floor(mapData.length * 0.6);
    friendPos = Math.floor(mapData.length * 0.15);
    canPrice = 1; trashPrice = 2; isNight = false;
    destTile = pickDestTile();
    
    players = lobbyPlayers.map((lp, idx) => {
        let p = createPlayer(idx, lp.name, lp.isCPU === true, lp.charType);
        p.userId = lp.userId;
        return p;
    });
    turn = 0;
    isOnlineMode = true;
    
    const initialState = window.extractGameState();
    broadcastNetworkData({ type: 'game_start', state: initialState });
    
    document.getElementById("online-lobby-modal").style.display = "none";
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("main-title").style.display = "none";
    document.getElementById("game-screen").style.display = "flex";
    
    initBoard();
    updateUI();
    log("🌐 オンライン対戦スタート！(ホスト)");
};

// ==========================================
// TITLE & MODE SELECTION (DOM IDによる確実な制御)
// ==========================================
document.getElementById('main-title').style.display = 'none';
document.getElementById('setup-screen').style.display = 'none';

window.executeReturnToTitle = function() {
    if (isOnlineMode || myRoomId) {
        // Firebaseから部屋を削除
        if (isHost && currentHostRoomRef) {
            currentHostRoomRef.remove();
            currentHostRoomRef.onDisconnect().cancel();
            currentHostRoomRef = null;
        }
        
        if (peer) {
            try { peer.destroy(); } catch(e) {}
            peer = null;
        }
        connections = {};
        hostConnection = null;
        myRoomId = null;
        isOnlineMode = false;
        isHost = false;
        lobbyPlayers = [];
    }
    
    executeReturnToTitleBase();
    stopFirebaseRoomListener();
    
    document.getElementById('main-title').style.display = 'none';
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('mode-select-overlay').style.display = 'none';
    document.getElementById('online-lobby-modal').style.display = 'none';
    document.getElementById('title-screen-overlay').style.display = 'flex';
};

window.goToModeSelect = function() {
    document.getElementById('title-screen-overlay').style.display = 'none';
    document.getElementById('mode-select-overlay').style.display = 'flex';
};

window.startOfflineMode = function() {
    document.getElementById('mode-select-overlay').style.display = 'none';
    document.getElementById('main-title').style.display = 'block';
    document.getElementById('setup-screen').style.display = 'block';
    
    document.getElementById('setup-offline-players').style.display = 'block';
    document.getElementById('setup-game-settings').style.display = 'block';
    
    stopFirebaseRoomListener();
};

window.startOnlineModeMenu = function() {
    document.getElementById('mode-select-overlay').style.display = 'none';
    document.getElementById('main-title').style.display = 'block';
    document.getElementById('setup-screen').style.display = 'block';
    
    document.getElementById('setup-offline-players').style.display = 'none';
    document.getElementById('setup-game-settings').style.display = 'none';
    
    document.getElementById('online-lobby-modal').style.display = 'flex';
    backToOnlineMenu();
    startFirebaseRoomListener(); // Firebaseリスナー起動
};

document.getElementById("online-close-btn").onclick = function() {
    document.getElementById('online-lobby-modal').style.display = 'none';
    document.getElementById('main-title').style.display = 'none';
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('mode-select-overlay').style.display = 'flex';
    
    stopFirebaseRoomListener();
};
