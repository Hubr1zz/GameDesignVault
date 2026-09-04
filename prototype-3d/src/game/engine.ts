import { CONTENT } from "./content";
import { compliantEndpoint, hexDistance, isInside, keyOf, neighbors, reachableCells, sameHex } from "./geometry";
import { SeededRandom } from "./rng";
import type {
  BattleCommand, BattleEvent, BattleState, BodyPart, CardResult, Color, DamageRequest,
  DeathCard, DispatchResult, GameContent, HexPosition, HitLocationDefinition,
  HitLocationState, HunterState, InspirationCard, MonsterAction, RandomSource
} from "./types";

const BODY_PARTS: BodyPart[] = ["head", "torso", "arms", "legs"];
const BODY_NAMES: Record<BodyPart, string> = { head: "头部", torso: "躯干", arms: "手臂", legs: "腿部" };
const COLOR_NAMES: Record<Color, string> = { red: "红·残暴", blue: "蓝·精湛", yellow: "黄·速度" };

const surviveCard = (): DeathCard => ({ id: "survive", type: "survive", name: "存活", text: "从存活事件池抽取事件。" });
const obsessionCard = (): DeathCard => ({ id: "obsession", type: "survival", name: "强烈执念", text: "未竟之事让你的血再次滚烫。" });
const deathCard = (id: string): DeathCard => ({ id, type: "death", name: "死亡", text: "你失去希望。你死了。" });

export class BattleEngine {
  readonly content: GameContent;
  private rng: RandomSource;
  private events: BattleEvent[] = [];
  private idCounter = 0;
  state: BattleState;

  constructor(options: { content?: GameContent; seed?: number; tutorial?: boolean } = {}) {
    this.content = options.content ?? CONTENT;
    this.rng = new SeededRandom(options.seed ?? (options.tutorial === false ? Date.now() : 20260805));
    this.state = this.createInitialState(options.tutorial !== false);
  }

