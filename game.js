// ========== DAMAGE SYSTEM ==========
function dealDamage(target, dmg, source, attacker = null) {
    if (target.equip.helmet) {
        target.equip.helmet = false;
        log(`🪖 ${target.name}のヘルメットがダメージを完全吸収！`);
        playSfx('success');
        return 0;
    }
    if (target.equip.shield) {
        target.equip.shield = false;
        dmg = Math.floor(dmg / 2);
        log(`🛡️ ${target.name}の段ボールの盾がダメージを半減！(${dmg}ダメージ)`);
        playSfx('hit');
    }
    
    target.hp -= dmg;
    let dropP = Math.floor(dmg / 5);
    dropP = Math.min(dropP, Math.max(0, target.p));
    target.p -= dropP;
    
    playSfx('hit');
    log(`<span class="danger">💥 ${target.name}に${dmg}ダメージ！ ${dropP > 0 ? dropP + 'P落とした！' : ''}</span>`);
    
    if (attacker && dropP > 0) {
        attacker.p += dropP;
        log(`💰 ${attacker.name}が${dropP}P拾った！`);
    } else if (!attacker && dropP > 0) {
        // ハイエナシステム
        let nearbyPlayers = players.filter(otherPlayer => 
            otherPlayer.id !== target.id && otherPlayer.hp > 0 && getDistance(otherPlayer.pos, target.pos) <= 2
        );
        if (nearbyPlayers.length > 0) {
            let share = Math.floor(dropP / nearbyPlayers.length);
            nearbyPlayers.forEach(neighbor => {
                neighbor.p += share;
                if (share > 0) log(`🦴 ${neighbor.name}がハイエナとして${share}P拾った！`);
            });
        }
    }
    
    // 死亡判定
    if (target.hp <= 0) {
        target.hp = 0;
        let lostP = Math.floor(target.p / 2);
        target.p -= lostP;
        target.pos = 0; // 病院へ
        target.equip = { bicycle: false, shoes: false, cart: false, shield: false, helmet: false, doll: false, backpack: false };
        target.ap = 0;
        
        log(`<span class="danger">☠️ ${target.name}が死亡！ ${lostP}P没収、装備全喪失、病院に搬送！</span>`);
        playSfx('death');
        target.hp = 100; // 復活
    }
    return dmg;
}

function getDistance(posA, posB) {
    if (posA === posB) return 0;
    let visited = new Set([posA]);
    let queue = [{ id: posA, dist: 0 }];
    
    while (queue.length > 0) {
        let current = queue.shift();
        let tile = mapData.find(t => t.id === current.id);
        if (!tile) continue;
        
        for (let nextId of tile.next) {
            if (nextId === posB) return current.dist + 1;
            if (!visited.has(nextId)) {
                visited.add(nextId);
                queue.push({ id: nextId, dist: current.dist + 1 });
            }
        }
    }
    return 999;
}


// ========== ACTIONS ==========
async function rollDice() {
    if (players.length === 0 || !players[turn]) return;
    
    let currentPlayer = players[turn];
    document.getElementById("btn-roll").disabled = true;
    toggleHighlight("btn-roll", false);
    
    // ネットワーク同期 (サイコロ開始)
    if (typeof isOnlineMode !== 'undefined' && isOnlineMode && typeof myRoomId !== 'undefined' && myRoomId && !currentPlayer.isCPU) {
        let msg = { type: 'dice_start', name: currentPlayer.name };
        if (typeof isHost !== 'undefined' && isHost) { 
            if (typeof broadcastNetworkData === 'function') broadcastNetworkData(msg); 
        } else if (typeof hostConnection !== 'undefined' && hostConnection && hostConnection.open) {
            hostConnection.send(msg);
        }
    }

    setAnimating(true); // UI保護フラグON
    
    let dice1Val = Math.floor(Math.random() * 6) + 1;
    let dice2Val = Math.floor(Math.random() * 6) + 1;
    
    const overlay = document.getElementById("dice-overlay");
    const d1El = document.getElementById("dice-1");
    const d2El = document.getElementById("dice-2");
    const resultEl = document.getElementById("dice-result");
    const messageEl = document.getElementById("dice-message");
    
    overlay.style.display = "flex";
    d1El.className = "dice";
    d2El.className = "dice";
    messageEl.innerText = `${currentPlayer.name}がサイコロを振っています...`;
    resultEl.innerText = "";
    
    let rollInterval = setInterval(() => {
        d1El.innerText = Math.floor(Math.random() * 6) + 1;
        d2El.innerText = Math.floor(Math.random() * 6) + 1;
        playSfx('dice');
    }, 100);
    
    await sleep(1000);
    clearInterval(rollInterval);
    
    if (players.length === 0 || !players[turn]) { setAnimating(false); return; }
    
    d1El.className = "dice stopped";
    d2El.className = "dice stopped";
    d1El.innerText = dice1Val;
    d2El.innerText = dice2Val;
    
    let totalAP = dice1Val + dice2Val - currentPlayer.penaltyAP + currentPlayer.bonusAP;
    let isZorome = (dice1Val === dice2Val);
    
    if (isZorome) totalAP = (dice1Val + dice2Val) * 2 - currentPlayer.penaltyAP + currentPlayer.bonusAP;
    if (currentPlayer.equip.bicycle) totalAP += 2;
    if (totalAP < 0) totalAP = 0;
    
    let textResult = `${dice1Val}+${dice2Val}=${dice1Val+dice2Val}AP`;
    if (isZorome) textResult += " (🎲ゾロ目×2)";
    if (currentPlayer.equip.bicycle) textResult += " (🚲+2)";
    if (currentPlayer.penaltyAP > 0) textResult += ` (ペナ-${currentPlayer.penaltyAP})`;
    if (currentPlayer.bonusAP > 0) textResult += ` (ボーナス+${currentPlayer.bonusAP})`;
    textResult += ` = ${totalAP}AP`;
    
    resultEl.innerHTML = textResult;
    playSfx('success');
    
    // ネットワーク同期 (サイコロ結果)
    if (typeof isOnlineMode !== 'undefined' && isOnlineMode && typeof myRoomId !== 'undefined' && myRoomId && !currentPlayer.isCPU) {
        let msg = { type: 'dice_result', d1: dice1Val, d2: dice2Val, text: textResult };
        if (typeof isHost !== 'undefined' && isHost) { 
            if (typeof broadcastNetworkData === 'function') broadcastNetworkData(msg); 
        } else if (typeof hostConnection !== 'undefined' && hostConnection && hostConnection.open) {
            hostConnection.send(msg);
        }
    }

    await sleep(1800);
    overlay.style.display = "none";
    setAnimating(false); // UI保護フラグOFF
    
    if (players.length === 0 || !players[turn]) return;
    
    currentPlayer.ap += totalAP;
    diceRolled = true;
    currentPlayer.bonusAP = 0;
    currentPlayer.penaltyAP = 0;
    
    triggerAPPopup(currentPlayer.id, totalAP, "ダイスロール");
    log(`<span class="highlight">${currentPlayer.name}</span>は${totalAP}AP獲得！${isZorome ? "(ゾロ目!)" : ""}`);
    
    // 陣地収入の計算
    let ownedTiles = Object.keys(territories).filter(key => territories[key] === currentPlayer.id);
    if (ownedTiles.length > 0) {
        if (currentPlayer.p >= 0) {
            let income = 0;
            ownedTiles.forEach(tileId => {
                let area = mapData.find(t => t.id == tileId).area;
                income += (area === "slum" ? 1 : area === "commercial" ? 2 : 3);
            });
            if (currentPlayer.equip.cart) income *= 2;
            
            currentPlayer.p += income;
            triggerAPPopup(currentPlayer.id, income, "陣地収入");
            log(`🚩 陣地収入${income}P！`);
        } else {
            log(`<span class="danger">📉 借金中...陣地収入没収！</span>`);
        }
    }
    
    // 目的地ボーナス判定
    if (currentPlayer.pos === destTile) {
        let destBonus = roundCount * 2 + 5;
        currentPlayer.p += destBonus;
        log(`🎯 目的地ボーナス！${destBonus}P獲得！`);
        triggerAPPopup(currentPlayer.id, destBonus, "目的地ボーナス");
        playSfx('coin');
        destTile = pickDestTile();
    }
    
    syncOnline();
    updateUI();
}

