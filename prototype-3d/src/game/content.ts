import type { GameContent } from "./types";

export const CONTENT: GameContent = {
  radius: 3,
  actions: [
    { id: "attack", name: "攻击", time: 2, cost: "any", text: "以武器攻击 Boss 或持续部位", recovery: "支付任意灵感", burst: "获得 1 时点" },
    { id: "move", name: "移动", time: 2, cost: "any", text: "移动至相邻合法六边格", recovery: "回合开始恢复", burst: "获得 1 蓝色灵感" },
    { id: "turn", name: "转向", time: 1, cost: "none", text: "转向 60°", recovery: "任意卡翻面时恢复", burst: "获得 1 时点" },
    { id: "focus", name: "专注", time: 2, cost: "none", text: "投掷两枚三色物理骰", recovery: "回合开始恢复", burst: "获得 1 时点" },
    { id: "arc", name: "圆弧斩", time: 2, cost: "any", text: "攻击前方扇形内的 Boss", recovery: "支付 1 红 1 蓝", burst: "获得 1 时点", hunterOnly: "h1" }
  ],
  hunters: [
    { id: "h1", name: "刃手", strength: 3, agility: 2, will: 3, weapon: { name: "裂刃", speed: 2, power: 1, range: 1 }, position: { q: -1, r: 0 }, facing: 0, inspiration: ["red", "blue", "yellow"] },
    { id: "h2", name: "斥候", strength: 2, agility: 3, will: 3, weapon: { name: "短矛", speed: 1, power: 2, range: 2 }, position: { q: -2, r: 1 }, facing: 0, inspiration: ["blue", "yellow", "blue"] },
    { id: "h3", name: "守誓者", strength: 2, agility: 1, will: 4, weapon: { name: "重锤", speed: 1, power: 3, range: 1 }, position: { q: -1, r: -1 }, facing: 0, inspiration: ["red", "yellow", "red"], traits: ["强烈执念"] }
  ],
  monster: {
    id: "boss", name: "裂颅屠影", hp: 9, toughness: 3, position: { q: 2, r: 0 },
    actions: [
      { id: "maul", name: "撕裂逼近", timeLimit: 4, move: 2, target: "nearest", count: 2, precision: 2, damage: 1, range: 1, windup: "低伏身体，扑向最近的猎人", after: "爪刃砸入地面", fallback: "若无法接近，原地横扫" },
      { id: "howl", name: "黑嚎", timeLimit: 3, move: 1, target: "wounded", count: 1, precision: 3, damage: 1, range: 2, windup: "喉囊鼓起，锁定伤势最重者", after: "喉鸣逐渐平息", fallback: "没有合法目标时令所有猎人翻面一张行动卡", temporaryPart: "throat" },
      { id: "spines", name: "骨刺追猎", timeLimit: 3, move: 2, target: "nearest", count: 2, precision: 3, damage: 1, range: 2, windup: "骨刺朝最近者偏转", after: "骨刺缓慢收回", fallback: "骨刺落空" },
      { id: "pounce", name: "点名扑杀", timeLimit: 5, move: 3, target: "any", count: 2, precision: 2, damage: 2, range: 1, windup: "等待玩家指定猎物", after: "怪物陷入短暂后摇", fallback: "扑向最近猎人" }
    ],
    hitLocations: [
      { id: "skull", name: "颅骨裂缝", hp: 2, text: "摧毁：额外造成 1 伤害", onSuccess: "damage", onDestroyed: "extraDamage" },
      { id: "jaw", name: "咬合肌", hp: 1, text: "失败：反击攻击者", onSuccess: "damage", onFailure: "counter" },
      { id: "tail", name: "持续尾刃", hp: 2, text: "留场：每回合首次攻击其他部位失败时反伤", persistent: true, onSuccess: "damage" },
      { id: "scale", name: "层叠鳞甲", hp: 2, text: "若前一张成功，本卡失败时 Boss 获得防御提示", onSuccess: "damage", previousSuccessArmor: true },
      { id: "soft", name: "柔软腹腔", hp: 1, text: "成功：攻击者获得红色灵感", onSuccess: "red" },
      { id: "throat", name: "震颤喉囊", hp: 1, text: "临时部位；击破会削弱本次黑嚎", temporary: true, onSuccess: "weakenHowl" }
    ]
  },
  terrain: [
    { q: 0, r: -2, type: "grass" }, { q: -2, r: 0, type: "grass" }, { q: 1, r: 1, type: "grass" },
    { q: 0, r: 1, type: "rock" }, { q: 1, r: -1, type: "rock" }
  ],
  objects: [{ id: "bone-pillar", name: "枯骨柱", q: 0, r: 0, hp: 2, passable: false }]
};
