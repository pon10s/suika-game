const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Matter = require("../src/lib/matter.min.js");

const radii = [14, 21, 30, 40, 50, 60, 72, 84, 96, 110, 125];
const testMath = Object.create(Math);
testMath.random = () => 0.999999;
const context = vm.createContext({
  Matter,
  Math: testMath,
  FRUITS: radii.map((radius, fruitIndex) => ({ radius, fruitIndex })),
  DROPPABLE_COUNT: 5,
  WATERMELON_BONUS: 100,
  GameAudio: undefined,
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0,
  setTimeout,
  clearTimeout,
  console,
});

const source = fs.readFileSync(require.resolve("../src/js/game.js"), "utf8");
vm.runInContext(`${source}\nglobalThis.TestGame = Game;`, context);

const fakeCanvas = { getContext: () => ({}) };
const TestGame = context.TestGame;

function step(game, count) {
  for (let i = 0; i < count; i++) {
    Matter.Engine.update(game.engine, 1000 / 60);
  }
}

// First five drops exclude persimmon(index 4); the sixth can include it.
{
  const game = new TestGame(fakeCanvas);
  assert.equal(game.randomFruitIndex(0), 3);
  assert.equal(game.randomFruitIndex(4), 3);
  assert.equal(game.randomFruitIndex(5), 4);
}

// A settled pile should lose only invisible micro-jitter, without entering immediate sleep.
{
  const game = new TestGame(fakeCanvas);
  const pile = [
    game.createFruitBody(6, 240, 552),
    game.createFruitBody(4, 240, 430),
    game.createFruitBody(2, 240, 348),
    game.createFruitBody(1, 240, 292),
  ];
  for (const body of pile) body.hasLanded = true;
  Matter.Composite.add(game.world, pile);
  step(game, 1200);

  assert.ok(pile.every((body) => body.isSleeping === false), "pile entered sleep");
  assert.ok(
    pile.every((body) => Math.abs(body.velocity.y) < 0.01),
    `settled pile still vibrates vertically: ${pile.map((body) => body.velocity.y.toFixed(4)).join(", ")}`
  );

  const target = pile.reduce((highest, body) =>
    body.position.y < highest.position.y ? body : highest
  );
  const beforeImpact = pile.map((body) => ({ x: body.position.x, y: body.position.y }));
  const falling = game.createFruitBody(0, target.position.x, target.position.y - radii[target.fruitIndex] - 26);
  game.activeBody = falling;
  Matter.Composite.add(game.world, falling);
  let largestShift = 0;
  for (let i = 0; i < 240; i++) {
    Matter.Engine.update(game.engine, 1000 / 60);
    for (let j = 0; j < pile.length; j++) {
      largestShift = Math.max(largestShift, Math.hypot(
        pile[j].position.x - beforeImpact[j].x,
        pile[j].position.y - beforeImpact[j].y
      ));
    }
  }
  assert.ok(largestShift > 0.02, "new falling fruit did not move the contacted pile");
}

// Floor contact should resist sliding gradually, while rotation follows the travelled distance.
{
  const game = new TestGame(fakeCanvas);
  const slider = game.createFruitBody(0, 100, 608);
  slider.hasLanded = true;
  Matter.Body.setVelocity(slider, { x: 0.5, y: 0 });
  Matter.Composite.add(game.world, slider);
  const startX = slider.position.x;
  const startAngle = slider._visualAngle;
  step(game, 120);

  const travelled = slider.position.x - startX;
  const rotated = slider._visualAngle - startAngle;
  assert.ok(travelled > 25, `floor resistance stopped motion too quickly: ${travelled}px`);
  assert.ok(slider.velocity.x > 0.1, `floor resistance stopped velocity too quickly: ${slider.velocity.x}`);
  assert.ok(slider.velocity.x < 0.35, `floor contact still slides too freely: ${slider.velocity.x}`);
  assert.equal(slider.isSleeping, false);
  assert.equal(slider.angularVelocity, 0, "visual rotation affected physics");
  assert.ok(Math.abs(rotated - travelled / radii[0]) < 0.02, "visual rotation did not match travel distance");
}

