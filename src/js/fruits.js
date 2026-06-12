// フルーツ定義(REQUIREMENTS.md の11段階 / 色・表情は docs/DESIGN.md に従う)
// score は「合体でそのフルーツができたとき」に加算する点数(本家方式)
// face: laugh=元気に笑ってる / smile=にっこり / wink=いたずらっこ /
//       angry=ちょっとおこ / relaxed=ほんわか / sulky=すねてる / shy=てれてれ
// rimL: 縁取りの明度倍率(省略時は 0.82)。小さいほど濃い(暗い)縁になる。
// さくらんぼ・いちご・なし・メロン・スイカは明るすぎたので本体よりしっかり濃い縁にする。
const FRUITS = [
  { name: "さくらんぼ",   radius: 14,  color: "#F23B3B", score: 0,  face: "laugh",   rimL: 0.6 },
  { name: "いちご",       radius: 21,  color: "#FF5160", score: 1,  face: "shy",     rimL: 0.6 },
  { name: "ぶどう",       radius: 30,  color: "#B45CDB", score: 3,  face: "wink" },
  { name: "デコポン",     radius: 40,  color: "#FFA21F", score: 6,  face: "deko" },
  { name: "かき",         radius: 50,  color: "#FF7A1A", score: 10, face: "relaxed" },
  { name: "りんご",       radius: 60,  color: "#F5283C", score: 15, face: "smile" },
  { name: "なし",         radius: 72,  color: "#D8D64A", score: 21, face: "nashi",   rimL: 0.6 },
  { name: "もも",         radius: 84,  color: "#FF9CC4", score: 28, face: "momo" },
  { name: "パイナップル", radius: 96,  color: "#FFD51F", score: 36, face: "pine" },
  { name: "メロン",       radius: 110, color: "#86D24A", score: 45, face: "sleepy",  rimL: 0.6 },
  { name: "スイカ",       radius: 125, color: "#36A94E", score: 55, face: "laugh",   rimL: 0.6 },
];

// スイカ同士が合体したときの消滅ボーナス
const WATERMELON_BONUS = 100;

// 色を濃く/淡くする。f>0で暗く、f<0で明るく。縁取り・目口の「本体より濃い同系色」用。
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r *= 1 - f; g *= 1 - f; b *= 1 - f; }
  else { r += (255 - r) * -f; g += (255 - g) * -f; b += (255 - b) * -f; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// --- HSL ベースの色調整 ---
// 彩度を上げたり、縁取りを「黒へ寄せず」明るい同系色にするために使う。
function _hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function _hslToHex(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
const _clamp01 = (v) => Math.max(0, Math.min(1, v));
// 色相は保ったまま、彩度(sMul)・明度(lMul)を倍率で調整した色を返す。
function tone(hex, sMul = 1, lMul = 1) {
  const [h, s, l] = _rgbToHsl(..._hexToRgb(hex));
  return _hslToHex(h, _clamp01(s * sMul), _clamp01(l * lMul));
}

// 全フルーツの本体色をビビッドに(色相そのまま・彩度を底上げ・ほんの少し明るく)。
// 縁取り・目口・模様もこの本体色から派生するので、ここを上げれば全体が鮮やかになる。
for (const _f of FRUITS) { _f.color = tone(_f.color, 1.3, 1.04); }

// フルーツを1個描く(イラスト調:ベタ塗り＋太い縁取り＋本体同系色の濃い目口)。
// ゲーム画面・ネクスト表示・進化リストで共用。drawRadius でミニ表示も可。
// opts.eyes === "closed" でゲームオーバー時の「目をつむった顔」になる。
function drawFruitShape(ctx, x, y, fruit, angle = 0, drawRadius = fruit.radius, opts = {}) {
  const r = drawRadius;
  // 縁取り:黒へ寄せず、彩度を上げた同系色にする。明度は fruit.rimL(既定0.82)で個別調整。
  const outline = tone(fruit.color, 1.2, fruit.rimL ?? 0.82);
  const ink = tone(fruit.color, 1.25, (fruit.rimL ?? 0.82) * 0.7);  // 目・口:縁よりさらに濃いめ。黒は使わない
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 当たり判定は円のまま。いちご・ぶどうは見た目だけ別の形にする(隙間/重なりは許容)
  if (fruit.name === "いちご") {
    drawStrawberryBody(ctx, r, fruit, outline);
  } else if (fruit.name === "ぶどう") {
    drawGrapeBody(ctx, r, fruit, outline);
  } else {
    // 本体(ベタ塗りの円 → フルーツ同士に隙間ができない)
    ctx.fillStyle = fruit.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // スイカだけ縦縞(docs/DESIGN.md)
    if (fruit.name === "スイカ") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "#1B5E20";
      ctx.lineWidth = r * 0.16;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.42, -r);
        ctx.lineTo(i * r * 0.42, r);
        ctx.stroke();
      }
      ctx.restore();
    }

    // イラスト調のやわらかい光(上側だけ・影は付けない=フラットで漫画っぽく)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.32, r * 0.72, r * 0.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 表面の模様(種・網目・斑点など。円の内側=縁取りより下)
    drawSurfaceTexture(ctx, r, fruit);

    // 太い縁取り(本体より濃い同系色)
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, r * 0.085);
    ctx.beginPath();
    ctx.arc(0, 0, r - r * 0.03, 0, Math.PI * 2);
    ctx.stroke();

    // 小さな反射ハイライト
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.arc(-r * 0.4, -r * 0.45, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // ヘタ・枝・葉っぱ(縁取りより前に=隠れず手前に出す)
  drawTopper(ctx, r, fruit);

  // 顔(本体同系色の濃い色で)
  drawFace(ctx, r, fruit.face, ink, opts.eyes);

  ctx.restore();
}

