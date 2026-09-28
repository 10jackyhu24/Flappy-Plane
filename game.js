(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
    intro: document.querySelector("#introPanel"),
    result: document.querySelector("#resultPanel"),
    pause: document.querySelector("#pausePanel"),
    hud: document.querySelector("#hud"),
    score: document.querySelector("#scoreValue"),
    best: document.querySelector("#bestValue"),
    finalScore: document.querySelector("#finalScore"),
    finalBest: document.querySelector("#finalBest"),
    resultMessage: document.querySelector("#resultMessage"),
    start: document.querySelector("#startButton"),
    restart: document.querySelector("#restartButton"),
    resume: document.querySelector("#resumeButton"),
    pauseButton: document.querySelector("#pauseButton"),
    soundButton: document.querySelector("#soundButton"),
    flightTip: document.querySelector("#flightTip"),
    enemyAlert: document.querySelector("#enemyAlert"),
    altitude: document.querySelector("#altitudeValue"),
    speed: document.querySelector("#speedValue"),
  };

  const TAU = Math.PI * 2;
  const storageKey = "skyline-ace-best";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const world = {
    width: 0,
    height: 0,
    dpr: 1,
    groundY: 0,
    clock: 0,
    scroll: 0,
    speed: 220,
  };

  const game = {
    state: "intro",
    score: 0,
    best: loadBest(),
    runTime: 0,
    nextBuilding: 1.25,
    nextCloud: 1.4,
    nextEnemy: 5.2,
    tipUntil: 0,
    alertUntil: 0,
    muted: false,
    lastTime: performance.now(),
    shake: 0,
  };

  const plane = {
    x: 0,
    y: 0,
    vy: 0,
    rotation: 0,
  };

  let buildings = [];
  let stormClouds = [];
  let enemies = [];
  let particles = [];
  let audioContext = null;

  function loadBest() {
    try {
      return Math.max(0, Number.parseInt(localStorage.getItem(storageKey) || "0", 10) || 0);
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(storageKey, String(game.best));
    } catch {
      // The game remains fully playable when storage is unavailable.
    }
  }

  function padScore(value) {
    return String(Math.max(0, value)).padStart(3, "0");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function hash(value) {
    return Math.abs(Math.sin(value * 91.733 + 17.17) * 43758.5453) % 1;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    world.width = Math.max(320, rect.width);
    world.height = Math.max(480, rect.height);
    world.dpr = Math.min(window.devicePixelRatio || 1, 2);
    world.groundY = world.height - clamp(world.height * 0.105, 60, 92);

    canvas.width = Math.round(world.width * world.dpr);
    canvas.height = Math.round(world.height * world.dpr);
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);

    if (game.state === "intro") {
      plane.x = world.width * (world.width < 760 ? 0.72 : 0.73);
      plane.y = world.height * (world.width < 760 ? 0.29 : 0.44);
    } else {
      plane.x = clamp(plane.x, 78, world.width * 0.28);
      plane.y = clamp(plane.y, 40, world.groundY - 30);
    }
  }

  function resetGame() {
    game.score = 0;
    game.runTime = 0;
    game.nextBuilding = 1.15;
    game.nextCloud = random(1.15, 1.65);
    game.nextEnemy = random(4.8, 6.3);
    game.tipUntil = 4;
    game.alertUntil = 0;
    game.shake = 0;
    world.scroll = 0;
    world.speed = clamp(world.width * 0.17, 175, 245);
    plane.x = Math.max(80, world.width * (world.width < 600 ? 0.22 : 0.24));
    plane.y = world.height * 0.43;
    plane.vy = -40;
    plane.rotation = 0;
    buildings = [];
    stormClouds = [];
    enemies = [];
    particles = [];
    updateScore();
  }

  function startGame() {
    ensureAudio();
    resetGame();
    game.state = "playing";
    setPanels();
    tone(330, 0.08, "sine", 0.035, 0);
    tone(520, 0.1, "sine", 0.03, 0.07);
  }

  function endGame() {
    if (game.state !== "playing") return;
    game.state = "crashed";
    game.shake = prefersReducedMotion ? 0 : 12;
    game.best = Math.max(game.best, game.score);
    saveBest();
    updateScore();
    ui.flightTip.classList.remove("is-visible");
    ui.enemyAlert.classList.remove("is-visible");
    burst(plane.x, plane.y, 22, "#ff956c");
    burst(plane.x, plane.y, 15, "#8ffff3");
    tone(120, 0.28, "sawtooth", 0.05, -45);

    window.setTimeout(() => {
      if (game.state !== "crashed") return;
      game.state = "gameover";
      ui.finalScore.textContent = padScore(game.score);
      ui.finalBest.textContent = padScore(game.best);
      ui.resultMessage.textContent = getResultMessage(game.score);
      setPanels();
    }, 650);
  }

  function getResultMessage(score) {
    if (score === 0) return "先熟悉拉升節奏，下一次一定會更遠。";
    if (score < 6) return "已經抓到感覺了，再試一次突破天際線！";
    if (score < 15) return "漂亮的飛行！城市王牌正在向你招手。";
    return "傳奇級航線完成，整座城市都記住你了。";
  }

  function togglePause(forcePause = false) {
    if (game.state === "playing") {
      game.state = "paused";
    } else if (game.state === "paused" && !forcePause) {
      game.state = "playing";
      game.lastTime = performance.now();
    } else {
      return;
    }
    setPanels();
  }

  function setPanels() {
    ui.intro.classList.toggle("is-visible", game.state === "intro");
    ui.result.classList.toggle("is-visible", game.state === "gameover");
    ui.pause.classList.toggle("is-visible", game.state === "paused");
    ui.hud.classList.toggle("is-visible", ["playing", "paused", "crashed", "gameover"].includes(game.state));
    ui.pauseButton.classList.toggle("is-paused", game.state === "paused");
    ui.pauseButton.setAttribute("aria-label", game.state === "paused" ? "繼續遊戲" : "暫停遊戲");
  }

  function updateScore() {
    const score = padScore(game.score);
    const best = padScore(game.best);
    ui.score.textContent = score;
    ui.best.textContent = best;
  }

  function flap() {
    if (game.state !== "playing") return;
    plane.vy = -clamp(world.height * 0.55, 350, 445);
    emitTrail(plane.x - 27, plane.y + 3, 5, true);
    tone(510, 0.055, "triangle", 0.025, 130);
  }

  function ensureAudio() {
    if (game.muted || audioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext = new AudioContext();
  }

  function tone(frequency, duration, type, volume, slide = 0) {
    if (game.muted) return;
    ensureAudio();
    if (!audioContext) return;
    if (audioContext.state === "suspended") audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.linearRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function toggleSound() {
    game.muted = !game.muted;
    ui.soundButton.classList.toggle("is-muted", game.muted);
    ui.soundButton.setAttribute("aria-label", game.muted ? "開啟音效" : "關閉音效");
    if (!game.muted) {
      ensureAudio();
      tone(620, 0.06, "sine", 0.025, 90);
    }
  }

  function spawnBuilding() {
    const minHeight = Math.max(105, world.height * 0.17);
    const width = random(world.width < 600 ? 64 : 78, world.width < 600 ? 94 : 122);
    const x = world.width + 60;
    const safeGap = clamp(world.height * 0.17, 120, 165);
    let maxHeight = Math.min(world.groundY - 120, world.height * (game.score > 10 ? 0.61 : 0.55));

    for (const cloud of stormClouds) {
      if (horizontalRangesOverlap(x, width, cloud.x, cloud.width, 16)) {
        maxHeight = Math.min(maxHeight, world.groundY - (cloud.y + cloud.height + safeGap));
      }
    }

    if (maxHeight < minHeight) return false;
    const heightBias = Math.pow(Math.random(), 0.82);
    const height = lerp(minHeight, maxHeight, heightBias);

    const building = {
      x,
      width,
      height,
      seed: Math.floor(random(1, 9999)),
      style: Math.floor(random(0, 4)),
      passed: false,
    };
    buildings.push(building);
    spawnLowBuildingCloudLayers(building);
    return true;
  }

  function spawnStormCloud() {
    const width = random(world.width < 600 ? 126 : 158, world.width < 600 ? 178 : 226);
    const height = width * random(0.44, 0.56);
    const x = world.width + 76;

    if (stormClouds.some((cloud) => horizontalRangesOverlap(x, width, cloud.x, cloud.width, 24))) return false;

    const minY = clamp(world.height * 0.075, 48, 76);
    const safeGap = clamp(world.height * 0.19 - Math.min(30, game.score) * 0.6, 145, 175);
    let routeBottom = world.groundY - safeGap;

    for (const building of buildings) {
      if (horizontalRangesOverlap(x, width, building.x, building.width, 16)) {
        routeBottom = Math.min(routeBottom, world.groundY - building.height - safeGap);
      }
    }

    const maxY = Math.min(world.groundY * 0.43, routeBottom) - height;
    if (maxY < minY) return false;
    const y = random(minY, maxY);
    const baseCloud = addStormCloud({
      x,
      y,
      width,
      height,
      style: Math.floor(random(0, 3)),
      scoreValue: 1,
    });
    spawnCloudsBelow(baseCloud, routeBottom);
    return true;
  }

  function spawnCloudsBelow(baseCloud, routeBottom) {
    const centerX = baseCloud.x + baseCloud.width * 0.5;
    const targetLayers = Math.random() < 0.48 ? 3 : 2;
    let previousCloud = baseCloud;
    let addedLayers = 0;

    for (let layer = 1; layer < targetLayers; layer += 1) {
      const width = baseCloud.width * (1 - layer * 0.07);
      const height = width * random(0.44, 0.52);
      const y = previousCloud.y + previousCloud.height + randomCloudLayerGap();
      if (y + height > routeBottom) break;

      addStormCloud({
        x: centerX - width * 0.5,
        y,
        width,
        height,
        style: baseCloud.style,
        scoreValue: 0,
        formation: baseCloud.seed,
      });
      previousCloud = { y, height };
      addedLayers += 1;
    }

    if (addedLayers > 0) {
      baseCloud.scoreValue = 2;
      baseCloud.formation = baseCloud.seed;
    }
  }

  function spawnLowBuildingCloudLayers(building) {
    const lowBuildingThreshold = world.height * 0.34;
    if (building.height > lowBuildingThreshold || Math.random() > 0.94) return;

    const nearbyCloud = stormClouds.some((cloud) =>
      horizontalRangesOverlap(building.x, building.width, cloud.x, cloud.width, 34),
    );
    if (nearbyCloud) return;

    const buildingTop = world.groundY - building.height;
    const routeGap = clamp(world.height * 0.21 - Math.min(32, game.score) * 0.9, 145, 190);
    const baseWidth = random(world.width < 600 ? 132 : 166, world.width < 600 ? 178 : 218);
    const baseHeight = baseWidth * random(0.44, 0.52);
    const formationCenter = building.x + building.width * 0.5 + random(-18, 18);
    const lowerY = buildingTop - routeGap - baseHeight;
    const targetLayers = Math.random() < 0.3 ? 3 : 2;
    const style = Math.floor(random(0, 3));
    let previousY = lowerY;

    for (let layer = 0; layer < targetLayers; layer += 1) {
      const scale = 1 - layer * 0.08;
      const width = baseWidth * scale;
      const height = layer === 0 ? baseHeight : width * random(0.44, 0.51);
      const y = layer === 0 ? lowerY : previousY - height - randomCloudLayerGap();

      // A third layer is optional when it would be almost completely off-screen.
      if (layer > 1 && y < -height * 0.32) break;

      // Keep every layer on the same vertical center line. Different widths
      // still give the formation a natural tapered silhouette.
      const x = formationCenter - width * 0.5;
      addStormCloud({
        x,
        y: Math.max(-height * 0.42, y),
        width,
        height,
        style,
        scoreValue: layer === 0 ? 2 : 0,
        formation: building.seed,
      });
      previousY = y;
    }
  }

  function addStormCloud({ x, y, width, height, style, scoreValue = 1, formation = null }) {
    const cloud = {
      x,
      y,
      baseY: y,
      width,
      height,
      seed: Math.floor(random(1, 9999)),
      style,
      phase: random(0, TAU),
      scoreValue,
      formation,
      passed: false,
    };
    stormClouds.push(cloud);
    return cloud;
  }

  function horizontalRangesOverlap(xA, widthA, xB, widthB, padding = 0) {
    return xA < xB + widthB + padding && xA + widthA + padding > xB;
  }

  function randomCloudLayerGap() {
    const useCloseSpacing = Math.random() < 0.55;
    if (useCloseSpacing) {
      return random(clamp(world.height * 0.025, 16, 24), clamp(world.height * 0.045, 26, 40));
    }
    return random(clamp(world.height * 0.07, 34, 58), clamp(world.height * 0.12, 54, 100));
  }

  function spawnEnemy() {
    const type = Math.random() < Math.min(0.32 + game.score * 0.012, 0.55) ? "ufo" : "jet";
    const marginTop = world.width < 600 ? 135 : 90;
    let y = random(marginTop, world.groundY - 75);

    // Keep surprise attacks fair by avoiding a near-perfect overlap at spawn time.
    if (Math.abs(y - plane.y) < 58) {
      y += y < world.height * 0.5 ? 82 : -82;
    }

    enemies.push({
      type,
      x: world.width + 115,
      y: clamp(y, marginTop, world.groundY - 65),
      baseY: clamp(y, marginTop, world.groundY - 65),
      width: type === "ufo" ? 62 : 70,
      height: type === "ufo" ? 30 : 28,
      phase: random(0, TAU),
      passed: false,
      speedBoost: random(35, 75) + game.score * 1.2,
    });
    game.alertUntil = game.runTime + 1.35;
    tone(760, 0.08, "square", 0.018, -180);
  }

  function update(dt) {
    world.clock += dt;

    if (game.state === "intro") {
      world.scroll += dt * 22;
      plane.y += Math.sin(world.clock * 1.65) * dt * 7;
      plane.rotation = Math.sin(world.clock * 1.25) * 0.035;
      updateAmbientParticles(dt);
      return;
    }

    if (game.state === "paused" || game.state === "gameover") return;

    if (game.state === "crashed") {
      plane.vy += world.height * 1.35 * dt;
      plane.y += plane.vy * dt;
      plane.rotation += dt * 3.2;
      game.shake = Math.max(0, game.shake - dt * 28);
      updateParticles(dt);
      return;
    }

    game.runTime += dt;
    world.speed = clamp(world.width * 0.17, 175, 245) + Math.min(105, game.score * 3.2);
    world.scroll += world.speed * dt;

    const gravity = clamp(world.height * 1.58, 820, 1320);
    plane.vy = Math.min(620, plane.vy + gravity * dt);
    plane.y += plane.vy * dt;
    plane.rotation = lerp(plane.rotation, clamp(plane.vy / 720, -0.42, 0.72), 1 - Math.pow(0.002, dt));

    if (Math.random() < dt * 12) emitTrail(plane.x - 32, plane.y + 4, 1, false);

    game.nextBuilding -= dt;
    if (game.nextBuilding <= 0) {
      if (spawnBuilding()) {
        const gap = clamp(1.65 - game.score * 0.012, 1.23, 1.65);
        game.nextBuilding = random(gap, gap + 0.28);
      } else {
        game.nextBuilding = 0.2;
      }
    }

    game.nextCloud -= dt;
    if (game.nextCloud <= 0) {
      if (spawnStormCloud()) {
        const cloudGapMin = Math.max(1.05, 1.3 - game.score * 0.004);
        const cloudGapMax = Math.max(1.45, 1.7 - game.score * 0.004);
        game.nextCloud = random(cloudGapMin, cloudGapMax);
      } else {
        game.nextCloud = 0.22;
      }
    }

    game.nextEnemy -= dt;
    if (game.nextEnemy <= 0) {
      spawnEnemy();
      game.nextEnemy = random(Math.max(3.2, 5.8 - game.score * 0.08), Math.max(4.2, 7.2 - game.score * 0.07));
    }

    for (const building of buildings) {
      building.x -= world.speed * dt;
      if (!building.passed && building.x + building.width < plane.x - 22) {
        building.passed = true;
        addScore(1);
      }
    }

    for (const cloud of stormClouds) {
      cloud.x -= world.speed * dt;
      cloud.phase += dt * 0.72;
      cloud.y = cloud.baseY + Math.sin(cloud.phase) * 4;
      if (!cloud.passed && cloud.x + cloud.width < plane.x - 22) {
        cloud.passed = true;
        if (cloud.scoreValue > 0) addScore(cloud.scoreValue);
      }
    }

    for (const enemy of enemies) {
      enemy.x -= (world.speed + enemy.speedBoost) * dt;
      enemy.phase += dt * (enemy.type === "ufo" ? 3.8 : 1.8);
      enemy.y = enemy.baseY + Math.sin(enemy.phase) * (enemy.type === "ufo" ? 18 : 7);
      if (!enemy.passed && enemy.x + enemy.width < plane.x - 22) {
        enemy.passed = true;
        addScore(2);
      }
    }

    buildings = buildings.filter((building) => building.x + building.width > -80);
    stormClouds = stormClouds.filter((cloud) => cloud.x + cloud.width > -100);
    enemies = enemies.filter((enemy) => enemy.x + enemy.width > -100);
    updateParticles(dt);
    checkCollisions();

    ui.flightTip.classList.toggle("is-visible", game.runTime < game.tipUntil);
    ui.enemyAlert.classList.toggle("is-visible", game.runTime < game.alertUntil);
    ui.altitude.textContent = String(Math.max(0, Math.round((world.groundY - plane.y) * 2.4)));
    ui.speed.textContent = String(Math.round(155 + (world.speed - 175) * 0.62));
  }

  function addScore(amount) {
    game.score += amount;
    if (game.score > game.best) game.best = game.score;
    updateScore();
    tone(690, 0.065, "sine", 0.026, 120);
  }

  function checkCollisions() {
    const px = plane.x;
    const py = plane.y;
    const prx = 25;
    const pry = 12;

    if (py - pry <= 3 || py + pry >= world.groundY) {
      endGame();
      return;
    }

    for (const building of buildings) {
      const top = world.groundY - building.height;
      if (ellipseRectangleCollision(px, py, prx, pry, building.x + 5, top, building.width - 10, building.height + 5)) {
        endGame();
        return;
      }
    }

    for (const cloud of stormClouds) {
      const cloudX = cloud.x + cloud.width * 0.5;
      const cloudY = cloud.y + cloud.height * 0.52;
      const cloudRx = cloud.width * 0.4;
      const cloudRy = cloud.height * 0.4;
      const nx = (px - cloudX) / (prx + cloudRx);
      const ny = (py - cloudY) / (pry + cloudRy);
      if (nx * nx + ny * ny < 0.86) {
        endGame();
        return;
      }
    }

    for (const enemy of enemies) {
      const ex = enemy.x;
      const ey = enemy.y;
      const rx = enemy.type === "ufo" ? 29 : 30;
      const ry = enemy.type === "ufo" ? 13 : 11;
      const nx = (px - ex) / (prx + rx);
      const ny = (py - ey) / (pry + ry);
      if (nx * nx + ny * ny < 0.82) {
        endGame();
        return;
      }
    }
  }

  function ellipseRectangleCollision(cx, cy, rx, ry, x, y, width, height) {
    const closestX = clamp(cx, x, x + width);
    const closestY = clamp(cy, y, y + height);
    const dx = (cx - closestX) / rx;
    const dy = (cy - closestY) / ry;
    return dx * dx + dy * dy < 1;
  }

  function emitTrail(x, y, amount, bright) {
    for (let i = 0; i < amount; i += 1) {
      particles.push({
        x: x + random(-5, 4),
        y: y + random(-4, 4),
        vx: random(-58, -18),
        vy: random(-18, 18),
        life: random(0.28, 0.58),
        maxLife: 0.58,
        size: random(bright ? 3 : 1.5, bright ? 7 : 4),
        color: bright ? "#a2fff6" : "#d9f2ed",
      });
    }
  }

  function burst(x, y, amount, color) {
    for (let i = 0; i < amount; i += 1) {
      const angle = random(0, TAU);
      const force = random(55, 230);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force,
        life: random(0.4, 1),
        maxLife: 1,
        size: random(2, 7),
        color,
      });
    }
  }

  function updateAmbientParticles(dt) {
    if (particles.length < 18 && Math.random() < dt * 4) {
      particles.push({
        x: world.width + 10,
        y: random(70, world.groundY - 100),
        vx: random(-18, -8),
        vy: 0,
        life: 12,
        maxLife: 12,
        size: random(0.8, 1.8),
        color: "#b6fff7",
      });
    }
    updateParticles(dt);
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 28 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0 && particle.x > -50);
  }

  function render() {
    ctx.save();
    if (game.shake > 0) ctx.translate(random(-game.shake, game.shake), random(-game.shake, game.shake));
    drawSky();
    drawClouds();
    drawDistantCity();
    drawGround();

    for (const cloud of stormClouds) drawStormCloud(cloud);
    for (const building of buildings) drawBuilding(building);
    for (const enemy of enemies) drawEnemy(enemy);
    drawParticles();
    drawPlayerPlane();
    drawAtmosphere();
    ctx.restore();
  }

  function drawSky() {
    const gradient = ctx.createLinearGradient(0, 0, 0, world.height);
    gradient.addColorStop(0, "#07182e");
    gradient.addColorStop(0.48, "#134c67");
    gradient.addColorStop(0.78, "#5a858a");
    gradient.addColorStop(1, "#e0a575");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, world.width, world.height);

    const sunX = world.width * 0.79;
    const sunY = world.height * 0.25;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, world.height * 0.32);
    glow.addColorStop(0, "rgba(255, 223, 170, 0.82)");
    glow.addColorStop(0.1, "rgba(255, 194, 135, 0.3)");
    glow.addColorStop(1, "rgba(255, 174, 116, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.beginPath();
    ctx.arc(sunX, sunY, clamp(world.height * 0.037, 24, 42), 0, TAU);
    ctx.fillStyle = "rgba(255, 231, 188, 0.82)";
    ctx.fill();
  }

  function drawClouds() {
    const cloudWidth = 290;
    const offset = -((world.scroll * 0.08) % cloudWidth);
    ctx.save();
    ctx.globalAlpha = 0.17;
    for (let i = -1; i < Math.ceil(world.width / cloudWidth) + 2; i += 1) {
      const seed = i + Math.floor(world.scroll * 0.08 / cloudWidth);
      const x = offset + i * cloudWidth + hash(seed) * 100;
      const y = 105 + hash(seed + 2) * world.height * 0.3;
      const scale = 0.7 + hash(seed + 7) * 0.7;
      ctx.fillStyle = "#d5eeea";
      ctx.beginPath();
      ctx.ellipse(x, y, 72 * scale, 11 * scale, 0, 0, TAU);
      ctx.ellipse(x - 35 * scale, y - 5, 36 * scale, 15 * scale, 0, 0, TAU);
      ctx.ellipse(x + 20 * scale, y - 9, 48 * scale, 18 * scale, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDistantCity() {
    drawSkylineLayer(world.groundY, 0.12, 64, world.height * 0.16, "rgba(21, 54, 72, 0.72)", 1);
    drawSkylineLayer(world.groundY, 0.25, 78, world.height * 0.27, "rgba(9, 35, 55, 0.86)", 9);
    drawSkylineLayer(world.groundY, 0.42, 92, world.height * 0.36, "rgba(5, 24, 43, 0.94)", 23);
  }

  function drawSkylineLayer(baseY, parallax, averageWidth, maxHeight, color, salt) {
    const segment = averageWidth;
    const scroll = world.scroll * parallax;
    const firstIndex = Math.floor(scroll / segment) - 1;
    const offset = -(scroll % segment);

    ctx.fillStyle = color;
    for (let i = -1; i < Math.ceil(world.width / segment) + 2; i += 1) {
      const index = firstIndex + i;
      const width = segment * (0.7 + hash(index + salt) * 0.6);
      const height = maxHeight * (0.24 + hash(index * 3 + salt) * 0.76);
      const x = offset + i * segment;
      const y = baseY - height;
      ctx.fillRect(x, y, width, height);

      if (parallax > 0.2) {
        ctx.fillStyle = "rgba(121, 230, 219, 0.12)";
        const rows = Math.floor(height / 24);
        for (let row = 1; row < rows; row += 1) {
          for (let col = 10; col < width - 6; col += 18) {
            if (hash(index * 81 + row * 7 + col) > 0.53) ctx.fillRect(x + col, y + row * 20, 4, 7);
          }
        }
        ctx.fillStyle = color;
      }
    }
  }

  function drawGround() {
    const gradient = ctx.createLinearGradient(0, world.groundY, 0, world.height);
    gradient.addColorStop(0, "#0a2235");
    gradient.addColorStop(1, "#020914");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, world.groundY, world.width, world.height - world.groundY);

    ctx.fillStyle = "rgba(102, 230, 226, 0.35)";
    ctx.fillRect(0, world.groundY, world.width, 1);
    ctx.fillStyle = "rgba(255, 181, 127, 0.1)";
    ctx.fillRect(0, world.groundY + 5, world.width, 2);

    const dashOffset = -((world.scroll * 1.2) % 76);
    ctx.fillStyle = "rgba(158, 223, 219, 0.15)";
    for (let x = dashOffset; x < world.width + 76; x += 76) ctx.fillRect(x, world.groundY + 26, 34, 2);
  }

  function drawBuilding(building) {
    const x = building.x;
    const y = world.groundY - building.height;
    const width = building.width;
    const height = building.height;
    if (x > world.width + 150 || x + width < -30) return;

    ctx.save();
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    const palettes = [
      ["#173b50", "#071b30"],
      ["#234958", "#0a2334"],
      ["#12364d", "#06182c"],
      ["#294653", "#0a2030"],
    ];
    const palette = palettes[building.style];
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(1, palette[1]);
    ctx.fillStyle = gradient;

    ctx.beginPath();
    if (building.style === 1) {
      ctx.moveTo(x + width * 0.14, y);
      ctx.lineTo(x + width * 0.86, y);
      ctx.lineTo(x + width, y + 17);
      ctx.lineTo(x + width, world.groundY);
      ctx.lineTo(x, world.groundY);
      ctx.lineTo(x, y + 17);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(146, 241, 232, 0.16)";
    ctx.fillRect(x + 5, y + 5, 2, height - 5);
    ctx.fillStyle = "rgba(1, 10, 22, 0.25)";
    ctx.fillRect(x + width - 10, y + 4, 10, height - 4);

    if (building.style === 2) {
      ctx.fillStyle = "#102c3d";
      ctx.fillRect(x + width * 0.31, y - 12, width * 0.38, 12);
      ctx.fillStyle = "rgba(102, 230, 226, 0.5)";
      ctx.fillRect(x + width * 0.31, y - 12, width * 0.38, 2);
    } else if (building.style === 3) {
      ctx.strokeStyle = "rgba(137, 230, 222, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + width * 0.5, y);
      ctx.lineTo(x + width * 0.5, y - 22);
      ctx.stroke();
      ctx.fillStyle = Math.sin(world.clock * 4) > 0 ? "#ff7656" : "rgba(255,118,86,0.2)";
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y - 23, 3, 0, TAU);
      ctx.fill();
    }

    const windowWidth = clamp(width * 0.11, 6, 11);
    const columnGap = clamp(width * 0.12, 13, 19);
    const rowGap = 24;
    for (let wy = y + 24, row = 0; wy < world.groundY - 13; wy += rowGap, row += 1) {
      for (let wx = x + 15, col = 0; wx < x + width - 11; wx += columnGap, col += 1) {
        const lit = hash(building.seed + row * 13 + col * 51) > 0.38;
        ctx.fillStyle = lit
          ? hash(building.seed + row + col) > 0.75
            ? "rgba(255, 191, 123, 0.68)"
            : "rgba(104, 235, 225, 0.48)"
          : "rgba(2, 13, 25, 0.5)";
        ctx.fillRect(wx, wy, windowWidth, 8);
      }
    }

    if (building.height > world.height * 0.35 && building.style !== 3) {
      ctx.fillStyle = "rgba(5, 18, 31, 0.82)";
      ctx.fillRect(x + 11, y + 16, width - 22, 18);
      ctx.fillStyle = "rgba(104, 235, 225, 0.75)";
      ctx.font = `700 ${Math.min(9, width / 9)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(building.seed % 2 ? "SKY" : "ACE", x + width / 2, y + 25);
    }
    ctx.restore();
  }

  function drawStormCloud(cloud) {
    const { x, y, width, height } = cloud;
    if (x > world.width + 260 || x + width < -80) return;

    const flashWave = Math.sin(world.clock * 5.7 + cloud.seed * 0.73);
    const flash = flashWave > 0.62 ? (flashWave - 0.62) / 0.38 : 0;
    const palettes = [
      ["#43616d", "#203e4e", "#0b2435", "#a1fff1"],
      ["#4a5673", "#293b59", "#101f38", "#c8d3ff"],
      ["#5c5364", "#40384b", "#211f33", "#ffd1a7"],
    ];
    const palette = palettes[cloud.style];

    ctx.save();
    ctx.shadowColor = "rgba(1, 9, 20, 0.45)";
    ctx.shadowBlur = 22;
    const body = ctx.createLinearGradient(0, y, 0, y + height);
    body.addColorStop(0, palette[0]);
    body.addColorStop(0.55, palette[1]);
    body.addColorStop(1, palette[2]);
    ctx.fillStyle = body;

    // Large overlapping ellipses form a wide, rounded cumulonimbus cloud.
    const puffs = [
      [0.13, 0.62, 0.18, 0.25],
      [0.27, 0.43, 0.23, 0.34],
      [0.48, 0.31, 0.28, 0.4],
      [0.7, 0.42, 0.25, 0.35],
      [0.86, 0.61, 0.18, 0.25],
      [0.51, 0.68, 0.43, 0.27],
    ];
    for (let i = 0; i < puffs.length; i += 1) {
      const [px, py, prx, pry] = puffs[i];
      const wobble = (hash(cloud.seed + i * 19) - 0.5) * 0.04;
      ctx.beginPath();
      ctx.ellipse(
        x + width * (px + wobble),
        y + height * (py + wobble * 0.4),
        width * prx,
        height * pry,
        0,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();

    // Soft highlights and a heavy underside add volume without visible seams.
    ctx.save();
    ctx.fillStyle = "rgba(169, 208, 207, 0.075)";
    for (const [px, py, rx, ry] of [
      [0.33, 0.34, 0.18, 0.19],
      [0.56, 0.22, 0.2, 0.18],
      [0.75, 0.43, 0.14, 0.16],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x + width * px, y + height * py, width * rx, height * ry, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(2, 13, 27, 0.22)";
    ctx.beginPath();
    ctx.ellipse(x + width * 0.52, y + height * 0.7, width * 0.39, height * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // The cloud belly lights up for a split second before the bolt flashes.
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.1 + flash * 0.24;
      ctx.fillStyle = palette[3];
      for (const px of [0.4, 0.58]) {
        ctx.beginPath();
        ctx.ellipse(x + width * px, y + height * 0.67, width * 0.2, height * 0.18, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    const boltX = x + width * (0.38 + hash(cloud.seed) * 0.25);
    const boltTop = y + height * 0.6;
    ctx.save();
    ctx.globalAlpha = 0.34 + flash * 0.66;
    ctx.shadowColor = palette[3];
    ctx.shadowBlur = 8 + flash * 18;
    ctx.fillStyle = palette[3];
    ctx.beginPath();
    ctx.moveTo(boltX + 5, boltTop);
    ctx.lineTo(boltX - 8, boltTop + height * 0.34);
    ctx.lineTo(boltX + 1, boltTop + height * 0.34);
    ctx.lineTo(boltX - 8, boltTop + height * 0.68);
    ctx.lineTo(boltX + 15, boltTop + height * 0.24);
    ctx.lineTo(boltX + 6, boltTop + height * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Harmless rain streaks reinforce the weather theme below the soft edge.
    ctx.save();
    ctx.strokeStyle = "rgba(137, 235, 232, 0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) {
      const rainX = x + width * (0.12 + i * 0.15) + hash(cloud.seed + i) * 6;
      const rainLength = 8 + hash(cloud.seed + i * 5) * 12;
      ctx.beginPath();
      ctx.moveTo(rainX, y + height * 0.88);
      ctx.lineTo(rainX - 3, y + height * 0.88 + rainLength);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerPlane() {
    const idleScale = game.state === "intro" ? clamp(world.width / 1000, 0.82, 1.12) : 0.9;
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.rotate(plane.rotation);
    ctx.scale(idleScale, idleScale);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#06111f";
    ctx.beginPath();
    ctx.ellipse(0, 20, 38, 7, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Far wing.
    ctx.fillStyle = "#2ca8aa";
    ctx.strokeStyle = "#0d2b3a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-18, -18);
    ctx.lineTo(-8, -19);
    ctx.lineTo(11, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Vertical tail with a bright airline livery.
    ctx.fillStyle = "#55ddd9";
    ctx.beginPath();
    ctx.moveTo(-35, 1);
    ctx.lineTo(-29, -22);
    ctx.lineTo(-18, -21);
    ctx.lineTo(-14, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(244,255,248,0.82)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-30, -13);
    ctx.lineTo(-21, -7);
    ctx.stroke();

    // Passenger fuselage.
    const fuselage = ctx.createLinearGradient(0, -10, 0, 10);
    fuselage.addColorStop(0, "#fffdf2");
    fuselage.addColorStop(1, "#cfdedb");
    ctx.fillStyle = fuselage;
    ctx.strokeStyle = "#0d2b3a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-38, -5);
    ctx.quadraticCurveTo(-13, -11, 21, -8);
    ctx.quadraticCurveTo(35, -7, 40, -1);
    ctx.quadraticCurveTo(34, 8, 17, 9);
    ctx.lineTo(-27, 7);
    ctx.lineTo(-38, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Airline stripe and cockpit glazing.
    ctx.strokeStyle = "#35bfc0";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-28, 3);
    ctx.quadraticCurveTo(2, 6, 29, 3);
    ctx.stroke();

    ctx.fillStyle = "#12384b";
    ctx.beginPath();
    ctx.moveTo(23, -7);
    ctx.quadraticCurveTo(33, -6, 37, -2);
    ctx.lineTo(27, -1);
    ctx.closePath();
    ctx.fill();

    for (let wx = -19; wx <= 17; wx += 7) {
      ctx.fillStyle = "#153c4f";
      ctx.beginPath();
      ctx.roundRect(wx, -5, 3.8, 2.8, 1);
      ctx.fill();
    }

    // Swept near wing.
    ctx.fillStyle = "#58deda";
    ctx.strokeStyle = "#0a3440";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9, 3);
    ctx.lineTo(-10, 23);
    ctx.lineTo(3, 24);
    ctx.lineTo(22, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // A compact turbofan beneath the wing completes the passenger-jet silhouette.
    ctx.fillStyle = "#e9eee5";
    ctx.beginPath();
    ctx.roundRect(-3, 14, 16, 8, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#173a4a";
    ctx.beginPath();
    ctx.ellipse(10, 18, 3, 4, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#ff805d";
    ctx.beginPath();
    ctx.moveTo(-36, -5);
    ctx.lineTo(-29, -8);
    ctx.lineTo(-28, -4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.type === "ufo") drawUfo();
    else drawEnemyJet();
    ctx.restore();
  }

  function drawEnemyJet() {
    ctx.fillStyle = "#e55e4d";
    ctx.strokeStyle = "#451d27";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.quadraticCurveTo(-23, -8, 13, -7);
    ctx.lineTo(29, -2);
    ctx.lineTo(29, 5);
    ctx.quadraticCurveTo(-6, 9, -26, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f1b071";
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(11, -19);
    ctx.lineTo(19, -18);
    ctx.lineTo(12, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#18384a";
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-7, -14);
    ctx.lineTo(4, -13);
    ctx.lineTo(7, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 178, 102, 0.75)";
    ctx.beginPath();
    ctx.moveTo(29, -1);
    ctx.lineTo(41 + Math.sin(world.clock * 20) * 3, 2);
    ctx.lineTo(29, 5);
    ctx.closePath();
    ctx.fill();
  }

  function drawUfo() {
    const pulse = 0.65 + Math.sin(world.clock * 8) * 0.25;
    ctx.globalAlpha = pulse * 0.28;
    const beam = ctx.createLinearGradient(0, 8, 0, 48);
    beam.addColorStop(0, "#9affed");
    beam.addColorStop(1, "rgba(154,255,237,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-16, 7);
    ctx.lineTo(-27, 45);
    ctx.lineTo(27, 45);
    ctx.lineTo(16, 7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#78e0d7";
    ctx.strokeStyle = "#123a49";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 31, 10, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(174, 255, 244, 0.68)";
    ctx.beginPath();
    ctx.ellipse(0, -4, 14, 11, 0, Math.PI, TAU);
    ctx.lineTo(-14, -4);
    ctx.fill();
    ctx.stroke();

    for (let i = -2; i <= 2; i += 1) {
      ctx.fillStyle = (i + Math.round(world.clock * 8)) % 2 ? "#ff8a61" : "#eeffd5";
      ctx.beginPath();
      ctx.arc(i * 10, 5, 2.2, 0, TAU);
      ctx.fill();
    }
  }

  function drawParticles() {
    ctx.save();
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1) * 0.8;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * clamp(particle.life / particle.maxLife, 0.2, 1), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAtmosphere() {
    ctx.save();
    const haze = ctx.createLinearGradient(0, world.groundY - 160, 0, world.groundY);
    haze.addColorStop(0, "rgba(236, 179, 125, 0)");
    haze.addColorStop(1, "rgba(236, 179, 125, 0.12)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, world.groundY - 160, world.width, 160);

    ctx.globalAlpha = 0.045;
    ctx.fillStyle = "#d8ffff";
    for (let y = 0; y < world.height; y += 5) ctx.fillRect(0, y, world.width, 1);
    ctx.restore();
  }

  function frame(timestamp) {
    const dt = Math.min((timestamp - game.lastTime) / 1000, 0.033);
    game.lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  ui.start.addEventListener("click", startGame);
  ui.restart.addEventListener("click", startGame);
  ui.resume.addEventListener("click", () => togglePause());
  ui.pauseButton.addEventListener("click", () => togglePause());
  ui.soundButton.addEventListener("click", toggleSound);
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    flap();
  });

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      event.preventDefault();
      if (game.state === "intro" || game.state === "gameover") startGame();
      else flap();
    }
    if (["KeyP", "Escape"].includes(event.code)) {
      event.preventDefault();
      togglePause();
    }
    if (event.code === "KeyM") toggleSound();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "playing") togglePause(true);
  });
  window.addEventListener("resize", resize);

  ui.best.textContent = padScore(game.best);
  ui.finalBest.textContent = padScore(game.best);
  resize();
  setPanels();
  requestAnimationFrame(frame);
})();
