import { describe, expect, it } from "vitest";
import { BattleEngine } from "./engine";
import { cells, compliantEndpoint, facingToWorldAngle, HEX_DIRECTIONS, hexDistance, axialToWorld } from "./geometry";
import type { HitLocationState } from "./types";

describe("hex geometry", () => {
  it("creates a radius-three 37-cell board and uses axial distance", () => {
    expect(cells(3)).toHaveLength(37);
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 1 })).toBe(3);
  });

  it("stops a compliant route at attack range", () => {
    const endpoint = compliantEndpoint({ q: 2, r: 0 }, { q: -1, r: 0 }, 2, 1, new Set(), 3);
    expect(hexDistance(endpoint, { q: -1, r: 0 })).toBe(1);
  });

  it("maps all six hunter facings to their matching world-space direction", () => {
    HEX_DIRECTIONS.forEach((direction, facing) => {
      const [x, , z] = axialToWorld(direction, 1);
      const angle = facingToWorldAngle(facing);
      expect(Math.sin(angle)).toBeCloseTo(x / Math.hypot(x, z));
      expect(Math.cos(angle)).toBeCloseTo(z / Math.hypot(x, z));
    });
    expect(facingToWorldAngle(6)).toBeCloseTo(facingToWorldAngle(0));
    expect(facingToWorldAngle(-1)).toBeCloseTo(facingToWorldAngle(5));
    expect(facingToWorldAngle(Number.NaN)).toBeCloseTo(facingToWorldAngle(0));
  });
});

