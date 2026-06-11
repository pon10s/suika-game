// フルーツ定義(REQUIREMENTS.md の11段階 / 色・表情は docs/DESIGN.md に従う)
// score は「合体でそのフルーツができたとき」に加算する点数(本家方式)
// face: laugh=元気に笑ってる / smile=にっこり / wink=いたずらっこ /
//       angry=ちょっとおこ / relaxed=ほんわか / sulky=すねてる / shy=てれてれ
const FRUITS = [
  { name: "さくらんぼ",   radius: 16,  color: "#F23B3B", score: 0,  face: "laugh" },
  { name: "いちご",       radius: 24,  color: "#FF5160", score: 1,  face: "shy" },
  { name: "ぶどう",       radius: 32,  color: "#A436D6", score: 3,  face: "wink" },
  { name: "デコポン",     radius: 40,  color: "#FFA21F", score: 6,  face: "deko" },
  { name: "かき",         radius: 50,  color: "#FF7A1A", score: 10, face: "relaxed" },
  { name: "りんご",       radius: 60,  color: "#F5283C", score: 15, face: "smile" },
  { name: "なし",         radius: 72,  color: "#C6E23A", score: 21, face: "nashi" },
  { name: "もも",         radius: 84,  color: "#FF9CC4", score: 28, face: "momo" },
  { name: "パイナップル", radius: 96,  color: "#FFD51F", score: 36, face: "pine" },
  { name: "メロン",       radius: 110, color: "#86D24A", score: 45, face: "sleepy" },
  { name: "スイカ",       radius: 125, color: "#36A94E", score: 55, face: "laugh" },
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

// フルーツを1個描く(イラスト調:ベタ塗り＋太い縁取り＋本体同系色の濃い目口)。
// ゲーム画面・ネクスト表示・進化リストで共用。drawRadius でミニ表示も可。
function drawFruitShape(ctx, x, y, fruit, angle = 0, drawRadius = fruit.radius) {
  const r = drawRadius;
  const outline = shade(fruit.color, 0.34); // 縁取り:本体より濃い同系色
  const ink = shade(fruit.color, 0.48);     // 目・口:さらに濃い同系色
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

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

  // フルーツらしい形・装飾(当たり判定は円のまま、見た目だけ果物に寄せる)
  drawDecoration(ctx, r, fruit, ink);

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

  // 顔(本体同系色の濃い色で)
  drawFace(ctx, r, fruit.face, ink);

  ctx.restore();
}

// フルーツごとの装飾。本家と同じく「丸い本体の上にフルーツの形を乗せる」方式。
// 円からはみ出していいのは上部のヘタ・葉・冠だけ(接触しない場所)。横・下は円のまま＋陰影。
function drawDecoration(ctx, r, fruit, ink) {
  const STEM = "#7B4F2C";       // 枝(イラスト調で少し濃いめの茶)
  const STEM_D = "#5C3A1E";     // 枝の縁取り
  const LEAF = "#5BB85B";
  const LEAF_D = "#3C8C3C";

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

  const clipBody = (draw) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    draw();
    ctx.restore();
  };

  // 上部のくぼみ(りんご・なし):中心上を暗く落として凹みを表現
  const topDimple = () => {
    clipBody(() => {
      const d = ctx.createRadialGradient(0, -r * 0.9, r * 0.04, 0, -r * 0.9, r * 0.55);
      d.addColorStop(0, "rgba(0,0,0,0.30)");
      d.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = d;
      ctx.beginPath();
      ctx.arc(0, -r * 0.65, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
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
    case "いちご": { // 上の緑ヘタ(5枚)+ 種のつぶつぶ
      ctx.fillStyle = LEAF;
      for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.translate(0, -r * 0.72);
        ctx.rotate(i * 0.55);
        ctx.beginPath();
        ctx.moveTo(0, r * 0.18);
        ctx.lineTo(-r * 0.16, -r * 0.45);
        ctx.lineTo(r * 0.16, -r * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      stem(0.16, 0.06);
      ctx.fillStyle = "rgba(255, 240, 150, 0.95)";
      const seeds = [[-0.32, 0.25], [0.32, 0.28], [0, 0.5], [-0.5, 0.46], [0.5, 0.42], [-0.15, 0.02], [0.2, 0.08], [-0.6, 0.1], [0.58, 0.12], [0, 0.7]];
      for (const [sx, sy] of seeds) {
        ctx.save();
        ctx.translate(sx * r, sy * r);
        ctx.rotate(0.4);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.04, r * 0.075, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "ぶどう": { // 房に見えるように粒の輪郭＋ツヤを重ねる
      stem(0.28, 0.08);
      leaf(1, 0.18, 1.12, 0.2);
      clipBody(() => {
        const lobes = [[-0.45, 0.05], [0.45, 0.05], [-0.28, 0.5], [0.28, 0.5], [0, 0.72], [-0.6, -0.25], [0.6, -0.25], [0, 0.18], [-0.15, -0.55], [0.15, -0.55]];
        ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
        ctx.lineWidth = Math.max(1, r * 0.03);
        for (const [bx, by] of lobes) {
          ctx.beginPath();
          ctx.arc(bx * r, by * r, r * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        for (const [bx, by] of lobes) {
          ctx.beginPath();
          ctx.arc(bx * r - r * 0.1, by * r - r * 0.12, r * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }
    case "デコポン": { // オレンジ(かき)と区別:そばかすみたいなぼつぼつ
      clipBody(() => {
        ctx.fillStyle = shade(fruit.color, 0.28);
        const spots = [[-0.45, -0.2], [0.4, -0.3], [-0.2, 0.1], [0.15, 0.25], [-0.55, 0.3], [0.5, 0.2],
          [0.05, -0.45], [-0.3, 0.5], [0.45, 0.5], [-0.1, 0.55], [0.3, -0.1], [-0.6, 0.0], [0.6, -0.05], [0.2, 0.55]];
        for (const [dx, dy] of spots) {
          ctx.beginPath();
          ctx.arc(dx * r, dy * r, r * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }
    case "かき": { // 4枚の緑ヘタ(柿の特徴)
      ctx.fillStyle = LEAF_D;
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.78);
        ctx.quadraticCurveTo(-r * 0.3, -r * 0.95, 0, -r * 1.06);
        ctx.quadraticCurveTo(r * 0.3, -r * 0.95, 0, -r * 0.78);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = STEM;
      ctx.beginPath();
      ctx.arc(0, -r * 0.9, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "りんご": { // 上のくぼみ + 茎 + 葉
      topDimple();
      stem(0.32, 0.07);
      leaf(1, 0.16, 1.12, 0.18);
      break;
    }
    case "なし": { // 上のくぼみ + 皮の斑点(固定位置)
      topDimple();
      stem(0.26, 0.06);
      clipBody(() => {
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
    case "もも": { // 縦の割れ目(桃のすじ)+ 葉
      clipBody(() => {
        ctx.strokeStyle = "rgba(0,0,0,0.14)";
        ctx.lineWidth = Math.max(1, r * 0.04);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95);
        ctx.quadraticCurveTo(r * 0.12, 0, 0, r * 0.95);
        ctx.stroke();
      });
      leaf(1, 0.1, 1.0, 0.22);
      break;
    }
    case "パイナップル": { // 上にトゲトゲの冠 + 網目
      ctx.fillStyle = LEAF_D;
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
        ctx.restore();
      }
      clipBody(() => {
        ctx.strokeStyle = "rgba(150, 110, 0, 0.4)";
        ctx.lineWidth = Math.max(1, r * 0.03);
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.35 - r); ctx.lineTo(r, i * r * 0.35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.35 + r); ctx.lineTo(r, i * r * 0.35); ctx.stroke();
        }
      });
      break;
    }
    case "メロン": { // 網目模様 + T字のヘタ
      clipBody(() => {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = Math.max(1, r * 0.022);
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.32 - r * 0.2); ctx.lineTo(r, i * r * 0.32 + r * 0.2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-r, i * r * 0.32 + r * 0.2); ctx.lineTo(r, i * r * 0.32 - r * 0.2); ctx.stroke();
        }
      });
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
    default:
      stem(0.26, 0.07);
      leaf(1, 0.18, 1.05, 0.18);
  }
}

// 顔:「絶対に死なんハムスター」風。手書きっぽいシンプル顔。色は本体の濃い同系色(ink)。
// 目・口ともにバリエーション多め。
function drawFace(ctx, r, face, ink = "#4a3a30") {
  const eyeX = r * 0.28;
  const eyeY = -r * 0.02;
  const eyeR = Math.max(1.1, r * 0.078);
  const lw = Math.max(1, r * 0.05);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;

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
