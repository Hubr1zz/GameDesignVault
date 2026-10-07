"use strict";

const DATA = window.PROTOTYPE_DATA;

class EventLog {
  constructor() {
    this.entries = [];
  }

  add(text) {
    this.entries.unshift(text);
    this.entries = this.entries.slice(0, 120);
  }
}

class DeckSystem {
  constructor(rng) {
    this.rng = rng;
  }

  drawMany(deck, count) {
    const copy = [...deck];
    const results = [];
    for (let i = 0; i < count && copy.length; i += 1) {
      const index = Math.floor(this.rng() * copy.length);
      results.push(copy.splice(index, 1)[0]);
    }
    return results;
  }

  drawOneWeighted(cards) {
    return this.drawMany(cards, 1)[0];
  }
}

class BoardGeometry {
  constructor(mode = "square", board = { width: 6, height: 6 }) {
    this.mode = mode === "hex" ? "hex" : "square";
    this.board = board;
    this.radius = Math.max(2, Math.floor(Math.min(board.width, board.height) / 2));
    this.sourceOrigin = {
      x: Math.floor((board.width - 1) / 2),
      y: Math.floor((board.height - 1) / 2)
    };
    this.directionSets = {
      square: [
        { id: "up", name: "上", arrow: "↑", angle: 0, delta: { x: 0, y: -1 } },
        { id: "right", name: "右", arrow: "→", angle: 90, delta: { x: 1, y: 0 } },
        { id: "down", name: "下", arrow: "↓", angle: 180, delta: { x: 0, y: 1 } },
        { id: "left", name: "左", arrow: "←", angle: 270, delta: { x: -1, y: 0 } }
      ],
      hex: [
        { id: "up", name: "左上", arrow: "↖", angle: 330, delta: { x: 0, y: -1 } },
        { id: "upRight", name: "右上", arrow: "↗", angle: 30, delta: { x: 1, y: -1 } },
        { id: "right", name: "右", arrow: "→", angle: 90, delta: { x: 1, y: 0 } },
        { id: "down", name: "右下", arrow: "↘", angle: 150, delta: { x: 0, y: 1 } },
        { id: "downLeft", name: "左下", arrow: "↙", angle: 210, delta: { x: -1, y: 1 } },
        { id: "left", name: "左", arrow: "←", angle: 270, delta: { x: -1, y: 0 } }
      ]
    };
  }

  get directions() {
    return this.directionSets[this.mode];
  }

  definition(direction) {
    return this.directions.find((item) => item.id === direction) || this.directions.find((item) => item.id === "right");
  }

  delta(direction) {
    return this.definition(direction).delta;
  }

  name(direction) {
    return this.definition(direction).name;
  }

  arrow(direction) {
    return this.definition(direction).arrow;
  }

  angle(direction) {
    return this.definition(direction).angle;
  }

  rotate(direction, steps = 1) {
    const index = Math.max(0, this.directions.findIndex((item) => item.id === direction));
    return this.directions[(index + steps + this.directions.length) % this.directions.length].id;
  }

  neighbor(position, direction) {
    const delta = this.delta(direction);
    return { x: position.x + delta.x, y: position.y + delta.y };
  }

  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (this.mode === "hex") return (Math.abs(dx) + Math.abs(dy) + Math.abs(dx + dy)) / 2;
    return Math.abs(dx) + Math.abs(dy);
  }

  isOnRay(origin, target, direction, range) {
    const delta = this.delta(direction);
    for (let step = 1; step <= range; step += 1) {
      if (origin.x + delta.x * step === target.x && origin.y + delta.y * step === target.y) return true;
    }
    return false;
  }

  normalizePosition(position) {
    if (this.mode !== "hex") return { ...position };
    return {
      x: position.x - this.sourceOrigin.x,
      y: position.y - this.sourceOrigin.y
    };
  }

  isInside(position) {
    if (this.mode === "hex") {
      return Math.max(Math.abs(position.x), Math.abs(position.y), Math.abs(position.x + position.y)) <= this.radius;
    }
    return position.x >= 0 && position.y >= 0 && position.x < this.board.width && position.y < this.board.height;
  }

  cells() {
    if (this.mode === "square") {
      return Array.from({ length: this.board.height }, (_, y) =>
        Array.from({ length: this.board.width }, (_, x) => ({ x, y }))
      ).flat();
    }
    const cells = [];
    for (let y = -this.radius; y <= this.radius; y += 1) {
      const minX = Math.max(-this.radius, -y - this.radius);
      const maxX = Math.min(this.radius, -y + this.radius);
      for (let x = minX; x <= maxX; x += 1) cells.push({ x, y });
    }
    return cells;
  }

  cellStyle(position) {
    if (this.mode !== "hex") return `--board-x:${position.x};--board-y:${position.y}`;
    const column = position.x + position.y / 2 + this.radius;
    const row = position.y + this.radius;
    return `--hex-column:${column};--hex-row:${row}`;
  }

  positionLabel(position) {
    if (this.mode === "hex") return `${position.x >= 0 ? "+" : ""}${position.x}, ${position.y >= 0 ? "+" : ""}${position.y}`;
    return `${position.x + 1}, ${position.y + 1}`;
  }
}

class ConfigView {
  constructor(data, root, onStart) {
    this.data = data;
    this.root = root;
    this.onStart = onStart;
    this.sel = this.buildDefaults();
    this.preview = { kind: "action-card", id: this.data.actionCards[0]?.id || null };
    this.render();
  }

  buildDefaults() {
    return {
      boardMode: "square",
      hunters: Object.fromEntries(
        this.data.hunters.map((h) => [
          h.id,
          {
            weaponIndex: h.defaultWeaponIndex ?? 0,
            cardIds: new Set(
              this.data.actionCards
                .filter((c) => !c.hunterOnly || c.hunterOnly === h.id)
                .map((c) => c.id)
            )
          }
        ])
      ),
      boss: {
        actionIds: new Set(this.data.monster.actionDeck.map((a) => a.id)),
        partIds: new Set(this.data.monster.hitLocations.map((p) => p.id))
      }
    };
  }

  bind(selector, event, handler) {
    this.root.querySelectorAll(selector).forEach((n) => n.addEventListener(event, handler));
  }

  setPreview(kind, id) {
    this.preview = { kind, id };
    const panel = this.root.querySelector("[data-card-preview]");
    if (panel) panel.innerHTML = this.renderCardPreview();
  }

  detailButton(kind, id) {
    return `
      <button
        type="button"
        class="config-info-btn"
        data-preview-kind="${kind}"
        data-preview-id="${id}"
        title="查看效果"
      >查看</button>
    `;
  }

  renderCardPreview() {
    const kind = this.preview?.kind;
    const id = this.preview?.id;
    if (kind === "action-card") {
      const card = this.data.actionCards.find((c) => c.id === id);
      if (!card) return this.renderPreviewEmpty();
      const frontText = card.id === "turn"
        ? `转向${this.sel.boardMode === "hex" ? 60 : 90}度`
        : card.front;
      return `
        <div class="preview-card">
          <div class="preview-kicker">猎人行动卡</div>
          <h3>${card.name}</h3>
          <dl class="preview-lines">
            <div><dt>时点</dt><dd>${card.time}</dd></div>
            <div><dt>费用</dt><dd>${card.cost || "无"}</dd></div>
            <div><dt>正面</dt><dd>${frontText}</dd></div>
            <div><dt>背面/恢复</dt><dd>${card.back || "无"}</dd></div>
            <div><dt>爆发</dt><dd>${card.burst || "无"}</dd></div>
            ${card.hunterOnly ? `<div><dt>限制</dt><dd>仅 ${this.hunterName(card.hunterOnly)} 可用</dd></div>` : ""}
          </dl>
        </div>
      `;
    }
    if (kind === "boss-action") {
      const card = this.data.monster.actionDeck.find((a) => a.id === id);
      if (!card) return this.renderPreviewEmpty();
      return `
        <div class="preview-card">
          <div class="preview-kicker">Boss行动卡</div>
          <h3>${card.name}</h3>
          <dl class="preview-lines">
            <div><dt>类型</dt><dd>${card.type}</dd></div>
            <div><dt>时点上限</dt><dd>${card.timeLimit}</dd></div>
            <div><dt>目标</dt><dd>${this.describeTarget(card)}</dd></div>
            <div><dt>前摇</dt><dd>${card.windup || "无"}</dd></div>
            <div><dt>效果</dt><dd>${card.effect || this.describeAttack(card)}</dd></div>
            <div><dt>后摇</dt><dd>${card.after || "无"}</dd></div>
          </dl>
        </div>
      `;
    }
    if (kind === "boss-part") {
      const part = this.data.monster.hitLocations.find((p) => p.id === id);
      if (!part) return this.renderPreviewEmpty();
      return `
        <div class="preview-card">
          <div class="preview-kicker">Boss部位卡</div>
          <h3>${part.name}</h3>
          <dl class="preview-lines">
            <div><dt>耐久</dt><dd>${part.hp} HP</dd></div>
            <div><dt>性质</dt><dd>${part.persistent ? "持续部位，抽出后留场" : "命中部位，抽出后结算"}</dd></div>
            <div><dt>文本</dt><dd>${part.text}</dd></div>
            ${part.onSuccess ? `<div><dt>成功标记</dt><dd>${part.onSuccess}</dd></div>` : ""}
            ${part.onFailure ? `<div><dt>失败标记</dt><dd>${part.onFailure}</dd></div>` : ""}
            ${part.onDestroyed ? `<div><dt>摧毁标记</dt><dd>${part.onDestroyed}</dd></div>` : ""}
            ${part.stackedFailure ? `<div><dt>层叠失败</dt><dd>${part.stackedFailure}</dd></div>` : ""}
          </dl>
        </div>
      `;
    }
    return this.renderPreviewEmpty();
  }

  renderPreviewEmpty() {
    return `
      <div class="preview-card preview-empty">
        <div class="preview-kicker">卡牌详情</div>
        <h3>选择一张卡</h3>
        <p class="subtle">点击配置项右侧的“查看”，这里会显示行动、前摇、恢复或部位效果。</p>
      </div>
    `;
  }

  hunterName(id) {
    return this.data.hunters.find((h) => h.id === id)?.name || id;
  }

  describeAttack(card) {
    if (!card.attack) return "无攻击动作";
    const parts = [`${card.attack.count}次攻击`, `命中${card.attack.precision}+`, `伤害${card.attack.damage}`];
    if (card.areaRadius) parts.push(`范围${card.areaRadius}`);
    if (card.range) parts.push(`射程${card.range}`);
    return parts.join("，");
  }

