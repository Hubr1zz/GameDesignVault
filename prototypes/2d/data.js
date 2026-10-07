"use strict";

window.PROTOTYPE_DATA = {
  board: { width: 6, height: 6 },
  weaponPool: [
    { name: "裂刃", speed: 2, power: 1, range: 1 },
    { name: "短矛", speed: 1, power: 2, range: 2 },
    { name: "重锤", speed: 1, power: 3, range: 1 },
    { name: "猎刀", speed: 3, power: 1, range: 1 },
    { name: "长弓", speed: 1, power: 1, range: 3 }
  ],
  terrain: [
    { x: 0, y: 1, type: "grass" },
    { x: 1, y: 4, type: "grass" },
    { x: 4, y: 0, type: "grass" },
    { x: 2, y: 2, type: "rock" },
    { x: 4, y: 3, type: "rock" }
  ],
  objects: [
    {
      id: "bone-pillar",
      name: "枯骨柱",
      type: "destructible",
      position: { x: 2, y: 3 },
      overlap: false,
      passable: false,
      hp: 2,
      hitEffect: "撞击或攻击时耐久-1",
      destroyedEffect: "摧毁后移出战场，攻击者获得1黄色灵感"
    }
  ],
  hunters: [
    {
      id: "h1",
      name: "刃手",
      strength: 3,
      agility: 2,
      will: 3,
      inspiration: { red: 1, blue: 1, yellow: 1 },
      weapon: { name: "裂刃", speed: 2, power: 1, range: 1 },
      defaultWeaponIndex: 0,
      position: { x: 3, y: 2 },
      facing: "right",
      tempSlots: 6
    },
    {
      id: "h2",
      name: "斥候",
      strength: 2,
      agility: 3,
      will: 3,
      inspiration: { red: 0, blue: 2, yellow: 1 },
      weapon: { name: "短矛", speed: 1, power: 2, range: 2 },
      defaultWeaponIndex: 1,
      position: { x: 0, y: 4 },
      facing: "right",
      tempSlots: 6
    },
    {
      id: "h3",
      name: "守誓者",
      strength: 2,
      agility: 1,
      will: 4,
      inspiration: { red: 1, blue: 0, yellow: 2 },
      weapon: { name: "重锤", speed: 1, power: 3, range: 1 },
      defaultWeaponIndex: 2,
      position: { x: 1, y: 0 },
      facing: "right",
      tempSlots: 6
    }
  ],
  actionCards: [
    {
      id: "attack",
      name: "攻击",
      time: 2,
      cost: "任意灵感",
      front: "用武器攻击Boss或持续部位",
      back: "恢复：支付任意灵感",
      burst: "获得1时点"
    },
    {
      id: "move",
      name: "移动",
      time: 2,
      cost: "任意灵感",
      front: "移动1格，草丛+1闪避，石块可投石",
      back: "角色回合开始时恢复",
      burst: "获得1蓝色灵感"
    },
    {
      id: "turn",
      name: "转向",
      time: 1,
      cost: "无",
      front: "转向90度；原型中作为低耗时动作",
      back: "翻转任意卡时恢复",
      burst: "获得1时点"
    },
    {
      id: "focus",
      name: "专注",
      time: 2,
      cost: "无",
      front: "掷两枚三色骰，获得对应颜色的战斗灵感",
      back: "角色回合开始时恢复",
      burst: "获得1时点"
    },
    {
      id: "arc-slash",
      name: "圆弧斩",
      time: 2,
      cost: "任意灵感",
      front: "攻击前方、前左、前右3格中若有Boss，触发攻击",
      back: "恢复：1红1蓝",
      burst: "获得1时点",
      hunterOnly: "h1"
    }
  ],
  monster: {
    name: "裂颅屠影",
    hp: 12,
    toughness: 3,
    position: { x: 4, y: 2 },
    facing: "left",
    buffSlots: 6,
    actionSlots: 3,
    traits: ["时钟槽：每次怪物行动推进1格，满3格触发大招"],
    actionDeck: [
      {
        id: "maul",
        name: "撕裂横扫",
        type: "attack",
        timeLimit: 4,
        windup: "低身蓄力",
        after: "后摇：下轮玩家可观察到较高时点",
        target: "nearest",
        attack: { count: 2, precision: 2, damage: 1 }
      },
      {
        id: "stalk",
        name: "压迫逼近",
        type: "skill",
        timeLimit: 3,
        windup: "锁定伤势最重者",
        after: "后摇：无",
        effect: "攻击伤势最重的猎人1次",
        target: "wounded",
        attack: { count: 1, precision: 3, damage: 1 }
      },
      {
        id: "hide",
        name: "甲壳收束",
        type: "defense",
        timeLimit: 5,
        windup: "收紧外壳",
        after: "后摇：玩家有较长行动窗口",
        effect: "Boss进入防御姿态，无攻击动作"
      },
      {
        id: "guard",
        name: "骨盾拱起",
        type: "defense",
        timeLimit: 4,
        windup: "骨盾挡在创口前",
        after: "后摇：Boss凝神观察",
        effect: "Boss进入防御姿态，无攻击动作"
      },
      {
        id: "rupture",
        name: "裂地冲击",
        type: "attack",
        timeLimit: 4,
        windup: "抬爪锁定一块地面",
        after: "后摇：地面震荡结束后进入常规节奏",
        target: "cell",
        areaRadius: 1,
        attack: { count: 1, precision: 2, damage: 1 }
      },
      {
        id: "spine-line",
        name: "骨刺直线",
        type: "attack",
        timeLimit: 3,
        windup: "背脊骨刺指向一个方向",
        after: "后摇：直线攻击后无额外效果",
        target: "direction",
        range: 4,
        attack: { count: 1, precision: 3, damage: 1 }
      },
      {
        id: "marked-pounce",
        name: "点名扑杀",
        type: "attack",
        timeLimit: 4,
        windup: "Boss盯住一名猎人",
        after: "后摇：扑杀后进入常规节奏",
        target: "hunter",
        attack: { count: 2, precision: 2, damage: 1 }
      },
      {
        id: "focus",
        name: "凝神捕猎",
        type: "skill",
        timeLimit: 3,
        windup: "盯住猎人的节奏破绽",
        after: "后摇：Boss观察猎人行动",
        effect: "Boss观察破绽，无攻击动作"
      },
      {
        id: "howl",
        name: "黑嚎",
        type: "skill",
        timeLimit: 2,
        windup: "喉囊震动",
        after: "后摇：极短",
        effect: "所有猎人压力上升：随机翻面一张正面行动卡",
        howl: true
      }
    ],
    hitLocations: [
      {
        id: "skull",
        name: "颅骨裂缝",
        hp: 2,
        text: "成功：Boss -1血。摧毁：额外-1血。",
        onSuccess: "damage",
        onDestroyed: "extraDamage"
      },
      {
        id: "jaw",
        name: "咬合肌",
        hp: 1,
        text: "失败：反击攻击者1次。成功：Boss -1血。",
        onSuccess: "damage",
        onFailure: "counter"
      },
      {
        id: "horn",
        name: "时钟角",
        hp: 1,
        text: "成功：Boss -1血，并拨回一个时钟槽。",
        onSuccess: "damageAndClock"
      },
      {
        id: "tail",
        name: "持续尾刃",
        hp: 2,
        persistent: true,
        text: "抽出后留场：每回合开始随机猎人受1伤。击破后移出。",
        onSuccess: "damage"
      },
      {
        id: "scale",
        name: "层叠鳞甲",
        hp: 2,
        text: "如果前一部位命中，本部位失败会让Boss获得1护甲Buff。",
        onSuccess: "damage",
        stackedFailure: "armor"
      },
      {
        id: "soft",
        name: "柔软腹腔",
        hp: 1,
        text: "成功：Boss -1血，猎人获得1红色灵感。",
        onSuccess: "damageAndRed"
      }
    ]
  }
};