// ---- 装飾の共通ヘルパー ----
const STEM = "#7B4F2C";       // 枝(イラスト調で少し濃いめの茶)
const STEM_D = "#5C3A1E";     // 枝の縁取り
const LEAF = "#5BB85B";
const LEAF_D = "#3C8C3C";

function _clipBody(ctx, r, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  draw();
  ctx.restore();
}

// いちご:見本のような、上が平たく横にふくらみ、下だけ丸く尖る形。
function drawStrawberryBody(ctx, r, fruit, outline) {
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.93);
    ctx.bezierCurveTo(-r * 0.42, r * 0.82, -r * 0.78, r * 0.42, -r * 0.94, -r * 0.02);
    ctx.bezierCurveTo(-r * 0.96, -r * 0.48, -r * 0.7, -r * 0.72, -r * 0.38, -r * 0.76);
    ctx.bezierCurveTo(-r * 0.16, -r * 0.79, r * 0.16, -r * 0.79, r * 0.38, -r * 0.76);
    ctx.bezierCurveTo(r * 0.7, -r * 0.72, r * 0.96, -r * 0.48, r * 0.94, -r * 0.02);
    ctx.bezierCurveTo(r * 0.78, r * 0.42, r * 0.42, r * 0.82, 0, r * 0.93);
    ctx.closePath();
  };
  ctx.fillStyle = fruit.color;
  trace();
  ctx.fill();
  ctx.save();
  trace();
  ctx.clip();
  // やわらかい光
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.18, r * 0.5, r * 0.4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // 種のつぶつぶ(三角の中に収まる位置)
  ctx.fillStyle = "rgba(255,240,150,0.95)";
  const seeds = [[-0.32, 0.0], [0.3, 0.04], [0, 0.22], [-0.5, 0.28], [0.48, 0.3],
    [-0.2, 0.46], [0.22, 0.46], [0, 0.66], [-0.34, 0.58], [0.34, 0.58], [-0.12, 0.8], [0.14, 0.8]];
  for (const [sx, sy] of seeds) {
    ctx.save();
    ctx.translate(sx * r, sy * r);
    ctx.rotate(0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.045, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // 縁取り
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(2, r * 0.085);
  trace();
  ctx.stroke();
  // ハイライト
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(-r * 0.34, -r * 0.34, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// ぶどう:頬を外へ張り出した、丸みのある逆三角形の房。
// 見た目の外周を当たり判定円の近くまで広げ、先端や頬が接触位置から浮いて見えないようにする。
function drawGrapeBody(ctx, r, fruit, outline) {
  const gr = r * 0.38;
  // 上段と中段を同じ3粒にして頬をふっくらさせ、下の1粒で丸い三角形にまとめる
  const grapes = [
    [-0.4, -0.36], [0.0, -0.54], [0.4, -0.36],
    [-0.56, 0.16], [0.0, -0.02], [0.56, 0.16],
    [0.0, 0.55],
  ];
  // 1) 全粒に太い縁取りをストローク → このあと塗りで内側を隠す=外周だけ縁取りが残る
  ctx.lineJoin = "round";
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(2.5, r * 0.12);
  for (const [gx, gy] of grapes) { ctx.beginPath(); ctx.arc(gx * r, gy * r, gr, 0, Math.PI * 2); ctx.stroke(); }
  // 2) 均一な単色で塗り(フラット)。手前(下)の粒を後に塗って重なりを自然に
  ctx.fillStyle = fruit.color;
  for (const [gx, gy] of grapes) { ctx.beginPath(); ctx.arc(gx * r, gy * r, gr, 0, Math.PI * 2); ctx.fill(); }
  // 3) 粒の境目(円弧を重ねた感じ)=各粒の下側の弧を薄い同系色で
  ctx.strokeStyle = shade(fruit.color, 0.13);
  ctx.lineWidth = Math.max(1, r * 0.04);
  for (const [gx, gy] of grapes) { ctx.beginPath(); ctx.arc(gx * r, gy * r, gr * 0.94, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke(); }
  // 4) 各粒に同じ位置の小さなツヤ(均一なテイスト)
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  for (const [gx, gy] of grapes) { ctx.beginPath(); ctx.arc(gx * r - gr * 0.32, gy * r - gr * 0.34, gr * 0.2, 0, Math.PI * 2); ctx.fill(); }
}

// 表面の模様(円の内側のテクスチャ。縁取りより下に描く)。はみ出すヘタ・枝はここには描かない。
function drawSurfaceTexture(ctx, r, fruit) {
  switch (fruit.name) {
    case "デコポン": { // オレンジ(かき)と区別:そばかす。※口まわり(中央下)には置かない
      _clipBody(ctx, r, () => {
        ctx.fillStyle = shade(fruit.color, 0.28);
        const spots = [[-0.45, -0.2], [0.4, -0.3], [-0.2, 0.1], [-0.55, 0.3], [0.5, 0.2],
          [0.05, -0.45], [-0.3, 0.5], [0.45, 0.5], [0.3, -0.1], [-0.6, 0.0], [0.6, -0.05]];
        for (const [dx, dy] of spots) {
          ctx.beginPath();
          ctx.arc(dx * r, dy * r, r * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }
    case "なし": { // 皮の斑点(固定位置)
      _clipBody(ctx, r, () => {
        ctx.fillStyle = "rgba(120, 90, 40, 0.35)";
        const dots = [[-0.4, -0.1], [0.35, 0.0], [-0.1, 0.3], [0.2, 0.45], [-0.5, 0.3], [0.5, 0.35], [0.05, -0.2], [-0.25, 0.55], [0.45, -0.3], [-0.6, 0.0], [0.15, 0.65], [-0.3, -0.4]];
        for (const [dx, dy] of dots) {
          ctx.beginPath();
          ctx.arc(dx * r, dy * r, r * 0.025, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }
    case "パイナップル": { // 網目
      _clipBody(ctx, r, () => {
        ctx.strokeStyle = "rgba(150, 110, 0, 0.4)";
        ctx.lineWidth = Math.max(1, r * 0.03);
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.35 - r); ctx.lineTo(r, i * r * 0.35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.35 + r); ctx.lineTo(r, i * r * 0.35); ctx.stroke();
        }
      });
      break;
    }
    case "メロン": { // 網目模様
      _clipBody(ctx, r, () => {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = Math.max(1, r * 0.022);
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.32 - r * 0.2); ctx.lineTo(r, i * r * 0.32 + r * 0.2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.32 + r * 0.2); ctx.lineTo(r, i * r * 0.32 - r * 0.2); ctx.stroke();
        }
      });
      break;
    }
  }
}

// ヘタ・枝・葉っぱ・冠(縁取りより前=手前に出す。隠れない)。
function drawTopper(ctx, r, fruit) {
  // 太めの枝(縁取りつきでイラストっぽく)
  const stem = (len = 0.3, w = 0.12) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = STEM_D;
    ctx.lineWidth = Math.max(2, r * (w + 0.04));
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(0, -r * (0.9 + len));
    ctx.stroke();
    ctx.strokeStyle = STEM;
    ctx.lineWidth = Math.max(1, r * w);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(0, -r * (0.9 + len));
    ctx.stroke();
  };

  const leaf = (side = 1, cx = 0.22, cy = 1.05, lr = 0.24) => {
    ctx.save();
    ctx.translate(side * r * cx, -r * cy);
    ctx.rotate(side * -0.6);
    ctx.fillStyle = LEAF;
    ctx.strokeStyle = LEAF_D;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * lr, r * lr * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  switch (fruit.name) {
    case "さくらんぼ": { // 長くてカーブした太い茎(縁取りつき)
      ctx.lineCap = "round";
      ctx.strokeStyle = STEM_D;
      ctx.lineWidth = Math.max(2, r * 0.17);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.82);
      ctx.quadraticCurveTo(r * 0.7, -r * 1.5, r * 0.3, -r * 1.65);
      ctx.stroke();
      ctx.strokeStyle = STEM;
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.82);
      ctx.quadraticCurveTo(r * 0.7, -r * 1.5, r * 0.3, -r * 1.65);
      ctx.stroke();
      break;
    }
    case "いちご": { // 見本に合わせた、低く横へ広がる丸い三つ葉状のヘタ
      ctx.save();
      ctx.translate(0, -r * 0.72);
      ctx.fillStyle = LEAF;
      ctx.strokeStyle = LEAF_D;
      ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath();
      ctx.moveTo(-r * 0.68, 0);
      ctx.bezierCurveTo(-r * 0.7, -r * 0.2, -r * 0.46, -r * 0.27, -r * 0.28, -r * 0.15);
      ctx.bezierCurveTo(-r * 0.2, -r * 0.42, r * 0.2, -r * 0.42, r * 0.28, -r * 0.15);
      ctx.bezierCurveTo(r * 0.46, -r * 0.27, r * 0.7, -r * 0.2, r * 0.68, 0);
      ctx.bezierCurveTo(r * 0.62, r * 0.2, r * 0.34, r * 0.19, r * 0.2, r * 0.08);
      ctx.bezierCurveTo(r * 0.08, r * 0.3, -r * 0.08, r * 0.3, -r * 0.2, r * 0.08);
      ctx.bezierCurveTo(-r * 0.34, r * 0.19, -r * 0.62, r * 0.2, -r * 0.68, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "ぶどう": { // 葉は左上に1枚(参考画像どおり)。茎は描かない
      leaf(-1, 0.5, 0.6, 0.22);
      break;
    }
    case "かき": { // 柿のヘタ(がく):上に横へ広がる4枚のがく。星形に開く
      ctx.save();
      ctx.translate(0, -r * 0.72); // がくの中心(果実の上)
      ctx.fillStyle = LEAF;
      ctx.strokeStyle = LEAF_D;
      ctx.lineWidth = Math.max(1, r * 0.03);
      // +x方向に伸びる短く幅広のがく1枚。angで向きを変える
      const sepal = (ang) => {
        ctx.save();
        ctx.rotate(ang);
        const len = r * 0.5, w = r * 0.17;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.5, -w, len, 0);
        ctx.quadraticCurveTo(len * 0.5, w, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      // 上方向(-PI/2)を中心に左右へ広げた4枚
      [-Math.PI * 0.92, -Math.PI * 0.64, -Math.PI * 0.36, -Math.PI * 0.08].forEach(sepal);
      // 中心をなめらかにつなぐ小さな緑(茶色の点は付けない)
      ctx.fillStyle = LEAF_D;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "りんご": { // 茎 + 葉(付け根の影は入れない)
      stem(0.32, 0.07);
      leaf(1, 0.16, 1.12, 0.18);
      break;
    }
    case "なし": { // 茎のみ(付け根の影は入れない)
      stem(0.26, 0.06);
      break;
    }
    case "もも": { // 葉のみ(縦すじは無し)
      leaf(1, 0.1, 1.0, 0.22);
      break;
    }
    case "パイナップル": { // 上にトゲトゲの冠
      ctx.fillStyle = LEAF;
      ctx.strokeStyle = LEAF_D;
      ctx.lineWidth = Math.max(1, r * 0.03);
      for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.translate(0, -r * 0.82);
        ctx.rotate(i * 0.34);
        ctx.beginPath();
        ctx.moveTo(0, r * 0.1);
        ctx.lineTo(-r * 0.1, -r * 0.6);
        ctx.lineTo(r * 0.1, -r * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "メロン": { // T字のヘタ
      ctx.strokeStyle = LEAF_D;
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, -r * 1.15);
      ctx.moveTo(-r * 0.18, -r * 1.12); ctx.lineTo(r * 0.18, -r * 1.12);
      ctx.stroke();
      break;
    }
    case "スイカ": // 縞は本体描画で対応済み。茎と葉を添える
      stem(0.22, 0.07);
      leaf(1, 0.18, 1.05, 0.18);
      break;
    case "デコポン": // ヘタ無し(そばかすのみ)
      break;
    default:
      stem(0.26, 0.07);
      leaf(1, 0.18, 1.05, 0.18);
  }
}

// 顔:「絶対に死なんハムスター」風。手書きっぽいシンプル顔。色は本体の濃い同系色(ink)。
// 目・口ともにバリエーション多め。
function drawFace(ctx, r, face, ink = "#4a3a30", eyesOverride = null) {
  const eyeX = r * 0.28;
  const eyeY = -r * 0.02;
  const eyeR = Math.max(1.1, r * 0.078);
  const lw = Math.max(1, r * 0.05);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;

  // ゲームオーバー時:目をつむった顔(困り眉＋小さな口)
  if (eyesOverride === "closed") {
    ctx.strokeStyle = ink; ctx.lineWidth = lw;
    for (const sx of [-eyeX, eyeX]) {
      ctx.beginPath();
      ctx.arc(sx, eyeY - eyeR * 0.4, eyeR * 1.2, Math.PI * 0.12, Math.PI * 0.88); // ‿ 閉じた目
      ctx.stroke();
    }
    // 小さな「>_<」っぽい口
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, r * 0.2);
    ctx.quadraticCurveTo(0, r * 0.28, r * 0.1, r * 0.2);
    ctx.stroke();
    // ほっぺ
    ctx.fillStyle = "rgba(255, 150, 160, 0.4)";
    ctx.beginPath(); ctx.arc(-r * 0.52, r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.52, r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
    return;
  }

  // --- 目のバリエーション ---
  const dot = (x, dx = 0) => { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x + dx, eyeY, eyeR, 0, Math.PI * 2); ctx.fill(); };
  const happy = (x) => { // ^ にっこり
    ctx.strokeStyle = ink; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(x, eyeY + eyeR * 0.7, eyeR * 1.3, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
  };
  const ring = (x) => { // o 白目(中空)
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath(); ctx.arc(x, eyeY, eyeR * 1.1, 0, Math.PI * 2); ctx.stroke();
  };
  const hanoji = (x, side) => { // ＼／ ハの字(困り目)
    ctx.strokeStyle = ink; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x - side * eyeR * 1.1, eyeY - eyeR * 0.9);
    ctx.lineTo(x + side * eyeR * 1.1, eyeY + eyeR * 0.5);
    ctx.stroke();
  };
  const sleepy = (x) => { // ― 半目(ねむそう)
    ctx.strokeStyle = ink; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x - eyeR, eyeY); ctx.lineTo(x + eyeR, eyeY); ctx.stroke();
  };
  const lashEye = (x, side) => { // 点目＋まつげ(目から外へ跳ねる)
    dot(x);
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(x + side * eyeR * 0.7, eyeY - eyeR * 0.6);
    ctx.quadraticCurveTo(x + side * eyeR * 1.9, eyeY - eyeR * 1.7, x + side * eyeR * 2.5, eyeY - eyeR * 1.1);
    ctx.stroke();
  };

  // --- 口のバリエーション ---
  const omega = (size = 0.11, my = 0.14) => { // ω
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.045);
    const a = r * size, y = r * my;
    ctx.beginPath(); ctx.arc(-a, y, a, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(a, y, a, 0, Math.PI); ctx.stroke();
  };
  const smileArc = (size = 0.16, my = 0.06) => { // ◡ にこっ
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.arc(0, r * my, r * size, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  };
  const openMouth = (size = 0.13, my = 0.18) => { // ● ぱくっ(開いた口)
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(0, r * my, r * size, r * size * 1.1, 0, 0, Math.PI * 2); ctx.fill();
  };
  const cat3 = (my = 0.16) => { // ³ ネコ口
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.045);
    const a = r * 0.1, y = r * my;
    ctx.beginPath(); ctx.arc(-a, y, a, Math.PI * 1.9, Math.PI * 0.9, false); ctx.stroke();
    ctx.beginPath(); ctx.arc(a, y, a, Math.PI * 0.1, Math.PI * 1.1, true); ctx.stroke();
  };
  const lineMouth = (my = 0.18) => { // ― むっ
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.beginPath(); ctx.moveTo(-r * 0.1, r * my); ctx.lineTo(r * 0.1, r * my); ctx.stroke();
  };
  const caretUp = (size = 0.13, my = 0.17) => { // ∧ (Aみたいな口)
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.05);
    const a = r * size, y = r * my, h = r * 0.1;
    ctx.beginPath(); ctx.moveTo(-a, y); ctx.lineTo(0, y - h); ctx.lineTo(a, y); ctx.stroke();
  };
  const caretDown = (size = 0.13, my = 0.1) => { // ∨ (Aの逆の口)
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.05);
    const a = r * size, y = r * my, h = r * 0.1;
    ctx.beginPath(); ctx.moveTo(-a, y); ctx.lineTo(0, y + h); ctx.lineTo(a, y); ctx.stroke();
  };

  switch (face) {
    case "laugh":   happy(-eyeX); happy(eyeX); openMouth(0.12, 0.16); break;
    case "wink":    dot(-eyeX); happy(eyeX); omega(0.11, 0.14); break;
    case "sulky":   dot(-eyeX, eyeR * 0.6); dot(eyeX, eyeR * 0.6); lineMouth(0.18); break;
    case "relaxed": happy(-eyeX); happy(eyeX); omega(0.1, 0.14); break;
    case "shy":     happy(-eyeX); happy(eyeX); omega(0.085, 0.14); break;
    case "deko":    ring(-eyeX); ring(eyeX); caretUp(0.12, 0.18); break; // デコポン:白目+A口
    case "nashi":   hanoji(-eyeX, -1); hanoji(eyeX, 1); omega(0.09, 0.16); break; // ナシ:逆ハの字
    case "momo":    dot(-eyeX); dot(eyeX); caretDown(0.13, 0.1); break; // もも:Aの逆の口
    case "cat":     dot(-eyeX); dot(eyeX); cat3(0.16); break;
    case "sleepy":  sleepy(-eyeX); sleepy(eyeX); smileArc(0.12, 0.14); break;
    case "pine":    lashEye(-eyeX, -1); lashEye(eyeX, 1); smileArc(0.14, 0.06); break; // パイナップル:まつげ(両外)
    default:        dot(-eyeX); dot(eyeX); smileArc(0.14, 0.07); // smile
  }

  // ほっぺ(控えめ。てれは少し大きめ)
  const blushR = r * (face === "shy" ? 0.12 : 0.085);
  ctx.fillStyle = "rgba(255, 150, 160, 0.4)";
  ctx.beginPath(); ctx.arc(-r * 0.52, r * 0.2, blushR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.52, r * 0.2, blushR, 0, Math.PI * 2); ctx.fill();
}

// 待機フルーツを抱える雲(本家風)。点目＋ω口つき
function drawCloud(ctx, x, y) {
  const u = 20; // 雲の大きさの基準
  ctx.save();
  ctx.translate(x, y);

  // ふわふわの本体(複数の円の和集合)
  ctx.fillStyle = "#FFFFFF";
  const puffs = [[-1.5, 0.15, 0.85], [-0.7, -0.5, 1.0], [0.55, -0.55, 1.05], [1.5, 0.1, 0.8], [0, 0.25, 1.25]];
  ctx.beginPath();
  for (const [px, py, pr] of puffs) {
    ctx.moveTo((px + pr) * u, py * u);
    ctx.arc(px * u, py * u, pr * u, 0, Math.PI * 2);
  }
  ctx.fill();
  // 下を平らに
  ctx.beginPath();
  ctx.ellipse(0, 0.55 * u, 1.95 * u, 0.65 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // 下側のうっすら影
  ctx.fillStyle = "rgba(150, 180, 210, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 0.8 * u, 1.6 * u, 0.3 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // 顔(点目＋ω)
  const ink = "#5D6D7E";
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.arc(-0.5 * u, -0.05 * u, 0.13 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0.5 * u, -0.05 * u, 0.13 * u, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, 0.06 * u);
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(-0.13 * u, 0.18 * u, 0.13 * u, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.13 * u, 0.18 * u, 0.13 * u, 0, Math.PI); ctx.stroke();

  ctx.restore();
}

// 落下時に出るのは小さい方の5種類のみ
const DROPPABLE_COUNT = 5;

// --- スプライトキャッシュ ---
// 各フルーツを一度だけオフスクリーンに高解像度で描いて使い回す。
// 毎フレームの重い描画(グラデ・装飾)を避けて動きを滑らかにし、回転は drawImage で表現する。
const _spriteCache = {};
const SPRITE_SCALE = 2;     // 高解像度で焼いてくっきり
const SPRITE_PAD = 0.7;     // ヘタ・茎など円からのはみ出し余白(半径比)

function getFruitSprite(index) {
  if (_spriteCache[index]) return _spriteCache[index];
  const r = FRUITS[index].radius;
  const ext = r * (1 + SPRITE_PAD);             // 中心からの描画範囲
  const size = Math.ceil(ext * 2 * SPRITE_SCALE);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d");
  c.translate(size / 2, size / 2);
  c.scale(SPRITE_SCALE, SPRITE_SCALE);
  drawFruitShape(c, 0, 0, FRUITS[index], 0);    // 角度0で焼く
  const sprite = { canvas: cv, ext };
  _spriteCache[index] = sprite;
  return sprite;
}

// 雲も一度だけ焼いて使い回す
let _cloudSprite = null;
function getCloudSprite() {
  if (_cloudSprite) return _cloudSprite;
  const u = 20, ext = 2.7 * u;
  const size = Math.ceil(ext * 2 * SPRITE_SCALE);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d");
  c.translate(size / 2, size / 2);
  c.scale(SPRITE_SCALE, SPRITE_SCALE);
  drawCloud(c, 0, 0);
  _cloudSprite = { canvas: cv, ext };
  return _cloudSprite;
}

// スプライトを中心(x,y)に等倍で描く
function drawSprite(ctx, sprite, x, y) {
  ctx.drawImage(sprite.canvas, x - sprite.ext, y - sprite.ext, sprite.ext * 2, sprite.ext * 2);
}