  private nextId(prefix: string) {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  private createInitialState(tutorial: boolean): BattleState {
    const actionDeck = tutorial
      ? [...this.content.monster.actions]
      : this.rng.shuffle(this.content.monster.actions);
    const currentAction = actionDeck.shift()!;
    const state: BattleState = {
      phase: "player", round: 1, tutorial,
      selectedHunterId: this.content.hunters[0].id,
      pendingMove: false,
      pendingTurn: null,
      currentAction,
      actionDeck,
      monster: {
        id: this.content.monster.id, name: this.content.monster.name,
        hp: this.content.monster.hp, maxHp: this.content.monster.hp,
        toughness: this.content.monster.toughness,
        position: { ...this.content.monster.position }, facing: 3,
        persistentParts: [],
        partHp: Object.fromEntries(this.content.monster.hitLocations.map((part) => [part.id, part.hp])),
        tailTriggeredRound: null,
        temporaryPartActive: Boolean(currentAction.temporaryPart), howlWeakened: false
      },
      hunters: this.content.hunters.map((hunter) => ({
        ...hunter, position: { ...hunter.position }, maxWill: hunter.will,
        timeSpent: 0, debt: 0, ended: false, overtime: false,
        wounds: { head: 2, torso: 3, arms: 3, legs: 3 },
        armor: { head: 1, torso: 2, arms: 1, legs: 1 },
        mind: hunter.inspiration.map((color) => ({ id: this.nextId("mind"), color })),
        cards: this.content.actions
          .filter((card) => !card.hunterOnly || card.hunterOnly === hunter.id)
          .map((card) => ({ ...card, faceUp: true, storedMind: [] })),
        fate: 0, statuses: [], permanentInjuries: [], usedWill: [], dead: false,
        deathDeck: hunter.traits?.includes("强烈执念") ? [surviveCard(), obsessionCard()] : [surviveCard()]
      })),
      objects: this.content.objects.map((object) => ({ ...object })),
      pendingAttack: null, pendingOverflow: null, pendingFocus: null,
      pendingBody: null, pendingDeath: null, damageQueue: [],
      bossPlan: { endpoint: null, targetId: null },
      log: [`第 1 轮：Boss 预告【${currentAction.name}】，每名猎人时点上限 ${currentAction.timeLimit}。`],
      summary: []
    };
    return state;
  }

  snapshot() { return structuredClone(this.state); }

  dispatch(command: BattleCommand): DispatchResult {
    this.events = [];
    switch (command.type) {
      case "selectHunter": this.selectHunter(command.hunterId); break;
      case "storeMind": this.storeMind(command.mindId, command.cardId); break;
      case "unstowMind": this.unstowMind(command.mindId, command.cardId); break;
      case "useAction": this.useAction(command.cardId, command.position, command.target); break;
      case "confirmTurn": this.confirmTurn(command.facing); break;
      case "cancelActionChoice": this.cancelActionChoice(); break;
      case "resolveFocus": this.resolveFocus(command.colors); break;
      case "resolveOverflow": this.resolveOverflow(command.replaceId); break;
      case "assignResult": this.assignResult(command.resultIndex, command.partIndex); break;
      case "reorderPart": this.reorderPart(command.from, command.to); break;
      case "resolveAttack": this.resolveAttack(); break;
      case "setBossEndpoint": this.setBossEndpoint(command.position); break;
      case "setBossTarget": this.state.bossPlan.targetId = command.hunterId; break;
      case "executeBoss": this.executeBoss(); break;
      case "chooseBody": this.chooseBody(command.index); break;
      case "chooseDeath": this.chooseDeath(command.index); break;
      case "endPlayerTurn": this.endPlayerTurn(); break;
      case "advanceRound": this.advanceRound(); break;
      case "recover": this.recover(command.cardId); break;
      case "burst": this.burst(command.cardId); break;
      case "will": this.useWill(command.action, command.targetId); break;
    }
    return { state: this.snapshot(), events: [...this.events] };
  }

  private log(text: string) {
    this.state.log.unshift(text);
    this.state.log = this.state.log.slice(0, 100);
    this.events.push({ type: "log", text });
  }

  private selectHunter(id: string) {
    if (this.state.pendingMove || this.state.pendingTurn) return;
    if (this.state.hunters.some((hunter) => hunter.id === id && !hunter.dead)) {
      this.state.selectedHunterId = id;
      this.events.push({ type: "focus", target: id });
    }
  }

  get selectedHunter() { return this.state.hunters.find((h) => h.id === this.state.selectedHunterId)!; }
  private getHunter(id: string) { return this.state.hunters.find((hunter) => hunter.id === id); }
  private getCard(hunter: HunterState, id: string) { return hunter.cards.find((card) => card.id === id); }
  private interrupted() {
    return Boolean(this.state.pendingMove || this.state.pendingTurn || this.state.pendingAttack || this.state.pendingOverflow || this.state.pendingFocus || this.state.pendingBody || this.state.pendingDeath);
  }

  private canFinishChoice(hunter: HunterState) {
    return this.state.phase === "player" && !hunter.dead && !hunter.ended && !hunter.overtime &&
      !this.state.pendingAttack && !this.state.pendingOverflow && !this.state.pendingFocus && !this.state.pendingBody && !this.state.pendingDeath;
  }

  private canAct(hunter: HunterState) {
    return this.state.phase === "player" && !hunter.dead && !hunter.ended && !hunter.overtime && !this.interrupted();
  }

  private useAction(cardId: string, position?: HexPosition, target = "boss") {
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (cardId === "move" && position) {
      if (!this.state.pendingMove || !card || !card.faceUp || !this.canFinishChoice(hunter)) return;
      if (!this.canMoveHunterTo(hunter, position)) return;
      if (!this.consumeStoredMind(hunter, card, 1)) {
        this.log("移动确认失败：请先把一张灵感拖到移动卡上。");
        return;
      }
      this.state.pendingMove = false;
      this.moveHunter(hunter, position);
      this.consumeTime(hunter, card.time);
      this.flipCard(hunter, card);
      return;
    }
    if (!card || !card.faceUp || !this.canAct(hunter)) return;
    if (cardId === "move" && !position) {
      if (!card.storedMind.some((mind) => !mind.locked)) {
        this.log("请先把一张灵感拖到移动卡上，再请求使用。");
        return;
      }
      this.state.pendingMove = true;
      this.log("选择一个相邻亮起格完成移动；费用将在确认移动时支付。");
      return;
    }
    if (cardId === "turn") {
      this.state.pendingTurn = hunter.id;
      this.log("选择角色周围的一个方向箭头完成转向；确认前不消耗时点。 ");
      return;
    }
    if (card.cost === "any" && !this.consumeStoredMind(hunter, card, 1)) {
      this.log(`【${card.name}】尚未装填足够灵感。`);
      return;
    }
    if (cardId === "focus") {
      this.state.pendingFocus = hunter.id;
      this.events.push({ type: "dice", hunterId: hunter.id });
      this.log(`${hunter.name}将两枚灵感骰投入骰盘。`);
    }
    if (cardId === "attack" || cardId === "arc") this.startAttack(hunter, target);
    this.consumeTime(hunter, card.time);
    this.flipCard(hunter, card);
  }

  private confirmTurn(facing: number) {
    const hunterId = this.state.pendingTurn;
    const hunter = hunterId ? this.getHunter(hunterId) : undefined;
    const card = hunter ? this.getCard(hunter, "turn") : undefined;
    if (!hunter || !card || !card.faceUp || !this.canFinishChoice(hunter) || !Number.isInteger(facing) || facing < 0 || facing > 5) return;
    if (facing === hunter.facing) {
      this.log("请选择不同于当前朝向的方向。");
      return;
    }
    hunter.facing = facing;
    this.state.pendingTurn = null;
    this.consumeTime(hunter, card.time);
    this.flipCard(hunter, card);
    this.log(`${hunter.name}转向至方向 ${facing + 1}。`);
  }

  private cancelActionChoice() {
    if (!this.state.pendingMove && !this.state.pendingTurn) return;
    this.state.pendingMove = false;
    this.state.pendingTurn = null;
    this.log("已取消行动目标选择；未消耗资源或时点。 ");
  }

  private storeMind(mindId: string, cardId: string) {
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    const index = hunter.mind.findIndex((mind) => mind.id === mindId && !mind.locked);
    if (!card || index < 0 || this.state.phase !== "player" || this.interrupted()) return;
    const [mind] = hunter.mind.splice(index, 1);
    card.storedMind.push(mind);
    this.events.push({ type: "sound", cue: "cardPlace" });
    this.log(`${hunter.name}将【${COLOR_NAMES[mind.color]}】装填到【${card.name}】。`);
  }

  private unstowMind(mindId: string, cardId: string) {
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (!card || hunter.mind.length >= 4 || this.state.phase !== "player" || this.interrupted()) return;
    const index = card.storedMind.findIndex((mind) => mind.id === mindId);
    if (index < 0) return;
    const [mind] = card.storedMind.splice(index, 1);
    hunter.mind.push(mind);
    this.events.push({ type: "sound", cue: "cardPlace" });
    this.log(`${hunter.name}将【${COLOR_NAMES[mind.color]}】从【${card.name}】退回思维区。`);
  }

  private consumeStoredMind(hunter: HunterState, card: HunterState["cards"][number], count: number) {
    const spendable = card.storedMind.filter((mind) => !mind.locked);
    if (spendable.length < count) return false;
    const spent = spendable.slice(0, count);
    const spentIds = new Set(spent.map((mind) => mind.id));
    card.storedMind = card.storedMind.filter((mind) => !spentIds.has(mind.id));
    this.log(`${hunter.name}从【${card.name}】消耗${spent.map((mind) => `【${COLOR_NAMES[mind.color]}】`).join("、")}。`);
    return true;
  }

  private consumeTime(hunter: HunterState, amount: number) {
    hunter.timeSpent += amount;
    const limit = this.state.currentAction.timeLimit;
    if (hunter.timeSpent > limit) {
      hunter.debt = hunter.timeSpent - limit;
      hunter.ended = true;
      this.log(`${hunter.name}耗尽：超出上限，向下轮结转 ${hunter.debt} 时点。`);
    }
  }

  private flipCard(hunter: HunterState, card: HunterState["cards"][number]) {
    card.faceUp = false;
    this.events.push({ type: "sound", cue: "cardFlip" });
    const turn = this.getCard(hunter, "turn");
    if (turn && !turn.faceUp && turn !== card) turn.faceUp = true;
  }

  private moveHunter(hunter: HunterState, position: HexPosition) {
    const object = this.state.objects.find((o) => o.hp > 0 && o.q === position.q && o.r === position.r && !o.passable);
    if (object) {
      object.hp -= 1;
      this.queueDamage({ hunterId: hunter.id, amount: 1, precision: 2, source: `撞击${object.name}` });
      this.log(`${hunter.name}撞上${object.name}，双方受到冲击。`);
      return;
    }
    hunter.position = { ...position };
    this.log(`${hunter.name}移动到 [${position.q}, ${position.r}]。`);
  }

  private canMoveHunterTo(hunter: HunterState, position: HexPosition) {
    if (!neighbors(hunter.position).some((p) => sameHex(p, position)) || !isInside(position, this.content.radius)) {
      this.log("移动失败：只能选择相邻的合法六边格。");
      return false;
    }
    if (this.state.hunters.some((h) => !h.dead && h.id !== hunter.id && sameHex(h.position, position)) || sameHex(this.state.monster.position, position)) {
      this.log("移动失败：该格已被单位占据。");
      return false;
    }
    return true;
  }

  private resolveFocus(colors: Color[]) {
    const hunterId = this.state.pendingFocus;
    const hunter = hunterId ? this.getHunter(hunterId) : undefined;
    if (!hunter || colors.length !== 2) return;
    this.state.pendingFocus = null;
    const incoming = colors.map((color) => ({ id: this.nextId("mind"), color }));
    this.log(`骰子停稳：${colors.map((c) => COLOR_NAMES[c]).join("、")}。`);
    this.addIncomingMind(hunter, incoming);
  }

  private addIncomingMind(hunter: HunterState, cards: InspirationCard[]) {
    const remaining = [...cards];
    while (remaining.length && hunter.mind.length < 4) hunter.mind.push(remaining.shift()!);
    if (remaining.length) this.state.pendingOverflow = { hunterId: hunter.id, incoming: remaining };
  }

  private resolveOverflow(replaceId?: string) {
    const pending = this.state.pendingOverflow;
    if (!pending) return;
    const hunter = this.getHunter(pending.hunterId)!;
    const next = pending.incoming.shift()!;
    if (replaceId) {
      const index = hunter.mind.findIndex((card) => card.id === replaceId && !card.locked);
      if (index < 0) { pending.incoming.unshift(next); return; }
      const removed = hunter.mind.splice(index, 1, next)[0];
      this.log(`${hunter.name}以【${COLOR_NAMES[next.color]}】替换【${COLOR_NAMES[removed.color]}】。`);
    } else {
      this.log(`${hunter.name}丢弃新获得的【${COLOR_NAMES[next.color]}】。`);
    }
    if (!pending.incoming.length) this.state.pendingOverflow = null;
  }

  private availableHitLocations() {
    const activePersistent = new Set(this.state.monster.persistentParts.map((part) => part.id));
    return this.content.monster.hitLocations.filter((part) => {
      if (part.persistent && activePersistent.has(part.id)) return false;
      if ((this.state.monster.partHp[part.id] ?? part.hp) <= 0) return false;
      if (part.temporary) return this.state.monster.temporaryPartActive;
      return true;
    });
  }

  private toPart(part: HitLocationDefinition): HitLocationState {
    return { ...part, instanceId: this.nextId("part"), currentHp: this.state.monster.partHp[part.id] ?? part.hp };
  }

  private startAttack(hunter: HunterState, target: string) {
    if (target.startsWith("part:")) {
      const id = target.slice(5);
      this.attackPersistent(hunter, id);
      return;
    }
    if (hexDistance(hunter.position, this.state.monster.position) > hunter.weapon.range) {
      this.log(`${hunter.weapon.name}射程不足，攻击落空。`);
      return;
    }
    const failureCount = Math.max(0, this.state.monster.toughness - hunter.weapon.power);
    const pool: CardResult[] = [
      ...Array.from({ length: Math.max(1, hunter.strength) }, () => "success" as const),
      ...Array.from({ length: failureCount }, () => "failure" as const)
    ];
    const results = Array.from({ length: hunter.weapon.speed }, () => this.rng.pick(pool));
    const available = this.rng.shuffle(this.availableHitLocations());
    const parts = results.map((_, index) => this.toPart(available[index % available.length]));
    this.state.pendingAttack = { hunterId: hunter.id, target: "boss", parts, results, assignments: parts.map(() => null) };
    this.log(`${hunter.name}抽取 ${results.length} 张攻击结果与部位卡，等待分配和排序。`);
  }

  private attackPersistent(hunter: HunterState, instanceId: string) {
    const part = this.state.monster.persistentParts.find((p) => p.instanceId === instanceId);
    if (!part) return;
    const failures = Math.max(0, 2 - hunter.weapon.power);
    const result = this.rng.pick<CardResult>([
      ...Array.from({ length: Math.max(1, hunter.strength) }, () => "success" as const),
      ...Array.from({ length: failures }, () => "failure" as const)
    ]);
    if (result === "success") {
      part.currentHp -= 1;
      this.log(`${hunter.name}击中持续部位【${part.name}】，剩余耐久 ${part.currentHp}。`);
      if (part.currentHp <= 0) {
        this.state.monster.persistentParts = this.state.monster.persistentParts.filter((p) => p.instanceId !== instanceId);
        this.log(`【${part.name}】被击破并移出战场。`);
      }
    } else this.log(`${hunter.name}攻击持续部位【${part.name}】失败。`);
  }

  private assignResult(resultIndex: number, partIndex: number) {
    const pending = this.state.pendingAttack;
    if (!pending || pending.assignments.includes(resultIndex) || pending.assignments[partIndex] !== null) return;
    pending.assignments[partIndex] = resultIndex;
  }

  private reorderPart(from: number, to: number) {
    const pending = this.state.pendingAttack;
    if (!pending || from === to || from < 0 || to < 0 || from >= pending.parts.length || to >= pending.parts.length) return;
    const [part] = pending.parts.splice(from, 1);
    const [assignment] = pending.assignments.splice(from, 1);
    pending.parts.splice(to, 0, part);
    pending.assignments.splice(to, 0, assignment);
  }

  private resolveAttack() {
    const pending = this.state.pendingAttack;
    if (!pending || pending.assignments.some((value) => value === null)) return;
    const hunter = this.getHunter(pending.hunterId)!;
    let previousSuccess = false;
    for (let i = 0; i < pending.parts.length; i += 1) {
      const part = pending.parts[i];
      const result = pending.results[pending.assignments[i]!];
      let persistentState = this.state.monster.persistentParts.find((p) => p.id === part.id);
      if (part.persistent && !persistentState) {
        persistentState = { ...part, instanceId: this.nextId("persistent"), currentHp: part.currentHp };
        this.state.monster.persistentParts.push(persistentState);
        this.state.summary.push(`持续部位出现：${part.name}`);
        this.log(`【${part.name}】离开部位牌堆并留在场上。`);
      }
      if (result === "failure") {
        this.log(`部位【${part.name}】结算失败。${part.previousSuccessArmor && previousSuccess ? "前一张成功，Boss 收紧防御。" : ""}`);
        if (part.onFailure === "counter") this.queueDamage({ hunterId: hunter.id, amount: 1, precision: 2, source: `${part.name}反击` });
        if (!part.persistent && this.state.monster.persistentParts.some((p) => p.id === "tail") && this.state.monster.tailTriggeredRound !== this.state.round) {
          this.state.monster.tailTriggeredRound = this.state.round;
          this.queueDamage({ hunterId: hunter.id, amount: 1, precision: 2, source: "持续尾刃" });
          this.log("持续尾刃捕捉到本回合首次部位失败并反击。");
        }
        previousSuccess = false;
        continue;
      }
      previousSuccess = true;
      part.currentHp -= 1;
      this.state.monster.partHp[part.id] = part.currentHp;
      if (persistentState) persistentState.currentHp = part.currentHp;
      this.state.monster.hp -= 1;
      this.events.push({ type: "impact", strength: 1 });
      this.log(`部位【${part.name}】成功：Boss -1 血。`);
      if (part.onSuccess === "red") this.addIncomingMind(hunter, [{ id: this.nextId("mind"), color: "red" }]);
      if (part.onSuccess === "weakenHowl") {
        this.state.monster.howlWeakened = true;
        this.state.monster.temporaryPartActive = false;
        this.state.summary.push("击破临时部位：震颤喉囊");
      }
      if (part.currentHp <= 0 && part.onDestroyed === "extraDamage") {
        this.state.monster.hp -= 1;
        this.log(`【${part.name}】被摧毁，额外造成 1 伤害。`);
      }
    }
    this.state.pendingAttack = null;
    if (this.state.monster.hp <= 0) this.win();
    this.beginNextDamage();
  }

  getOriginalTarget(action = this.state.currentAction) {
    const alive = this.state.hunters.filter((h) => !h.dead);
    if (!alive.length) return null;
    if (action.target === "wounded") return [...alive].sort((a, b) => this.remainingWounds(a) - this.remainingWounds(b))[0];
    if (action.target === "any") return alive[0];
    return [...alive].sort((a, b) => hexDistance(a.position, this.state.monster.position) - hexDistance(b.position, this.state.monster.position))[0];
  }

  getCompliantEndpoint() {
    const target = this.getOriginalTarget();
    if (!target) return this.state.monster.position;
    const blocked = new Set([
      ...this.state.hunters.filter((h) => !h.dead && h.id !== target.id).map((h) => keyOf(h.position)),
      ...this.state.objects.filter((o) => o.hp > 0 && !o.passable).map((o) => `${o.q},${o.r}`)
    ]);
    return compliantEndpoint(this.state.monster.position, target.position, this.state.currentAction.move, this.state.currentAction.range, blocked, this.content.radius);
  }

  getLegalBossEndpoints() {
    const blocked = new Set([
      ...this.state.hunters.filter((h) => !h.dead).map((h) => keyOf(h.position)),
      ...this.state.objects.filter((o) => o.hp > 0 && !o.passable).map((o) => `${o.q},${o.r}`)
    ]);
    return reachableCells(this.state.monster.position, this.state.currentAction.move, blocked, this.content.radius);
  }

  private setBossEndpoint(position: HexPosition) {
    if (this.state.phase !== "monster" || !this.getLegalBossEndpoints().some((candidate) => sameHex(candidate, position))) return;
    this.state.bossPlan.endpoint = { ...position };
  }

  private executeBoss() {
    if (this.state.phase !== "monster" || this.interrupted()) return;
    const action = this.state.currentAction;
    const originalTarget = this.getOriginalTarget();
    const endpoint = this.state.bossPlan.endpoint ?? this.getCompliantEndpoint();
    const target = this.getHunter(this.state.bossPlan.targetId ?? originalTarget?.id ?? "");
    if (!originalTarget || !target) {
      this.log(`${action.name}无法找到目标：${action.fallback}`);
      this.finishBossAction();
      return;
    }
    const compliant = this.getCompliantEndpoint();
    const moveDeviation = !sameHex(endpoint, compliant);
    const targetDeviation = target.id !== originalTarget.id;
    if (moveDeviation) {
      this.state.hunters.filter((h) => !h.dead).forEach((h) => { h.fate += 1; });
      this.log("Boss 移动偏离规则：全体存活猎人命运值 +1。");
    }
    if (targetDeviation) {
      originalTarget.fate += 1;
      this.log(`Boss 索敌偏离规则：原目标${originalTarget.name}命运值 +1。`);
    }
    this.state.monster.position = { ...endpoint };
    this.log(`Boss 执行【${action.name}】，移动至 [${endpoint.q}, ${endpoint.r}] 并锁定${target.name}。`);
    if (hexDistance(endpoint, target.position) <= action.range) {
      const count = action.id === "howl" && this.state.monster.howlWeakened ? Math.max(0, action.count - 1) : action.count;
      for (let i = 0; i < count; i += 1) {
        const terrainBonus = this.terrainAt(target.position) === "grass" ? 1 : 0;
        const pool = [
          ...Array.from({ length: action.precision }, () => "hit"),
          ...Array.from({ length: target.agility + terrainBonus }, () => "dodge")
        ];
        const result = this.rng.pick(pool);
        this.log(`${action.name}第 ${i + 1} 次攻击抽到${result === "hit" ? "命中" : "闪避"}。`);
        if (result === "hit") this.state.damageQueue.push({ hunterId: target.id, amount: action.damage, precision: action.precision, source: action.name });
      }
    } else this.log(`${target.name}不在攻击范围内，攻击落空。`);
    this.finishBossAction();
    this.beginNextDamage();
  }

  private finishBossAction() {
    this.state.monster.temporaryPartActive = false;
    this.state.monster.howlWeakened = false;
    this.state.phase = "recovery";
    this.state.bossPlan = { endpoint: null, targetId: null };
    this.log(`【${this.state.currentAction.name}】进入后摇：${this.state.currentAction.after}`);
  }

  private terrainAt(position: HexPosition) {
    return this.content.terrain.find((cell) => sameHex(cell, position))?.type;
  }

  private queueDamage(request: DamageRequest) {
    this.state.damageQueue.push(request);
    this.beginNextDamage();
  }

  private beginNextDamage() {
    if (this.state.pendingBody || this.state.pendingDeath) return;
    const next = this.state.damageQueue.shift();
    if (!next) return;
    const hunter = this.getHunter(next.hunterId);
    if (!hunter || hunter.dead) { this.beginNextDamage(); return; }
    this.state.pendingBody = { ...next, choices: this.rng.shuffle(BODY_PARTS) };
    this.events.push({ type: "focus", target: hunter.id });
    this.log(`${next.source}命中${hunter.name}：四张受击部位卡已洗混。`);
  }

  private chooseBody(index: number) {
    const pending = this.state.pendingBody;
    if (!pending || index < 0 || index >= pending.choices.length) return;
    const hunter = this.getHunter(pending.hunterId)!;
    const part = pending.choices[index];
    this.state.pendingBody = null;
    const armorPool = [
      ...Array.from({ length: hunter.armor[part] }, () => "block"),
      ...Array.from({ length: pending.precision }, () => "pierce")
    ];
    if (hunter.armor[part] > 0 && this.rng.pick(armorPool) === "block") {
      this.log(`${hunter.name}翻出【${BODY_NAMES[part]}】，护甲随后阻挡了伤害。`);
      this.beginNextDamage();
      return;
    }
    hunter.wounds[part] -= pending.amount;
    this.events.push({ type: "impact", strength: pending.amount });
    this.log(`${hunter.name}的${BODY_NAMES[part]}受到 ${pending.amount} 伤害，剩余 ${hunter.wounds[part]}。`);
    if (hunter.wounds[part] < 0) {
      this.state.pendingDeath = { hunterId: hunter.id, part, choices: this.rng.shuffle(hunter.deathDeck) };
      this.log(`${hunter.name}遭受致命伤：展示死亡牌堆并等待抽取。`);
      return;
    }
    this.beginNextDamage();
  }

  private chooseDeath(index: number) {
    const pending = this.state.pendingDeath;
    if (!pending || index < 0 || index >= pending.choices.length) return;
    const hunter = this.getHunter(pending.hunterId)!;
    const card = pending.choices[index];
    this.state.pendingDeath = null;
    if (card.type === "death") {
      hunter.dead = true;
      hunter.ended = true;
      this.state.summary.push(`${hunter.name}永久死亡`);
      this.log(`${hunter.name}抽到【死亡】：你失去希望。你死了。`);
    } else {
      hunter.deathDeck.push(deathCard(this.nextId("death")));
      const injury = `${BODY_NAMES[pending.part]}永久损伤`;
      if (!hunter.permanentInjuries.includes(injury)) hunter.permanentInjuries.push(injury);
      if (card.type === "survive") {
        if (!hunter.statuses.includes("幸运 +1")) hunter.statuses.push("幸运 +1");
        this.state.summary.push(`${hunter.name}触发存活事件：幸运儿`);
        this.log(`${hunter.name}抽到【存活】并触发“幸运儿”：幸运 +1；死亡牌堆加入 1 张死亡牌。`);
      } else {
        this.state.summary.push(`${hunter.name}触发生存卡：${card.name}`);
        this.log(`${hunter.name}抽到生存卡【${card.name}】：${card.text} 死亡牌堆加入 1 张死亡牌。`);
      }
    }
    if (this.state.hunters.every((h) => h.dead)) this.lose();
    else this.beginNextDamage();
  }

  private endPlayerTurn() {
    if (this.state.phase !== "player" || this.interrupted()) return;
    this.state.hunters.forEach((hunter) => { if (!hunter.dead) hunter.ended = true; });
    this.state.phase = "monster";
    this.state.bossPlan = { endpoint: this.getCompliantEndpoint(), targetId: this.getOriginalTarget()?.id ?? null };
    this.log(`猎人前摇结束。请按行动卡要求操控 Boss，或偏离规则承担命运。`);
  }

  private advanceRound() {
    if (this.state.phase !== "recovery" || this.interrupted()) return;
    if (!this.state.actionDeck.length) this.state.actionDeck = this.state.tutorial ? [...this.content.monster.actions] : this.rng.shuffle(this.content.monster.actions);
    this.state.currentAction = this.state.actionDeck.shift()!;
    this.state.monster.temporaryPartActive = Boolean(this.state.currentAction.temporaryPart);
    if (this.state.currentAction.temporaryPart) {
      const definition = this.content.monster.hitLocations.find((part) => part.id === this.state.currentAction.temporaryPart);
      if (definition) this.state.monster.partHp[definition.id] = definition.hp;
    }
    this.state.round += 1;
    this.state.phase = "player";
    this.state.hunters.forEach((hunter) => {
      hunter.usedWill = [];
      hunter.ended = hunter.dead;
      hunter.timeSpent = hunter.debt;
      hunter.overtime = !hunter.dead && hunter.debt > this.state.currentAction.timeLimit;
      if (hunter.overtime) hunter.ended = true;
      else hunter.debt = 0;
      ["move", "focus"].forEach((id) => { const card = this.getCard(hunter, id); if (card) card.faceUp = true; });
    });
    this.log(`第 ${this.state.round} 轮：公开【${this.state.currentAction.name}】，时点上限 ${this.state.currentAction.timeLimit}。`);
  }

  private recover(cardId: string) {
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (!card || card.faceUp || this.interrupted()) return;
    if (cardId === "attack") {
      if (!this.consumeStoredMind(hunter, card, 1)) { this.log("恢复攻击前需向攻击卡装填一张灵感。"); return; }
      card.faceUp = true;
    } else if (cardId === "arc") {
      const red = card.storedMind.find((mind) => mind.color === "red" && !mind.locked);
      const blue = card.storedMind.find((mind) => mind.color === "blue" && !mind.locked);
      if (!red || !blue) { this.log("圆弧斩需要 1 红 1 蓝灵感恢复。"); return; }
      card.storedMind = card.storedMind.filter((mind) => mind.id !== red.id && mind.id !== blue.id);
      card.faceUp = true;
    } else this.log("该卡只能通过其被动条件恢复。");
    if (card.faceUp) {
      this.events.push({ type: "sound", cue: "cardFlip" });
      this.log(`${hunter.name}恢复【${card.name}】。`);
    }
  }

  private burst(cardId: string) {
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (!card || !card.faceUp || !this.canAct(hunter)) return;
    this.flipCard(hunter, card);
    if (cardId === "move") this.addIncomingMind(hunter, [{ id: this.nextId("mind"), color: "blue" }]);
    else hunter.timeSpent = Math.max(0, hunter.timeSpent - 1);
    this.log(`${hunter.name}爆发【${card.name}】：${card.burst}。`);
  }

  private useWill(action: "encourage" | "sprint" | "struggle", targetId?: string) {
    const hunter = this.selectedHunter;
    if (hunter.will <= 0 || hunter.usedWill.includes(action) || hunter.dead || this.interrupted()) return;
    if (action === "encourage") {
      const target = targetId ? this.getHunter(targetId) : undefined;
      if (!target || target.dead || target.id === hunter.id) return;
      target.debt = Math.max(0, target.debt - 1);
      target.timeSpent = Math.max(0, target.timeSpent - 1);
      if (target.overtime && target.debt <= this.state.currentAction.timeLimit) { target.overtime = false; target.ended = false; }
      this.log(`${hunter.name}鼓舞${target.name}，给予 1 时点。`);
    } else {
      const card = this.getCard(hunter, action === "sprint" ? "move" : "attack");
      if (card) card.faceUp = true;
      this.log(`${hunter.name}${action === "sprint" ? "冲刺" : "奋力一搏"}，恢复【${card?.name}】。`);
    }
    hunter.will -= 1;
    hunter.usedWill.push(action);
  }

  private remainingWounds(hunter: HunterState) {
    return Object.values(hunter.wounds).reduce((sum, hp) => sum + Math.max(0, hp), 0);
  }

  private win() {
    this.state.phase = "won";
    this.state.summary.unshift(`第 ${this.state.round} 轮击败${this.state.monster.name}`);
    this.log("Boss 血量归零，决战胜利。");
  }

  private lose() {
    this.state.phase = "lost";
    this.state.summary.unshift(`第 ${this.state.round} 轮全队失去希望`);
    this.log("全部猎人死亡，决战失败。");
  }
}
