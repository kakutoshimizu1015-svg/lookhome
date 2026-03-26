// ========== SOUND EFFECTS ==========
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        let baseGain = 0;
        
        if (type === 'dice') { o.type = 'square'; o.frequency.value = 440; baseGain = 0.15; g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15); o.start(); o.stop(audioCtx.currentTime + 0.15); }
        else if (type === 'coin') { o.type = 'sine'; o.frequency.value = 880; baseGain = 0.15; g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); o.start(); o.stop(audioCtx.currentTime + 0.3); }
        else if (type === 'hit') { o.type = 'sawtooth'; o.frequency.value = 150; baseGain = 0.15; g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); o.start(); o.stop(audioCtx.currentTime + 0.2); }
        else if (type === 'success') { 
            o.type = 'sine'; o.frequency.value = 523; baseGain = 0.15; 
            setTimeout(() => { 
                const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(); 
                o2.connect(g2); g2.connect(audioCtx.destination); 
                g2.gain.value = 0.15 * globalMasterVolume; 
                o2.type = 'sine'; o2.frequency.value = 659; 
                g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); 
                o2.start(); o2.stop(audioCtx.currentTime + 0.3); 
            }, 150); 
            g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); 
            o.start(); o.stop(audioCtx.currentTime + 0.2); 
        }
        else if (type === 'fail') { o.type = 'sawtooth'; o.frequency.value = 200; baseGain = 0.15; o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.4); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4); o.start(); o.stop(audioCtx.currentTime + 0.4); }
        else if (type === 'move') { o.type = 'triangle'; o.frequency.value = 600; baseGain = 0.08; g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); o.start(); o.stop(audioCtx.currentTime + 0.1); }
        else if (type === 'death') { o.type = 'sawtooth'; o.frequency.value = 300; baseGain = 0.15; o.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.8); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8); o.start(); o.stop(audioCtx.currentTime + 0.8); }
        else if (type === 'win') { o.type = 'sine'; o.frequency.value = 523; baseGain = 0.15; g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); o.start(); o.stop(audioCtx.currentTime + 0.5); }
        else if (type === 'card') { o.type = 'triangle'; o.frequency.value = 1047; baseGain = 0.1; g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); o.start(); o.stop(audioCtx.currentTime + 0.2); }
        
        g.gain.value = baseGain * globalMasterVolume;
    } catch(e) {}
}

function updateVolume(val) {
    globalMasterVolume = parseFloat(val);
    document.getElementById("vol-disp").innerText = Math.round(globalMasterVolume * 100) + "%";
}

// UI Animations
function showBloodAnim(name) {
    const overlay = document.getElementById('blood-overlay');
    document.getElementById('blood-text').innerText = `${name}が轢かれた！`;
    overlay.style.display = 'flex';
    playSfx('death');
    setTimeout(() => overlay.style.display = 'none', 2000);
}

function showPoliceAnim(name) {
    const overlay = document.getElementById('police-alert-overlay');
    document.getElementById('police-alert-title').innerText = `🚓 ${name}補導！`;
    overlay.style.display = 'flex';
    playSfx('fail');
    setTimeout(() => overlay.style.display = 'none', 3000);
}

function showJobResult(isSuccess, pts) {
    const overlay = document.getElementById('job-result-overlay');
    const box = document.getElementById('job-result-box');
    const icon = document.getElementById('job-result-icon');
    const title = document.getElementById('job-result-title');
    const text = document.getElementById('job-result-text');
    
    if (isSuccess) {
        box.style.background = "#f1c40f"; box.style.color = "#333"; box.style.borderColor = "#f39c12";
        icon.innerText = "💼🎉"; title.innerText = "バイト大成功！"; text.innerText = `${pts}P獲得！`;
        playSfx('success');
    } else {
        box.style.background = "#2c3e50"; box.style.color = "white"; box.style.borderColor = "#1a252f";
        icon.innerText = "😭"; title.innerText = "バイト失敗..."; text.innerText = "報酬なし。";
        playSfx('fail');
    }
    overlay.style.display = 'flex';
}

let pendingCardId = -1;
function showMgResult(isWin, msg, cardId) {
    const overlay = document.getElementById("mg-result-overlay");
    const box = document.getElementById("mg-result-box");
    const icon = document.getElementById("mg-result-icon");
    const title = document.getElementById("mg-result-text");
    const subText = document.getElementById("mg-result-sub");
    
    if (isWin) {
        box.style.background = "#f1c40f"; box.style.color = "#333";
        icon.innerText = "🎉"; title.innerText = "大成功！"; pendingCardId = cardId;
        playSfx('success');
    } else {
        box.style.background = "#2c3e50"; box.style.color = "white";
        icon.innerText = "😭"; title.innerText = "失敗..."; pendingCardId = -1;
        playSfx('fail');
    }
    subText.innerText = msg;
    overlay.style.display = "flex";
}

function closeMgResult() {
    document.getElementById("mg-result-overlay").style.display = "none";
    if (pendingCardId !== -1) {
        showCardAcquisition(pendingCardId);
        pendingCardId = -1;
    }
}

async function showCardAcquisition(cardId) {
    setAnimating(true); // ネットワーク状態の適用を保留
    let cardData = deckData[cardId];
    document.getElementById("card-get-icon").innerText = cardData.icon;
    document.getElementById("card-get-name").innerText = cardData.name;
    document.getElementById("card-get-name").style.color = cardData.color;
    document.getElementById("card-get-desc").innerText = cardData.desc;
    
    let overlay = document.getElementById("card-get-overlay");
    overlay.style.display = "flex";
    
    // アニメーションのリセットと再実行
    overlay.firstElementChild.style.animation = "none";
    void overlay.offsetWidth; 
    overlay.firstElementChild.style.animation = "card-get-anim 2.5s forwards";
    
    playSfx('card');
    await sleep(2500);
    overlay.style.display = "none";
    setAnimating(false); // 保留していたネットワーク状態があれば適用
}