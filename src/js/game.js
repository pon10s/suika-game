// ゲーム本体:Matter.js の世界(箱・フルーツ)の管理と描画
// F2時点:合体・スコア・ゲームオーバー判定まで

const GAME = {
  width: 480,
  height: 640,
  wallThickness: 16,
  topMargin: 90,        // 待機フルーツの表示域(箱の上)
  limitLineY: 120,      // 上限ライン(超えたままだとゲームオーバー)
  dropCooldownMs: 600,  // 連続落下のクールダウン
  gameOverGraceMs: 1500, // 上限ライン超えがこの時間続いたらゲームオーバー
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.engine = Matter.Engine.create();
    this.world = this.engine.world;

    this.dropX = GAME.width / 2;     // 待機フルーツのX位置
    this.currentIndex = this.randomFruitIndex();
    this.nextIndex = this.randomFruitIndex();
    this.lastDropAt = 0;

    this.score = 0;
    this.isGameOver = false;
    this.overLimitSince = null;      // 上限ライン超えが始まった時刻
    this.onScoreChange = null;       // main.js が設定するコールバック
    this.onGameOver = null;
    this.onNextChange = null;        // ネクスト表示の更新用

    this.createWalls();
    Matter.Events.on(this.engine, "collisionStart", (e) => this.handleCollisions(e));
    Matter.Events.on(this.engine, "afterUpdate", () => this.checkGameOver());
    Matter.Runner.run(Matter.Runner.create(), this.engine);
    requestAnimationFrame(() => this.draw());
  }

  // ---- 合体・スコア ----

  handleCollisions(event) {
    if (this.isGameOver) return;
    const merged = new Set(); // 同一フレームで同じフルーツを二重合体させない
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      // 何かに触れたフルーツは「着地済み」にする(ゲームオーバー判定の対象になる)
      if (a.label === "fruit") a.hasLanded = true;
      if (b.label === "fruit") b.hasLanded = true;
      if (a.label !== "fruit" || b.label !== "fruit") continue;
      if (a.fruitIndex !== b.fruitIndex) continue;
      if (merged.has(a.id) || merged.has(b.id)) continue;
      merged.add(a.id);
      merged.add(b.id);
      this.merge(a, b);
    }
  }

  merge(a, b) {
    const mid = {
      x: (a.position.x + b.position.x) / 2,
      y: (a.position.y + b.position.y) / 2,
    };
    Matter.Composite.remove(this.world, a);
    Matter.Composite.remove(this.world, b);

    if (a.fruitIndex === FRUITS.length - 1) {
      // スイカ同士:両方消滅してボーナス
      this.addScore(WATERMELON_BONUS);
      return;
    }

    const newIndex = a.fruitIndex + 1;
    const fruit = FRUITS[newIndex];
    const body = Matter.Bodies.circle(mid.x, mid.y, fruit.radius, {
      label: "fruit",
      restitution: 0.2,
      friction: 0.3,
    });
    body.fruitIndex = newIndex;
    Matter.Composite.add(this.world, body);
    this.addScore(fruit.score);
  }

  addScore(points) {
    this.score += points;
    if (this.onScoreChange) this.onScoreChange(this.score);
  }

  // ---- ゲームオーバー判定 ----
  // 「着地済み」かつほぼ静止したフルーツが上限ラインを超えた状態が gameOverGraceMs 続いたら終了
  // (落とした直後のフルーツはラインより上に出現するため、未着地のものは対象外にする)

  checkGameOver() {
    if (this.isGameOver) return;
    const over = Matter.Composite.allBodies(this.world).some((body) =>
      body.label === "fruit" &&
      body.hasLanded &&
      body.speed < 0.35 &&
      body.position.y - FRUITS[body.fruitIndex].radius < GAME.limitLineY
    );
    if (!over) {
      this.overLimitSince = null;
      return;
    }
    if (this.overLimitSince === null) this.overLimitSince = Date.now();
    if (Date.now() - this.overLimitSince >= GAME.gameOverGraceMs) {
      this.isGameOver = true;
      if (this.onGameOver) this.onGameOver(this.score);
    }
  }

  restart() {
    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label === "fruit") Matter.Composite.remove(this.world, body);
    }
    this.score = 0;
    this.isGameOver = false;
    this.overLimitSince = null;
    this.currentIndex = this.randomFruitIndex();
    this.nextIndex = this.randomFruitIndex();
    this.lastDropAt = 0;
    if (this.onScoreChange) this.onScoreChange(0);
    if (this.onNextChange) this.onNextChange(this.nextIndex);
  }

  randomFruitIndex() {
    return Math.floor(Math.random() * DROPPABLE_COUNT);
  }

  createWalls() {
    const t = GAME.wallThickness;
    const opts = { isStatic: true, label: "wall" };
    const floor = Matter.Bodies.rectangle(
      GAME.width / 2, GAME.height - t / 2, GAME.width, t, opts);
    const left = Matter.Bodies.rectangle(
      t / 2, (GAME.height + GAME.topMargin) / 2, t, GAME.height - GAME.topMargin, opts);
    const right = Matter.Bodies.rectangle(
      GAME.width - t / 2, (GAME.height + GAME.topMargin) / 2, t, GAME.height - GAME.topMargin, opts);
    Matter.Composite.add(this.world, [floor, left, right]);
  }

  // 待機フルーツの移動(壁にめり込まない範囲に収める)
  moveTo(x) {
    const r = FRUITS[this.currentIndex].radius;
    const min = GAME.wallThickness + r;
    const max = GAME.width - GAME.wallThickness - r;
    this.dropX = Math.min(max, Math.max(min, x));
  }

  drop() {
    if (this.isGameOver) return;
    const now = Date.now();
    if (now - this.lastDropAt < GAME.dropCooldownMs) return;
    this.lastDropAt = now;

    const index = this.currentIndex;
    const fruit = FRUITS[index];
    const body = Matter.Bodies.circle(this.dropX, GAME.topMargin - fruit.radius, fruit.radius, {
      label: "fruit",
      restitution: 0.2,
      friction: 0.3,
    });
    body.fruitIndex = index;
    Matter.Composite.add(this.world, body);

    this.currentIndex = this.nextIndex;
    this.nextIndex = this.randomFruitIndex();
    this.moveTo(this.dropX); // 新フルーツの半径で位置を補正
    if (this.onNextChange) this.onNextChange(this.nextIndex);
  }

  // ---- 描画 ----

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, GAME.width, GAME.height);

    this.drawBox(ctx);
    if (!this.isGameOver) this.drawGuideLine(ctx);

    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label === "fruit") this.drawFruit(ctx, body);
    }

    if (!this.isGameOver) this.drawWaitingFruit(ctx);
    requestAnimationFrame(() => this.draw());
  }

  drawBox(ctx) {
    const t = GAME.wallThickness;
    ctx.fillStyle = "#C8A165";
    ctx.strokeStyle = "#8B6B43";
    ctx.lineWidth = 2;
    const walls = [
      [0, GAME.height - t, GAME.width, t],
      [0, GAME.topMargin, t, GAME.height - GAME.topMargin],
      [GAME.width - t, GAME.topMargin, t, GAME.height - GAME.topMargin],
    ];
    for (const [x, y, w, h] of walls) {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    // 上限ライン(赤の点線)
    ctx.strokeStyle = "#E74C3C";
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(GAME.wallThickness, GAME.limitLineY);
    ctx.lineTo(GAME.width - GAME.wallThickness, GAME.limitLineY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawGuideLine(ctx) {
    ctx.strokeStyle = "rgba(93, 64, 55, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.dropX, GAME.topMargin);
    ctx.lineTo(this.dropX, GAME.height - GAME.wallThickness);
    ctx.stroke();
  }

  drawWaitingFruit(ctx) {
    const fruit = FRUITS[this.currentIndex];
    drawFruitShape(ctx, this.dropX, GAME.topMargin - fruit.radius, fruit);
  }

  drawFruit(ctx, body) {
    drawFruitShape(ctx, body.position.x, body.position.y, FRUITS[body.fruitIndex], body.angle);
  }
}
