const SIZE = 6;
const COLORS = ["red", "blue", "green", "yellow", "purple"];
const ROUND_SECONDS = 120;
const MOVE_MS = 520;
const FALL_MS = 620;
const SPAWN_MS = 920;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const timerEl = document.getElementById("timer");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayTextEl = document.getElementById("overlayText");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const restartBtn = document.getElementById("restartBtn");

let board = [];
let score = 0;
let bestCombo = 1;
let timeLeft = ROUND_SECONDS;
let timerId = null;
let isBusy = false;
let gameOver = false;
let touchStartX = null;
let hasStarted = false;
let incomingByDirection = { left: { colors: [], rows: [] }, right: { colors: [], rows: [] } };
let gemIdCounter = 1;
let cellSize = 0;
let sidePreviewEls = [];

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function randColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function makeGem(color) {
  return { id: gemIdCounter++, color };
}

function pickTwoDistinctRows() {
  const a = Math.floor(Math.random() * SIZE);
  let b = Math.floor(Math.random() * SIZE);
  while (b === a) b = Math.floor(Math.random() * SIZE);
  return [a, b].sort((x, y) => x - y);
}

function pickIncomingConfig() {
  return { colors: [randColor(), randColor()], rows: pickTwoDistinctRows() };
}

function updateHud() {
  scoreEl.textContent = score;
  comboEl.textContent = `x${bestCombo}`;
  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, "0");
  timerEl.textContent = `${mins}:${secs}`;
}

function rollNextIncoming() {
  incomingByDirection = {
    left: pickIncomingConfig(),
    right: pickIncomingConfig()
  };
  mountSidePreviews();
}

function ensureBoardMetrics() {
  const gap = 8;
  cellSize = (boardEl.clientWidth - gap * (SIZE - 1)) / SIZE;
}

function boardToPixel(row, col) {
  const gap = 8;
  return { x: col * (cellSize + gap), y: row * (cellSize + gap) };
}

function createGemElement(gem) {
  const el = document.createElement("div");
  el.className = `gem ${gem.color}`;
  el.dataset.id = String(gem.id);
  el.style.position = "absolute";
  el.style.width = `${cellSize}px`;
  el.style.height = `${cellSize}px`;
  el.style.transition = "none";
  return el;
}

function mountBoardStatic() {
  ensureBoardMetrics();
  boardEl.innerHTML = "";
  boardEl.style.height = `${boardEl.clientWidth}px`;

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const bg = document.createElement("div");
      bg.className = "cell";
      bg.style.width = `${cellSize}px`;
      bg.style.height = `${cellSize}px`;
      const { x, y } = boardToPixel(row, col);
      bg.style.left = `${x}px`;
      bg.style.top = `${y}px`;
      boardEl.appendChild(bg);
    }
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const gem = board[row][col];
      if (!gem) continue;
      const el = createGemElement(gem);
      const { x, y } = boardToPixel(row, col);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      boardEl.appendChild(el);
    }
  }

  mountSidePreviews();
}

function clearSidePreviews() {
  sidePreviewEls.forEach((el) => el.remove());
  sidePreviewEls = [];
}

function mountSidePreviews() {
  if (!hasStarted && board.length === 0) return;
  clearSidePreviews();
  ensureBoardMetrics();
  ["left", "right"].forEach((direction) => {
    const config = incomingByDirection[direction];
    const side = direction === "left" ? boardEl.clientWidth + 8 : -34;
    config.colors.forEach((color, index) => {
      const el = document.createElement("div");
      el.className = `side-gem ${color}`;
      el.dataset.direction = direction;
      const row = config.rows[index];
      const { y } = boardToPixel(row, 0);
      el.style.left = `${side}px`;
      el.style.top = `${y + (cellSize - 26) / 2}px`;
      boardEl.appendChild(el);
      sidePreviewEls.push(el);
    });
  });
}

