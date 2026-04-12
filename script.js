const firebaseConfig = {
    apiKey: "AIzaSyC1pahrL4HvE-f59uITc-QL2dObvOwby9E",
    authDomain: "toh-multiplayer.firebaseapp.com",
    databaseURL: "https://toh-multiplayer-default-rtdb.firebaseio.com",
    projectId: "toh-multiplayer",
    storageBucket: "toh-multiplayer.firebasestorage.app",
    messagingSenderId: "428390154864",
    appId: "1:428390154864:web:26ff4010ee094b5da3aab5",
    measurementId: "G-5Y1WCXGBJB"
};

let db = null;

try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log("✅ Firebase connected successfully.");
    } else {
        console.warn("Firebase SDK not loaded. Multiplayer features will not work offline.");
    }
} catch (e) {
    console.error("Firebase init failed:", e);
}

// --- Game Variables ---
const symbols = ["★", "●", "▲", "■", "◆", "✿", "✦", "⬟", "⬢"];
let towers = [[], [], []];
let selected = null;
let moves = 0;
let totalDisks;
let startTime;
let gameFinished = false;
let gameStarted = false; // Locked until race starts
let totalPlayers = 1;
let resultsShown = false;
let multiMode = 'create'; // 'create' or 'join'
let activeRoomId = '';
let maxPlayersValue = 2; // Module-level — shared by joinMultiplayer & listenResults
let finishOrderListenerRef = null;  // Store so we can detach on Play Again

const playerId = "p_" + Math.random().toString(36).slice(2, 8);

// --- DOM Elements ---
const towersEl = document.querySelectorAll(".tower");
const movesEl = document.getElementById("moves");
const resultModal = document.getElementById("resultModal");
const resultTitle = document.getElementById("resultTitle");
const resultStats = document.getElementById("resultStats");

const modeSelect = document.getElementById("mode");
const multiOptions = document.getElementById("multiOptions");
const inviteBtn = document.getElementById("inviteBtn");
const chatSection = document.getElementById("chatSection");
const chatTitle = document.getElementById("chatTitle");
const emojiBar = document.getElementById("emojiBar");

// Multiplayer Inner Tabs
const tabCreate = document.getElementById("tabCreate");
const tabJoin = document.getElementById("tabJoin");
const createRoomView = document.getElementById("createRoomView");
const joinRoomView = document.getElementById("joinRoomView");
const createdRoomCode = document.getElementById("createdRoomCode");
const maxPlayersSelect = document.getElementById("maxPlayers");

// Disk +/- controls
const diskCountInput = document.getElementById("diskCount");
const diskDisplay = document.getElementById("diskDisplay");
document.getElementById("increaseDisk").onclick = () => {
    let v = parseInt(diskCountInput.value);
    if (v < 8) { diskCountInput.value = v + 1; diskDisplay.textContent = v + 1; }
};
document.getElementById("decreaseDisk").onclick = () => {
    let v = parseInt(diskCountInput.value);
    if (v > 3) { diskCountInput.value = v - 1; diskDisplay.textContent = v - 1; }
};

// Buttons & Inputs
const startBtn = document.getElementById("startBtn");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatInput = document.getElementById("chatInput");
const chatBox = document.getElementById("chatBox");
const playAgainBtn = document.getElementById("playAgainBtn");
const exitBtn = document.getElementById("exitBtn");

const playerNameInput = document.getElementById("playerName");
const roomIdInput = document.getElementById("roomId");

// --- Initialization & URL Parsing ---
window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        modeSelect.value = 'multi';
        multiOptions.style.display = 'block';
        switchMultiTab('join');
        roomIdInput.value = roomParam;
    }
};