function actionMove() {
    let currentPlayer = players[turn];
    let currentTile = mapData.find(t => t.id === currentPlayer.pos);
    let validNextTiles = currentTile.next.filter(id => id !== constructionPos);
    
    if (validNextTiles.length === 0) {
        log("🚧 道が塞がれている！");
        return;
    }
    if (validNextTiles.length === 1) {
        executeMove(validNextTiles[0]);
    } else {
        isBranchPicking = true;
        currentBranchOptions = validNextTiles;
        log("🛣️ 分岐点！進む道を選んでください。");
        updateUI();
    }
}

function checkYankee(movedPlayer) {
    let targets = players.filter(op => op.id !== movedPlayer.id && op.pos === movedPlayer.pos && op.p > 0 && op.hp > 0);
    targets.forEach(target => {
        if (movedPlayer.charType === "yankee") {
            target.p -= 1;
            movedPlayer.p += 1;
            log(`👊 ${movedPlayer.name}が${target.name}から1Pカツアゲ！`);
        }
        if (target.charType === "yankee" && movedPlayer.p > 0) {
            movedPlayer.p -= 1;
            target.p += 1;
            log(`👊 ${target.name}が${movedPlayer.name}から1Pカツアゲ！`);
        }
    });
}

function executeMove(targetTileId) {
    let currentPlayer = players[turn];
    let moveCost = (isRainy && !currentPlayer.rainGear && currentPlayer.charType !== "athlete") ? 2 : 1;
    
    currentPlayer.ap -= moveCost;
    currentPlayer.pos = targetTileId;
    playSfx('move');
    checkYankee(currentPlayer);
    
    let tileType = mapData.find(t => t.id === currentPlayer.pos).type;
    
    if (tileType === "koban") {
        log("🚓 交番！職務質問で足止め！");
        currentPlayer.cannotMove = true;
    }
    
    // 警察NPCマス
    if (currentPlayer.pos === policePos) {
        if (currentPlayer.equip.doll) {
            currentPlayer.equip.doll = false;
            log(`🎎 身代わり人形が警察を防いだ！`);
        } else if (currentPlayer.stealth) {
            currentPlayer.stealth = false;
            log(`💨 ステルスで警察回避！`);
        } else if (currentPlayer.hasID) {
            currentPlayer.hasID = false;
            log(`🔵 身分証で警察回避！`);
        } else if (currentPlayer.charType === "survivor") {
            log(`🌿 サバイバーの勘で回避！`);
        } else {
            dealDamage(currentPlayer, 30, "警察");
            currentPlayer.penaltyAP += 2;
            currentPlayer.ap = 0;
            if (!currentPlayer.isCPU) showPoliceAnim(currentPlayer.name);
            syncOnline();
            updateUI();
            return;
        }
    }
    
    // その他のNPCイベント
    if (currentPlayer.pos === unclePos) {
        log(`<span class="danger">🧓 厄介なおじさん！カード1枚破棄＆ターン終了！</span>`);
        if (currentPlayer.hand.length > 0) currentPlayer.hand.pop();
        currentPlayer.ap = 0;
        syncOnline(); updateUI(); return;
    }
    if (currentPlayer.pos === yakuzaPos) {
        if (currentPlayer.equip.doll) {
            currentPlayer.equip.doll = false;
            log(`🎎 身代わり人形がヤクザを防いだ！`);
        } else {
            dealDamage(currentPlayer, 30, "ヤクザ");
            if (currentPlayer.hand.length > 0) {
                currentPlayer.hand.splice(Math.floor(Math.random() * currentPlayer.hand.length), 1);
                log(`😎 ヤクザにカード1枚を強奪された！`);
            }
        }
    }
    if (currentPlayer.pos === loansharkPos) {
        if (currentPlayer.equip.doll) {
            currentPlayer.equip.doll = false;
            log(`🎎 身代わり人形が闇金を防いだ！`);
        } else {
            currentPlayer.p -= 10;
            log(`<span class="danger">💀 闇金に遭遇！10P没収！</span>`);
            playSfx('fail');
        }
    }
    if (currentPlayer.pos === friendPos) {
        currentPlayer.cans += 1;
        log(`🤝 仲間のホームレスから空き缶を1つもらった！`);
        playSfx('coin');
    }
    
    // 移動先での目的地ボーナス判定
    if (currentPlayer.pos === destTile) {
        let bonus = roundCount * 2 + 5;
        currentPlayer.p += bonus;
        log(`🎯 目的地ボーナス！${bonus}P獲得！`);
        triggerAPPopup(currentPlayer.id, bonus, "目的地ボーナス");
        playSfx('coin');
        destTile = pickDestTile();
    }
    
    // イベントマス判定
    if (tileType === "event") {
        if (!currentPlayer.isCPU) {
            if (Math.random() < 0.3) startStoryEvent();
            else startMiniGame();
        }
        syncOnline(); updateUI(); return;
    }
    if (tileType === "shelter") {
        currentPlayer.stealth = true;
        log(`🏕️ 避難所で休息。ステルス獲得！`);
    }
    
    syncOnline();
    updateUI();
}