describe("battle rules", () => {
  it("does not charge movement until a destination is confirmed", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    const payment = hunter.mind[0].id;
    engine.dispatch({ type: "storeMind", mindId: payment, cardId: "move" });
    engine.dispatch({ type: "useAction", cardId: "move" });
    expect(hunter.cards.find((card) => card.id === "move")?.storedMind).toHaveLength(1);
    expect(engine.state.pendingMove).toBe(true);
    engine.dispatch({ type: "useAction", cardId: "move", position: { q: -1, r: 1 } });
    expect(hunter.mind).toHaveLength(2);
    expect(hunter.cards.find((card) => card.id === "move")?.storedMind).toHaveLength(0);
    expect(hunter.timeSpent).toBe(2);
  });

  it("rejects an occupied destination without spending inspiration or time", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    const occupied = engine.state.hunters[2].position;
    const payment = hunter.mind[0].id;
    engine.dispatch({ type: "storeMind", mindId: payment, cardId: "move" });
    engine.dispatch({ type: "useAction", cardId: "move" });
    engine.dispatch({ type: "useAction", cardId: "move", position: occupied });
    expect(hunter.cards.find((card) => card.id === "move")?.storedMind.some((card) => card.id === payment)).toBe(true);
    expect(hunter.timeSpent).toBe(0);
    expect(engine.state.pendingMove).toBe(true);
  });

  it("keeps the headspace open flow when movement has no selected payment", () => {
    const engine = new BattleEngine();
    engine.dispatch({ type: "useAction", cardId: "move" });
    expect(engine.state.pendingMove).toBe(false);
    expect(engine.state.hunters[0].timeSpent).toBe(0);
    expect(engine.state.log[0]).toContain("拖到移动卡");
  });

  it("stores inspiration on a specific action and can return it", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    const mind = hunter.mind[0];
    engine.dispatch({ type: "storeMind", mindId: mind.id, cardId: "attack" });
    expect(hunter.mind.some((card) => card.id === mind.id)).toBe(false);
    expect(hunter.cards.find((card) => card.id === "attack")?.storedMind[0].id).toBe(mind.id);
    engine.dispatch({ type: "unstowMind", mindId: mind.id, cardId: "attack" });
    expect(hunter.mind.some((card) => card.id === mind.id)).toBe(true);
  });

  it("pauses and resolves each overflowing mind card", () => {
    const engine = new BattleEngine();
    engine.state.pendingFocus = "h1";
    engine.dispatch({ type: "resolveFocus", colors: ["red", "blue"] });
    expect(engine.state.hunters[0].mind).toHaveLength(4);
    expect(engine.state.pendingOverflow?.incoming).toHaveLength(1);
    engine.dispatch({ type: "resolveOverflow" });
    expect(engine.state.pendingOverflow).toBeNull();
  });

  it("supports replacing a chosen mind card", () => {
    const engine = new BattleEngine();
    const old = engine.state.hunters[0].mind[0];
    engine.state.pendingFocus = "h1";
    engine.dispatch({ type: "resolveFocus", colors: ["yellow", "yellow"] });
    engine.dispatch({ type: "resolveOverflow", replaceId: old.id });
    expect(engine.state.hunters[0].mind.some((card) => card.id === old.id)).toBe(false);
    expect(engine.state.pendingOverflow).toBeNull();
  });

  it("creates overtime debt when an action exceeds the current limit", () => {
    const engine = new BattleEngine();
    engine.state.currentAction.timeLimit = 1;
    const hunter = engine.state.hunters[0];
    engine.dispatch({ type: "useAction", cardId: "turn" });
    expect(engine.state.pendingTurn).toBe(hunter.id);
    engine.dispatch({ type: "confirmTurn", facing: 2 });
    expect(hunter.facing).toBe(2);
    expect(hunter.timeSpent).toBe(1);
    const focus = hunter.cards.find((card) => card.id === "focus")!;
    focus.faceUp = true;
    hunter.ended = false;
    engine.dispatch({ type: "useAction", cardId: "focus" });
    expect(hunter.debt).toBe(2);
    expect(hunter.ended).toBe(true);
  });

  it("does not spend turn resources before direction confirmation and can cancel", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    engine.dispatch({ type: "useAction", cardId: "turn" });
    expect(engine.state.pendingTurn).toBe(hunter.id);
    expect(hunter.timeSpent).toBe(0);
    expect(hunter.cards.find((card) => card.id === "turn")?.faceUp).toBe(true);
    engine.dispatch({ type: "cancelActionChoice" });
    expect(engine.state.pendingTurn).toBeNull();
    expect(hunter.timeSpent).toBe(0);
  });

  it("charges both fate deviations independently", () => {
    const engine = new BattleEngine();
    engine.dispatch({ type: "endPlayerTurn" });
    const original = engine.getOriginalTarget()!;
    const alternate = engine.state.hunters.find((hunter) => hunter.id !== original.id)!;
    engine.dispatch({ type: "setBossEndpoint", position: { ...engine.state.monster.position } });
    engine.dispatch({ type: "setBossTarget", hunterId: alternate.id });
    engine.dispatch({ type: "executeBoss" });
    expect(original.fate).toBe(2);
    expect(alternate.fate).toBe(1);
    expect(engine.state.hunters.filter((hunter) => hunter.id !== original.id && hunter.id !== alternate.id)[0].fate).toBe(1);
  });

  it("assigns and reorders attack results before resolving", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    hunter.position = { q: 1, r: 0 };
    engine.dispatch({ type: "storeMind", mindId: hunter.mind[0].id, cardId: "attack" });
    engine.dispatch({ type: "useAction", cardId: "attack" });
    expect(engine.state.pendingAttack?.parts).toHaveLength(hunter.weapon.speed);
    engine.dispatch({ type: "assignResult", resultIndex: 0, partIndex: 0 });
    engine.dispatch({ type: "assignResult", resultIndex: 1, partIndex: 1 });
    const first = engine.state.pendingAttack!.parts[0].instanceId;
    engine.dispatch({ type: "reorderPart", from: 0, to: 1 });
    expect(engine.state.pendingAttack!.parts[1].instanceId).toBe(first);
    engine.dispatch({ type: "resolveAttack" });
    expect(engine.state.pendingAttack).toBeNull();
  });

  it("keeps a persistent part and triggers its retaliation only once per round", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    const tail: HitLocationState = { ...engine.content.monster.hitLocations.find((part) => part.id === "tail")!, instanceId: "tail-test", currentHp: 2 };
    const scale: HitLocationState = { ...engine.content.monster.hitLocations.find((part) => part.id === "scale")!, instanceId: "scale-test", currentHp: 2 };
    engine.state.pendingAttack = { hunterId: hunter.id, target: "boss", parts: [tail, scale], results: ["success", "failure"], assignments: [0, 1] };
    engine.dispatch({ type: "resolveAttack" });
    expect(engine.state.monster.persistentParts.some((part) => part.id === "tail")).toBe(true);
    expect(engine.state.monster.persistentParts.find((part) => part.id === "tail")?.currentHp).toBe(1);
    expect(engine.state.monster.tailTriggeredRound).toBe(1);
    expect(engine.state.pendingBody?.source).toBe("持续尾刃");
  });

  it("breaks the temporary throat and purges it after the action", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    const throat: HitLocationState = { ...engine.content.monster.hitLocations.find((part) => part.id === "throat")!, instanceId: "throat-test", currentHp: 1 };
    engine.state.monster.temporaryPartActive = true;
    engine.state.pendingAttack = { hunterId: hunter.id, target: "boss", parts: [throat], results: ["success"], assignments: [0] };
    engine.dispatch({ type: "resolveAttack" });
    expect(engine.state.monster.howlWeakened).toBe(true);
    expect(engine.state.monster.temporaryPartActive).toBe(false);
  });

  it("restores a temporary part's durability when a later matching windup begins", () => {
    const engine = new BattleEngine();
    const howl = engine.content.monster.actions.find((action) => action.id === "howl")!;
    engine.state.monster.partHp.throat = 0;
    engine.state.phase = "recovery";
    engine.state.actionDeck = [howl];
    engine.dispatch({ type: "advanceRound" });
    expect(engine.state.monster.temporaryPartActive).toBe(true);
    expect(engine.state.monster.partHp.throat).toBe(1);
  });

  it("interrupts lethal damage with the death deck and adds a death card on survival", () => {
    const engine = new BattleEngine();
    const hunter = engine.state.hunters[0];
    hunter.wounds.head = 0;
    hunter.armor.head = 0;
    engine.state.pendingBody = { hunterId: hunter.id, amount: 1, precision: 2, source: "测试攻击", choices: ["head", "torso", "arms", "legs"] };
    engine.dispatch({ type: "chooseBody", index: 0 });
    expect(engine.state.pendingDeath).not.toBeNull();
    const surviveIndex = engine.state.pendingDeath!.choices.findIndex((card) => card.type === "survive");
    engine.dispatch({ type: "chooseDeath", index: surviveIndex });
    expect(hunter.dead).toBe(false);
    expect(hunter.deathDeck.some((card) => card.type === "death")).toBe(true);
    expect(hunter.statuses).toContain("幸运 +1");
  });

  it("includes the Strong Obsession survival card for its hunter", () => {
    const engine = new BattleEngine();
    expect(engine.state.hunters[2].deathDeck.some((card) => card.type === "survival" && card.name === "强烈执念")).toBe(true);
  });
});