  describeTarget(card) {
    const names = {
      nearest: "最近猎人",
      wounded: "伤势最重猎人",
      cell: "指定地格",
      direction: "指定方向",
      hunter: "点名猎人"
    };
    return names[card.target] || card.target || "无";
  }

  render() {
    const d = this.data;
    this.root.innerHTML = `
      <section class="topbar">
        <div>
          <h1>Boss战斗 · 战前配置</h1>
          <div class="subtle">选择猎人武器、行动卡，以及启用的Boss行动/部位</div>
        </div>
        <div class="row">
          <button data-config-reset>恢复默认</button>
          <button data-config-start class="btn-primary">开始战斗</button>
        </div>
      </section>
      <section class="config-layout">
        <div class="config-section config-map-mode">
          <h2>地图模式</h2>
          <div class="mode-options">
            <label class="mode-option ${this.sel.boardMode === "square" ? "selected" : ""}">
              <input type="radio" name="board-mode" value="square" ${this.sel.boardMode === "square" ? "checked" : ""} />
              <strong>四边形地图</strong>
              <span class="subtle">原有模式 · 4方向移动 · 曼哈顿距离</span>
            </label>
            <label class="mode-option ${this.sel.boardMode === "hex" ? "selected" : ""}">
              <input type="radio" name="board-mode" value="hex" ${this.sel.boardMode === "hex" ? "checked" : ""} />
              <strong>六边形地图</strong>
              <span class="subtle">新模式 · 6方向移动 · 六边格距离</span>
            </label>
          </div>
        </div>
        <div class="config-section">
          <h2>猎人装备与行动卡</h2>
          <div class="config-hunters">
            ${d.hunters.map((h) => this.renderHunterConfig(h)).join("")}
          </div>
        </div>
        <div class="config-section">
          <h2>Boss 配置</h2>
          <div class="config-boss">
            ${this.renderBossActions()}
            ${this.renderBossParts()}
          </div>
        </div>
        <div class="config-section config-preview-section">
          <h2>卡牌详情</h2>
          <div data-card-preview>
            ${this.renderCardPreview()}
          </div>
        </div>
      </section>
    `;
    this.attachEvents();
  }