// ========== MINI GAME ==========
function startMiniGame() {
    mgActive = true;
    let types = ["highlow", "boxes", "slot"];
    mgType = types[Math.floor(Math.random() * types.length)];
    mgTimeLeft = 10;
    
    document.getElementById("mg-highlow-ui").style.display = "none";
    document.getElementById("mg-boxes-ui").style.display = "none";
    document.getElementById("mg-slot-ui").style.display = "none";
    document.getElementById("minigame-overlay").style.display = "flex";
    document.getElementById("mg-result").innerText = "";
    
    if (mgType === "highlow") {
        document.getElementById("mg-title").innerText = "🎲 ハイ＆ロー";
        mgValue = Math.floor(Math.random() * 14);
        document.getElementById("mg-highlow-target").innerText = mgValue;
        document.getElementById("mg-highlow-ui").style.display = "block";
    } else if (mgType === "boxes") {
        document.getElementById("mg-title").innerText = "📦 宝箱3択";
        document.getElementById("mg-boxes-ui").style.display = "block";
    } else if (mgType === "slot") {
        document.getElementById("mg-title").innerText = "🎰 スロット";
        slotStopped = [false, false, false];
        slotReels = [0, 0, 0];
        updateSlotUI();
        document.getElementById("mg-slot-ui").style.display = "block";
        if (slotAnimInterval) clearInterval(slotAnimInterval);
        slotAnimInterval = setInterval(() => {
            for (let i = 0; i < 3; i++) {
                if (!slotStopped[i]) slotReels[i] = Math.floor(Math.random() * 3);
            }
            updateSlotUI();
        }, 100);
    }
    
    clearInterval(mgTimer);
    document.getElementById("mg-timer-display").innerText = mgTimeLeft;
    mgTimer = setInterval(() => {
        mgTimeLeft--;
        document.getElementById("mg-timer-display").innerText = mgTimeLeft;
        if (mgTimeLeft <= 0) {
            clearInterval(mgTimer);
            if (mgType === "slot") clearInterval(slotAnimInterval);
            processMiniGameResult(false, "時間切れ...");
        }
    }, 1000);
}

function processHighLow(choice) {
    let result = Math.floor(Math.random() * 14);
    let isWin = (choice === "high" && result >= mgValue) || (choice === "low" && result < mgValue);
    processMiniGameResult(isWin, `出目【${result}】${isWin ? "正解！" : "ハズレ..."}`);
}

function processBoxes(index) {
    let winIndex = Math.floor(Math.random() * 3);
    processMiniGameResult(index === winIndex, index === winIndex ? "当たり！" : "空っぽ...");
}

function stopSlot(index) {
    if (slotStopped[index]) return;
    slotStopped[index] = true;
    if (slotStopped.every(v => v)) {
        clearInterval(slotAnimInterval);
        let isWin = (slotReels[0] === slotReels[1] && slotReels[1] === slotReels[2]);
        setTimeout(() => processMiniGameResult(isWin, isWin ? "揃った！" : "揃わなかった..."), 800);
    }
}

function updateSlotUI() {
    let marks = ["🍒", "🔔", "🍇"];
    for (let i = 0; i < 3; i++) document.getElementById("slot-reel-" + i).innerText = marks[slotReels[i]];
}

async function processMiniGameResult(isWin, msg) {
    clearInterval(mgTimer);
    if (mgType === "slot") clearInterval(slotAnimInterval);
    
    document.getElementById("minigame-overlay").style.display = "none";
    let currentPlayer = players[turn];
    log(`🎲 ミニゲーム: ${msg}`);
    let acquiredCardId = -1;
    
    if (isWin) {
        // 逆転補正の計算
        let topPoints = Math.max(...players.map(p => p.p));
        let pointsDiff = topPoints - currentPlayer.p;
        let comebackChance = pointsDiff > 50 ? 0.40 : pointsDiff > 20 ? 0.20 : 0.05;
        
        if (Math.random() < comebackChance) {
            // 逆転カード(ID 12, 13, 14など)
            acquiredCardId = 12 + Math.floor(Math.random() * 3);
        } else {
            // 通常プール
            let cardPool = [0,1,2,3,4,5,6,7,8,9,10,11,15,16,17,18,24,25,26,27,28,29];
            acquiredCardId = cardPool[Math.floor(Math.random() * cardPool.length)];
        }
        currentPlayer.hand.push(acquiredCardId);
    }
    
    showMgResult(isWin, msg, acquiredCardId);
    mgActive = false;
    syncOnline();
    updateUI();
}

