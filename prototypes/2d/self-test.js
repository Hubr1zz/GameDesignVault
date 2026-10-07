"use strict";

window.runCombatPrototypeSelfTest = function runCombatPrototypeSelfTest() {
  const results = [];
  const assert = (condition, label) => {
    results.push({ label, passed: Boolean(condition) });
  };

  const engine = new CombatEngine(window.PROTOTYPE_DATA);
  const hunter = engine.state.hunters[0];

  assert(engine.state.phase === "player", "starts in player phase");
  assert(engine.geometry.mode === "square", "square board remains the default mode");
  assert(engine.state.currentAction.timeLimit > 0, "monster action exposes a time limit");

  const hexEngine = new CombatEngine(window.PROTOTYPE_DATA, {
    ...engine.defaultConfig(),
    boardMode: "hex"
  });
  assert(hexEngine.geometry.mode === "hex" && hexEngine.geometry.directions.length === 6, "hex board exposes six directions");
  assert(
    JSON.stringify(hexEngine.geometry.directions.map((direction) => direction.angle)) === JSON.stringify([330, 30, 90, 150, 210, 270]),
    "hex facings point through the six edge centers"
  );
  assert(hexEngine.geometry.cells().length === 37, "hex board is a radius-three hexagon with 37 cells");
  assert(hexEngine.geometry.cells().every((cell) => hexEngine.geometry.isInside(cell)), "every rendered hex cell is inside the hexagonal boundary");
  assert(hexEngine.distance({ x: 0, y: 0 }, { x: 1, y: 1 }) === 2, "hex board uses axial hex distance");
  assert(hexEngine.distance({ x: 0, y: 1 }, { x: 1, y: 0 }) === 1, "hex diagonal neighbors are one tile apart");
  assert(hexEngine.geometry.rotate("right", 1) === "down", "hex turning advances by one sixty-degree side");
  const hexHunter = hexEngine.state.hunters[0];
  hexHunter.position = { x: 0, y: 0 };
  hexEngine.move(hexHunter, "upRight");
  assert(hexHunter.position.x === 1 && hexHunter.position.y === -1 && hexHunter.facing === "upRight", "hex movement follows the selected diagonal");
  hexEngine.state.monster.position = { x: 2, y: 2 };
  hexEngine.state.hunters[1].position = { x: 4, y: 0 };
  assert(hexEngine.pickDirectionTargets("upRight", 3).some((item) => item.id === hexEngine.state.hunters[1].id), "hex line targeting follows a diagonal ray");

  const tempoEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const tempoLeader = tempoEngine.state.hunters[0];
  const tempoPeer = tempoEngine.state.hunters[1];
  tempoLeader.timeSpent = 2;
  tempoPeer.timeSpent = 0;
  assert(tempoEngine.isTempoLeaderLocked(tempoLeader), "highest tempo hunter waits for a teammate");
  tempoPeer.timeSpent = 2;
  assert(!tempoEngine.isTempoLeaderLocked(tempoLeader), "tempo leader unlocks when a teammate catches up");

  engine.attack(hunter);
  assert(Boolean(engine.state.pendingAttack), "hunter attack creates pending hit locations");
  const pendingCount = engine.state.pendingAttack?.parts.length || 0;
  engine.selectAttackResult(0);
  engine.assignAttackResult(0);
  assert(engine.state.pendingAttack.assignments[0] === 0, "drawn attack result can be assigned to a hit location");
  engine.autoAssignAttackResults();
  engine.resolvePendingAttack("ltr");
  assert(pendingCount > 0 && !engine.state.pendingAttack, "hit locations resolve and clear");

  const object = engine.state.objects.find((item) => item.id === "bone-pillar");
  hunter.position = { x: 1, y: 3 };
  hunter.facing = "right";
  engine.attack(hunter);
  assert(object.hp === 1 && !object.destroyed, "destructible object in front is attacked");
  engine.attack(hunter);
  assert(object.destroyed, "destructible object destroyed at zero hp");

  const collisionEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const collisionHunter = collisionEngine.state.hunters[0];
  const collisionObject = collisionEngine.state.objects.find((item) => item.id === "bone-pillar");
  collisionHunter.position = { x: 1, y: 3 };
  const torsoBeforeCollision = collisionHunter.wounds.torso;
  collisionEngine.move(collisionHunter, "right");
  assert(collisionHunter.position.x === 1 && collisionHunter.wounds.torso === torsoBeforeCollision - 1, "non-passable object stops movement and causes collision damage");
  assert(collisionObject.hp === 1, "collision damages destructible object");

  hunter.position = { x: 2, y: 2 };
  hunter.timeSpent = 0;
  engine.throwStone(hunter);
  assert(Boolean(engine.state.pendingAttack), "rock terrain grants throw stone temporary action");
  engine.autoAssignAttackResults();
  engine.resolvePendingAttack("ltr");
  assert(!engine.state.pendingAttack, "throw stone resolves through hit locations");

  const hpBeforeDeathTest = hunter.wounds.head;
  engine.applyDamage(hunter, "head", hpBeforeDeathTest + 1);
  assert(Boolean(engine.state.pendingDeath), "lethal wound creates death draw prompt");
  assert(engine.state.pendingDeath.choices.length === hunter.deathDeck.length, "death draw presents one hidden choice per death deck card");
  engine.resolveDeathDraw(0);
  assert(!engine.state.pendingDeath, "death draw clears prompt");
  assert(hunter.dead || hunter.deathDeck.length > 1, "death deck records survival pressure or hunter dies");

  const overtimeEngine = new CombatEngine(window.PROTOTYPE_DATA);
  overtimeEngine.state.currentAction = { ...overtimeEngine.state.currentAction, timeLimit: 2 };
  const overtimeTarget = overtimeEngine.state.hunters[0];
  const helper = overtimeEngine.state.hunters[1];
  overtimeTarget.debt = 3;
  overtimeTarget.timeSpent = 3;
  overtimeTarget.overtime = true;
  overtimeTarget.ended = true;
  overtimeEngine.selectHunter(helper.id);
  const helperWillBefore = helper.will;
  overtimeEngine.useWill("encourage", overtimeTarget.id);
  assert(helper.will === helperWillBefore - 1, "encourage spends helper will");
  assert(!overtimeTarget.overtime && !overtimeTarget.ended && overtimeTarget.debt === 2, "encourage can pull hunter out of overtime when debt fits current time limit");

  const recoveryEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const recoveryHunter = recoveryEngine.state.hunters[0];
  const attackCard = recoveryEngine.getCard(recoveryHunter, "attack");
  attackCard.faceUp = false;
  const redBeforeRecovery = recoveryEngine.inspirationCount(recoveryHunter, "red");
  recoveryEngine.selectHunter(recoveryHunter.id);
  recoveryEngine.recover("attack");
  assert(attackCard.faceUp && recoveryEngine.inspirationCount(recoveryHunter, "red") === redBeforeRecovery - 1, "attack card can be actively recovered by paying inspiration");

  const noResourceEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const noResourceHunter = noResourceEngine.state.hunters[0];
  noResourceHunter.tempResources = noResourceHunter.tempResources.filter((resource) => resource.type !== "inspiration");
  const noResourceAttack = noResourceEngine.getCard(noResourceHunter, "attack");
  noResourceAttack.faceUp = false;
  noResourceEngine.selectHunter(noResourceHunter.id);
  noResourceEngine.recover("attack");
  assert(!noResourceAttack.faceUp, "attack recovery fails without inspiration");

  const moveRecoveryEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const moveRecoveryHunter = moveRecoveryEngine.state.hunters[0];
  const moveCard = moveRecoveryEngine.getCard(moveRecoveryHunter, "move");
  moveCard.faceUp = false;
  moveRecoveryEngine.selectHunter(moveRecoveryHunter.id);
  moveRecoveryEngine.recover("move");
  assert(moveCard.faceUp && moveRecoveryEngine.inspirationCount(moveRecoveryHunter, "blue") === 0, "move can be actively recovered with 1 blue inspiration");

  const passiveTriggerEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const passiveHunter = passiveTriggerEngine.state.hunters[0];
  const passiveMove = passiveTriggerEngine.getCard(passiveHunter, "move");
  passiveMove.faceUp = false;
  passiveTriggerEngine.startHunterRound(passiveHunter);
  assert(passiveMove.faceUp, "move still recovers passively at round start");

  const turnRecoveryEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const turnHunter = turnRecoveryEngine.state.hunters[0];
  const turnCard = turnRecoveryEngine.getCard(turnHunter, "turn");
  const moveForFlip = turnRecoveryEngine.getCard(turnHunter, "move");
  turnCard.faceUp = false;
  turnRecoveryEngine.flipCard(turnHunter, moveForFlip);
  assert(turnCard.faceUp, "turn recovers when any card flips");

  const facingEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const facingHunter = facingEngine.state.hunters[0];
  facingHunter.position = { x: 2, y: 1 };
  facingHunter.facing = "up";
  facingEngine.move(facingHunter, "up");
  assert(facingHunter.facing === "up", "move sets facing to movement direction");

  const momentumGainEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const momentumGainHunter = momentumGainEngine.state.hunters[0];
  momentumGainHunter.position = { x: 2, y: 2 };
  momentumGainEngine.move(momentumGainHunter, "right");
  assert(momentumGainHunter.tempResources.some((r) => r.type === "momentum"), "move grants momentum temp resource");

  const momentumUseEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const momentumUseHunter = momentumUseEngine.state.hunters[0];
  momentumUseHunter.tempResources.push({ type: "momentum", name: "动能", desc: "..." });
  momentumUseEngine.attack(momentumUseHunter);
  assert(!momentumUseHunter.tempResources.some((r) => r.type === "momentum"), "momentum consumed on attack");

  const momentumClearEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const momentumClearHunter = momentumClearEngine.state.hunters[0];
  momentumClearHunter.tempResources.push({ type: "momentum", name: "动能", desc: "..." });
  momentumClearEngine.selectHunter(momentumClearHunter.id);
  momentumClearEngine.useCard("turn", null);
  assert(!momentumClearHunter.tempResources.some((r) => r.type === "momentum"), "momentum cleared on non-attack action");

  const arcEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const arcHunter = arcEngine.state.hunters[0];
  const arcCard = arcEngine.getCard(arcHunter, "arc-slash");
  assert(Boolean(arcCard), "h1 (刃手) has arc-slash card");
  arcHunter.facing = "right";
  arcEngine.arcSlash(arcHunter);
  assert(Boolean(arcEngine.state.pendingAttack), "arc slash hits boss in front tile");
  arcEngine.autoAssignAttackResults();
  arcEngine.resolvePendingAttack("ltr");
  assert(!arcEngine.state.pendingAttack, "arc slash resolves through hit locations");

  const arcRecoverEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const arcRecoverHunter = arcRecoverEngine.state.hunters[0];
  const arcRecoverCard = arcRecoverEngine.getCard(arcRecoverHunter, "arc-slash");
  arcRecoverCard.faceUp = false;
  arcRecoverEngine.selectHunter(arcRecoverHunter.id);
  arcRecoverEngine.recover("arc-slash");
  assert(arcRecoverCard.faceUp, "arc-slash recovers with 1R1B");
  assert(arcRecoverEngine.inspirationCount(arcRecoverHunter, "red") === 0 && arcRecoverEngine.inspirationCount(arcRecoverHunter, "blue") === 0, "arc-slash recovery costs 1R1B");

  const focusEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const focusHunter = focusEngine.state.hunters[0];
  const focusCard = focusEngine.getCard(focusHunter, "focus");
  const redBeforeFocus = focusEngine.inspirationCount(focusHunter, "red");
  focusEngine.deck = new DeckSystem(() => 0);
  focusEngine.selectHunter(focusHunter.id);
  focusEngine.useCard("focus");
  assert(Boolean(focusCard) && !focusCard.faceUp && focusHunter.timeSpent === 2, "focus is a two-tempo base action card");
  assert(focusEngine.inspirationCount(focusHunter, "red") === redBeforeFocus + 2, "matching focus dice stack inspiration in one mind-zone resource");
  assert(focusHunter.tempResources.filter((resource) => resource.type === "inspiration" && resource.color === "red").length === 1, "same-color inspiration occupies one stacked block");

  const facingMissEngine = new CombatEngine(window.PROTOTYPE_DATA);
  const facingMissHunter = facingMissEngine.state.hunters[0];
  facingMissHunter.facing = "down";
  facingMissEngine.attack(facingMissHunter);
  assert(!facingMissEngine.state.pendingAttack, "attack misses when nothing in front");

  engine.endPlayerTurn();
  assert(engine.state.phase === "monster", "ending player turn enters manual monster phase");
  engine.executeMonsterTurn();
  if (engine.state.pendingDeath) engine.resolveDeathDraw();
  assert(["recovery", "lost"].includes(engine.state.phase), "monster turn enters a stable recovery phase");
  if (engine.state.phase === "recovery") engine.advanceFromRecovery();
  assert(["player", "lost"].includes(engine.state.phase), "recovery confirmation reveals the next action");

  const cellEngine = new CombatEngine(window.PROTOTYPE_DATA);
  cellEngine.state.phase = "monster";
  cellEngine.state.currentAction = window.PROTOTYPE_DATA.monster.actionDeck.find((action) => action.id === "rupture");
  cellEngine.executeMonsterTurn({ cell: { x: 3, y: 2 } });
  if (cellEngine.state.pendingDeath) cellEngine.resolveDeathDraw();
  assert(["recovery", "lost"].includes(cellEngine.state.phase), "cell-target monster action can be manually executed");

  const directionEngine = new CombatEngine(window.PROTOTYPE_DATA);
  directionEngine.state.phase = "monster";
  directionEngine.state.currentAction = window.PROTOTYPE_DATA.monster.actionDeck.find((action) => action.id === "spine-line");
  directionEngine.state.hunters[0].position = { x: 3, y: 2 };
  directionEngine.executeMonsterTurn({ direction: "left" });
  if (directionEngine.state.pendingDeath) directionEngine.resolveDeathDraw();
  assert(["recovery", "lost"].includes(directionEngine.state.phase), "direction-target monster action can be manually executed");

  const hunterTargetEngine = new CombatEngine(window.PROTOTYPE_DATA);
  hunterTargetEngine.state.phase = "monster";
  hunterTargetEngine.state.currentAction = window.PROTOTYPE_DATA.monster.actionDeck.find((action) => action.id === "marked-pounce");
  hunterTargetEngine.executeMonsterTurn({ hunterId: "h1" });
  if (hunterTargetEngine.state.pendingDeath) hunterTargetEngine.resolveDeathDraw();
  assert(["recovery", "lost"].includes(hunterTargetEngine.state.phase), "direct hunter-target monster action can be manually executed");

  return {
    passed: results.every((item) => item.passed),
    results,
    round: engine.state.round,
    phase: engine.state.phase
  };
};