  renderHunterConfig(h) {
    const hc = this.sel.hunters[h.id];
    return `
      <div class="config-hunter-card">
        <h3>${h.name} <span class="subtle">力${h.strength} 敏${h.agility} 意${h.will}</span></h3>
        <div class="config-row">
          <label class="config-label">武器：</label>
          <select data-weapon="${h.id}" class="config-select">
            ${this.data.weaponPool.map((w, i) => `
              <option value="${i}" ${i === hc.weaponIndex ? "selected" : ""}>
                ${w.name} (速${w.speed} 威${w.power} 范${w.range})
              </option>
            `).join("")}
          </select>
        </div>
        <div class="config-row">
          <span class="config-label">行动卡：</span>
          <div class="config-checks">
            ${this.data.actionCards
              .filter((c) => !c.hunterOnly || c.hunterOnly === h.id)
              .map((c) => {
                const checked = hc.cardIds.has(c.id);
                return `
                  <label class="config-check ${checked ? "" : "unchecked"}">
                    <input type="checkbox" data-card="${h.id}:${c.id}" ${checked ? "checked" : ""} />
                    <span>${c.name} <span class="subtle">(${c.time}时点${c.hunterOnly ? "·专属" : ""})</span></span>
                    ${this.detailButton("action-card", c.id)}
                  </label>
                `;
              }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  renderBossActions() {
    const bossName = this.data.monster.name;
    const allChecked = this.data.monster.actionDeck.every((a) => this.sel.boss.actionIds.has(a.id));
    return `
      <div class="config-boss-panel">
        <div class="config-boss-header">
          <h3>${bossName} · 行动牌堆</h3>
          <div class="row">
            <button data-boss-action-all="on">全选</button>
            <button data-boss-action-all="off">全关</button>
          </div>
        </div>
        <div class="config-checks">
          ${this.data.monster.actionDeck.map((a) => {
            const checked = this.sel.boss.actionIds.has(a.id);
            return `
              <label class="config-check ${checked ? "" : "unchecked"}">
                <input type="checkbox" data-boss-action="${a.id}" ${checked ? "checked" : ""} />
                <span>${a.name} <span class="subtle">(${a.type}·${a.timeLimit}时点)</span></span>
                ${this.detailButton("boss-action", a.id)}
              </label>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  renderBossParts() {
    return `
      <div class="config-boss-panel">
        <div class="config-boss-header">
          <h3>部位卡</h3>
          <div class="row">
            <button data-boss-part-all="on">全选</button>
            <button data-boss-part-all="off">全关</button>
          </div>
        </div>
        <div class="config-checks">
          ${this.data.monster.hitLocations.map((p) => {
            const checked = this.sel.boss.partIds.has(p.id);
            return `
              <label class="config-check ${checked ? "" : "unchecked"}">
                <input type="checkbox" data-boss-part="${p.id}" ${checked ? "checked" : ""} />
                <span>${p.name} <span class="subtle">(${p.hp}HP${p.persistent ? "·持续" : ""})</span></span>
                ${this.detailButton("boss-part", p.id)}
              </label>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  attachEvents() {
    this.bind("[data-config-start]", "click", () => this.startBattle());
    this.bind("[data-config-reset]", "click", () => {
      this.sel = this.buildDefaults();
      this.preview = { kind: "action-card", id: this.data.actionCards[0]?.id || null };
      this.render();
    });

    this.bind("[data-preview-kind]", "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setPreview(e.currentTarget.dataset.previewKind, e.currentTarget.dataset.previewId);
    });

    this.bind("input[name='board-mode']", "change", (e) => {
      this.sel.boardMode = e.currentTarget.value;
      this.render();
    });

    this.bind("select[data-weapon]", "change", (e) => {
      const hunterId = e.currentTarget.dataset.weapon;
      this.sel.hunters[hunterId].weaponIndex = Number(e.currentTarget.value);
    });

    this.bind("input[data-card]", "change", (e) => {
      const [hunterId, cardId] = e.currentTarget.dataset.card.split(":");
      const label = e.currentTarget.closest(".config-check");
      if (e.currentTarget.checked) {
        this.sel.hunters[hunterId].cardIds.add(cardId);
        label.classList.remove("unchecked");
      } else {
        this.sel.hunters[hunterId].cardIds.delete(cardId);
        label.classList.add("unchecked");
      }
    });

    this.bind("input[data-boss-action]", "change", (e) => {
      const id = e.currentTarget.dataset.bossAction;
      const label = e.currentTarget.closest(".config-check");
      if (e.currentTarget.checked) {
        this.sel.boss.actionIds.add(id);
        label.classList.remove("unchecked");
      } else {
        this.sel.boss.actionIds.delete(id);
        label.classList.add("unchecked");
      }
    });

    this.bind("input[data-boss-part]", "change", (e) => {
      const id = e.currentTarget.dataset.bossPart;
      const label = e.currentTarget.closest(".config-check");
      if (e.currentTarget.checked) {
        this.sel.boss.partIds.add(id);
        label.classList.remove("unchecked");
      } else {
        this.sel.boss.partIds.delete(id);
        label.classList.add("unchecked");
      }
    });

    this.bind("[data-boss-action-all='on']", "click", () => {
      this.sel.boss.actionIds = new Set(this.data.monster.actionDeck.map((a) => a.id));
      this.render();
    });
    this.bind("[data-boss-action-all='off']", "click", () => {
      this.sel.boss.actionIds = new Set();
      this.render();
    });
    this.bind("[data-boss-part-all='on']", "click", () => {
      this.sel.boss.partIds = new Set(this.data.monster.hitLocations.map((p) => p.id));
      this.render();
    });
    this.bind("[data-boss-part-all='off']", "click", () => {
      this.sel.boss.partIds = new Set();
      this.render();
    });
  }

  startBattle() {
    if (this.sel.boss.actionIds.size === 0) {
      alert("Boss 至少需要启用 1 张行动卡。");
      return;
    }
    if (this.sel.boss.partIds.size === 0) {
      alert("Boss 至少需要启用 1 张部位卡（否则攻击无法结算）。");
      return;
    }
    const config = {
      boardMode: this.sel.boardMode,
      hunters: Object.fromEntries(
        Object.entries(this.sel.hunters).map(([id, hc]) => [
          id,
          { weaponIndex: hc.weaponIndex, cardIds: [...hc.cardIds] }
        ])
      ),
      boss: {
        actionIds: [...this.sel.boss.actionIds],
        partIds: [...this.sel.boss.partIds]
      }
    };
    this.onStart(config);
  }
}

class CombatEngine {
  constructor(data, config) {
    this.sourceData = data;
    this.config = config || this.defaultConfig();
    this.geometry = new BoardGeometry(this.config.boardMode, data.board);
    this.data = this.buildFilteredData();
    this.log = new EventLog();
    this.deck = new DeckSystem(Math.random);
    this.state = this.createInitialState();
  }

  defaultConfig() {
    return {
      boardMode: "square",
      hunters: Object.fromEntries(
        this.sourceData.hunters.map((h) => [
          h.id,
          {
            weaponIndex: h.defaultWeaponIndex ?? 0,
            cardIds: this.sourceData.actionCards
              .filter((c) => !c.hunterOnly || c.hunterOnly === h.id)
              .map((c) => c.id)
          }
        ])
      ),
      boss: {
        actionIds: this.sourceData.monster.actionDeck.map((a) => a.id),
        partIds: this.sourceData.monster.hitLocations.map((p) => p.id)
      }
    };
  }

  buildFilteredData() {
    const data = {
      ...this.sourceData,
      monster: { ...this.sourceData.monster }
    };
    const bc = this.config.boss || {};
    const actionIds = new Set(bc.actionIds && bc.actionIds.length ? bc.actionIds : this.sourceData.monster.actionDeck.map((a) => a.id));
    const partIds = new Set(bc.partIds && bc.partIds.length ? bc.partIds : this.sourceData.monster.hitLocations.map((p) => p.id));
    data.monster.actionDeck = this.sourceData.monster.actionDeck.filter((a) => actionIds.has(a.id));
    data.monster.hitLocations = this.sourceData.monster.hitLocations.filter((p) => partIds.has(p.id));
    return data;
  }

  createInitialState() {
    const actionDeck = this.deck.drawMany(this.data.monster.actionDeck, this.data.monster.actionDeck.length);
    const currentAction = actionDeck.shift();
    return {
      phase: "player",
      round: 1,
      selectedHunterId: "h1",
      selectedAttackTarget: "boss",
      currentAction,
      actionDeck,
      pendingAttack: null,
      pendingDeath: null,
      monsterActionResolved: false,
      objects: this.data.objects.map((object) => ({
        ...object,
        position: this.geometry.normalizePosition(object.position),
        hp: object.hp,
        destroyed: false
      })),
      monster: {
        ...this.data.monster,
        position: this.geometry.normalizePosition(this.data.monster.position),
        hp: this.data.monster.hp,
        maxHp: this.data.monster.hp,
        facing: this.data.monster.facing || "left",
        clock: [false, false, false],
        persistentParts: [],
        hitLocationDiscard: []
      },
      hunters: this.data.hunters.map((hunter) => {
        const hc = this.config.hunters[hunter.id] || {};
        const weaponIndex = hc.weaponIndex ?? hunter.defaultWeaponIndex ?? 0;
        const weapon = (this.sourceData.weaponPool && this.sourceData.weaponPool[weaponIndex]) ? this.sourceData.weaponPool[weaponIndex] : hunter.weapon;
        const cardIds = hc.cardIds && hc.cardIds.length
          ? new Set(hc.cardIds)
          : new Set(this.data.actionCards.filter((card) => !card.hunterOnly || card.hunterOnly === hunter.id).map((card) => card.id));
        return {
          id: hunter.id,
          name: hunter.name,
          strength: hunter.strength,
          agility: hunter.agility,
          will: hunter.will,
          maxWill: hunter.will,
          weapon: { ...weapon },
          position: this.geometry.normalizePosition(hunter.position),
          timeSpent: 0,
          debt: 0,
          ended: false,
          overtime: false,
          usedWillActions: {},
          wounds: { head: 3, torso: 4, arms: 3, legs: 3 },
          armor: { head: 1, torso: 2, arms: 1, legs: 1 },
          permanentInjuries: [],
          deathDeck: ["survive"],
          dead: false,
          facing: hunter.facing || "right",
          tempSlots: hunter.tempSlots || 6,
          tempResources: this.createInspirationResources(hunter.inspiration),
          cards: this.data.actionCards
            .filter((card) => cardIds.has(card.id))
            .map((card) => ({ ...card, faceUp: true }))
        };
      }),
      questions: [
        "护甲在正式文档中列入怪物攻击数据，但阻挡结算位置未定；原型假设为命中后再抽'护甲阻挡/精准穿透'。",
        "暴击条件尚未定义；当前部位卡只实现成功、失败、摧毁和持续部位。",
        "后摇的额外数值收益尚未定；当前实现为独立确认阶段，不擅自附加奖励。",
        "死亡牌堆的正式UI是玩家选牌；原型先用按钮执行一次随机抽牌并显示牌堆构成。",
        "意志行动【硬撑】在文档中仍是暂未细化；原型先显示为禁用按钮，等待规则定义。"
      ]
    };
  }

  reset() {
    this.log = new EventLog();
    this.state = this.createInitialState();
    this.log.add("新战斗开始。当前怪物行动已公开，玩家按该行动的时点上限行动。");
  }

  selectHunter(id) {
    this.state.selectedHunterId = id;
  }

  setAttackTarget(target) {
    this.state.selectedAttackTarget = target;
  }

  get selectedHunter() {
    return this.state.hunters.find((hunter) => hunter.id === this.state.selectedHunterId);
  }

  getCard(hunter, cardId) {
    return hunter.cards.find((card) => card.id === cardId);
  }

  terrainAt(position) {
    return this.data.terrain.find((tile) => this.posEq(this.geometry.normalizePosition(tile), position))?.type || "normal";
  }

  objectAt(position) {
    return this.state.objects.find((object) => !object.destroyed && object.position.x === position.x && object.position.y === position.y);
  }

  posEq(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  facingDelta(facing) {
    return this.geometry.delta(facing);
  }

  getFrontTile(pos, facing) {
    return this.geometry.neighbor(pos, facing);
  }

  getFrontLeftTile(pos, facing) {
    return this.getFrontTile(pos, this.geometry.rotate(facing, -1));
  }

  getFrontRightTile(pos, facing) {
    return this.getFrontTile(pos, this.geometry.rotate(facing, 1));
  }

  facingName(facing) {
    return this.geometry.name(facing);
  }

  facingArrow(facing) {
    return this.geometry.arrow(facing);
  }

  facingAngle(facing) {
    return this.geometry.angle(facing);
  }

  inspirationDefinition(color) {
    return {
      red: { name: "红色灵感", meaning: "残暴" },
      blue: { name: "蓝色灵感", meaning: "精湛" },
      yellow: { name: "黄色灵感", meaning: "速度" }
    }[color];
  }

  createInspirationResources(inspiration = {}) {
    return ["red", "blue", "yellow"]
      .filter((color) => (inspiration[color] || 0) > 0)
      .map((color) => {
        const definition = this.inspirationDefinition(color);
        return {
          type: "inspiration",
          color,
          name: definition.name,
          count: inspiration[color],
          desc: `${definition.meaning}类战斗灵感，可支付行动卡费用。`
        };
      });
  }

  addMindResource(hunter, resource) {
    if (!hunter || hunter.dead) return false;
    if (resource.type === "inspiration") {
      const stacked = hunter.tempResources.find((item) => item.type === "inspiration" && item.color === resource.color);
      if (stacked) {
        stacked.count += resource.count || 1;
        return true;
      }
    }
    if (hunter.tempResources.length >= (hunter.tempSlots || 6)) return false;
    hunter.tempResources.push(resource);
    return true;
  }

  inspirationCount(hunter, color) {
    return hunter?.tempResources.find((item) => item.type === "inspiration" && item.color === color)?.count || 0;
  }

  spendInspiration(hunter, color) {
    const resource = hunter?.tempResources.find((item) => item.type === "inspiration" && item.color === color);
    if (!resource || resource.count <= 0) return false;
    resource.count -= 1;
    if (resource.count === 0) hunter.tempResources = hunter.tempResources.filter((item) => item !== resource);
    return true;
  }

  addMomentum(hunter) {
    if (!hunter || hunter.dead) return;
    if (!this.addMindResource(hunter, { type: "momentum", name: "动能", count: 1, desc: "下次攻击时消耗，增加1力量。任何其他行动会移除。" })) {
      this.log.add(`${hunter.name}临时资源槽已满，无法获得动能。`);
      return;
    }
    this.log.add(`${hunter.name}在思维区获得【动能】。`);
  }

  consumeMomentum(hunter) {
    if (!hunter) return false;
    const has = hunter.tempResources.some((r) => r.type === "momentum");
    if (has) {
      hunter.tempResources = hunter.tempResources.filter((r) => r.type !== "momentum");
      return true;
    }
    return false;
  }

  clearMomentum(hunter) {
    if (!hunter || !hunter.tempResources) return;
    const had = hunter.tempResources.some((r) => r.type === "momentum");
    if (had) {
      hunter.tempResources = hunter.tempResources.filter((r) => r.type !== "momentum");
      this.log.add(`${hunter.name}的【动能】因非攻击行动而消散。`);
    }
  }

  spendAnyInspiration(hunter) {
    const key = ["red", "blue", "yellow"].find((color) => this.inspirationCount(hunter, color) > 0);
    if (!key) return false;
    return this.spendInspiration(hunter, key);
  }

  gainInspiration(hunter, color, amount = 1) {
    const definition = this.inspirationDefinition(color);
    if (!definition || amount <= 0) return false;
    return this.addMindResource(hunter, {
      type: "inspiration",
      color,
      name: definition.name,
      count: amount,
      desc: `${definition.meaning}类战斗灵感，可支付行动卡费用。`
    });
  }

  flipCard(hunter, card) {
    if (!card.faceUp) return;
    card.faceUp = false;
    this.recoverTurnCards(hunter);
  }

  recoverTurnCards(hunter) {
    hunter.cards.filter((card) => card.id === "turn" && !card.faceUp).forEach((card) => {
      card.faceUp = true;
      this.log.add(`${hunter.name}的【转向】因有卡牌翻面而恢复。`);
    });
  }

  consumeTime(hunter, amount) {
    const limit = this.state.currentAction.timeLimit;
    hunter.timeSpent += amount;
    if (hunter.timeSpent > limit) {
      hunter.debt = hunter.timeSpent - limit;
      hunter.ended = true;
      this.log.add(`${hunter.name}耗尽：超过时点上限${limit}，结转${hunter.debt}时点到下回合。`);
    }
  }

  isTempoLeaderLocked(hunter) {
    if (!hunter || hunter.timeSpent <= 0 || this.state.phase !== "player") return false;
    const peers = this.state.hunters.filter((item) => item.id !== hunter.id && !this.isHunterDead(item));
    return peers.length > 0 && !peers.some((item) => item.timeSpent >= hunter.timeSpent);
  }

  canHunterAct(hunter) {
    return Boolean(
      hunter &&
      this.state.phase === "player" &&
      !hunter.dead &&
      !hunter.ended &&
      !hunter.overtime &&
      !this.isTempoLeaderLocked(hunter) &&
      !this.state.pendingAttack &&
      !this.state.pendingDeath
    );
  }

  useCard(cardId, direction) {
    if (this.state.phase !== "player" || this.state.pendingAttack || this.state.pendingDeath) return;
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (!hunter || !card || !this.canHunterAct(hunter) || !card.faceUp) return;

    const needsInspiration = cardId === "attack" || cardId === "arc-slash" || cardId === "move";
    if (needsInspiration && !this.spendAnyInspiration(hunter)) {
      this.log.add(`${hunter.name}没有可支付的灵感，无法使用【${card.name}】。`);
      return;
    }

    if (cardId !== "attack" && cardId !== "arc-slash") this.clearMomentum(hunter);

    if (cardId === "attack") this.attack(hunter);
    if (cardId === "arc-slash") this.arcSlash(hunter);
    if (cardId === "move") this.move(hunter, direction);
    if (cardId === "focus") this.focus(hunter);
    if (cardId === "turn") {
      hunter.facing = this.geometry.rotate(hunter.facing, 1);
      this.log.add(`${hunter.name}执行【转向】：转向${this.geometry.mode === "hex" ? 60 : 90}度，现在面朝${this.facingName(hunter.facing)}。`);
    }

    this.consumeTime(hunter, card.time);
    this.flipCard(hunter, card);
  }

  burst(cardId) {
    if (this.state.phase !== "player" || this.state.pendingAttack || this.state.pendingDeath) return;
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (!hunter || !card || !this.canHunterAct(hunter) || !card.faceUp) return;
    this.flipCard(hunter, card);
    if (cardId === "move") {
      this.gainInspiration(hunter, "blue");
      this.log.add(`${hunter.name}爆发【移动】：获得1蓝色灵感。`);
    } else if (cardId === "arc-slash") {
      hunter.timeSpent = Math.max(0, hunter.timeSpent - 1);
      this.log.add(`${hunter.name}爆发【圆弧斩】：获得1时点，当前已用时点-1。`);
    } else {
      hunter.timeSpent = Math.max(0, hunter.timeSpent - 1);
      this.log.add(`${hunter.name}爆发【${card.name}】：获得1时点，当前已用时点-1。`);
    }
  }

  focus(hunter) {
    const colors = ["red", "blue", "yellow"];
    const results = [
      this.deck.drawOneWeighted(colors),
      this.deck.drawOneWeighted(colors)
    ];
    const gained = [];
    results.forEach((color) => {
      if (this.gainInspiration(hunter, color)) gained.push(this.inspirationDefinition(color).name);
    });
    this.log.add(
      `${hunter.name}执行【专注】，颜色骰结果：${results.map((color) => this.inspirationDefinition(color).name).join("、")}。` +
      (gained.length === results.length ? "灵感已加入思维区。" : "思维区已满，部分灵感未能加入。")
    );
  }

  recover(cardId) {
    const hunter = this.selectedHunter;
    const card = this.getCard(hunter, cardId);
    if (!hunter || !card) return;
    if (card.faceUp) {
      this.log.add(`${hunter.name}的【${card.name}】已经是正面，不需要恢复。`);
      return;
    }
    if (cardId === "attack") {
      if (!this.spendAnyInspiration(hunter)) {
        this.log.add(`${hunter.name}没有任意灵感，无法恢复【攻击】。`);
        return;
      }
      card.faceUp = true;
      this.log.add(`${hunter.name}支付任意灵感，恢复【攻击】。`);
      return;
    }
    if (cardId === "arc-slash") {
      if (this.inspirationCount(hunter, "red") < 1 || this.inspirationCount(hunter, "blue") < 1) {
        this.log.add(`${hunter.name}没有1红1蓝灵感，无法恢复【圆弧斩】。`);
        return;
      }
      this.spendInspiration(hunter, "red");
      this.spendInspiration(hunter, "blue");
      card.faceUp = true;
      this.log.add(`${hunter.name}支付1红1蓝灵感，恢复【圆弧斩】。`);
      return;
    }
    if (cardId === "move") {
      if (this.inspirationCount(hunter, "blue") < 1) {
        this.log.add(`${hunter.name}没有蓝色灵感，无法恢复【移动】。`);
        return;
      }
      this.spendInspiration(hunter, "blue");
      card.faceUp = true;
      this.log.add(`${hunter.name}消耗1蓝色灵感，恢复【移动】。`);
      return;
    }
    if (cardId === "turn") {
      this.log.add(`${hunter.name}的【转向】需要通过翻转任意卡恢复，不能主动恢复。`);
    }
    if (cardId === "focus") {
      this.log.add(`${hunter.name}的【专注】会在角色回合开始时恢复，不能主动恢复。`);
    }
  }

  attack(hunter) {
    const frontPos = this.getFrontTile(hunter.position, hunter.facing);
    const target = this.state.selectedAttackTarget;

    if (target && target.startsWith("part:")) {
      if (!this.isInside(frontPos) || !this.posEq(this.state.monster.position, frontPos)) {
        this.log.add(`${hunter.name}正前方没有Boss，无法攻击部位。`);
        return;
      }
      this.attackPersistentPart(hunter, target.replace("part:", ""));
      return;
    }

    const object = this.objectAt(frontPos);
    if (object) {
      const momentumBonus = this.consumeMomentum(hunter) ? 1 : 0;
      this.damageObject(object, 1 + momentumBonus, hunter, `${hunter.name}攻击${object.name}${momentumBonus ? "，动能+1伤害" : ""}`);
      return;
    }

    if (!this.isInside(frontPos) || !this.posEq(this.state.monster.position, frontPos)) {
      this.log.add(`${hunter.name}正前方没有目标，攻击无效但行动仍发生。`);
      return;
    }

    const momentumBonus = this.consumeMomentum(hunter) ? 1 : 0;
    const count = hunter.weapon.speed;
    const parts = this.drawHitLocations(count);
    const toughness = Math.max(0, this.state.monster.toughness - hunter.weapon.power);
    const deck = [
      ...Array.from({ length: Math.max(1, hunter.strength + momentumBonus) }, () => "success"),
      ...Array.from({ length: toughness }, () => "failure")
    ];
    const results = this.deck.drawMany(deck, count);
    this.state.pendingAttack = this.createPendingAttack(hunter.id, parts, results);
    this.log.add(`${hunter.name}攻击正前方的Boss${momentumBonus ? "，动能+1力量" : ""}。牌堆 ${hunter.strength + momentumBonus}成 / ${toughness}败，抽${count}张。`);
  }

  arcSlash(hunter) {
    const front = this.getFrontTile(hunter.position, hunter.facing);
    const frontLeft = this.getFrontLeftTile(hunter.position, hunter.facing);
    const frontRight = this.getFrontRightTile(hunter.position, hunter.facing);
    const tiles = [front, frontLeft, frontRight];
    const hitsBoss = tiles.some((t) => this.isInside(t) && this.posEq(this.state.monster.position, t));
    const hitObjects = tiles.filter((t) => this.objectAt(t)).map((t) => this.objectAt(t));

    if (!hitsBoss && !hitObjects.length) {
      this.log.add(`${hunter.name}圆弧斩的前方3格没有目标，行动无效但行动仍发生。`);
      return;
    }

    hitObjects.forEach((obj) => {
      this.damageObject(obj, 1, hunter, `${hunter.name}圆弧斩命中${obj.name}`);
    });

    if (hitsBoss) {
      const momentumBonus = this.consumeMomentum(hunter) ? 1 : 0;
      const count = hunter.weapon.speed;
      const parts = this.drawHitLocations(count);
      const toughness = Math.max(0, this.state.monster.toughness - hunter.weapon.power);
      const deck = [
        ...Array.from({ length: Math.max(1, hunter.strength + momentumBonus) }, () => "success"),
        ...Array.from({ length: toughness }, () => "failure")
      ];
      const results = this.deck.drawMany(deck, count);
      this.state.pendingAttack = this.createPendingAttack(hunter.id, parts, results);
      this.log.add(`${hunter.name}使用圆弧斩${momentumBonus ? "，动能+1力量" : ""}。牌堆 ${hunter.strength + momentumBonus}成 / ${toughness}败，抽${count}张。`);
    }
  }

  attackObject(hunter, objectId) {
    const object = this.state.objects.find((item) => item.id === objectId && !item.destroyed);
    if (!object) {
      this.log.add("目标物体已经不存在。");
      return;
    }
    const distance = this.distance(hunter.position, object.position);
    if (distance > hunter.weapon.range) {
      this.log.add(`${hunter.name}距离${object.name}为${distance}，超过武器范围${hunter.weapon.range}，攻击无效但行动仍发生。`);
      return;
    }
    this.damageObject(object, 1, hunter, `${hunter.name}攻击${object.name}`);
  }

  damageObject(object, amount, hunter, source) {
    if (!object || object.destroyed) return;
    object.hp -= amount;
    this.log.add(`${source}：${object.name}耐久-${amount}，剩余${object.hp}。`);
    if (object.hp <= 0) {
      object.destroyed = true;
      this.log.add(`${object.name}被摧毁并移出战场。`);
      if (hunter) {
        this.gainInspiration(hunter, "yellow");
        this.log.add(`${hunter.name}因摧毁${object.name}获得1黄色灵感。`);
      }
      if (this.state.selectedAttackTarget === `object:${object.id}`) this.state.selectedAttackTarget = "boss";
    }
  }

  throwStone(hunter) {
    if (this.state.phase !== "player" || this.state.pendingAttack || this.state.pendingDeath) return;
    if (!this.canHunterAct(hunter)) return;
    this.clearMomentum(hunter);
    if (this.terrainAt(hunter.position) !== "rock") {
      this.log.add(`${hunter.name}不在石块地形上，无法使用临时行动【投石】。`);
      return;
    }
    const distance = this.distance(hunter.position, this.state.monster.position);
    const range = 3;
    if (distance > range) {
      this.log.add(`${hunter.name}投石距离为${distance}，超过范围${range}，行动无效但仍消耗时点。`);
      this.consumeTime(hunter, 1);
      return;
    }
    const parts = this.drawHitLocations(1);
    const toughness = Math.max(0, this.state.monster.toughness - 1);
    const deck = ["success", ...Array.from({ length: toughness }, () => "failure")];
    const results = this.deck.drawMany(deck, 1);
    this.state.pendingAttack = this.createPendingAttack(hunter.id, parts, results);
    this.consumeTime(hunter, 1);
    this.log.add(`${hunter.name}使用临时行动【投石】：1时点，范围${range}，构建牌堆 1成功 / ${toughness}失败。`);
  }

  attackPersistentPart(hunter, partId) {
    const part = this.state.monster.persistentParts.find((item) => item.instanceId === partId);
    if (!part) return;
    const toughness = Math.max(0, 2 - hunter.weapon.power);
    const deck = [
      ...Array.from({ length: Math.max(1, hunter.strength) }, () => "success"),
      ...Array.from({ length: toughness }, () => "failure")
    ];
    const result = this.deck.drawOneWeighted(deck);
    if (result === "success") {
      part.hp -= 1;
      this.log.add(`${hunter.name}攻击持续部位【${part.name}】成功，部位耐久-1。`);
      if (part.hp <= 0) {
        this.state.monster.persistentParts = this.state.monster.persistentParts.filter((item) => item.instanceId !== partId);
        this.log.add(`持续部位【${part.name}】被击破，移出场上。`);
      }
    } else {
      this.log.add(`${hunter.name}攻击持续部位【${part.name}】失败。`);
    }
  }

  createPendingAttack(hunterId, parts, results) {
    return {
      hunterId,
      parts,
      results,
      assignments: parts.map(() => null),
      selectedResultIndex: null
    };
  }

  selectAttackResult(resultIndex) {
    const pending = this.state.pendingAttack;
    if (!pending) return;
    const index = Number(resultIndex);
    if (pending.assignments.includes(index)) return;
    pending.selectedResultIndex = index;
  }

  assignAttackResult(partIndex) {
    const pending = this.state.pendingAttack;
    if (!pending || pending.selectedResultIndex === null) return;
    const index = Number(partIndex);
    if (pending.assignments[index] !== null) return;
    pending.assignments[index] = pending.selectedResultIndex;
    pending.selectedResultIndex = null;
  }

  autoAssignAttackResults() {
    const pending = this.state.pendingAttack;
    if (!pending) return;
    pending.assignments = pending.parts.map((_, index) => index);
    pending.selectedResultIndex = null;
  }

  isPendingAttackFullyAssigned() {
    const pending = this.state.pendingAttack;
    return Boolean(pending && pending.assignments.every((assignment) => assignment !== null));
  }

  drawHitLocations(count) {
    const activeIds = new Set([
      ...this.state.monster.hitLocationDiscard,
      ...this.state.monster.persistentParts.map((part) => part.id)
    ]);
    const deck = this.data.monster.hitLocations.filter((part) => !activeIds.has(part.id));
    if (deck.length < count) {
      this.state.monster.hitLocationDiscard = [];
      return this.deck.drawMany(this.data.monster.hitLocations, count);
    }
    return this.deck.drawMany(deck, count);
  }

  resolvePendingAttack(order) {
    const pending = this.state.pendingAttack;
    if (!pending) return;
    if (!this.isPendingAttackFullyAssigned()) {
      this.log.add("需要先把所有抽到的结果分配给部位卡，才能结算。");
      return;
    }
    const hunter = this.state.hunters.find((item) => item.id === pending.hunterId);
    const indexes = pending.parts.map((_, index) => index);
    if (order === "rtl") indexes.reverse();
    let previousSuccess = false;
    indexes.forEach((index) => {
      const part = pending.parts[index];
      const result = pending.results[pending.assignments[index]] || "failure";
      this.resolveHitLocation(hunter, part, result, previousSuccess);
      previousSuccess = result === "success";
    });
    this.state.pendingAttack = null;
    if (this.state.monster.hp <= 0) {
      this.state.phase = "won";
      this.log.add("Boss血量归零，战斗胜利。");
    }
  }

  resolveHitLocation(hunter, part, result, previousSuccess) {
    if (part.persistent && !this.state.monster.persistentParts.some((item) => item.id === part.id)) {
      this.state.monster.persistentParts.push({ ...part, instanceId: `${part.id}-${Date.now()}`, hp: part.hp });
      this.log.add(`持续部位【${part.name}】留在场上。`);
    } else {
      this.state.monster.hitLocationDiscard.push(part.id);
    }

    if (result === "failure") {
      this.log.add(`部位【${part.name}】失败：${part.text}`);
      if (part.onFailure === "counter") this.monsterAttackHunter(hunter, { count: 1, precision: 2, damage: 1 }, "部位反击");
      if (previousSuccess && part.stackedFailure === "armor") {
        this.log.add("层叠部位触发：前一部位命中后本部位失败。");
      }
      return;
    }

    part.hp -= 1;
    this.state.monster.hp -= 1;
    this.log.add(`部位【${part.name}】成功：Boss -1血，部位耐久-1。`);
    if (part.onSuccess === "damageAndClock") this.rewindClock();
    if (part.onSuccess === "damageAndRed") this.gainInspiration(hunter, "red");
    if (part.hp <= 0 && part.onDestroyed === "extraDamage") {
      this.state.monster.hp -= 1;
      this.log.add(`部位【${part.name}】被摧毁：Boss额外-1血。`);
    }
  }

  rewindClock() {
    const index = this.state.monster.clock.lastIndexOf(true);
    if (index >= 0) {
      this.state.monster.clock[index] = false;
      this.log.add("时钟角命中：拨回一个已翻开的时钟槽。");
    }
  }

  move(hunter, direction) {
    const next = this.geometry.neighbor(hunter.position, direction || "right");
    if (!this.isInside(next)) {
      this.log.add(`${hunter.name}撞到战场边界，移动无效但行动仍发生。`);
      return;
    }
    const object = this.objectAt(next);
    if (object && !object.passable) {
      this.log.add(`${hunter.name}撞到${object.name}：停止移动并受到1撞击伤害。`);
      this.applyDamage(hunter, "torso", 1);
      this.damageObject(object, 1, hunter, "撞击");
      return;
    }
    hunter.position = next;
    hunter.facing = direction;
    this.addMomentum(hunter);
    const terrain = this.terrainAt(next);
    const terrainText = terrain === "rock" ? "，站上石块并获得临时行动【投石】" : "";
    this.log.add(`${hunter.name}移动到(${next.x + 1}, ${next.y + 1})${terrainText}。`);
  }

  isInside(position) {
    return this.geometry.isInside(position);
  }

  useWill(action, targetId) {
    const hunter = this.selectedHunter;
    if (!this.canHunterAct(hunter) || hunter.will <= 0 || hunter.usedWillActions[action]) return;
    if (action === "encourage" && !this.canEncourage(hunter, targetId)) return;
    this.clearMomentum(hunter);
    hunter.will -= 1;
    hunter.usedWillActions[action] = true;
    if (action === "encourage") {
      const target = this.state.hunters.find((item) => item.id === targetId && item.id !== hunter.id);
      if (!target) return;
      this.grantTimePoint(hunter, target);
    }
    if (action === "sprint") {
      const card = this.getCard(hunter, "move");
      card.faceUp = true;
      this.log.add(`${hunter.name}使用意志行动【冲刺】：恢复【移动】。`);
    }
    if (action === "last") {
      const card = this.getCard(hunter, "attack");
      card.faceUp = true;
      this.log.add(`${hunter.name}使用意志行动【奋力一搏】：恢复【攻击】。`);
    }
  }

  canEncourage(hunter, targetId) {
    const target = this.state.hunters.find((item) => item.id === targetId && item.id !== hunter.id);
    return Boolean(target && !target.dead && !hunter.overtime);
  }

  grantTimePoint(source, target) {
    if (target.overtime || target.debt > 0) {
      target.debt = Math.max(0, target.debt - 1);
      target.timeSpent = Math.max(0, target.timeSpent - 1);
      if (target.overtime && target.debt <= this.state.currentAction.timeLimit) {
        target.overtime = false;
        target.ended = false;
        this.log.add(`${source.name}鼓舞${target.name}：给予1时点，${target.name}脱离超时。`);
        return;
      }
      this.log.add(`${source.name}鼓舞${target.name}：给予1时点，结转降为${target.debt}。`);
      return;
    }
    target.timeSpent = Math.max(0, target.timeSpent - 1);
    this.log.add(`${source.name}鼓舞${target.name}：给予1时点，已用时点-1。`);
  }

  endHunter() {
    const hunter = this.selectedHunter;
    if (!hunter) return;
    hunter.ended = true;
    this.log.add(`${hunter.name}结束本轮行动。`);
  }

  endPlayerTurn() {
    if (this.state.pendingAttack || this.state.pendingDeath || this.state.phase !== "player") return;
    this.state.hunters.forEach((hunter) => {
      if (!hunter.ended && !hunter.overtime) hunter.ended = true;
    });
    this.state.phase = "monster";
    this.log.add(`玩家回合结束。请操控Boss执行【${this.state.currentAction.name}】。`);
  }

  executeMonsterTurn(options = {}) {
    if (this.state.phase !== "monster" || this.state.pendingDeath) return;
    const action = this.state.currentAction;
    this.state.monsterActionResolved = true;
    this.log.add(`前摇结束，怪物执行【${action.name}】：${action.windup}。`);
    this.advanceClock();
    if (action.howl) this.resolveHowl();
    if (action.attack) {
      const targets = this.pickMonsterTargets(action, options);
      targets.forEach((target) => {
        this.monsterAttackHunter(target, action.attack, action.name);
      });
      if (!targets.length) this.log.add(`【${action.name}】没有命中任何合法目标。`);
    }
    if (!this.state.pendingDeath) this.finishMonsterAction();
  }

  finishMonsterAction() {
    if (this.state.hunters.every((hunter) => this.isHunterDead(hunter))) {
      this.state.phase = "lost";
      this.log.add("全部猎人倒下，战斗失败。");
      return;
    }
    this.state.phase = "recovery";
    this.log.add(`【${this.state.currentAction.name}】进入${this.state.currentAction.after || "后摇阶段"}。确认后翻开下一张行动卡。`);
  }

  advanceFromRecovery() {
    if (this.state.phase !== "recovery" || this.state.pendingDeath) return;
    this.prepareNextRound();
  }

  pickMonsterTargets(action, options = {}) {
    if (action.target === "cell") return this.pickCellTargets(options.cell, action.areaRadius || 0);
    if (action.target === "direction") return this.pickDirectionTargets(options.direction || "left", action.range || 99);
    if (action.target === "hunter") {
      const target = this.state.hunters.find((hunter) => hunter.id === options.hunterId && !this.isHunterDead(hunter));
      return target ? [target] : [];
    }
    const target = this.pickTarget(action.target);
    return target ? [target] : [];
  }

  pickCellTargets(cell, radius) {
    if (!cell) return [];
    return this.state.hunters.filter((hunter) => !this.isHunterDead(hunter) && this.distance(hunter.position, cell) <= radius);
  }

  pickDirectionTargets(direction, range) {
    const origin = this.state.monster.position;
    return this.state.hunters.filter((hunter) =>
      !this.isHunterDead(hunter) && this.geometry.isOnRay(origin, hunter.position, direction || "left", range)
    );
  }

  advanceClock() {
    const index = this.state.monster.clock.indexOf(false);
    if (index >= 0) this.state.monster.clock[index] = true;
    if (this.state.monster.clock.every(Boolean)) {
      this.state.monster.clock = [false, false, false];
      this.log.add("时钟槽全满：Boss触发大招【裂颅钟鸣】。");
      this.state.hunters.forEach((hunter) => this.monsterAttackHunter(hunter, { count: 1, precision: 3, damage: 1 }, "裂颅钟鸣"));
    }
  }

  resolveHowl() {
    this.state.hunters.forEach((hunter) => {
      const faceUp = hunter.cards.filter((card) => card.faceUp);
      if (!faceUp.length) return;
      const card = this.deck.drawOneWeighted(faceUp);
      this.flipCard(hunter, card);
      this.log.add(`黑嚎使${hunter.name}的【${card.name}】翻面。`);
    });
  }

  pickTarget(mode) {
    const alive = this.state.hunters.filter((hunter) => !this.isHunterDead(hunter));
    if (!alive.length) return null;
    if (mode === "nearest") {
      return alive.sort((a, b) => this.distance(a.position, this.state.monster.position) - this.distance(b.position, this.state.monster.position))[0];
    }
    if (mode === "wounded") {
      return alive.sort((a, b) => this.totalWounds(a) - this.totalWounds(b))[0];
    }
    return this.deck.drawOneWeighted(alive);
  }

  distance(a, b) {
    return this.geometry.distance(a, b);
  }

  totalWounds(hunter) {
    return Object.values(hunter.wounds).reduce((sum, value) => sum + Math.max(0, value), 0);
  }

  monsterAttackHunter(hunter, attack, source) {
    for (let i = 0; i < attack.count; i += 1) {
      const terrainEvasion = this.terrainAt(hunter.position) === "grass" ? 1 : 0;
      const precision = Math.max(1, attack.precision);
      const agility = Math.max(0, hunter.agility + terrainEvasion);
      const hitDeck = [
        ...Array.from({ length: precision }, () => "hit"),
        ...Array.from({ length: agility }, () => "dodge")
      ];
      const hit = this.deck.drawOneWeighted(hitDeck);
      this.log.add(`${source}攻击${hunter.name}：临时牌堆 ${precision}命中 / ${agility}闪避，抽到${hit === "hit" ? "命中" : "闪避"}。`);
      if (hit !== "hit") continue;
      const part = this.deck.drawOneWeighted(["head", "torso", "arms", "legs"]);
      if (this.tryArmorBlock(hunter, part, precision)) {
        this.log.add(`${hunter.name}的${this.partName(part)}护甲阻挡了命中。`);
        continue;
      }
      this.applyDamage(hunter, part, attack.damage);
    }
  }

  tryArmorBlock(hunter, part, precision) {
    const armor = hunter.armor[part] || 0;
    if (armor <= 0) return false;
    const deck = [
      ...Array.from({ length: armor }, () => "block"),
      ...Array.from({ length: precision }, () => "pierce")
    ];
    return this.deck.drawOneWeighted(deck) === "block";
  }

  applyDamage(hunter, part, amount) {
    if (hunter.dead) return;
    hunter.wounds[part] -= amount;
    this.log.add(`${hunter.name}的${this.partName(part)}受到${amount}伤害，剩余${hunter.wounds[part]}。`);
    if (hunter.wounds[part] < 0) {
      const injury = `${this.partName(part)}永久损伤`;
      if (!hunter.permanentInjuries.includes(injury)) hunter.permanentInjuries.push(injury);
      this.state.pendingDeath = {
        hunterId: hunter.id,
        part,
        injury,
        choices: this.deck.drawMany(hunter.deathDeck, hunter.deathDeck.length),
        revealedIndex: null,
        resolved: false
      };
      this.log.add(`${hunter.name}触发致命伤：等待死亡牌堆判定。`);
    }
  }

  resolveDeathDraw(choiceIndex = 0) {
    const pending = this.state.pendingDeath;
    if (!pending) return;
    const hunter = this.state.hunters.find((item) => item.id === pending.hunterId);
    if (!hunter || hunter.dead) {
      this.state.pendingDeath = null;
      return;
    }
    const index = Number(choiceIndex);
    const result = pending.choices[index];
    if (!result || pending.resolved) return;
    pending.revealedIndex = index;
    pending.resolved = true;
    if (result === "survive") {
      hunter.deathDeck.push("death");
      this.log.add(`${hunter.name}从死亡牌堆抽到【存活】：活下来，并向牌堆加入1张死亡牌。`);
    } else {
      hunter.dead = true;
      hunter.ended = true;
      this.log.add(`${hunter.name}从死亡牌堆抽到【死亡】：猎人永久死亡，装备在原型中保留为记录。`);
    }
    this.state.pendingDeath = null;
    if (this.state.phase === "monster" && this.state.monsterActionResolved) this.finishMonsterAction();
  }

  partName(part) {
    return { head: "头", torso: "躯干", arms: "手臂", legs: "腿" }[part] || part;
  }

  prepareNextRound() {
    if (this.state.hunters.every((hunter) => this.isHunterDead(hunter))) {
      this.state.phase = "lost";
      this.log.add("全部猎人倒下，战斗失败。");
      return;
    }
    this.state.round += 1;
    if (!this.state.actionDeck.length) {
      this.state.actionDeck = this.deck.drawMany(this.data.monster.actionDeck, this.data.monster.actionDeck.length);
      this.log.add("怪物行动牌堆耗尽，重洗。");
    }
    this.state.currentAction = this.state.actionDeck.shift();
    this.state.monsterActionResolved = false;
    this.state.phase = "player";
    this.state.hunters.forEach((hunter) => this.startHunterRound(hunter));
    this.resolvePersistentParts();
    this.log.add(`第${this.state.round}轮前摇开始。公开行动【${this.state.currentAction.name}】，时点上限${this.state.currentAction.timeLimit}。`);
  }

  startHunterRound(hunter) {
    hunter.ended = false;
    hunter.usedWillActions = {};
    hunter.timeSpent = hunter.debt;
    hunter.overtime = false;
    ["move", "focus"].forEach((cardId) => {
      const card = this.getCard(hunter, cardId);
      if (card) card.faceUp = true;
    });
    if (hunter.dead) {
      hunter.ended = true;
      return;
    }
    if (hunter.debt > this.state.currentAction.timeLimit) {
      hunter.overtime = true;
      hunter.ended = true;
      this.log.add(`${hunter.name}进入超时：结转${hunter.debt}，高于本轮时点上限${this.state.currentAction.timeLimit}。`);
    } else {
      hunter.debt = 0;
    }
  }

  resolvePersistentParts() {
    this.state.monster.persistentParts.forEach((part) => {
      const target = this.deck.drawOneWeighted(this.state.hunters.filter((hunter) => !this.isHunterDead(hunter)));
      if (target) {
        this.applyDamage(target, "torso", 1);
        this.log.add(`持续部位【${part.name}】在回合开始造成1伤害。`);
      }
    });
  }

  isHunterDead(hunter) {
    return hunter.dead || Object.values(hunter.wounds).every((value) => value < 0);
  }
}

class PrototypeView {
  constructor(engine, root, onBackToConfig) {
    this.engine = engine;
    this.root = root;
    this.onBackToConfig = onBackToConfig || null;
    this.engine.log.add("原型载入：当前版本优先验证Boss战核心循环。");
    this.render();
  }

  bind(selector, event, handler) {
    this.root.querySelectorAll(selector).forEach((node) => node.addEventListener(event, handler));
  }

  render() {
    const state = this.engine.state;
    this.root.innerHTML = `
      <section class="topbar game-hud">
        <div class="brand-block">
          <span class="eyebrow">HUNTING IN DARKNESS</span>
          <h1>裂颅屠影讨伐战</h1>
        </div>
        <div class="round-status">
          <span class="round-number">${state.round}</span>
          <span><strong>${this.phaseText(state.phase)}</strong><small>${this.engine.geometry.mode === "hex" ? "六边形战场" : "四边形战场"} · 前摇上限 ${state.currentAction.timeLimit}</small></span>
        </div>
        <div class="hud-actions">
          ${this.onBackToConfig ? '<button data-command="back-config">配置</button>' : ""}
          <button class="btn-primary" data-command="end-player" ${state.phase !== "player" || state.pendingAttack || state.pendingDeath ? "disabled" : ""}>结束全队前摇</button>
          <button data-command="reset">重开</button>
        </div>
      </section>
      <section class="battle-layout">
        <aside class="column enemy-column">
          ${this.renderMonster()}
          ${this.renderTimeline()}
          ${this.renderMonsterControl()}
        </aside>
        <main class="column arena-column">
          ${this.renderBoard()}
          ${this.renderAttackPanel()}
          ${this.renderDeathPanel()}
        </main>
        <aside class="column party-column">
          ${this.renderHunters()}
          <details class="card utility-drawer">
            <summary>战斗记录与待澄清规则</summary>
            <section class="log">${state.logHtml || this.renderLog()}</section>
            ${this.renderQuestions()}
          </details>
        </aside>
      </section>
    `;
    this.attachEvents();
  }

  phaseText(phase) {
    return { player: "前摇应对", monster: "行动执行", recovery: "后摇间隙", won: "胜利", lost: "失败" }[phase] || phase;
  }

  renderTimeline() {
    const state = this.engine.state;
    const phaseRank = { player: 0, monster: 1, recovery: 2 }[state.phase] ?? 0;
    const previews = state.actionDeck.slice(0, Math.max(0, (this.engine.data.monster.actionSlots || 3) - 1));
    return `
      <section class="card timeline-card">
        <div class="section-heading">
          <span class="eyebrow">ACTION QUEUE</span>
          <h2>行动时序</h2>
        </div>
        <div class="phase-track">
          ${[
            ["player", "1", "前摇", "猎人投入时点"],
            ["monster", "2", "执行", "Boss结算行动"],
            ["recovery", "3", "后摇", "确认进入下一轮"]
          ].map(([phase, number, name, detail], index) => `
            <div class="phase-step ${state.phase === phase ? "active" : ""} ${phaseRank > index ? "done" : ""}">
              <span>${number}</span><div><strong>${name}</strong><small>${detail}</small></div>
            </div>
          `).join("")}
        </div>
        <div class="queue-preview">
          <div class="queue-card current"><span>当前</span><strong>${state.currentAction.name}</strong><small>${state.currentAction.timeLimit} 时点</small></div>
          ${previews.map((action, index) => `<div class="queue-card"><span>预判 ${index + 1}</span><strong>${action.name}</strong><small>${action.type}</small></div>`).join("")}
        </div>
      </section>
    `;
  }

  renderMonster() {
    const monster = this.engine.state.monster;
    const action = this.engine.state.currentAction;
    const buffSlotCount = monster.buffSlots || 6;
    return `
      <section class="card monster-sheet">
        <div class="section-heading"><span class="eyebrow">NEMESIS</span><h2>${monster.name}</h2></div>
        <div class="meter"><span style="width:${Math.max(0, (monster.hp / monster.maxHp) * 100)}%"></span></div>
        <div class="chips">
          <span class="chip danger">血量 ${monster.hp}/${monster.maxHp}</span>
          <span class="chip">韧性 ${monster.toughness}</span>
        </div>
        <div class="monster-card action-forecast">
          <span class="action-stage">${this.engine.state.phase === "recovery" ? "后摇" : (this.engine.state.phase === "monster" ? "执行" : "前摇")}</span>
          <h3>${action.name}</h3>
          <p class="action-meta">${action.type} · 前摇上限 ${action.timeLimit}</p>
          <p><strong>前摇征兆</strong> ${action.windup}</p>
          <p><strong>后摇表现</strong> ${action.after?.replace(/^后摇：/, "") || "无"}</p>
          <p>${action.effect || (action.attack ? `攻击：${action.attack.count}次 / 精准${action.attack.precision} / 伤害${action.attack.damage}` : "")}</p>
        </div>
        <div class="chips">
          ${monster.clock.map((on, index) => `<span class="chip ${on ? "warn" : ""}">时钟${index + 1} ${on ? "已翻" : "未翻"}</span>`).join("")}
        </div>
        <div class="buff-slots">
          <span class="subtle" style="margin-right:4px;">Buff:</span>
          ${Array.from({ length: buffSlotCount }, () => `
            <div class="buff-slot" title="空槽位——尚未赋予Boss Buff">
              <div class="buff-tooltip">空槽位</div>
            </div>
          `).join("")}
        </div>
        <div class="chips" style="margin-top:8px;">
          ${monster.persistentParts.length ? monster.persistentParts.map((part) => `<button data-target="part:${part.instanceId}">锁定${part.name}(${part.hp})</button>`).join("") : '<span class="chip ok">无持续部位</span>'}
          ${this.engine.state.objects.filter((object) => !object.destroyed).map((object) => `<button data-target="object:${object.id}">锁定${object.name}(${object.hp})</button>`).join("")}
          <button data-target="boss">锁定Boss本体</button>
        </div>
      </section>
    `;
  }

  renderMonsterControl() {
    const state = this.engine.state;
    if (state.phase === "recovery") {
      return `
        <section class="attack-panel recovery-panel">
          <span class="eyebrow">RECOVERY WINDOW</span>
          <h2>${state.currentAction.after || "后摇"}</h2>
          <p>本次行动已经结算。后摇不附加未定义的数值奖励；确认后翻开队列中的下一张行动卡。</p>
          <button class="btn-primary" data-command="advance-recovery">结束后摇 · 下一行动</button>
        </section>
      `;
    }
    if (state.phase !== "monster" || state.pendingDeath) return "";
    const action = state.currentAction;
    if (!action.attack) {
      return `
        <section class="attack-panel">
          <h2>怪物行动控制</h2>
          <p>执行【${action.name}】。</p>
          <button data-monster-execute="auto">执行行动</button>
        </section>
      `;
    }
    if (action.target === "cell") {
      const cells = this.engine.geometry.cells().map((position) =>
        `<button data-monster-cell="${position.x},${position.y}" style="${this.engine.geometry.cellStyle(position)}">${this.engine.geometry.positionLabel(position)}</button>`
      );
      return `
        <section class="attack-panel">
          <h2>怪物行动控制</h2>
          <p>【${action.name}】指定1个目标格，半径${action.areaRadius || 0}内猎人受攻击。</p>
          <div class="cell-picker ${this.engine.geometry.mode}">${cells.join("")}</div>
        </section>
      `;
    }
    if (action.target === "direction") {
      return `
        <section class="attack-panel">
          <h2>怪物行动控制</h2>
          <p>【${action.name}】选择一个方向，直线范围${action.range || "无限"}。</p>
          <div class="row">
            ${this.renderDirectionButtons("data-monster-direction")}
          </div>
        </section>
      `;
    }
    if (action.target === "hunter") {
      return `
        <section class="attack-panel">
          <h2>怪物行动控制</h2>
          <p>【${action.name}】直接指定一名猎人。</p>
          <div class="row">
            ${state.hunters.filter((hunter) => !hunter.dead).map((hunter) => `<button data-monster-hunter="${hunter.id}">${hunter.name}</button>`).join("")}
          </div>
        </section>
      `;
    }
    return `
      <section class="attack-panel">
        <h2>怪物行动控制</h2>
        <p>【${action.name}】自动选择目标：${action.target}。</p>
        <button data-monster-execute="auto">执行行动</button>
      </section>
    `;
  }

  renderBoard() {
    const cells = this.engine.geometry.cells().map((position) => {
        const terrain = this.engine.terrainAt(position);
        const bossHere = this.samePos(this.engine.state.monster.position, position);
        const hunters = this.engine.state.hunters.filter((hunter) => this.samePos(hunter.position, position));
        const object = this.engine.objectAt(position);
        return `
          <div class="cell ${terrain}" style="${this.engine.geometry.cellStyle(position)}" title="坐标 ${this.engine.geometry.positionLabel(position)}">
            ${terrain === "grass" ? '<span class="subtle">草</span>' : ""}
            ${terrain === "rock" ? '<span class="subtle">石</span>' : ""}
            ${object ? `<span class="unit object">${object.name[0]}${object.hp}</span>` : ""}
            ${bossHere ? `<span class="unit boss">Boss<span class="facing-arrow" style="--facing-angle:${this.engine.facingAngle(this.engine.state.monster.facing)}deg">▲</span></span>` : ""}
            ${hunters.map((hunter) => `<span class="unit hunter">${hunter.name[0]}<span class="facing-arrow" style="--facing-angle:${this.engine.facingAngle(hunter.facing)}deg">▲</span></span>`).join("")}
          </div>
        `;
      });
    const modeName = this.engine.geometry.mode === "hex" ? "六边形" : "四边形";
    return `<section class="card battlefield-card"><div class="section-heading"><span class="eyebrow">BATTLEFIELD</span><h2>战场 <small>${modeName}</small></h2></div><div class="board ${this.engine.geometry.mode}">${cells.join("")}</div></section>`;
  }

  renderDirectionButtons(attribute) {
    return this.engine.geometry.directions.map((direction) =>
      `<button ${attribute}="${direction.id}">${direction.arrow} ${direction.name}</button>`
    ).join("");
  }

  samePos(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  renderHunters() {
    return `
      <section class="card hunters-panel">
        <div class="section-heading"><span class="eyebrow">HUNTER PARTY</span><h2>猎人行动</h2></div>
        ${this.engine.state.hunters.map((hunter) => this.renderHunter(hunter)).join("")}
      </section>
    `;
  }

  renderHunter(hunter) {
    const selected = hunter.id === this.engine.state.selectedHunterId;
    const limit = this.engine.state.currentAction.timeLimit;
    const terrain = this.engine.terrainAt(hunter.position);
    const tempoLocked = this.engine.isTempoLeaderLocked(hunter);
    const canAct = this.engine.canHunterAct(hunter);
    return `
      <article class="hunter-card ${selected ? "selected" : ""} ${tempoLocked ? "tempo-locked" : ""}" data-hunter="${hunter.id}">
        <div class="hunter-header">
          <h3>${hunter.name}</h3>
          <div class="row">
            <span class="chip ${hunter.overtime ? "danger" : ""}">时点 ${hunter.timeSpent}/${limit}</span>
            ${hunter.debt ? `<span class="chip warn">结转 ${hunter.debt}</span>` : ""}
            ${hunter.ended ? '<span class="chip warn">已结束</span>' : ""}
            ${hunter.overtime ? '<span class="chip danger">超时</span>' : ""}
            ${hunter.dead ? '<span class="chip danger">死亡</span>' : ""}
            ${tempoLocked ? '<span class="chip tempo">等待队友追平</span>' : ""}
            <button data-select="${hunter.id}">${selected ? "已选择" : "选择"}</button>
            <button data-end-hunter="${hunter.id}" ${hunter.dead || hunter.ended || this.engine.state.phase !== "player" ? "disabled" : ""}>结束行动</button>
          </div>
        </div>
        ${tempoLocked ? '<div class="tempo-notice">当前时点投入最高。需要至少一名猎人的累计投入追平后才能继续行动。</div>' : ""}

        <div class="panel-section">
          <div class="panel-section-title">状态数据</div>
          <div class="status-row">
            <span>${this.terrainText(terrain, hunter)}</span>
            <span class="chip">意志 ${hunter.will}/${hunter.maxWill}</span>
            <span class="chip">武器 ${hunter.weapon.name} 速${hunter.weapon.speed} 威${hunter.weapon.power} 范${hunter.weapon.range}</span>
          </div>
          <div class="chips" style="margin-top:4px;">
            ${Object.entries(hunter.wounds).map(([part, hp]) => `<span class="chip ${hp <= 0 ? "danger" : ""}">${this.engine.partName(part)} ${hp}</span>`).join("")}
            <span class="chip">死亡牌堆 存活1/死亡${hunter.deathDeck.filter((card) => card === "death").length}</span>
            ${hunter.permanentInjuries.map((injury) => `<span class="chip danger">${injury}</span>`).join("")}
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-section-title">行动卡</div>
          <div class="card-sets">
            ${hunter.cards.map((card) => this.renderActionCardSet(hunter, card)).join("")}
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-section-title">思维区</div>
          ${this.renderTempResourceSlots(hunter)}
          <div class="panel-section-title mind-actions-title">意志行动</div>
          <div class="row">
            ${this.renderEncourageButtons(hunter)}
            <button data-will="endure" disabled>硬撑(待定)</button>
            <button data-will="sprint" data-will-source="${hunter.id}" ${!canAct || hunter.will <= 0 || hunter.usedWillActions.sprint ? "disabled" : ""}>冲刺</button>
            <button data-will="last" data-will-source="${hunter.id}" ${!canAct || hunter.will <= 0 || hunter.usedWillActions.last ? "disabled" : ""}>奋力一搏</button>
            <button data-temp-action="throwStone" data-temp-hunter="${hunter.id}" ${terrain !== "rock" || !canAct || hunter.ended || hunter.overtime || this.engine.state.pendingAttack || this.engine.state.pendingDeath ? "disabled" : ""}>投石</button>
          </div>
          ${this.renderHunterBuffSlots()}
        </div>
      </article>
    `;
  }

  renderHunterBuffSlots() {
    return `
      <div class="buff-slots" style="margin-top:6px;">
        <span class="subtle" style="margin-right:4px;">Buff:</span>
        ${Array.from({ length: 4 }, () => `
          <div class="buff-slot" title="空槽位——后续用于猎人Buff">
            <div class="buff-tooltip">空槽位</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  renderTempResourceSlots(hunter) {
    const slotCount = hunter.tempSlots || 6;
    return `
      <div class="temp-slots mind-zone">
        <span class="subtle mind-capacity">临时资源 ${hunter.tempResources.length}/${slotCount}</span>
        ${Array.from({ length: slotCount }, (_, i) => {
          const res = hunter.tempResources[i];
          if (res) {
            const isInspiration = res.type === "inspiration";
            const label = isInspiration ? res.count : (res.type === "momentum" ? "动" : (res.name[0] || "?"));
            return `
              <div class="temp-slot filled ${isInspiration ? `inspiration ${res.color}` : res.type}" title="${res.desc || ""}">
                <span class="temp-label">${label}</span>
                <div class="buff-tooltip">${res.name}${isInspiration ? ` ×${res.count}` : ""}: ${res.desc || ""}</div>
              </div>
            `;
          }
          return `
            <div class="temp-slot" title="空槽位">
              <div class="buff-tooltip">空槽位</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  renderEncourageButtons(hunter) {
    return this.engine.state.hunters
      .filter((target) => target.id !== hunter.id)
      .map((target) => {
        const disabled = !this.engine.canHunterAct(hunter) || hunter.will <= 0 || hunter.usedWillActions.encourage || target.dead;
        return `<button data-will="encourage" data-will-source="${hunter.id}" data-will-target="${target.id}" ${disabled ? "disabled" : ""}>鼓舞${target.name}</button>`;
      })
      .join("");
  }

  terrainText(terrain, hunter) {
    const position = this.engine.geometry.positionLabel(hunter.position);
    if (terrain === "grass") return `位置(${position}) · 草丛+1闪避`;
    if (terrain === "rock") return `位置(${position}) · 石块可投石`;
    return `位置(${position})`;
  }

  renderActionCardSet(hunter, card) {
    const isMove = card.id === "move";
    const isAttack = card.id === "attack";
    const needsInsp = isAttack || isMove || card.id === "arc-slash";
    const canUse = card.faceUp && this.engine.canHunterAct(hunter);
    const noInspiration = needsInsp && !["red", "blue", "yellow"].some((color) => this.engine.inspirationCount(hunter, color) > 0);
    const useDisabled = !canUse || noInspiration;
    const burstDisabled = !canUse;
    const recoverDisabled = card.faceUp || hunter.dead;
    const frontText = card.id === "turn"
      ? `转向${this.engine.geometry.mode === "hex" ? 60 : 90}度`
      : card.front;
    return `
      <div class="action-card-set ${card.faceUp ? "" : "flipped"}">
        <div class="action-card-header">
          <strong>${card.name}</strong>
          <span class="subtle">${card.faceUp ? `正面 · ${card.time}时点` : `背面 · ${card.back}`}</span>
        </div>
        <div class="action-card-desc">${card.faceUp ? `${card.cost} · ${frontText}` : `冷却中 · ${card.back}`}</div>
        <div class="action-card-desc">爆发：${card.burst}</div>
        <div class="action-card-ops">
          ${isMove ? `
            ${this.engine.geometry.directions.map((direction) => `
              <button data-move="${direction.id}" data-card-hunter="${hunter.id}" ${useDisabled ? "disabled" : ""}>${direction.arrow} ${direction.name}</button>
            `).join("")}
          ` : `
            <button data-card="${card.id}" data-card-hunter="${hunter.id}" ${useDisabled ? "disabled" : ""}>使用并翻面</button>
          `}
          <button data-burst="${card.id}" data-card-hunter="${hunter.id}" ${burstDisabled ? "disabled" : ""}>爆发</button>
          <button data-recover="${card.id}" data-card-hunter="${hunter.id}" ${recoverDisabled ? "disabled" : ""}>恢复到正面</button>
        </div>
      </div>
    `;
  }

  renderAttackPanel() {
    const pending = this.engine.state.pendingAttack;
    if (!pending) return "";
    const assigned = new Set(pending.assignments.filter((assignment) => assignment !== null));
    return `
      <section class="attack-panel">
        <h2>分配并结算部位</h2>
        <div class="row">
          ${pending.results.map((result, index) => `
            <button data-result-index="${index}" ${assigned.has(index) ? "disabled" : ""} class="${pending.selectedResultIndex === index ? "selected-token" : ""}">
              ${index + 1}. ${result === "success" ? "成功" : "失败"}
            </button>
          `).join("")}
          <button data-auto-assign="true">自动分配</button>
        </div>
        <div class="part-grid">
          ${pending.parts.map((part, index) => `
            <button class="part-card" data-assign-part="${index}" ${pending.assignments[index] !== null ? "disabled" : ""}>
              <strong>${index + 1}. ${part.name}</strong>
              ${this.renderAssignedResult(pending, index)}
              <p class="subtle">${part.text}</p>
            </button>
          `).join("")}
        </div>
        <div class="row">
          <button data-resolve="ltr" ${!this.engine.isPendingAttackFullyAssigned() ? "disabled" : ""}>从左到右结算</button>
          <button data-resolve="rtl" ${!this.engine.isPendingAttackFullyAssigned() ? "disabled" : ""}>从右到左结算</button>
        </div>
      </section>
    `;
  }

  renderAssignedResult(pending, partIndex) {
    const assignment = pending.assignments[partIndex];
    if (assignment === null) return '<div class="subtle">未分配结果</div>';
    const result = pending.results[assignment];
    return `<div class="${result === "success" ? "result-success" : "result-failure"}">已分配：${assignment + 1}. ${result === "success" ? "成功" : "失败"}</div>`;
  }

  renderDeathPanel() {
    const pending = this.engine.state.pendingDeath;
    if (!pending) return "";
    const hunter = this.engine.state.hunters.find((item) => item.id === pending.hunterId);
    if (!hunter) return "";
    const deathCount = hunter.deathDeck.filter((card) => card === "death").length;
    return `
      <section class="attack-panel">
        <h2>死亡判定</h2>
        <p>${hunter.name}的${this.engine.partName(pending.part)}触发致命伤。</p>
        <p class="subtle">当前死亡牌堆：1张存活 / ${deathCount}张死亡。选择1张翻开；抽到存活后会加入1张死亡牌。</p>
        <div class="death-choice-row">
          ${pending.choices.map((card, index) => `
            <button class="death-card-back" data-death-choice="${index}">
              ?
              <span class="subtle">第${index + 1}张</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  renderQuestions() {
    return `
      <section class="card">
        <h2>待澄清规则</h2>
        <ul class="clarify-list">
          ${this.engine.state.questions.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  renderLog() {
    return this.engine.log.entries.map((entry) => `<p>${entry}</p>`).join("");
  }

  attachEvents() {
    this.bind("[data-command='back-config']", "click", () => {
      if (this.onBackToConfig) this.onBackToConfig();
    });
    this.bind("[data-command='reset']", "click", () => {
      this.engine.reset();
      this.render();
    });
    this.bind("[data-command='end-player']", "click", () => {
      this.engine.endPlayerTurn();
      this.render();
    });
    this.bind("[data-command='advance-recovery']", "click", () => {
      this.engine.advanceFromRecovery();
      this.render();
    });
    this.bind("[data-monster-execute]", "click", () => {
      this.engine.executeMonsterTurn();
      this.render();
    });
    this.bind("[data-monster-cell]", "click", (event) => {
      const [x, y] = event.currentTarget.dataset.monsterCell.split(",").map((value) => Number(value));
      this.engine.executeMonsterTurn({ cell: { x, y } });
      this.render();
    });
    this.bind("[data-monster-direction]", "click", (event) => {
      this.engine.executeMonsterTurn({ direction: event.currentTarget.dataset.monsterDirection });
      this.render();
    });
    this.bind("[data-monster-hunter]", "click", (event) => {
      this.engine.executeMonsterTurn({ hunterId: event.currentTarget.dataset.monsterHunter });
      this.render();
    });
    this.bind("[data-select]", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.select);
      this.render();
    });
    this.bind("[data-hunter]", "click", (event) => {
      const button = event.target.closest("button");
      if (!button) this.engine.selectHunter(event.currentTarget.dataset.hunter);
    });
    this.bind("[data-card]", "click", (event) => {
      const cardId = event.currentTarget.dataset.card;
      const direction = cardId === "move" ? "right" : undefined;
      this.engine.selectHunter(event.currentTarget.dataset.cardHunter);
      this.engine.useCard(cardId, direction);
      this.render();
    });
    this.bind("[data-move]", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.cardHunter);
      this.engine.useCard("move", event.currentTarget.dataset.move);
      this.render();
    });
    this.bind("[data-burst]", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.cardHunter);
      this.engine.burst(event.currentTarget.dataset.burst);
      this.render();
    });
    this.bind("[data-recover]", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.cardHunter);
      this.engine.recover(event.currentTarget.dataset.recover);
      this.render();
    });
    this.bind("[data-will]", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.willSource);
      this.engine.useWill(event.currentTarget.dataset.will, event.currentTarget.dataset.willTarget);
      this.render();
    });
    this.bind("[data-temp-action='throwStone']", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.tempHunter);
      this.engine.throwStone(this.engine.selectedHunter);
      this.render();
    });
    this.bind("[data-end-hunter]", "click", (event) => {
      this.engine.selectHunter(event.currentTarget.dataset.endHunter);
      this.engine.endHunter();
      this.render();
    });
    this.bind("[data-resolve]", "click", (event) => {
      this.engine.resolvePendingAttack(event.currentTarget.dataset.resolve);
      this.render();
    });
    this.bind("[data-result-index]", "click", (event) => {
      this.engine.selectAttackResult(event.currentTarget.dataset.resultIndex);
      this.render();
    });
    this.bind("[data-assign-part]", "click", (event) => {
      this.engine.assignAttackResult(event.currentTarget.dataset.assignPart);
      this.render();
    });
    this.bind("[data-auto-assign]", "click", () => {
      this.engine.autoAssignAttackResults();
      this.render();
    });
    this.bind("[data-death-choice]", "click", (event) => {
      this.engine.resolveDeathDraw(event.currentTarget.dataset.deathChoice);
      this.render();
    });
    this.bind("[data-target]", "click", (event) => {
      this.engine.setAttackTarget(event.currentTarget.dataset.target);
      this.render();
    });
  }
}

const activeData = window.PROTOTYPE_DATA || DATA;

function startBattle(config) {
  const engine = new CombatEngine(activeData, config);
  const view = new PrototypeView(engine, document.getElementById("app"), () => {
    new ConfigView(activeData, document.getElementById("app"), startBattle);
  });
  window.combatPrototype = { DATA: activeData, engine, view, config };
}

new ConfigView(activeData, document.getElementById("app"), startBattle);
window.combatPrototype = { DATA: activeData };