// --- Tab Logic ---
function switchMultiTab(mode) {
    multiMode = mode;
    if (mode === 'create') {
        tabCreate.classList.add('active');
        tabJoin.classList.remove('active');
        createRoomView.style.display = 'block';
        joinRoomView.style.display = 'none';
        startBtn.textContent = 'Create Room';
        document.getElementById('diskCount').parentElement.style.display = 'flex'; // Show difficulty for Host
        
        // Auto-generate code once
        if(createdRoomCode.textContent === '----') {
            createdRoomCode.textContent = Math.random().toString(36).substring(2, 8).toUpperCase();
        }
    } else {
        tabJoin.classList.add('active');
        tabCreate.classList.remove('active');
        joinRoomView.style.display = 'block';
        createRoomView.style.display = 'none';
        startBtn.textContent = 'Join Room';
        document.getElementById('diskCount').parentElement.style.display = 'none'; // Hide difficulty for Joiner
    }
}

tabCreate.onclick = () => switchMultiTab('create');
tabJoin.onclick = () => switchMultiTab('join');

modeSelect.onchange = (e) => {
    if (e.target.value === 'multi') {
        if (!db) {
            alert("⚠️ You are currently offline or Firebase is blocked. Please connect to the internet to play Multiplayer!");
            modeSelect.value = 'single';
            return;
        }
        multiOptions.style.display = 'block';
        switchMultiTab(multiMode);
    } else {
        multiOptions.style.display = 'none';
        startBtn.textContent = "Start Game";
        // Always restore disk count when returning to Single Player
        document.getElementById('diskCount').parentElement.style.display = 'flex';
    }
};

// --- Game Logic ---
startBtn.onclick = startGame;
exitBtn.onclick = exitGame;

function startGame() {
    if (modeSelect.value === "multi") {
        if (!playerNameInput.value.trim()) {
            alert("Please enter your name.");
            return;
        }
        if (multiMode === 'join' && !roomIdInput.value.trim()) {
            alert("Please enter a room code to join.");
            return;
        }
        activeRoomId = multiMode === 'create'
            ? createdRoomCode.textContent.trim().toUpperCase()
            : roomIdInput.value.trim().toUpperCase();
    }

    resultModal.style.display = "none";
    gameFinished = false;
    resultsShown = false;
    selected = null;
    moves = 0;
    movesEl.textContent = 0;
    totalDisks = +diskCountInput.value;
    startTime = Date.now();

    towersEl.forEach(t => t.classList.remove('selected', 'invalid-move'));

    towers = [[], [], []];
    for (let i = totalDisks; i >= 1; i--) towers[0].push(i);
    render();

    // Switch to game view on mobile (hides setup panel)
    document.body.classList.add('game-active');

    // Show board, moves counter, and (for multiplayer) chat
    document.getElementById("boardSection").style.display = "flex";
    document.getElementById("gameControls").style.display = "flex";

    if (modeSelect.value === "multi") {
        document.body.classList.remove('single-mode');
        document.getElementById("chatSidebar").style.display = "block";
        document.getElementById("waitingOverlay").style.display = "flex";
        gameStarted = false;
        joinMultiplayer();
    } else {
        document.body.classList.add('single-mode');
        document.getElementById("chatSidebar").style.display = "none";
        document.getElementById("waitingOverlay").style.display = "none";
        gameStarted = true;
        chatSection.style.display = "none";
        emojiBar.style.display = "none";
        totalPlayers = 1;
    }
}

function render() {
    towersEl.forEach((towerEl, i) => {
        const container = document.getElementById(`tower-${i}`);
        container.innerHTML = "";
        
        towers[i].forEach(d => {
            const disk = document.createElement("div");
            disk.className = "disk";
            
            const minWidth = 40;
            const percentageWidth = minWidth + (d / totalDisks) * (95 - minWidth);
            disk.style.width = `${percentageWidth}%`;
            
            const hue = (d * 40) % 360;
            disk.style.background = `linear-gradient(135deg, hsl(${hue}, 90%, 60%), hsl(${hue}, 90%, 45%))`;
            
            disk.textContent = `${symbols[(d - 1) % symbols.length] || '●'} ${d}`;
            container.appendChild(disk);
        });
    });
}

