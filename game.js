(() => {
  const COLS = 20;
  const ROWS = 20;
  const BASE_SPEED = 150;
  const MIN_SPEED = 68;
  const BEST_KEY = "galaxy-snake-best";

  const KEYS = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };

  const board = must("board");
  const starsCanvas = must("stars");
  const boardFrame = must("board-frame");
  const overlay = must("overlay");
  const overlayKicker = must("overlay-kicker");
  const overlayTitle = must("overlay-title");
  const overlayText = must("overlay-text");
  const restartBtn = must("restart");
  const scoreEl = must("score");
  const bestEl = must("best");
  const liveEl = must("live");

  const ctx = board.getContext("2d");
  const starCtx = starsCanvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let snake = [];
  let dir = { x: 1, y: 0 };
  let queue = [];
  let food = null;
  let score = 0;
  let best = loadBest();
  let speed = BASE_SPEED;
  let state = "idle";
  let effects = [];
  let acc = 0;
  let lastTime = 0;
  let stars = [];
  let starKey = "";
  let meteor = null;
  let touchStart = null;

  function must(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error("找不到 #" + id);
    return el;
  }

  function loadBest() {
    try {
      const value = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (error) {
      /* 私人瀏覽模式可能無法寫入 */
    }
  }

  function live(text) {
    liveEl.textContent = text;
  }

  function renderHud() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }

  function showOverlay(kicker, title, text, withRestart) {
    overlay.hidden = false;
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    restartBtn.hidden = !withRestart;
  }

  function isOpposite(a, b) {
    return a.x + b.x === 0 && a.y + b.y === 0;
  }

  function spawnFood() {
    const taken = new Set(snake.map((part) => part.x + "," + part.y));
    const open = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!taken.has(x + "," + y)) open.push({ x, y });
      }
    }
    if (!open.length) {
      food = null;
      win();
      return;
    }
    food = open[Math.floor(Math.random() * open.length)];
  }

  function reset() {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0;
    speed = BASE_SPEED;
    state = "idle";
    effects = [];
    acc = 0;
    lastTime = 0;
    spawnFood();
    renderHud();
    live("按方向鍵開始。吃掉星塵讓身體變長，避開牆壁和自己的身體。");
    showOverlay(
      "準備出發",
      "按方向鍵開始",
      "吃掉星塵讓身體變長，避開牆壁和自己的身體。",
      false
    );
  }

  function start() {
    state = "playing";
    acc = 0;
    lastTime = 0;
    overlay.hidden = true;
    live("遊戲開始");
  }

  function die(kind) {
    state = "dead";
    const reason = kind === "self" ? "咬到自己的身體了。" : "撞到牆壁了。";
    showOverlay(
      "失敗",
      "遊戲結束",
      reason + "分數 " + score + "。按空白鍵或按鈕再玩一次。",
      true
    );
    live("遊戲結束。" + reason + "分數 " + score + "。");
  }

  function win() {
    state = "win";
    showOverlay(
      "完成",
      "星域清空",
      "你吃完了所有星塵。分數 " + score + "。",
      true
    );
    live("你吃完了所有星塵。分數 " + score + "。");
  }

  function enqueue(x, y) {
    const reference = queue.length ? queue[queue.length - 1] : dir;
    if (reference.x === x && reference.y === y) return;
    if (isOpposite(reference, { x, y })) return;
    if (queue.length >= 2) return;
    queue.push({ x, y });
  }

  function input(x, y) {
    if (Math.abs(x) + Math.abs(y) !== 1) return;
    if (state === "dead" || state === "win") reset();
    if (state === "idle") {
      if (isOpposite(dir, { x, y })) return;
      dir = { x, y };
      start();
      return;
    }
    if (state === "playing") enqueue(x, y);
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = snake[0];
    const next = { x: head.x + dir.x, y: head.y + dir.y };
    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      die("wall");
      return;
    }
    const eating = food && next.x === food.x && next.y === food.y;
    const checkLength = eating ? snake.length : snake.length - 1;
    for (let i = 0; i < checkLength; i += 1) {
      if (snake[i].x === next.x && snake[i].y === next.y) {
        die("self");
        return;
      }
    }
    snake.unshift(next);
    if (eating) {
      effects.push({ x: food.x, y: food.y, life: 1 });
      score += 1;
      if (score > best) {
        best = score;
        saveBest();
      }
      speed = Math.max(MIN_SPEED, BASE_SPEED - score * 4);
      spawnFood();
      renderHud();
      live("分數 " + score);
    } else {
      snake.pop();
    }
  }

  function updateEffects(delta) {
    effects = effects.filter((fx) => {
      fx.life -= delta / 420;
      return fx.life > 0;
    });
  }

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (width < 2 || height < 2) return false;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return true;
  }

  function ensureStars() {
    const key = starsCanvas.width + "x" + starsCanvas.height;
    if (key === starKey) return;
    starKey = key;
    const count = Math.max(80, Math.min(380, Math.round((starsCanvas.width * starsCanvas.height) / 4200)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      r: Math.random() * 1.25 + 0.2,
      phase: Math.random() * Math.PI * 2,
      tone: Math.random(),
    }));
  }

  function drawStars(time) {
    if (!fitCanvas(starsCanvas)) return;
    ensureStars();
    const width = starsCanvas.width;
    const height = starsCanvas.height;
    starCtx.clearRect(0, 0, width, height);
    for (const star of stars) {
      const drift = reduceMotion ? 0 : (time * 0.000008) * (0.15 + star.z);
      const x = ((star.x + drift) % 1) * width;
      const y = star.y * height;
      const twinkle = reduceMotion ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.002 + star.phase));
      const radius = star.r * (0.55 + star.z) * Math.min(window.devicePixelRatio || 1, 2);
      if (star.tone > 0.92) starCtx.fillStyle = "rgba(253, 224, 171, " + twinkle + ")";
      else if (star.tone > 0.84) starCtx.fillStyle = "rgba(186, 230, 253, " + twinkle + ")";
      else starCtx.fillStyle = "rgba(255, 255, 255, " + twinkle + ")";
      starCtx.beginPath();
      starCtx.arc(x, y, radius, 0, Math.PI * 2);
      starCtx.fill();
    }
    drawMeteor(width, height);
  }

  function drawMeteor(width, height) {
    if (reduceMotion) return;
    if (!meteor) {
      if (Math.random() < 0.0015) {
        meteor = {
          x: Math.random() * 0.65,
          y: Math.random() * 0.45,
          vx: 0.010 + Math.random() * 0.008,
          vy: 0.005 + Math.random() * 0.005,
          life: 1,
        };
      }
      return;
    }
    meteor.x += meteor.vx;
    meteor.y += meteor.vy;
    meteor.life -= 0.018;
    if (meteor.life <= 0 || meteor.x > 1.05 || meteor.y > 1.05) {
      meteor = null;
      return;
    }
    const x2 = meteor.x * width;
    const y2 = meteor.y * height;
    const x1 = x2 - meteor.vx * width * 8;
    const y1 = y2 - meteor.vy * height * 8;
    const gradient = starCtx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(224, 242, 254, " + meteor.life + ")");
    starCtx.strokeStyle = gradient;
    starCtx.lineWidth = 2;
    starCtx.beginPath();
    starCtx.moveTo(x1, y1);
    starCtx.lineTo(x2, y2);
    starCtx.stroke();
  }

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }

  function drawStarShape(cx, cy, outer, inner) {
    const spikes = 5;
    let rot = -Math.PI / 2 + performance.now() / 900;
    const step = Math.PI / spikes;
    ctx.beginPath();
    for (let i = 0; i < spikes; i += 1) {
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
    }
    ctx.closePath();
  }

  function drawBoard(time) {
    if (!fitCanvas(board)) return;
    const width = board.width;
    const height = board.height;
    const cellW = width / COLS;
    const cellH = height / ROWS;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(186, 230, 253, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x += 1) {
      ctx.moveTo(x * cellW, 0);
      ctx.lineTo(x * cellW, height);
    }
    for (let y = 1; y < ROWS; y += 1) {
      ctx.moveTo(0, y * cellH);
      ctx.lineTo(width, y * cellH);
    }
    ctx.stroke();

    for (const fx of effects) {
      const cx = (fx.x + 0.5) * cellW;
      const cy = (fx.y + 0.5) * cellH;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) * (0.2 + (1 - fx.life) * 0.8), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(253, 230, 138, " + fx.life + ")";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (food) {
      const pulse = 0.84 + 0.16 * Math.sin(time / 180);
      const cx = (food.x + 0.5) * cellW;
      const cy = (food.y + 0.5) * cellH;
      const outer = Math.min(cellW, cellH) * 0.34 * pulse;
      ctx.save();
      ctx.shadowColor = "rgba(251, 113, 133, 0.9)";
      ctx.shadowBlur = outer;
      ctx.fillStyle = "#fde68a";
      drawStarShape(cx, cy, outer, outer * 0.46);
      ctx.fill();
      ctx.restore();
    }

    snake.forEach((part, index) => {
      const fromHead = snake.length === 1 ? 0 : (snake.length - 1 - index) / (snake.length - 1);
      const inset = Math.min(cellW, cellH) * 0.1;
      const x = part.x * cellW + inset;
      const y = part.y * cellH + inset;
      const w = cellW - inset * 2;
      const h = cellH - inset * 2;
      const red = Math.round(15 + (153 - 15) * (1 - fromHead));
      const green = Math.round(118 + (246 - 118) * (1 - fromHead));
      const blue = Math.round(110 + (228 - 110) * (1 - fromHead));
      ctx.fillStyle = "rgb(" + red + ", " + green + ", " + blue + ")";
      if (index === 0) {
        ctx.save();
        ctx.shadowColor = "rgba(94, 234, 212, 0.85)";
        ctx.shadowBlur = Math.min(cellW, cellH) * 0.45;
      }
      roundRect(x, y, w, h, Math.min(w, h) * 0.35);
      ctx.fill();
      if (index === 0) ctx.restore();
    });

    const head = snake[0];
    const cx = (head.x + 0.5) * cellW + dir.x * cellW * 0.1;
    const cy = (head.y + 0.5) * cellH + dir.y * cellH * 0.1;
    const eyeOffset = Math.min(cellW, cellH) * 0.16;
    const eyeRadius = Math.max(1.5, Math.min(cellW, cellH) * 0.07);
    for (const side of [-1, 1]) {
      const ex = cx + (dir.y !== 0 ? side * eyeOffset : 0);
      const ey = cy + (dir.x !== 0 ? side * eyeOffset : 0);
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#082f49";
      ctx.beginPath();
      ctx.arc(ex + dir.x * eyeRadius * 0.4, ey + dir.y * eyeRadius * 0.4, eyeRadius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick(time) {
    requestAnimationFrame(tick);
    if (state === "playing") {
      if (!lastTime) lastTime = time;
      let delta = time - lastTime;
      if (delta > 250) delta = 250;
      acc += delta;
      while (acc >= speed && state === "playing") {
        step();
        acc -= speed;
      }
      updateEffects(delta);
      lastTime = time;
    } else {
      lastTime = 0;
      if (effects.length) updateEffects(16);
    }
    drawStars(time);
    drawBoard(time);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (state === "dead" || state === "win") reset();
      return;
    }
    const direction = KEYS[event.key];
    if (!direction) return;
    event.preventDefault();
    input(direction[0], direction[1]);
  });

  restartBtn.addEventListener("click", () => reset());

  const PAD = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  document.querySelectorAll(".pad button").forEach((button) => {
    button.addEventListener("click", () => {
      const mapped = PAD[button.dataset.dir];
      input(mapped[0], mapped[1]);
    });
  });

  boardFrame.addEventListener("touchstart", (event) => {
    const point = event.changedTouches[0];
    touchStart = { x: point.clientX, y: point.clientY };
  }, { passive: true });

  boardFrame.addEventListener("touchend", (event) => {
    if (!touchStart) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touchStart.x;
    const dy = point.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) input(Math.sign(dx), 0);
    else input(0, Math.sign(dy));
  }, { passive: true });

  reset();
  requestAnimationFrame(tick);
})();
