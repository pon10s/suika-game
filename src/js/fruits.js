// フルーツ定義(REQUIREMENTS.md の11段階 / 色・表情は docs/DESIGN.md に従う)
// score は「合体でそのフルーツができたとき」に加算する点数(本家方式)
// face: laugh=元気に笑ってる / smile=にっこり / wink=いたずらっこ /
//       angry=ちょっとおこ / relaxed=ほんわか / sulky=すねてる / shy=てれてれ
const FRUITS = [
  { name: "さくらんぼ",   radius: 16,  color: "#D32F2F", score: 0,  face: "laugh" },
  { name: "いちご",       radius: 24,  color: "#E53935", score: 1,  face: "smile" },
  { name: "ぶどう",       radius: 32,  color: "#8E24AA", score: 3,  face: "wink" },
  { name: "デコポン",     radius: 40,  color: "#FB8C00", score: 6,  face: "angry" },
  { name: "かき",         radius: 50,  color: "#EF6C00", score: 10, face: "relaxed" },
  { name: "りんご",       radius: 60,  color: "#C62828", score: 15, face: "sulky" },
  { name: "なし",         radius: 72,  color: "#C0CA33", score: 21, face: "shy" },
  { name: "もも",         radius: 84,  color: "#F48FB1", score: 28, face: "smile" },
  { name: "パイナップル", radius: 96,  color: "#FDD835", score: 36, face: "laugh" },
  { name: "メロン",       radius: 110, color: "#7CB342", score: 45, face: "relaxed" },
  { name: "スイカ",       radius: 125, color: "#2E7D32", score: 55, face: "laugh" },
];

// スイカ同士が合体したときの消滅ボーナス
const WATERMELON_BONUS = 100;

// フルーツを1個描く(本体+縞+顔)。ゲーム画面・ネクスト表示・進化リストで共用。
// drawRadius を渡すと実サイズと違う大きさで描ける(ミニ表示用)
function drawFruitShape(ctx, x, y, fruit, angle = 0, drawRadius = fruit.radius) {
  const r = drawRadius;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 本体
  ctx.fillStyle = fruit.color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();

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

  // 左上ハイライト
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.arc(-r * 0.38, -r * 0.45, r * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // 顔(表情はフルーツごと。docs/DESIGN.md の表情表に従う)
  drawFace(ctx, r, fruit.face);

  ctx.restore();
}

function drawFace(ctx, r, face) {
  const eyeX = r * 0.38;          // 目はやや離し気味
  const eyeY = -r * 0.08;
  const eyeR = Math.max(1.2, r * 0.09);
  const ink = "#4E342E";
  const line = Math.max(1, r * 0.05);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = line;
  ctx.lineCap = "round";

  const dotEye = (x, dx = 0) => {
    ctx.beginPath();
    ctx.arc(x + dx, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
  };
  const closedEye = (x) => { // たれ目のとじ目(∪)
    ctx.beginPath();
    ctx.arc(x, eyeY - eyeR, eyeR * 1.7, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  };
  const happyEye = (x) => { // 笑い目(∩)
    ctx.beginPath();
    ctx.arc(x, eyeY + eyeR, eyeR * 1.7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  };

  switch (face) {
    case "laugh": // 元気に笑ってる:笑い目+開けた口
      happyEye(-eyeX);
      happyEye(eyeX);
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.2, 0, Math.PI);
      ctx.fill();
      break;

    case "wink": // いたずらっこ:片目ウインク+ニヤリ
      dotEye(-eyeX);
      closedEye(eyeX);
      ctx.beginPath();
      ctx.arc(-r * 0.06, r * 0.1, r * 0.22, Math.PI * 0.1, Math.PI * 0.6);
      ctx.stroke();
      break;

    case "angry": // ちょっとおこ:つり眉+への字口
      dotEye(-eyeX);
      dotEye(eyeX);
      ctx.beginPath();
      ctx.moveTo(-eyeX - eyeR * 1.4, eyeY - eyeR * 2.6);
      ctx.lineTo(-eyeX + eyeR * 1.1, eyeY - eyeR * 1.4);
      ctx.moveTo(eyeX + eyeR * 1.4, eyeY - eyeR * 2.6);
      ctx.lineTo(eyeX - eyeR * 1.1, eyeY - eyeR * 1.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, r * 0.42, r * 0.18, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      break;

    case "sulky": // すねてる:目が横を向く+口をとがらせ気味に横へ
      dotEye(-eyeX, eyeR * 0.8);
      dotEye(eyeX, eyeR * 0.8);
      ctx.beginPath();
      ctx.moveTo(-r * 0.02, r * 0.22);
      ctx.quadraticCurveTo(r * 0.12, r * 0.16, r * 0.22, r * 0.24);
      ctx.stroke();
      break;

    case "relaxed": // ほんわか:とじ目+小さな笑み
      closedEye(-eyeX);
      closedEye(eyeX);
      ctx.beginPath();
      ctx.arc(0, r * 0.14, r * 0.12, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      break;

    case "shy": // てれてれ:とじ目+ちっちゃい口(ほっぺ大きめは下で)
      closedEye(-eyeX);
      closedEye(eyeX);
      ctx.beginPath();
      ctx.arc(0, r * 0.18, Math.max(1, r * 0.05), 0, Math.PI * 2);
      ctx.fill();
      break;

    default: // smile: にっこり(定番)
      dotEye(-eyeX);
      dotEye(eyeX);
      ctx.beginPath();
      ctx.arc(0, r * 0.12, r * 0.2, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
  }

  // ほっぺ(共通。てれてれは大きめ)
  const blushR = r * (face === "shy" ? 0.16 : 0.11);
  ctx.fillStyle = "rgba(244, 143, 177, 0.55)";
  ctx.beginPath();
  ctx.arc(-r * 0.55, r * 0.2, blushR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.55, r * 0.2, blushR, 0, Math.PI * 2);
  ctx.fill();
}

// 落下時に出るのは小さい方の5種類のみ
const DROPPABLE_COUNT = 5;