// Click handling for moving disks
towersEl.forEach(t => {
    t.onclick = () => {
        if (!gameStarted || gameFinished) return; // Prevent moves before game starts
        const i = +t.dataset.i;

        if (selected === null) {
            if (!towers[i].length) return;
            selected = i;
            t.classList.add('selected');
            return;
        }

        if (selected === i) {
            selected = null;
            t.classList.remove('selected');
            return;
        }

        const disk = towers[selected].at(-1);
        const top = towers[i].at(-1);
        const prevTowerEl = document.querySelector(`.tower[data-i="${selected}"]`);

        if (top && top < disk) {
            t.classList.add('invalid-move');
            setTimeout(() => t.classList.remove('invalid-move'), 400);
            selected = null;
            if(prevTowerEl) prevTowerEl.classList.remove('selected');
            return;
        }

        towers[selected].pop();
        towers[i].push(disk);
        if(prevTowerEl) prevTowerEl.classList.remove('selected');
        selected = null;
        movesEl.textContent = ++moves;
        render();

        if (towers[2].length === totalDisks) {
            finishGame();
        }
    };
});

// --- Multiplayer Logic ---
async function joinMultiplayer() {
    try {
        chatSection.style.display = "flex";
        emojiBar.style.display = "flex";
        
        const roomPath = `rooms/${activeRoomId}`;
        const room = db.ref(roomPath);
        
        if (multiMode === 'create') {
            // Host sets maxPlayers and totalDisks
            maxPlayersValue = +maxPlayersSelect.value;
            await room.child("maxPlayers").set(maxPlayersValue);
            await room.child("totalDisks").set(totalDisks);
            // Reset any stale round data when creating fresh room
            await room.child("finishOrder").remove();
            await room.child("status").set("waiting");
        } else {
            // Joiner reads maxPlayers and totalDisks from host
            const snap = await room.child("maxPlayers").once("value");
            if (snap.exists()) {
                maxPlayersValue = snap.val();
            } else {
                maxPlayersValue = 2; // default fallback
            }

            // Sync difficulty from creator
            const diskSnap = await room.child("totalDisks").once("value");
            if (diskSnap.exists()) {
                totalDisks = diskSnap.val();
                diskCountInput.value = totalDisks;
                diskDisplay.textContent = totalDisks;
                towers = [[], [], []];
                for (let i = totalDisks; i >= 1; i--) towers[0].push(i);
                render();
            }
        }

        // Register this player in the room
        await room.child(`players/${playerId}`).set({
            id: playerId,
            name: playerNameInput.value.trim() || "Player"
        });

        // Auto-remove player on disconnect
        room.child(`players/${playerId}`).onDisconnect().remove();

        // Listen for player count changes (lobby management)
        room.child("players").on("value", snap => {
            const players = snap.val() || {};
            totalPlayers = Object.keys(players).length;
            chatTitle.textContent = `💬 Live Chat (${totalPlayers} / ${maxPlayersValue} connected)`;
            
            const overlay = document.getElementById("waitingOverlay");
            const wLabel = document.getElementById("waitingText");
            const wLoader = document.getElementById("waitingLoader");
            const wCount = document.getElementById("waitingCount");
            const wBtn = document.getElementById("startGameSyncBtn");

            if (totalPlayers < maxPlayersValue) {
                // Not everyone is here yet — show waiting state
                overlay.style.display = "flex";
                wLoader.style.display = "block";
                wBtn.style.display = "none";
                wLabel.textContent = "Waiting for Players";
                wCount.textContent = `${totalPlayers} / ${maxPlayersValue} Joined`;
            } else {
                // Lobby is full — show "Start Race!" button
                wLoader.style.display = "none";
                wLabel.textContent = "🎉 Lobby is Full!";
                wCount.textContent = "Everyone is ready!";
                wBtn.style.display = "block";
                wBtn.textContent = "▶ Start Race!";
                wBtn.onclick = () => {
                    wBtn.disabled = true;
                    wBtn.textContent = "Starting...";
                    db.ref(`rooms/${activeRoomId}/status`).set("playing");
                };
            }
        });

        // Listen for the "playing" status to sync game start across all clients
        room.child("status").on("value", snap => {
            const status = snap.val();
            if (status === "playing") {
                const overlay = document.getElementById("waitingOverlay");
                overlay.style.display = "none";
                if (!gameStarted) {
                    // Synchronised start time for all players
                    startTime = Date.now();
                    gameStarted = true;
                    gameFinished = false;
                    resultsShown = false;
                }
            } else if (status === "waiting") {
                // Room reset for a new round — re-lock the board
                gameStarted = false;
            }
        });

        listenResults();
        loadChat();
        loadEmojis();

    } catch (e) {
        console.error("Multiplayer Sync Error:", e);
        alert("❌ Firebase connection failed. Please check your internet connection and try again.");
    }
}

