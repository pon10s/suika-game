// ゲーム本体:Matter.js の世界(箱・フルーツ)の管理と描画
// F2時点:合体・スコア・ゲームオーバー判定まで

const GAME = {
  width: 480,
  height: 640,
  wallThickness: 16,
  topMargin: 128,       // 箱の縁(ここから下が箱の中)
  cloudY: 42,           // 雲の中心Y(箱の上)。フルーツはこの下にぶら下がる
  limitLineY: 158,      // 上限ライン(超えたままだとゲームオーバー)
  gameOverGraceMs: 900,  // 上限ライン超えがこの時間続いたらゲームオーバー(短め=判定厳しめ)
  dyingMs: 1100,        // ゲームオーバー時の「プルプル震える」演出の長さ
  landFallbackMs: 2500, // 着地検知が来ない場合の保険(これで次を出す)
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.engine = Matter.Engine.create();
    this.engine.gravity.scale = 0.0014; // 落下を少し速く(既定0.001)
    this.engine.enableSleeping = true;  // 静止したら眠らせる→止まり際の左右ゆらゆらを抑える
    // ソルバーの反復を増やして、積み重なった果物の「ぷるぷる」「めり込みの押し戻し反動」を抑える
    this.engine.positionIterations = 14;
    this.engine.velocityIterations = 10;
    this.engine.constraintIterations = 4;
    this.world = this.engine.world;

    this.dropX = GAME.width / 2;     // 待機フルーツのX位置
    this.currentIndex = this.randomFruitIndex();
    this.nextIndex = this.randomFruitIndex();
    this.canDrop = true;             // 次のフルーツを落とせる状態か
    this.activeBody = null;          // 落下中(着地待ち)のフルーツ
    this.landTimer = null;           // 着地検知の保険タイマー

    this.score = 0;
    this.isGameOver = false;
    this.phase = "playing";          // playing → dying(震える) → dead(ランキング表示)
    this.dyingSince = null;          // 震え演出の開始時刻
    this.effects = [];               // 合体の破裂エフェクト
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
      this.spawnPop(mid.x, mid.y, FRUITS[a.fruitIndex].radius, FRUITS[a.fruitIndex].color);
      this.addScore(WATERMELON_BONUS);
      if (typeof GameAudio !== "undefined") GameAudio.merge(a.fruitIndex);
      return;
    }

    const newIndex = a.fruitIndex + 1;
    const body = this.createFruitBody(newIndex, mid.x, mid.y);
    Matter.Composite.add(this.world, body);
    // 合体しても跳ねさせない(反動なし)。演出は見た目の破裂エフェクトだけで表現
    this.spawnPop(mid.x, mid.y, FRUITS[newIndex].radius, FRUITS[newIndex].color);
    this.addScore(FRUITS[newIndex].score);
    if (typeof GameAudio !== "undefined") GameAudio.merge(newIndex);
  }

  // 合体の破裂エフェクト(描画ループで広がって消える)
  spawnPop(x, y, r, color) {
    this.effects.push({ x, y, r, color, age: 0, life: 16 });
  }

  // フルーツのボディ生成(落下・合体で共通)。手触りの調整はここ一箇所
  // 本家っぽく:ぶつかると回転し、抵抗少なめでよく転がる(でも跳ねすぎない)
  createFruitBody(index, x, y) {
    const radius = FRUITS[index].radius;
    const body = Matter.Bodies.circle(x, y, radius, {
      label: "fruit",
      restitution: 0,         // 反動ゼロ(ぶつかっても跳ね返って戻らない)
      friction: 0,            // 接地の摩擦ゼロ→床を走る間は一切減速しない(見た目の回転は描画側で表現)
      frictionStatic: 0,      // 動き出しの引っかかり無し
      frictionAir: 0,         // 空気抵抗ゼロ→何もない所では止まらず動き続ける
      sleepThreshold: 90,     // 眠るまで長めに(動いている間に勝手に止まらない)。揺れ止めの保険のみ
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
        body._lastX = undefined; // 見た目回転の基準をリセット(瞬間移動で回りすぎないように)
      }
    }
  }

  checkGameOver() {
    if (this.phase !== "playing") return;
    this.recoverEscaped();
    // 着地済みフルーツの上端が上限ラインを超えていれば対象(速度は問わない=連打のあふれも確実に検知)
    const over = Matter.Composite.allBodies(this.world).some((body) =>
      body.label === "fruit" &&
      body.hasLanded &&
      body.position.y - FRUITS[body.fruitIndex].radius < GAME.limitLineY
    );
    if (!over) {
      this.overLimitSince = null;
      return;
    }
    if (this.overLimitSince === null) this.overLimitSince = Date.now();
    if (Date.now() - this.overLimitSince >= GAME.gameOverGraceMs) {
      this.startDying();
    }
  }

  // ゲームオーバー演出開始:物理を止めて、フルーツが目をつむってプルプル震える
  startDying() {
    this.phase = "dying";
    this.isGameOver = true;
    this.dyingSince = Date.now();
    this.engine.timing.timeScale = 0; // 物理を凍結(揺れは描画側で表現)
    clearTimeout(this.landTimer);
  }

  restart() {
    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label === "fruit") Matter.Composite.remove(this.world, body);
    }
    this.score = 0;
    this.isGameOver = false;
    this.phase = "playing";
    this.dyingSince = null;
    this.effects = [];
    this.engine.timing.timeScale = 1; // 物理を再開
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
    // 壁・床もツルツル(摩擦ゼロ・反動ゼロ)→ 床を走る間は減速せず、ぶつかっても戻らない
    const opts = { isStatic: true, label: "wall", friction: 0, frictionStatic: 0, restitution: 0 };
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

    // 震え演出が終わったら dead へ。描画より先に切り替えることで、このフレームで
    // 「通常の顔の静止画」を描いてから onGameOver を呼べる(=証跡キャプチャがその絵になる)
    let justDied = false;
    if (this.phase === "dying" && Date.now() - this.dyingSince >= GAME.dyingMs) {
      this.phase = "dead";
      justDied = true;
    }

    ctx.clearRect(0, 0, GAME.width, GAME.height);

    const playing = this.phase === "playing";
    this.drawBox(ctx);
    if (playing) this.drawGuideLine(ctx);

    // 雲は一番奥(フルーツより先に描く)→ 落とした瞬間も含めて常にフルーツの裏
    if (playing) drawSprite(ctx, getCloudSprite(), this.dropX, GAME.cloudY);

    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label === "fruit") this.drawFruit(ctx, body);
    }

    // 待機フルーツは雲の手前(完全に見える)
    if (playing && this.canDrop) {
      drawSprite(ctx, getFruitSprite(this.currentIndex), this.dropX, this.waitCenterY(this.currentIndex));
    }

    this.drawEffects(ctx);

    // 通常の顔の静止画(=証跡)を描き終えてから通知。main.js はこの瞬間にキャンバスを撮る
    if (justDied && this.onGameOver) this.onGameOver(this.score);
    requestAnimationFrame(() => this.draw());
  }

  drawBox(ctx) {
    const t = GAME.wallThickness;
    // 枠線なし(塗りのみ)。箱のフチの線は出さない
    ctx.fillStyle = "#C8A165";
    const walls = [
      [0, GAME.height - t, GAME.width, t],
      [0, GAME.topMargin, t, GAME.height - GAME.topMargin],
      [GAME.width - t, GAME.topMargin, t, GAME.height - GAME.topMargin],
    ];
    for (const [x, y, w, h] of walls) {
      ctx.fillRect(x, y, w, h);
    }
    // 上限ライン(赤の点線)はプレイ中のみ
    if (this.phase === "playing") {
      ctx.strokeStyle = "#E74C3C";
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(GAME.wallThickness, GAME.limitLineY);
      ctx.lineTo(GAME.width - GAME.wallThickness, GAME.limitLineY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 合体の破裂エフェクト(白い輪＋きらきらが広がって消える)
  drawEffects(ctx) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age++;
      const p = e.age / e.life;
      if (p >= 1) { this.effects.splice(i, 1); continue; }
      const ease = 1 - (1 - p) * (1 - p);
      const rr = e.r * (0.55 + ease * 1.0);
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = Math.max(2, e.r * 0.2 * (1 - p));
      ctx.beginPath();
      ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      // 飛び散るきらきら
      ctx.fillStyle = "#FFF4C2";
      const n = 6;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + e.r;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr * 1.05, e.y + Math.sin(a) * rr * 1.05,
          Math.max(1.5, e.r * 0.09 * (1 - p)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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
    // ゲームオーバーの震え演出中:目をつむってプルプル(その場で直接描画)
    if (this.phase === "dying") {
      const fruit = FRUITS[body.fruitIndex];
      const j = fruit.radius * 0.05;
      const dx = (Math.random() * 2 - 1) * j;
      const dy = (Math.random() * 2 - 1) * j;
      drawFruitShape(ctx, body.position.x + dx, body.position.y + dy,
        fruit, body.angle, fruit.radius, { eyes: "closed" });
      return;
    }
    // 通常:事前生成スプライトを描く。
    // 物理は抵抗ゼロでよく滑る(=回転はほぼ無い)ので、見た目だけ「横移動した距離ぶん回す」
    // ことで、転がっているように見せる(車輪と同じ:進んだ距離 ÷ 半径 = 回転角)。
    const s = getFruitSprite(body.fruitIndex);
    const radius = FRUITS[body.fruitIndex].radius;
    if (body._lastX === undefined) { body._lastX = body.position.x; body._rollAngle = body.angle; }
    body._rollAngle += (body.position.x - body._lastX) / radius;
    body._lastX = body.position.x;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body._rollAngle);
    ctx.drawImage(s.canvas, -s.ext, -s.ext, s.ext * 2, s.ext * 2);
    ctx.restore();
  }
}
