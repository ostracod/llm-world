const canvas = document.getElementById("canvas");
const inventoryEl = document.getElementById("inventory");
const ctx = canvas.getContext("2d");
const cellSize = 32;

const icons = {
    player: "🧑",
    sock: "🧦",
    wall: "🧱",
    basket: "🧺",
};

let playerViewRadius = 0;

function setupCanvas(logicalWidth, logicalHeight) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function updateInventory(inventory) {
    if (inventory.length === 0) {
        inventoryEl.textContent = "Player inventory: (empty)";
        return;
    }
    const itemIcons = inventory.map((name) => icons[name] ?? "?").join("");
    inventoryEl.textContent = `Player inventory: ${itemIcons}`;
}

function drawPlayerViewOutline(x, y) {
    const left = (x - playerViewRadius) * cellSize;
    const top = (y - playerViewRadius) * cellSize;
    const size = (2 * playerViewRadius + 1) * cellSize;
    ctx.strokeStyle = "#0000FF";
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, size, size);
}

function drawWorld(state) {
    const logicalWidth = state.width * cellSize;
    const logicalHeight = state.height * cellSize;
    setupCanvas(logicalWidth, logicalHeight);

    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize, 0);
        ctx.lineTo(x * cellSize, logicalHeight);
        ctx.stroke();
    }
    for (let y = 0; y <= state.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellSize);
        ctx.lineTo(logicalWidth, y * cellSize);
        ctx.stroke();
    }

    const players = [];
    for (let index = 0; index < state.entities.length; index++) {
        const name = state.entities[index];
        if (name === null) {
            continue;
        }
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        if (name === "player") {
            players.push({ x, y });
        }
    }

    for (const { x, y } of players) {
        drawPlayerViewOutline(x, y);
    }

    ctx.font = `${cellSize * 0.75}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let index = 0; index < state.entities.length; index++) {
        const name = state.entities[index];
        if (name === null) {
            continue;
        }
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        const icon = icons[name] ?? "?";
        ctx.fillText(
            icon,
            x * cellSize + cellSize / 2,
            y * cellSize + cellSize / 2
        );
    }

    updateInventory(state.inventory);
}

async function init() {
    const response = await fetch("/constants");
    const constants = await response.json();
    playerViewRadius = constants.playerViewRadius;

    const ws = new WebSocket(`ws://${location.host}`);
    ws.onmessage = (event) => {
        drawWorld(JSON.parse(event.data));
    };
}

init();