function finishGame() {
    if (gameFinished) return;
    gameFinished = true;

    if (modeSelect.value === "single" || !db) {
        // Single player: show result immediately
        const t = Math.floor((Date.now() - startTime) / 1000);
        const list = [{ id: playerId, name: playerNameInput.value.trim() || "You", time: t, moves }];
        showResult(1, list, true);
        return;
    }

    // Multiplayer: push this player's finish entry to Firebase
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    db.ref(`rooms/${activeRoomId}/finishOrder`).push({
        id: playerId,
        name: playerNameInput.value.trim() || "Player",
        moves,
        time: timeTaken
    });
}

function listenResults() {
    // Detach any existing listener first to avoid duplicate callbacks
    if (finishOrderListenerRef) {
        db.ref(`rooms/${activeRoomId}/finishOrder`).off("value", finishOrderListenerRef);
        finishOrderListenerRef = null;
    }

    finishOrderListenerRef = db.ref(`rooms/${activeRoomId}/finishOrder`).on("value", snap => {
        const raw = snap.val();
        const list = raw ? Object.values(raw) : [];
        const myPos = list.findIndex(p => p.id === playerId);
        const allDone = list.length >= maxPlayersValue;

        if (myPos === -1) {
            // This player hasn't finished yet
            if (resultModal.style.display === "flex") {
                updateScoreboard(list, -1, allDone);
            }
            return;
        }

        // This player HAS finished — show/update the modal
        resultModal.style.display = "flex";
        showResult(myPos + 1, list, allDone);
    });
}

function showResult(myRank, list, allDone) {
    resultModal.style.display = "flex";
    document.getElementById("waitingOverlay").style.display = "none";

    const isSingle = modeSelect.value === "single" || !db;

    if (isSingle) {
        resultTitle.textContent = "🏆 Puzzle Complete!";
        resultTitle.style.color = "gold";
        resultTitle.style.textShadow = "0 0 25px rgba(255,215,0,0.7)";
    } else if (allDone) {
        if (myRank === 1) {
            resultTitle.textContent = "🏆 YOU WON!";
            resultTitle.style.color = "gold";
            resultTitle.style.textShadow = "0 0 25px rgba(255,215,0,0.7)";
        } else {
            resultTitle.textContent = `🎮 Finished #${myRank} of ${list.length}`;
            resultTitle.style.color = "#22d3ee";
            resultTitle.style.textShadow = "none";
        }
    } else {
        resultTitle.textContent = myRank === 1
            ? `🥇 You're 1st! Waiting for others...`
            : `🎮 You're #${myRank} — ${list.length}/${maxPlayersValue} done`;
        resultTitle.style.color = "#a78bfa";
        resultTitle.style.textShadow = "none";
    }

    updateScoreboard(list, myRank - 1, allDone, isSingle);

    // Reveal "Play Again" only once all players are done (or in single-player)
    document.getElementById("playAgainBtn").style.display = (allDone || isSingle) ? "inline-block" : "none";
}