// Rare idle self-spin is extremely slow, constant, and cannot move the physical centre.
{
  const game = new TestGame(fakeCanvas);
  const spinner = game.createFruitBody(2, 240, 594);
  spinner.hasLanded = true;
  spinner._idleSpinRate = 0.00035;
  Matter.Composite.add(game.world, spinner);
  step(game, 30);
  const centre = { x: spinner.position.x, y: spinner.position.y };
  const visualBefore = spinner._visualAngle;
  step(game, 600);

  const idleRotation = spinner._visualAngle - visualBefore;
  assert.ok(Math.abs(idleRotation - 0.00035 * 600) < 0.002, "idle self-spin changed speed or stopped");
  assert.equal(spinner.angularVelocity, 0);
  assert.ok(Math.abs(spinner.angle) < 0.001, "physics body rotated");
  assert.ok(Math.abs(spinner.position.y - centre.y) < 0.2, "self-spin changed vertical centre");
}

// Fruit contact should reduce relative sliding without erasing shared sideways momentum.
{
  const game = new TestGame(fakeCanvas);
  const a = game.createFruitBody(3, 200, 300);
  const b = game.createFruitBody(0, 200, 250);
  Matter.Body.setVelocity(a, { x: 0.1, y: 0 });
  Matter.Body.setVelocity(b, { x: 0.8, y: 0 });
  const momentumBefore = a.velocity.x * a.mass + b.velocity.x * b.mass;
  const relativeBefore = b.velocity.x - a.velocity.x;
  game.resistContactSlide({
    bodyA: a,
    bodyB: b,
    collision: { normal: { x: 0, y: 1 } },
  });
  const relativeAfter = Math.abs(b.velocity.x - a.velocity.x);
  const momentumAfter = a.velocity.x * a.mass + b.velocity.x * b.mass;

  assert.ok(relativeAfter < relativeBefore, `fruit surfaces still slide freely: ${relativeAfter}`);
  assert.ok(Math.abs(momentumAfter - momentumBefore) < 1e-9, "contact resistance erased shared momentum");
}

// A plain floor impact should not rebound visibly when restitution is zero.
{
  const game = new TestGame(fakeCanvas);
  const falling = game.createFruitBody(2, 240, 260);
  Matter.Composite.add(game.world, falling);
  let contacted = false;
  let strongestUpwardSpeed = 0;
  Matter.Events.on(game.engine, "collisionStart", (event) => {
    if (event.pairs.some((pair) => pair.bodyA === falling || pair.bodyB === falling)) contacted = true;
  });
  for (let i = 0; i < 360; i++) {
    Matter.Engine.update(game.engine, 1000 / 60);
    if (contacted) strongestUpwardSpeed = Math.min(strongestUpwardSpeed, falling.velocity.y);
  }
  assert.ok(contacted, "falling fruit never contacted the floor");
  assert.ok(strongestUpwardSpeed > -0.08, `floor impact rebounded at ${strongestUpwardSpeed}`);
}

// Different fruits should lose most normal collision speed while retaining tangential movement.
{
  const game = new TestGame(fakeCanvas);
  const moving = game.createFruitBody(0, 170, 608);
  const resting = game.createFruitBody(1, 250, 600);
  moving.hasLanded = true;
  resting.hasLanded = true;
  Matter.Body.setVelocity(moving, { x: 2, y: 0 });
  Matter.Composite.add(game.world, [moving, resting]);
  step(game, 25);

  const totalX = Math.abs(moving.velocity.x) + Math.abs(resting.velocity.x);
  assert.ok(totalX > 0.45, `fruit collision stopped too quickly: ${totalX}`);
  assert.ok(Math.min(moving.velocity.x, resting.velocity.x) > 0.05, "collision did not transfer movement");
}

// The lower fruit should not visibly sink and spring back under a normal drop.
{
  const game = new TestGame(fakeCanvas);
  const lower = game.createFruitBody(2, 240, 594);
  lower.hasLanded = true;
  Matter.Composite.add(game.world, lower);
  step(game, 30);
  const initialY = lower.position.y;
  const falling = game.createFruitBody(1, 240, 300);
  Matter.Composite.add(game.world, falling);
  let maxSink = 0;
  for (let i = 0; i < 360; i++) {
    Matter.Engine.update(game.engine, 1000 / 60);
    maxSink = Math.max(maxSink, lower.position.y - initialY);
  }
  assert.ok(maxSink < 0.6, `lower fruit visibly sank by ${maxSink}px`);
}

console.log("physics smoke tests passed");