// ========== STORY EVENTS ==========
const storyEvents = [
    {
        title: "💰 怪しい男の投資話", 
        text: "怪しい男が近づいてきた。「確実に儲かる投資がある」と言うが...", 
        choices: [
            { label: "乗る(50%で+8P/失敗-5P)", action: p => { if(Math.random() > 0.5) { p.p += 8; log("💰 投資大成功！+8P"); } else { p.p -= 5; log("💰 投資詐欺！-5P"); } } },
            { label: "断る", action: p => { log("💰 怪しい話は断った。"); } }
        ]
    },
    {
        title: "🪙 自販機の下", 
        text: "自動販売機の下に手を入れてみると...", 
        choices: [
            { label: "探す", action: p => { let gain = Math.floor(Math.random() * 5); p.p += gain; log(`🪙 ${gain}P見つけた！`); } },
            { label: "やめる", action: p => { log("🪙 やめておいた。"); } }
        ]
    },
    {
        title: "🎁 見知らぬ人の贈り物", 
        text: "親切そうな人がカバンをくれた！", 
        choices: [
            { label: "受け取る", action: p => { if(Math.random() > 0.3) { let cardId = [6,7,10,15][Math.floor(Math.random() * 4)]; p.hand.push(cardId); log(`🎁 カード「${deckData[cardId].name}」を手に入れた！`); } else { dealDamage(p, 15, "罠"); log("🎁 罠だった！15ダメージ！"); } } },
            { label: "無視する", action: p => { log("🎁 無視した。"); } }
        ]
    },
    {
        title: "🐕 野良犬に追われた！", 
        text: "突然野良犬が襲ってきた！", 
        choices: [
            { label: "戦う(50%で勝利→+3P)", action: p => { if(Math.random() > 0.5) { p.p += 3; log("🐕 野良犬を撃退！+3P"); } else { dealDamage(p, 10, "野良犬"); log("🐕 噛まれた！10ダメージ！"); } } },
            { label: "逃げる(AP-2)", action: p => { p.ap = Math.max(0, p.ap - 2); log("🐕 全力で逃げた！AP-2"); } }
        ]
    }
];

function startStoryEvent() {
    let eventData = storyEvents[Math.floor(Math.random() * storyEvents.length)];
    document.getElementById("story-event-title").innerText = eventData.title;
    document.getElementById("story-event-text").innerText = eventData.text;
    
    let choicesContainer = document.getElementById("story-event-choices");
    choicesContainer.innerHTML = "";
    
    eventData.choices.forEach(choice => {
        let btn = document.createElement("button");
        btn.className = "btn-large";
        btn.style.width = "100%";
        btn.innerText = choice.label;
        btn.onclick = () => {
            document.getElementById("story-event-overlay").style.display = "none";
            choice.action(players[turn]);
            syncOnline();
            updateUI();
        };
        choicesContainer.appendChild(btn);
    });
    document.getElementById("story-event-overlay").style.display = "flex";
}

// ========== MORE ACTIONS ==========
function discardCard(index) {
    let currentPlayer = players[turn];
    currentPlayer.hand.splice(index, 1);
    log(`🗑️ ${currentPlayer.name}はカードを捨てた。`);
    syncOnline();
    updateUI();
}

function actionCan() {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 1;
    currentPlayer.cans += 1;
    canPickedThisTurn++;
    playSfx('coin');
    log(`🥫 空き缶を拾った！(所持:${currentPlayer.cans})`);
    syncOnline();
    updateUI();
}

function actionTrash() {
    let currentPlayer = players[turn];
    let actionCost = currentPlayer.equip.shoes ? 1 : 2;
    currentPlayer.ap -= actionCost;
    
    let gainAmount = Math.floor(Math.random() * 6);
    
    if (gainAmount === 0) {
        // ゴミ漁り失敗
        if (currentPlayer.stealth) {
            currentPlayer.stealth = false;
            log(`💨 ステルスで警察回避！`);
        } else if (currentPlayer.hasID) {
            currentPlayer.hasID = false;
            log(`🔵 身分証で警察回避！`);
        } else if (currentPlayer.charType === "survivor") {
            log(`🌿 サバイバーの勘で回避！`);
        } else {
            dealDamage(currentPlayer, 20, "警察");
            currentPlayer.penaltyAP += 2;
            log(`👮 ゴミ漁り失敗！警察に見つかった！`);
            playSfx('fail');
        }
    } else {
        // ゴミ漁り成功
        let nightBonus = isNight ? Math.floor(Math.random() * 3) : 0;
        gainAmount += nightBonus;
        currentPlayer.trash += gainAmount;
        log(`🗑️ ゴミ${gainAmount}個見つけた！${nightBonus > 0 ? `(夜ボーナス+${nightBonus})` : ''}`);
        playSfx('coin');
    }
    syncOnline();
    updateUI();
}

function actionOccupy() {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 3;
    territories[currentPlayer.pos] = currentPlayer.id;
    playSfx('success');
    log(`🚩 「${mapData.find(t => t.id === currentPlayer.pos).name}」を陣地化！`);
    syncOnline();
    updateUI();
}

function actionJob() {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 4;
    let successChance = currentPlayer.charType === "sales" ? 0.7 : 0.5;
    
    let isSuccess = Math.random() < successChance;
    let pointsEarned = isSuccess ? 10 : 0;
    
    if (isSuccess) currentPlayer.p += pointsEarned;
    
    log(isSuccess ? `💼 バイト成功！10P獲得！` : `💼 バイト失敗...`);
    if (!currentPlayer.isCPU) showJobResult(isSuccess, pointsEarned);
    
    syncOnline();
    updateUI();
}

function actionExchange() {
    let currentPlayer = players[turn];
    let totalValue = currentPlayer.cans * canPrice + currentPlayer.trash * trashPrice;
    
    log(`💱 換金！缶${currentPlayer.cans}×${canPrice}P + ゴミ${currentPlayer.trash}×${trashPrice}P = ${totalValue}P`);
    currentPlayer.p += totalValue;
    currentPlayer.cans = 0;
    currentPlayer.trash = 0;
    
    playSfx('coin');
    triggerAPPopup(currentPlayer.id, totalValue, "換金");
    syncOnline();
    updateUI();
}

function actionManhole() {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 1;
    let manholes = mapData.filter(t => t.type === "manhole" && t.id !== currentPlayer.pos);
    
    if (manholes.length > 0) {
        currentPlayer.pos = manholes[Math.floor(Math.random() * manholes.length)].id;
        log(`🕳️ ワープ！`);
        checkYankee(currentPlayer);
    }
    playSfx('move');
    syncOnline();
    updateUI();
}