function updateScoreboard(list, myIdx, allDone, isSingle) {
    const rankColors = ["gold", "silver", "#cd7f32"];
    const medals = ["🥇", "🥈", "🥉"];

    // Single player: clean simple summary
    if (isSingle && list.length === 1) {
        const p = list[0];
        resultStats.innerHTML = `
        <div style="text-align:center; padding:16px 0;">
            <div style="font-size:3rem; margin-bottom:12px">🌟</div>
            <div style="font-size:1.1rem; color:#94a3b8; margin-bottom:16px;">Your Result</div>
            <div style="display:flex; justify-content:center; gap:30px;">
                <div style="text-align:center;">
                    <div style="font-size:2rem; font-weight:800; color:gold;">${p.moves}</div>
                    <div style="font-size:0.8rem; color:var(--text-sub); text-transform:uppercase; letter-spacing:1px;">Moves</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:2rem; font-weight:800; color:var(--accent);">${p.time}s</div>
                    <div style="font-size:0.8rem; color:var(--text-sub); text-transform:uppercase; letter-spacing:1px;">Time</div>
                </div>
            </div>
            <div style="margin-top:16px; font-size:0.9rem; color:#64748b;">Minimum moves possible: ${Math.pow(2, totalDisks) - 1}</div>
        </div>`;
        return;
    }

    // Multiplayer scoreboard
    const pending = allDone ? 0 : maxPlayersValue - list.length;
    let html = `<div style="font-size:0.9rem; font-weight:700; margin-bottom:8px; color:#94a3b8; letter-spacing:1px; text-transform:uppercase;">
        📊 Live Scoreboard — ${list.length}/${maxPlayersValue} Finished
    </div>`;
    html += `<ol style="padding:0; margin:0; list-style:none;">`;
    list.forEach((p, idx) => {
        const medal = idx < 3 ? medals[idx] : `${idx + 1}.`;
        const color = idx < 3 ? rankColors[idx] : "#94a3b8";
        const isMe = p.id === playerId;
        const bg = isMe ? "rgba(99,102,241,0.15)" : "transparent";
        const border = isMe ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent";
        html += `
        <li style="display:flex; justify-content:space-between; align-items:center;
                   padding:8px 12px; margin-bottom:6px; border-radius:10px;
                   background:${bg}; border:${border};">
            <span style="color:${color}; font-weight:700; font-size:1.05rem;">${medal} ${p.name}${isMe ? "<span style='font-size:0.72rem;color:#a78bfa;margin-left:4px;'>(you)</span>" : ""}</span>
            <span style="color:#e2e8f0; font-size:0.88rem;">${p.time}s &nbsp;|&nbsp; ${p.moves} moves</span>
        </li>`;
    });
    for (let i = 0; i < pending; i++) {
        html += `<li style="padding:8px 12px; margin-bottom:6px; border-radius:10px;
                   background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.1);
                   color:#475569; font-style:italic;">⏳ Still playing...</li>`;
    }
    html += `</ol>`;
    resultStats.innerHTML = html;
}

// --- Chat & Emoji ---
sendChatBtn.onclick = sendChat;
chatInput.onkeypress = (e) => { if (e.key === "Enter") sendChat(); };

if(inviteBtn) {
    inviteBtn.onclick = () => {
        const code = createdRoomCode.textContent;
        if(code === '----') return;
        const link = `${location.origin}${location.pathname}?room=${code}`;
        navigator.clipboard.writeText(link).then(() => {
            const originalText = inviteBtn.textContent;
            inviteBtn.textContent = "✅ Copied!";
            setTimeout(() => inviteBtn.textContent = originalText, 2000);
        }).catch(() => {
            prompt("Copy this link:", link);
        });
    };
}

function sendChat() {
    if (!chatInput.value.trim() || !db || !activeRoomId) return;
    db.ref(`rooms/${activeRoomId}/chat`).push({
        senderId: playerId,
        name: playerNameInput.value.trim() || "Anonymous",
        msg: chatInput.value.trim()
    });
    chatInput.value = "";
}