function animateSidePreviews(direction) {
  sidePreviewEls.forEach((el) => {
    el.classList.remove("tilt-left", "tilt-right");
    const dir = el.dataset.direction;
    const isActive = dir === direction;
    if (!isActive) {
      el.style.opacity = "0.22";
      return;
    }
    el.classList.add(direction === "left" ? "tilt-left" : "tilt-right");
    const leftNow = parseFloat(el.style.left);
    const topNow = parseFloat(el.style.top);
    const targetLeft = leftNow + (direction === "left" ? -92 : 92);
    const targetTop = Math.min(topNow, -18);
    el.style.left = `${targetLeft}px`;
    el.style.top = `${targetTop}px`;
    el.style.opacity = "1";
  });
}

function resetSidePreviewAnimation() {
  sidePreviewEls.forEach((el) => {
    el.classList.remove("tilt-left", "tilt-right");
    el.style.opacity = "0.95";
  });
}

function snapshotPositions() {
  const map = new Map();
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const gem = board[row][col];
      if (gem) map.set(gem.id, { row, col, gem });
    }
  }
  return map;
}

function rotateBoardState(direction) {
  const next = emptyBoard();
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (direction === "left") next[SIZE - 1 - col][row] = board[row][col];
      else next[col][SIZE - 1 - row] = board[row][col];
    }
  }
  board = next;
}

function applyGravityToBoard() {
  for (let col = 0; col < SIZE; col += 1) {
    const compact = [];
    for (let row = SIZE - 1; row >= 0; row -= 1) {
      if (board[row][col]) compact.push(board[row][col]);
    }
    for (let row = SIZE - 1, idx = 0; row >= 0; row -= 1, idx += 1) {
      board[row][col] = compact[idx] || null;
    }
  }
}

function animateToBoard(previousMap, duration, easing = "cubic-bezier(.18,.84,.22,1)", spawnStarts = new Map()) {
  ensureBoardMetrics();
  const currentElements = new Map();
  [...boardEl.querySelectorAll('.gem')].forEach((el) => currentElements.set(Number(el.dataset.id), el));
  const nextMap = snapshotPositions();

  nextMap.forEach(({ row, col, gem }, id) => {
    let el = currentElements.get(id);
    if (!el) {
      el = createGemElement(gem);
      const start = spawnStarts.get(id) || { x: boardToPixel(row, col).x, y: -cellSize - 28 };
      el.style.left = `${start.x}px`;
      el.style.top = `${start.y}px`;
      boardEl.appendChild(el);
    }
    const { x, y } = boardToPixel(row, col);
    el.style.transition = `left ${duration}ms ${easing}, top ${duration}ms ${easing}, transform ${duration}ms ${easing}, opacity 180ms ease`;
    requestAnimationFrame(() => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
  });

  previousMap.forEach((value, id) => {
    if (nextMap.has(id)) return;
    const el = currentElements.get(id);
    if (!el) return;
    el.style.transition = `transform 180ms ease, opacity 180ms ease`;
    requestAnimationFrame(() => {
      el.style.transform = "scale(0.4)";
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 200);
  });

  return sleep(duration + 40);
}

function findGroups() {
  const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const groups = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const gem = board[row][col];
      if (!gem || visited[row][col]) continue;
      const stack = [[row, col]];
      const group = [];
      visited[row][col] = true;
      while (stack.length) {
        const [r, c] = stack.pop();
        group.push([r, c]);
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (visited[nr][nc] || !board[nr][nc] || board[nr][nc].color !== gem.color) continue;
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        }
      }
      if (group.length >= 3) groups.push(group);
    }
  }
  return groups;
}

function removeGroups(groups, combo) {
  let removed = 0;
  for (const group of groups) {
    removed += group.length;
    for (const [r, c] of group) board[r][c] = null;
  }
  score += removed * 10 * combo;
  bestCombo = Math.max(bestCombo, combo);
  updateHud();
}

async function resolveBoard() {
  let combo = 1;
  while (true) {
    const groups = findGroups();
    if (!groups.length) break;
    const beforeRemove = snapshotPositions();
    removeGroups(groups, combo);
    await animateToBoard(beforeRemove, 180, "ease-out");
    const beforeFall = snapshotPositions();
    applyGravityToBoard();
    await animateToBoard(beforeFall, FALL_MS);
    combo += 1;
  }
}

function spawnStartPixel(col) {
  const target = boardToPixel(0, col);
  return { x: target.x, y: target.y - cellSize - 22 };
}

