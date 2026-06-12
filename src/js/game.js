// ゲーム本体:Matter.js の世界(箱・フルーツ)の管理と描画
// F2時点:合体・スコア・ゲームオーバー判定まで

const GAME = {
  width: 480,
  height: 640,
  wallThickness: 16,
  topMargin: 128,       // 箱の縁(ここから下が箱の中)
  cloudY: 42,           // 雲の中心Y(箱の上)。フルーツはこの下にぶら下がる
  limitLineY: 128,      // 上限ライン=箱の一番上(topMarginと同じ)。ここを超えたままだとゲームオーバー
  gameOverGraceMs: 900,  // 上限ライン超えがこの時間続いたらゲームオーバー(短め=判定厳しめ)
  dyingMs: 1100,        // ゲームオーバー時の「プルプル震える」演出の長さ
  waitAnimMs: 420,      // 次の果物が出てきた瞬間の「プルプル+目つむり」演出の長さ
  landFallbackMs: 2500, // 着地検知が来ない場合の保険(これで次を出す)
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.engine = Matter.Engine.create();
    this.engine.gravity.scale = 0.0016; // 落下速度を少し速く(既定0.001)
    this.engine.enableSleeping = true;  // 落ち着いた山は眠らせる(動いている果物は止めない)
    // ソルバーの反復を多めに=積み重なりの「プルプル」を抑え、速い落下でもめり込まない
    this.engine.positionIterations = 30;
    this.engine.velocityIterations = 22;
    this.engine.constraintIterations = 6;
    this.world = this.engine.world;

    this.dropX = GAME.width / 2;     // 待機フルーツのX位置
    this.waitAnimStart = performance.now(); // 待機フルーツの登場アニメ開始時刻
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
    // 下の果物が消えると、その上に乗って眠っていた果物が固まったまま落ちないことがある。
    // 合体(=果物の消滅/生成)のたびに全フルーツを起こして、ちゃんと重力に従わせる。
    this.wakeAllFruits();

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

  // 眠っているフルーツを全部起こす(支えが消えたあと固まらないように)
  wakeAllFruits() {
    for (const b of Matter.Composite.allBodies(this.world)) {
      if (b.label === "fruit" && b.isSleeping) Matter.Sleeping.set(b, false);
    }
  }

  // フルーツのボディ生成(落下・合体で共通)。手触りの調整はここ一箇所
  // 本家っぽく:ぶつかると回転し、抵抗少なめでよく転がる(でも跳ねすぎない)
  createFruitBody(index, x, y) {
    const radius = FRUITS[index].radius;
    const body = Matter.Bodies.circle(x, y, radius, {
      label: "fruit",
      restitution: 0,         // 弾力ゼロ=固い物体。めり込んで跳ね返らない
      friction: 0,            // 摩擦ゼロ→床を滑る果物は何かに当たるまで止まらない(回転は描画で表現)
      frictionStatic: 0,      // 動き出しの引っかかり無し(押されたらすぐ動く)
      frictionAir: 0,         // 空気抵抗なし→何もない所では減速しない
      slop: 0.02,             // めり込み許容を小さく=固い当たり(沈み込み/跳ね戻りを抑える)
      sleepThreshold: 90,     // 完全に止まった果物だけ眠らせる(動いている間は止めない)
      // 質量を半径の約2.4乗に(density ∝ r^0.4)。大きい果物はしっかり重い(比≈139)。
      // r^2.5まで上げると質量比が極端でソルバーが不安定化(プルプル)するため、安定する2.4に。
      density: 0.0008 * Math.pow(radius, 0.4),
    });
    body.fruitIndex = index;
    return body;
  }

  addScore(points) {
    this.score += points;
    if (this.onScoreChange) this.onScoreChange(this.score);
  }

  // ---- ゲームオーバー判定 ----
  // 着地済みフルーツの「重心」が箱の上端の面を一瞬でも超えたら即アウト
  // (ぶつかって弾かれて上に出たときも逃さない。落下中・未着地のものは対象外)

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
        body._lastX = undefined; // 見た目回転の基準をリセット
      }
    }
  }

  checkGameOver() {
    if (this.phase !== "playing") return;
    this.recoverEscaped();
    // 着地済みフルーツの重心が箱の上端の面(limitLineY)を一瞬でも超えたら即アウト
    const over = Matter.Composite.allBodies(this.world).some((body) =>
      body.label === "fruit" &&
      body.hasLanded &&
      body.position.y < GAME.limitLineY
    );
    if (over) this.startDying();
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
    this.waitAnimStart = performance.now();
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
    this.waitAnimStart = performance.now(); // 新しい待機フルーツの登場アニメ
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
    this.drawBoxBack(ctx);   // ガラス瓶の奥側(本体・底・奥リム)
    if (playing) this.drawGuideLine(ctx);

    // 雲は一番奥(フルーツより先に描く)→ 落とした瞬間も含めて常にフルーツの裏。
    // 左右に伸び縮みさせて「もくもく」呼吸させる(見た目だけ)
    if (playing) {
      const tt = performance.now() / 1000;
      const sx = 1 + Math.sin(tt * 4.8) * 0.07;
      const sy = 1 - Math.sin(tt * 4.8) * 0.05;
      ctx.save();
      ctx.translate(this.dropX, GAME.cloudY);
      ctx.scale(sx, sy);
      drawSprite(ctx, getCloudSprite(), 0, 0);
      ctx.restore();
    }

    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.label === "fruit") this.drawFruit(ctx, body);
    }

    // 待機フルーツは雲の手前(完全に見える)。登場直後は一瞬プルプル＋目つむり→すぐ通常の顔
    if (playing && this.canDrop) {
      const wx = this.dropX, wy = this.waitCenterY(this.currentIndex);
      const elapsed = performance.now() - this.waitAnimStart;
      if (elapsed < GAME.waitAnimMs) {
        const fruit = FRUITS[this.currentIndex];
        const j = fruit.radius * 0.06;
        drawFruitShape(ctx, wx + (Math.random() * 2 - 1) * j, wy + (Math.random() * 2 - 1) * j,
          fruit, 0, fruit.radius, { eyes: "closed" });
      } else {
        drawSprite(ctx, getFruitSprite(this.currentIndex), wx, wy);
      }
    }

    this.drawBoxFront(ctx);  // ガラス瓶の手前(前リム・ハイライト)→ 上の果物がリムの奥に隠れて3Dに見える
    this.drawEffects(ctx);

    // 通常の顔の静止画(=証跡)を描き終えてから通知。main.js はこの瞬間にキャンバスを撮る
    if (justDied && this.onGameOver) this.onGameOver(this.score);
    requestAnimationFrame(() => this.draw());
  }

  // 開いた四角柱(角箱)の寸法。奥の上辺(yBack・高い)と手前の上辺(yFront・低い)で奥行きを出す。
  // dx=奥に行くほど狭く見せる遠近の食い込み(箱の中をのぞく立体感)。
  boxMetrics() {
    const L = GAME.wallThickness, R = GAME.width - GAME.wallThickness;
    const B = GAME.height - GAME.wallThickness;
    return {
      L, R, B,
      yBack: GAME.topMargin - 18,   // 奥の上辺(高い)
      yFront: GAME.topMargin + 16,  // 手前の上辺(低い)
      dx: 22,                       // 奥の遠近の食い込み
    };
  }

  // 開いた箱の外側シルエット(手前下→手前左上→奥左上→奥右上→手前右上→手前下)
  // ※手前の上辺(yFrontの横線)はここには含めない。それは drawBoxFront でフルーツの手前に描く。
  boxOutline(ctx, m) {
    ctx.beginPath();
    ctx.moveTo(m.L, m.B);
    ctx.lineTo(m.L, m.yFront);
    ctx.lineTo(m.L + m.dx, m.yBack);
    ctx.lineTo(m.R - m.dx, m.yBack);
    ctx.lineTo(m.R, m.yFront);
    ctx.lineTo(m.R, m.B);
    ctx.closePath();
  }

  // 奥側(フルーツより先):本体＋イラスト調の奥行き陰影(均一フラット・直線)＋太い外枠。
  drawBoxBack(ctx) {
    const m = this.boxMetrics();
    const BROWN = "#B5853F"; // 太い外枠(やわらかい薄茶・濃いめ)
    ctx.save();

    // ガラス本体(うっすら=中身が見える)
    this.boxOutline(ctx, m);
    ctx.fillStyle = "rgba(252,246,232,0.30)";
    ctx.fill();

    // 奥行きの陰影(イラスト調=均一なフラット色・まっすぐ)。clip
    ctx.save();
    this.boxOutline(ctx, m);
    ctx.clip();
    const wallSh = "rgba(150,118,74,0.18)"; // 壁
    const floorSh = "rgba(150,118,74,0.26)"; // 床(少し濃い)
    ctx.fillStyle = wallSh;
    // 奥の内壁(上の台形帯)
    ctx.beginPath();
    ctx.moveTo(m.L + m.dx, m.yBack); ctx.lineTo(m.R - m.dx, m.yBack);
    ctx.lineTo(m.R - m.dx, m.yBack + 24); ctx.lineTo(m.L + m.dx, m.yBack + 24); ctx.closePath();
    ctx.fill();
    // 左右の内壁(縦帯)
    ctx.fillRect(m.L, m.yFront, 22, m.B - m.yFront);
    ctx.fillRect(m.R - 22, m.yFront, 22, m.B - m.yFront);
    // 床(下の帯・少し濃い)
    ctx.fillStyle = floorSh;
    ctx.fillRect(m.L, m.B - 30, m.R - m.L, 30);
    ctx.restore();

    // 太い外枠(奥の上辺・斜めの横辺・縦の辺・底)。これより手前にフルーツが来る
    this.boxOutline(ctx, m);
    ctx.lineJoin = "miter";
    ctx.lineWidth = 8;
    ctx.strokeStyle = BROWN;
    ctx.stroke();
    ctx.restore();
  }

  // 手前側(フルーツより後):手前の上辺(横線)。これでフルーツが手前辺の奥に見え、開口の四辺がつながる。
  drawBoxFront(ctx) {
    const m = this.boxMetrics();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(m.L, m.yFront);
    ctx.lineTo(m.R, m.yFront);
    ctx.lineWidth = 8;
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#B5853F";
    ctx.stroke();
    ctx.restore();
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
    // 通常:摩擦ゼロで物理回転しないので、見た目だけ「横に進んだ距離 ÷ 半径」で回す
    // (車輪と同じ理屈=転がって見える)。いちご・ぶどうも横移動で一緒に転がる。
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