function loadChat() {
    chatBox.innerHTML = '<div class="chat-msg system">Welcome to the chat!</div>';
    db.ref(`rooms/${activeRoomId}/chat`).on("child_added", s => {
        const c = s.val();
        const isMe = c.senderId === playerId;
        const div = document.createElement("div");
        div.className = `chat-msg ${isMe ? "sent" : "received"}`;
        div.innerHTML = isMe
            ? `${c.msg}`
            : `<div class="chat-sender">${c.name}</div>${c.msg}`;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.onclick = () => {
        if (!db || modeSelect.value !== "multi" || !activeRoomId) return;
        const emoji = btn.textContent;
        db.ref(`rooms/${activeRoomId}/emojis`).push({
            emoji: emoji,
            id: Math.random().toString()
        });
    };
});

function loadEmojis() {
    db.ref(`rooms/${activeRoomId}/emojis`).limitToLast(1).on("child_added", s => {
        const data = s.val();
        if(data) spawnEmoji(data.emoji);
    });
}

function spawnEmoji(emojiChar) {
    const container = document.getElementById("floating-emojis-container");
    const emoji = document.createElement("div");
    emoji.className = "floating-emoji";
    emoji.textContent = emojiChar;
    
    const leftPos = 40 + Math.random() * 20; 
    emoji.style.left = `${leftPos}%`;
    emoji.style.bottom = "10px";
    
    container.appendChild(emoji);
    
    setTimeout(() => {
        if (container.contains(emoji)) {
            container.removeChild(emoji);
        }
    }, 3000);
}

// --- Play Again ---
playAgainBtn.onclick = () => {
    resultModal.style.display = "none";
    resultStats.innerHTML = "";
    document.getElementById("playAgainBtn").style.display = "none";

    gameFinished = false;
    resultsShown = false;
    gameStarted = false;
    moves = 0;
    selected = null;
    movesEl.textContent = 0;
    towers = [[], [], []];
    for (let i = totalDisks; i >= 1; i--) towers[0].push(i);
    render();

    if (modeSelect.value === "multi" && activeRoomId && db) {
        // Step 1: Detach old finishOrder listener BEFORE removing data
        if (finishOrderListenerRef) {
            db.ref(`rooms/${activeRoomId}/finishOrder`).off("value", finishOrderListenerRef);
            finishOrderListenerRef = null;
        }

        // Step 2: Reset Firebase round data
        db.ref(`rooms/${activeRoomId}/finishOrder`).remove();
        db.ref(`rooms/${activeRoomId}/status`).set("waiting");

        // Step 3: Show lobby overlay for next round
        document.getElementById("waitingText").textContent = "🔁 Ready for Next Round?";
        document.getElementById("waitingCount").textContent = "All players still in room";
        document.getElementById("waitingLoader").style.display = "none";
        const wBtn = document.getElementById("startGameSyncBtn");
        wBtn.style.display = "block";
        wBtn.textContent = "▶ Start Race!";
        wBtn.disabled = false;
        wBtn.onclick = () => {
            // Re-attach fresh listener for new round BEFORE setting status to "playing"
            listenResults();
            wBtn.disabled = true;
            wBtn.textContent = "Starting...";
            db.ref(`rooms/${activeRoomId}/status`).set("playing");
        };
        document.getElementById("waitingOverlay").style.display = "flex";
    } else {
        // Single player: restart immediately
        gameStarted = true;
        startTime = Date.now();
    }
};

function exitGame() {
    resultModal.style.display = "none";
    document.body.classList.remove('game-active');

    // Hide board and moves panel — back to setup screen
    document.getElementById("boardSection").style.display = "none";
    document.getElementById("chatSidebar").style.display = "none";
    document.getElementById("gameControls").style.display = "none";

    // Detach all Firebase listeners
    if (db && activeRoomId) {
        if (finishOrderListenerRef) {
            db.ref(`rooms/${activeRoomId}/finishOrder`).off("value", finishOrderListenerRef);
            finishOrderListenerRef = null;
        }
        db.ref(`rooms/${activeRoomId}/players/${playerId}`).remove();
    }

    window.location.href = location.origin + location.pathname;
}

// Bind exit button
const exitGameBtn = document.getElementById("exitGameBtn");
if (exitGameBtn) {
    exitGameBtn.onclick = () => {
        if (confirm("Are you sure you want to abandon the game and exit?")) {
            exitGame();
        }
    };
}