async function spawnIncoming(direction) {
  const config = incomingByDirection[direction];
  if (config.rows.some((col) => board[0][col])) {
    endGame("Brett voll", "Die obere Kante ist blockiert.");
    return false;
  }

  await sleep(180);
  const before = snapshotPositions();
  const spawnStarts = new Map();
  for (let i = 0; i < 2; i += 1) {
    const gem = makeGem(config.colors[i]);
    board[0][config.rows[i]] = gem;
    spawnStarts.set(gem.id, spawnStartPixel(config.rows[i]));
  }
  applyGravityToBoard();
  await animateToBoard(before, SPAWN_MS, "cubic-bezier(.16,.84,.22,1)", spawnStarts);
  rollNextIncoming();
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function animateTilt(direction) {
  animateSidePreviews(direction);
  boardEl.classList.remove("tilt-left", "tilt-right");
  boardEl.classList.add(direction === "left" ? "tilt-left" : "tilt-right");
  setTimeout(() => {
    boardEl.classList.remove("tilt-left", "tilt-right");
    resetSidePreviewAnimation();
  }, 820);
}

async function makeMove(direction) {
  if (isBusy || gameOver || !hasStarted) return;
  isBusy = true;
  animateTilt(direction);

  await sleep(220);
  const beforeRotate = snapshotPositions();
  rotateBoardState(direction);
  await animateToBoard(beforeRotate, MOVE_MS, "cubic-bezier(.18,.84,.22,1)");

  const beforeFall = snapshotPositions();
  applyGravityToBoard();
  await animateToBoard(beforeFall, FALL_MS);

  await resolveBoard();

  if (!gameOver) {
    const success = await spawnIncoming(direction);
    if (success) await resolveBoard();
  }

  mountBoardStatic();
  isBusy = false;
}

function showOverlay(title, text, buttonText = "Nochmal spielen") {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  restartBtn.textContent = buttonText;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

function endGame(title, text) {
  if (gameOver) return;
  gameOver = true;
  clearInterval(timerId);
  showOverlay(title, `${text} Endstand: ${score} Punkte. Combo: x${bestCombo}.`, "Neu starten");
}

function seedTutorialBoard() {
  board = [
    [null, null, null, null, null, null],
    [null, null, null, null, null, null],
    [null, null, makeGem("blue"), null, null, null],
    [null, makeGem("red"), null, null, null, null],
    [makeGem("red"), makeGem("blue"), null, makeGem("green"), null, null],
    [makeGem("red"), makeGem("blue"), makeGem("yellow"), makeGem("green"), makeGem("purple"), null]
  ];
}

function resetRunState() {
  clearInterval(timerId);
  score = 0;
  bestCombo = 1;
  timeLeft = ROUND_SECONDS;
  isBusy = false;
  gameOver = false;
  updateHud();
}

function beginRun() {
  resetRunState();
  hasStarted = true;
  hideOverlay();
  seedTutorialBoard();
  rollNextIncoming();
  mountBoardStatic();
  timerId = setInterval(() => {
    if (gameOver || !hasStarted) return;
    timeLeft -= 1;
    updateHud();
    if (timeLeft <= 0) endGame("Zeit abgelaufen", "2 Minuten vorbei.");
  }, 1000);
}

leftBtn.addEventListener("click", () => makeMove("left"));
rightBtn.addEventListener("click", () => makeMove("right"));
restartBtn.addEventListener("click", beginRun);
window.addEventListener("resize", () => {
  if (!hasStarted || isBusy) return;
  mountBoardStatic();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") makeMove("left");
  if (event.key === "ArrowRight") makeMove("right");
  if (event.key.toLowerCase() === "r") beginRun();
});
boardEl.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
}, { passive: true });
boardEl.addEventListener("touchend", (event) => {
  if (touchStartX === null) return;
  const deltaX = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(deltaX) > 28) makeMove(deltaX < 0 ? "left" : "right");
  touchStartX = null;
}, { passive: true });

resetRunState();
board = emptyBoard();
hasStarted = true;
rollNextIncoming();
hasStarted = false;
mountBoardStatic();
showOverlay(
  "Tilt Pop",
  "Linksdrehung nimmt die rechte Kante nach oben, Rechtsdrehung die linke. Das ist jetzt korrigiert.",
  "Start"
);