function actionPickpocket() {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 3;
    let targets = players.filter(op => op.id !== currentPlayer.id && op.pos === currentPlayer.pos && op.hp > 0);
    let target = targets[Math.floor(Math.random() * targets.length)];
    
    if (Math.random() > 0.5) {
        let stolenValue = Math.min(Math.floor(Math.random() * 5) + 1, Math.max(0, target.p));
        target.p -= stolenValue;
        currentPlayer.p += stolenValue;
        log(`🔪 スリ成功！${target.name}から${stolenValue}P奪取！`);
        playSfx('coin');
    } else {
        currentPlayer.p -= 2;
        log(`🔪 スリ失敗！逃げる際に2P落とした...`);
        playSfx('fail');
    }
    syncOnline();
    updateUI();
}

function actionStealCard() {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 2;
    let targets = players.filter(op => op.id !== currentPlayer.id && op.pos === currentPlayer.pos && op.hand.length > 0 && op.hp > 0);
    
    if (targets.length > 0) {
        let target = targets[Math.floor(Math.random() * targets.length)];
        let targetCardIndex = Math.floor(Math.random() * target.hand.length);
        let stolenCardId = target.hand.splice(targetCardIndex, 1)[0];
        currentPlayer.hand.push(stolenCardId);
        log(`🃏 ${target.name}からカード奪取！`);
        playSfx('card');
    } else {
        log(`🃏 失敗...相手にカードなし。`);
    }
    syncOnline();
    updateUI();
}

