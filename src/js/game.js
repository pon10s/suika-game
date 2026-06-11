// ゲーム本体:Matter.js の世界(箱・フルーツ)の管理と描画
// F2時点:合体・スコア・ゲームオーバー判定まで

const GAME = {
  width: 480,
  height: 640,
  wallThickness: 16,
  topMargin: 128,       // 箱の縁(ここから下が箱の中)
  cloudY: 42,           // 雲の中心Y(箱の上)。フルーツはこの下にぶら下がる
  limitLineY: 158,      // 上限ライン(超えたままだとゲームオーバー)
  gameOverGraceMs: 1500, // 上限ライン超えがこの時間続いたらゲームオーバー
  landFallbackMs: 2500, // 着地検知が来ない場合の保険(これで次を出す)
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.engine = Matter.Engine.create();
    this.engine.gravity.scale = 0.0014; // 落下を少し速く(既定0.001)
    this.world = this.engine.world;

    this.dropX = GAME.width / 2;     // 待機フルーツのX位置
    this.currentIndex = this.randomFruitIndex();
    this.nextIndex = this.randomFruitIndex();
    this.canDrop = true;             // 次のフルーツを落とせる状態か
    this.activeBody = null;          // 落下中(着地待ち)のフルーツ
    this.landTimer = null;           // 着地検知の保険タイマー

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
      // 落下中フルーツが床か他フルーツに触れたら、次のフルーツを出す
      if (this.activeBody && (a === this.activeBody || b === this.activeBody)) {
        this.releaseNext();
      }
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
      if (typeof GameAudio !== "undefined") GameAudio.merge(a.fruitIndex);
      return;
    }

    const newIndex = a.fruitIndex + 1;
    const body = this.createFruitBody(newIndex, mid.x, mid.y);
    Matter.Composite.add(this.world, body);
    // 合体した瞬間にちょっとだけ跳ねる(ぽよん・控えめ)
    Matter.Body.setVelocity(body, { x: 0, y: -1.3 });
    this.addScore(FRUITS[newIndex].score);
    if (typeof GameAudio !== "undefined") GameAudio.merge(newIndex);
  }

  // フルーツのボディ生成(落下・合体で共通)。手触りの調整はここ一箇所
  // 本家っぽく:ぶつかると回転し、抵抗少なめでよく転がる(でも跳ねすぎない)
  createFruitBody(index, x, y) {
    const radius = FRUITS[index].radius;
    const body = Matter.Bodies.circle(x, y, radius, {
      label: "fruit",
      restitution: 0.08,      // 跳ね返り控えめ
      friction: 0.3,          // 接地で食いつく→転がり(回転)が生まれる
      frictionStatic: 0.004,  // 動き出しの引っかかりほぼ無し→ちょっと押されても動く
      frictionAir: 0.0005,    // 空気抵抗ほぼ無し→ぶつかるまで動き続ける
      // 質量を半径に比例(面積比だと大物が重すぎる)→ 大きい果物も軽く押せる
      density: 0.012 / radius,
    });
    body.fruitIndex = index;
    return body;
  }

  addScore(points) {
    this.score += points;
    if (this.onScoreChange) this.onScoreChange(this.score);
  }

  // ---- ゲームオーバー判定 ----
  // 「着地済み」かつほぼ静止したフルーツが上限ラインを超えた状態が gameOverGraceMs 続いたら終了
  // (落とした直後のフルーツはラインより上に出現するため、未着地のものは対象外にする)

  // 万一フルーツが箱の外へすり抜けたら箱の中へ戻す(消失バグの保険)
  recoverEscaped() {
    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label !== "fruit") continue;
      const r = FRUITS[body.fruitIndex].radius;
      if (body.position.y > GAME.height + 20 ||
          body.position.x < -20 || body.position.x > GAME.width + 20) {
        Matter.Body.setPosition(body, { x: GAME.width / 2, y: GAME.height - GAME.wallThickness - r });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
      }
    }
  }

  checkGameOver() {
    if (this.isGameOver) return;
    this.recoverEscaped();
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
    clearTimeout(this.landTimer);
    this.activeBody = null;
    this.canDrop = true;
    if (this.onScoreChange) this.onScoreChange(0);
    if (this.onNextChange) this.onNextChange(this.nextIndex);
  }

  randomFruitIndex() {
    return Math.floor(Math.random() * DROPPABLE_COUNT);
  }

  // 雲にぶら下がる待機フルーツの中心Y(大きい果物ほど下にぶら下がる)
  waitCenterY(index) {
    return GAME.cloudY + 8 + FRUITS[index].radius;
  }

  createWalls() {
    const t = GAME.wallThickness;
    const TH = 120; // 当たり判定の実際の厚み(見た目はtのまま)。速い果物のすり抜け防止
    const opts = { isStatic: true, label: "wall" };
    // 床:見た目の床面(height - t)を上端に、下方向へ分厚く
    const floor = Matter.Bodies.rectangle(
      GAME.width / 2, (GAME.height - t) + TH / 2, GAME.width + TH * 2, TH, opts);
    // 左右の壁:見た目の内側面(x=t / x=width-t)を保ったまま外側へ分厚く
    const left = Matter.Bodies.rectangle(
      t - TH / 2, GAME.height / 2, TH, GAME.height * 2, opts);
    const right = Matter.Bodies.rectangle(
      GAME.width - t + TH / 2, GAME.height / 2, TH, GAME.height * 2, opts);
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
    if (this.isGameOver || !this.canDrop) return;

    const index = this.currentIndex;
    const body = this.createFruitBody(index, this.dropX, this.waitCenterY(index));
    Matter.Composite.add(this.world, body);

    if (typeof GameAudio !== "undefined") GameAudio.drop();
    // 着地するまで次のフルーツは出さない(canDrop=false)
    this.canDrop = false;
    this.activeBody = body;
    // 保険:着地検知が来なくても一定時間で次を出す
    clearTimeout(this.landTimer);
    this.landTimer = setTimeout(() => this.releaseNext(), GAME.landFallbackMs);
  }

  // 落下中フルーツが着地したら、次のフルーツを待機させて落下可能に戻す
  releaseNext() {
    if (this.canDrop) return; // 二重呼び出し防止
    clearTimeout(this.landTimer);
    this.activeBody = null;
    this.currentIndex = this.nextIndex;
    this.nextIndex = this.randomFruitIndex();
    this.moveTo(this.dropX); // 新フルーツの半径で位置を補正
    this.canDrop = true;
    if (this.onNextChange) this.onNextChange(this.nextIndex);
  }

  // ---- 描画 ----

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, GAME.width, GAME.height);

    this.drawBox(ctx);
    if (!this.isGameOver) this.drawGuideLine(ctx);

    // 雲は一番奥(フルーツより先に描く)→ 落とした瞬間も含めて常にフルーツの裏
    if (!this.isGameOver) drawSprite(ctx, getCloudSprite(), this.dropX, GAME.cloudY);

    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label === "fruit") this.drawFruit(ctx, body);
    }

    // 待機フルーツは雲の手前(完全に見える)
    if (!this.isGameOver && this.canDrop) {
      drawSprite(ctx, getFruitSprite(this.currentIndex), this.dropX, this.waitCenterY(this.currentIndex));
    }
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
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.dropX, GAME.cloudY);
    ctx.lineTo(this.dropX, GAME.height - GAME.wallThickness);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawFruit(ctx, body) {
    // 事前生成スプライトを回転して描く(軽い＝滑らか。回転も見える)
    const s = getFruitSprite(body.fruitIndex);
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    ctx.drawImage(s.canvas, -s.ext, -s.ext, s.ext * 2, s.ext * 2);
    ctx.restore();
  }
}