// ========== SHOP ==========
function openShop() {
    let currentPlayer = players[turn];
    document.getElementById("shop-p-display").innerText = currentPlayer.p;
    
    let itemList = document.getElementById("shop-items-list");
    itemList.innerHTML = "";
    
    let shopCardIds = [];
    for (let i = 0; i < 3; i++) {
        let pool = [0,1,2,3,4,5,6,7,8,9,10,11,15,16,17,18,19,20,24,25,26,27,28,29];
        shopCardIds.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    
    shopCardIds.forEach((cardId) => {
        let cardData = deckData[cardId];
        let price = cardData.type === 'weapon' ? Math.max(5, cardData.dmg / 5) : cardData.type === 'equip' ? 6 : 4;
        
        let btn = document.createElement("button");
        btn.className = "btn-clay";
        btn.style.borderColor = cardData.color;
        btn.innerHTML = `${cardData.icon} ${cardData.name} (${price}P)<br><span style="font-size:10px;">${cardData.desc}</span>`;
        btn.onclick = () => {
            if (currentPlayer.p < price) { showToast("ポイント不足！"); return; }
            if (currentPlayer.hand.length >= currentPlayer.maxHand) { showToast("手札が上限！"); return; }
            currentPlayer.p -= price;
            currentPlayer.hand.push(cardId);
            log(`🛒 「${cardData.name}」を${price}Pで購入！`);
            playSfx('coin');
            syncOnline();
            openShop(); // UIリフレッシュ
            updateUI();
        };
        itemList.appendChild(btn);
    });
    
    let sellList = document.getElementById("shop-sell-list");
    sellList.innerHTML = "";
    if (currentPlayer.hand.length === 0) {
        sellList.innerHTML = "<span style='color:#bdc3c7;font-size:12px;'>売れるカードなし</span>";
    } else {
        currentPlayer.hand.forEach((cardId, index) => {
            let cardData = deckData[cardId];
            let btn = document.createElement("button");
            btn.className = "sell-card-btn";
            btn.innerHTML = `${cardData.icon}${cardData.name}を売る`;
            btn.onclick = () => {
                currentPlayer.hand.splice(index, 1);
                currentPlayer.p += 2;
                log(`🛒 「${cardData.name}」を2Pで売却！`);
                syncOnline();
                openShop(); // UIリフレッシュ
                updateUI();
            };
            sellList.appendChild(btn);
        });
    }
    document.getElementById("shop-overlay").style.display = "flex";
}

function closeShop() {
    document.getElementById("shop-overlay").style.display = "none";
}

// ========== CARD USE ==========
function useCard(index, cardId) {
    let currentPlayer = players[turn];
    currentPlayer.ap -= 2;
    currentPlayer.hand.splice(index, 1);
    
    let cardData = deckData[cardId];
    log(`🎴 「${cardData.name}」を使用！`);
    playSfx('card');
    
    // 武器カードの処理
    if (cardData.type === 'weapon') {
        let targetsInRange = players.filter(op => op.id !== currentPlayer.id && op.hp > 0 && getDistance(currentPlayer.pos, op.pos) <= cardData.range);
        
        if (targetsInRange.length === 0) {
            log("⚔️ 射程内に敵がいない！");
            syncOnline(); updateUI(); return;
        }
        
        if (cardData.aoe) {
            targetsInRange.forEach(target => { dealDamage(target, cardData.dmg, cardData.name, currentPlayer); });
            log(`💥 ${cardData.name}で範囲攻撃！`);
            syncOnline(); updateUI(); return;
        }
        
        if (targetsInRange.length === 1) {
            dealDamage(targetsInRange[0], cardData.dmg, cardData.name, currentPlayer);
            syncOnline(); updateUI(); return;
        }
        
        pendingWeaponCard = cardData;
        let targetListDiv = document.getElementById("attack-targets");
        targetListDiv.innerHTML = "";
        targetsInRange.forEach(target => {
            let btn = document.createElement("button");
            btn.className = "btn-large";
            btn.style.width = "100%";
            btn.style.background = target.color;
            btn.innerText = `${target.name} (HP:${target.hp})`;
            btn.onclick = () => {
                document.getElementById("attack-overlay").style.display = "none";
                dealDamage(target, cardData.dmg, cardData.name, currentPlayer);
                syncOnline();
                updateUI();
            };
            targetListDiv.appendChild(btn);
        });
        document.getElementById("attack-overlay").style.display = "flex";
        return;
    }
    
    // アクション/装備カードの処理
    switch (cardId) {
        case 0: currentPlayer.stealth = true; log(`🔵 ステルス発動！`); break;
        case 1: currentPlayer.rainGear = true; log(`🔵 雨具装備！`); break;
        case 2: currentPlayer.hasID = true; currentPlayer.p += 1; log(`🔵 身分証+1P！`); break;
        case 3: 
            let others1 = players.filter(t => t.id !== currentPlayer.id);
            let target1 = others1[Math.floor(Math.random() * others1.length)];
            target1.penaltyAP += 2; 
            log(`🔴 通報！${target1.name}に次回AP-2！`); 
            break;
        case 4:
            let others2 = players.filter(t => t.id !== currentPlayer.id && t.p > 0);
            if (others2.length > 0) {
                let target2 = others2[Math.floor(Math.random() * others2.length)];
                let stolen = Math.min(2, target2.p);
                target2.p -= stolen;
                currentPlayer.p += stolen;
                log(`🔴 缶泥棒！${target2.name}から${stolen}P奪った！`);
            } else {
                log(`🔴 奪う相手がいない...`);
            }
            break;
        case 5:
            let diceRoll = Math.floor(Math.random() * 6) + 1;
            if (diceRoll >= 4) {
                let enemyTerritories = Object.keys(territories).filter(k => territories[k] !== currentPlayer.id);
                if (enemyTerritories.length > 0) {
                    let targetTerritory = enemyTerritories[Math.floor(Math.random() * enemyTerritories.length)];
                    territories[targetTerritory] = currentPlayer.id;
                    log(`🔴 領土挑戦(出目${diceRoll})成功！陣地を奪った！`);
                } else {
                    log(`🔴 奪える領土なし`);
                }
            } else {
                log(`🔴 領土挑戦(出目${diceRoll})失敗...`);
            }
            break;
        case 6: currentPlayer.p += 5; currentPlayer.bonusAP += 2; log(`🟢 支援面談！+5P＆次回AP+2！`); break;
        case 7: currentPlayer.p += 3; log(`🟢 炊き出し！+3P！`); break;
        case 8: currentPlayer.maxHand += 2; currentPlayer.equip.backpack = true; log(`🟢 リュック装備！手札上限${currentPlayer.maxHand}枚！`); break;
        case 9:
            if (Math.random() > 0.5) { currentPlayer.p += 3; log(`🟡 運勢良し！+3P！`); }
            else { currentPlayer.p = Math.max(0, currentPlayer.p - 3); log(`🟡 凶...-3P。`); }
            break;
        case 10: currentPlayer.p += 2; log(`🟡 野良猫の導き！+2P！`); break;
        case 11:
            if (Math.random() > 0.5) { currentPlayer.p += 6; log(`🟡 密かなバイト成功！+6P！`); }
            else { currentPlayer.p = Math.max(0, currentPlayer.p - 3); log(`🟡 密かなバイト失敗...-3P。`); }
            break;
        case 12:
            players.forEach(op => op.p = Math.floor(op.p / 2));
            log(`😱 大暴落！全員のP半減！`);
            break;
        case 13:
            let richerPlayers = players.filter(op => op.id !== currentPlayer.id && op.p > currentPlayer.p);
            if (richerPlayers.length > 0) {
                let topPlayer = richerPlayers.reduce((a, b) => a.p > b.p ? a : b);
                let tmp = currentPlayer.p;
                currentPlayer.p = topPlayer.p;
                topPlayer.p = tmp;
                log(`🔥 下剋上！${topPlayer.name}とP交換！`);
            } else {
                log(`🔥 自分がトップ...（何も起きない）`);
            }
            break;
        case 14:
            if (Math.random() < 0.1) { currentPlayer.p += 15; log(`🎉 宝くじ当選！！+15P！`); playSfx('win'); }
            else { log(`📄 ハズレ...`); }
            break;
        case 15: currentPlayer.ap += 5; log(`⚡ エナジードリンク！AP+5！`); triggerAPPopup(currentPlayer.id, 5, "AP回復"); break;
        case 16: currentPlayer.bonusAP += 5; log(`🛹 スケボー！次回ダイス+5AP！`); break;
        case 24: currentPlayer.equip.bicycle = true; log(`🚲 自転車装備！毎ターンAP+2！`); break;
        case 25: currentPlayer.equip.shoes = true; log(`👢 安全靴装備！ゴミ漁り1AP！`); break;
        case 26: currentPlayer.equip.cart = true; log(`🛒 リヤカー装備！陣地収入2倍！`); break;
        case 27: currentPlayer.equip.shield = true; log(`🛡️ 段ボールの盾装備！ダメージ半減！`); break;
        case 28: currentPlayer.equip.helmet = true; log(`🪖 ヘルメット装備！ダメージ1回無効！`); break;
        case 29: currentPlayer.equip.doll = true; log(`🎎 身代わり人形装備！NPC妨害1回無効！`); break;
    }
    
    syncOnline();
    updateUI();
}

function closeAttackOverlay() {
    document.getElementById("attack-overlay").style.display = "none";
}

// ========== TURN END & ROUND ==========
function endTurnClicked() {
    document.getElementById("btn-end").disabled = true;
    endTurnLogic();
}

async function endTurnLogic() {
    if (players.length === 0 || !players[turn]) return;
    
    let currentPlayer = players[turn];
    currentPlayer.ap = 0;
    diceRolled = false;
    canPickedThisTurn = 0;
    currentPlayer.cannotMove = false;
    
    if (turn === players.length - 1) {
        await processRoundEvents();
    }
    
    if (players.length === 0) return;
    
    turn = (turn + 1) % players.length;
    cpuActing = false;
    
    syncOnline();
    updateUI();
}

function getDestRandom(start, steps) {
    let current = start;
    let hitList = [];
    
    for (let i = 0; i < steps; i++) {
        let tile = mapData.find(t => t.id === current);
        let validNextTiles = tile.next.filter(id => id !== constructionPos);
        if (validNextTiles.length === 0) break;
        
        current = validNextTiles[Math.floor(Math.random() * validNextTiles.length)];
        hitList.push(current);
    }
    return { finalPos: current, hitList: hitList };
}

async function processRoundEvents() {
    roundCount++;
    if (roundCount > maxRounds) {
        endGame();
        return;
    }
    
    log(`<span class="system">--- 🌙 ラウンド${roundCount}/${maxRounds}終了 ---</span>`);
    let summaryDigest = [];
    
    // 天候変化
    let randWeather = Math.random();
    if (randWeather < 0.2) weatherState = "rainy";
    else if (randWeather < 0.4) weatherState = "cloudy";
    else weatherState = "sunny";
    isRainy = (weatherState === "rainy");
    summaryDigest.push(isRainy ? "🌧️ 雨" : "☀️ " + weatherState);
    
    // 昼夜切り替え
    isNight = (Math.floor(roundCount / 3) % 2 === 1);
    summaryDigest.push(isNight ? "🌙 夜になった" : "☀️ 昼になった");
    
    // 相場変動
    canPrice = Math.max(1, Math.floor(Math.random() * 4));
    trashPrice = Math.max(1, Math.floor(Math.random() * 6));
    summaryDigest.push(`📈 相場変動: 缶${canPrice}P ゴミ${trashPrice}P`);
    
    // 工事
    if (constructionTimer > 0) {
        constructionTimer--;
        if (constructionTimer === 0) {
            summaryDigest.push("🚧 工事終了");
            constructionPos = -1;
        }
    } else if (Math.random() < 0.1) {
        constructionPos = mapData[Math.floor(Math.random() * mapData.length)].id;
        if (constructionPos !== 0) {
            constructionTimer = 2;
            summaryDigest.push("🚧 道路工事発生");
        } else {
            constructionPos = -1;
        }
    }
    
    // NPC再配置
    let slumTiles = mapData.filter(t => t.area === "slum");
    animalPos = slumTiles[Math.floor(Math.random() * slumTiles.length)].id;
    unclePos = mapData[Math.floor(Math.random() * mapData.length)].id;
    yakuzaPos = mapData[Math.floor(Math.random() * mapData.length)].id;
    loansharkPos = mapData[Math.floor(Math.random() * mapData.length)].id;
    friendPos = mapData[Math.floor(Math.random() * mapData.length)].id;
    
    players.forEach(p => p.stealth = false); // ステルス解除
    
    await displayRoundSummary(summaryDigest);
    if (players.length === 0) return;
    
    // ごみ収集車（暴走）イベント
    log(`<span class="system" style="color:#c0392b;">🛻 ごみ収集車！</span>`);
    document.body.classList.add('horror-mode');
    
    let truckRoll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
    let truckMoveData = getDestRandom(truckPos, truckRoll);
    
    for (let stepId of truckMoveData.hitList) {
        truckPos = stepId;
        updateTokens();
        let targetElement = document.getElementById(`tile-${stepId}`);
        if (targetElement) targetElement.classList.add('truck-highlight');
        await sleep(300);
        
        if (players.length === 0) { document.body.classList.remove('horror-mode'); return; }
        if (targetElement) targetElement.classList.remove('truck-highlight');
    }
    
    // 収集車によるダメージ判定
    players.forEach(p => {
        if (p.hp > 0 && (truckMoveData.hitList.includes(p.pos) || truckPos === p.pos)) {
            if (p.equip.doll) {
                p.equip.doll = false;
                log(`🎎 ${p.name}:身代わり人形が守った！`);
            } else if (Math.random() < 0.7) {
                dealDamage(p, 80, "収集車");
                showBloodAnim(p.name);
            } else {
                log(`💨 ${p.name}は収集車をギリギリ回避！`);
            }
        }
    });
    document.body.classList.remove('horror-mode');
    
    // 警察パトロール（偶数ラウンドのみ）
    if (roundCount % 2 === 0) {
        log(`<span class="system" style="color:#2980b9;">🚓 警察パトロール！</span>`);
        let policeRoll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
        let policeMoveData = getDestRandom(policePos, policeRoll);
        
        for (let stepId of policeMoveData.hitList) {
            policePos = stepId;
            updateTokens();
            let targetElement = document.getElementById(`tile-${stepId}`);
            if (targetElement) targetElement.classList.add('police-highlight');
            await sleep(200);
            if (players.length === 0) return;
            if (targetElement) targetElement.classList.remove('police-highlight');
        }
        
        // 警察による捕獲判定
        players.forEach(p => {
            if (p.hp > 0 && (policeMoveData.hitList.includes(p.pos) || policePos === p.pos)) {
                if (p.equip.doll) {
                    p.equip.doll = false;
                    log(`🎎 ${p.name}:身代わり人形が守った！`);
                } else if (p.hasID) {
                    p.hasID = false;
                    log(`🔵 ${p.name}:身分証で回避`);
                } else {
                    dealDamage(p, 30, "警察");
                    p.penaltyAP += 2;
                    showPoliceAnim(p.name);
                }
            }
        });
    }
    
    if (destTile < 0) destTile = pickDestTile();
    
    syncOnline();
    updateTokens();
}

function endGame() {
    gameOver = true;
    let results = players.map(p => {
        let terrValue = 0;
        Object.keys(territories).filter(k => territories[k] === p.id).forEach(tId => {
            let area = mapData.find(t => t.id == tId).area;
            terrValue += (area === "slum" ? 3 : area === "commercial" ? 6 : 10);
        });
        let resourceValue = p.cans * canPrice + p.trash * trashPrice;
        let totalScore = p.p + terrValue + resourceValue;
        
        return { name: p.name, color: p.color, p: p.p, terrValue, resourceValue, totalScore, emoji: charEmoji[p.charType] };
    }).sort((a, b) => b.totalScore - a.totalScore);
    
    let rankHTML = results.map((r, i) => {
        let rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '4️⃣';
        let fontSize = i === 0 ? 22 : 16;
        return `<div style="margin:8px 0;font-size:${fontSize}px;">${rankIcon} <span style="color:${r.color};">${r.emoji}${r.name}</span>: <b>${r.totalScore}P</b> (💰${r.p} 🚩${r.terrValue} 📦${r.resourceValue})</div>`;
    }).join('');
    
    document.getElementById("win-title").innerText = `${results[0].emoji} ${results[0].name} 優勝！`;
    document.getElementById("win-ranking").innerHTML = rankHTML;
    document.getElementById("win-overlay").style.display = "flex";
    playSfx('win');
    log(`🏆 ゲーム終了！優勝: ${results[0].name} (${results[0].totalScore}P)`);
    
    if (isOnlineMode) {
        broadcastNetworkData({ type: 'game_end', rankHTML: rankHTML, winTitle: `${results[0].emoji} ${results[0].name} 優勝！` });
    }
}

// ========== CPU AI ==========
async function processCPUTurn() {
    if (players.length === 0 || !players[turn]) return;
    
    let cpuPlayer = players[turn];
    await sleep(1500); // 思考時間演出
    if (players.length === 0 || turn !== cpuPlayer.id) return;
    
    // 手札あふれ処理
    while (cpuPlayer.hand.length > cpuPlayer.maxHand) {
        discardCard(0);
        await sleep(300);
        if (players.length === 0) return;
    }
    
    // ミニゲーム自動処理
    if (mgActive) {
        await sleep(1000);
        if (players.length === 0) return;
        processMiniGameResult(Math.random() > 0.6, "CPU判定");
        await sleep(500);
        if (players.length === 0) return;
    }
    
    // ダイスロール
    if (!diceRolled) {
        await rollDice();
        await sleep(500);
        if (players.length === 0) return;
    }
    
    let maxActionLoops = 30; // 無限ループ防止
    
    while (cpuPlayer.ap > 0 && !gameOver && turn === cpuPlayer.id && !cpuPlayer.skipTurn && !mgActive && cpuPlayer.hand.length <= cpuPlayer.maxHand && !cpuPlayer.cannotMove && maxActionLoops-- > 0) {
        if (players.length === 0) return;
        
        let currentTile = mapData.find(t => t.id === cpuPlayer.pos);
        let validNextTiles = currentTile.next.filter(id => id !== constructionPos);
        let moveCost = (isRainy && !cpuPlayer.rainGear && cpuPlayer.charType !== "athlete") ? 2 : 1;
        let canMove = (cpuPlayer.ap >= moveCost && validNextTiles.length > 0);
        
        let acted = false;
        let otherPlayersOnTile = players.filter(op => op.id !== cpuPlayer.id && op.pos === cpuPlayer.pos && op.hp > 0);
        
        // 武器カードの優先使用
        let weaponCards = cpuPlayer.hand.map((cardId, index) => ({ cardId, index, cardData: deckData[cardId] })).filter(x => x.cardData.type === 'weapon');
        if (weaponCards.length > 0 && cpuPlayer.ap >= 2 && Math.random() > 0.5) {
            let wc = weaponCards[0];
            let targetPlayers = players.filter(op => op.id !== cpuPlayer.id && op.hp > 0 && getDistance(cpuPlayer.pos, op.pos) <= wc.cardData.range);
            if (targetPlayers.length > 0) {
                cpuPlayer.ap -= 2;
                cpuPlayer.hand.splice(wc.index, 1);
                if (wc.cardData.aoe) {
                    targetPlayers.forEach(t => dealDamage(t, wc.cardData.dmg, wc.cardData.name, cpuPlayer));
                } else {
                    dealDamage(targetPlayers[0], wc.cardData.dmg, wc.cardData.name, cpuPlayer);
                }
                acted = true;
            }
        }
        
        // スリ
        if (!acted && otherPlayersOnTile.length > 0 && cpuPlayer.ap >= 3 && Math.random() > 0.6) {
            actionPickpocket();
            acted = true;
        }
        // 換金
        else if (!acted && currentTile.type === "exchange" && (cpuPlayer.cans > 0 || cpuPlayer.trash > 0)) {
            actionExchange();
            acted = true;
        }
        // バフ・アイテムカード使用
        else if (!acted && cpuPlayer.hand.length > 0 && cpuPlayer.ap >= 2 && Math.random() > 0.7) {
            let nonWeaponIndex = cpuPlayer.hand.findIndex(cardId => deckData[cardId].type !== 'weapon');
            if (nonWeaponIndex >= 0) {
                useCard(nonWeaponIndex, cpuPlayer.hand[nonWeaponIndex]);
                acted = true;
            }
        }
        // 陣地占領
        else if (!acted && cpuPlayer.ap >= 3 && ["normal", "can", "trash", "job", "exchange", "shelter"].includes(currentTile.type) && territories[cpuPlayer.pos] !== cpuPlayer.id && cpuPlayer.pos !== unclePos && Math.random() > 0.4) {
            actionOccupy();
            acted = true;
        }
        // バイト
        else if (!acted && currentTile.type === "job" && cpuPlayer.ap >= 4 && Math.random() > 0.3) {
            actionJob();
            acted = true;
        }
        // 缶拾い
        else if (!acted && currentTile.type === "can" && cpuPlayer.ap >= 1 && canPickedThisTurn < 3 && (!isRainy || cpuPlayer.rainGear) && cpuPlayer.pos !== animalPos) {
            actionCan();
            acted = true;
        }
        // ゴミ漁り
        else if (!acted && currentTile.type === "trash" && cpuPlayer.ap >= (cpuPlayer.equip.shoes ? 1 : 2) && (!isRainy || cpuPlayer.rainGear) && cpuPlayer.pos !== animalPos && Math.random() > 0.4) {
            actionTrash();
            acted = true;
        }
        // ショップ (CPUはスキップ)
        else if (!acted && currentTile.type === "shop" && cpuPlayer.p >= 5 && Math.random() > 0.5) {
            // Do nothing
        }
        // 移動
        else if (!acted && canMove) {
            executeMove(validNextTiles[Math.floor(Math.random() * validNextTiles.length)]);
            acted = true;
        }
        
        if (mgActive) {
            await sleep(1000);
            if (players.length === 0) return;
            processMiniGameResult(Math.random() > 0.6, "CPU判定");
            acted = true;
        }
        
        if (!acted) break; // やることがなければ終了
        await sleep(600);
    }
    
    if (!gameOver && turn === cpuPlayer.id) {
        await sleep(300);
        if (players.length > 0) endTurnLogic();
    }
}
