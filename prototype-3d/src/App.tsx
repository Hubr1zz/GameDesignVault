import { useCallback, useEffect, useRef, useState } from "react";
import BattleScene from "./components/BattleScene";
import { CONTENT } from "./game/content";
import { BattleEngine } from "./game/engine";
import { hexDistance, sameHex } from "./game/geometry";
import type { BattleCommand, BattleState, HexPosition } from "./game/types";
import { clampTuningValue, DEFAULT_SCENE_TUNING, SCENE_TUNING_FIELDS, type SceneTuning } from "./presentation/tuning";

declare global {
  interface Window {
    __HID3D__?: {
      dispatch: (command: BattleCommand) => void;
      engine: BattleEngine;
      refresh: () => void;
    };
  }
}

const COLOR_META = {
  red: { icon: "◆", label: "红·残暴" },
  blue: { icon: "●", label: "蓝·精湛" },
  yellow: { icon: "▲", label: "黄·速度" }
} as const;
const PART_NAMES = { head: "头部", torso: "躯干", arms: "手臂", legs: "腿部" } as const;

function phaseName(phase: BattleState["phase"]) {
  return { player: "猎人前摇", monster: "操控 Boss", recovery: "Boss 后摇", won: "决战胜利", lost: "决战失败" }[phase];
}

function tutorialHint(state: BattleState) {
  if (!state.tutorial) return "随机重玩模式：牌堆顺序每场变化。";
  if (state.pendingFocus) return "观察物理骰子：结果只由停稳后实际朝上的颜色决定。";
  if (state.pendingMove) return "移动等待确认：点击战场上亮起的相邻六边格；确认后才支付灵感并翻面。";
  if (state.pendingTurn) return "转向等待确认：点击角色周围六个方向箭头之一。";
  if (state.pendingOverflow) return "思维区只有 4 格：替换一张旧灵感，或丢弃新灵感。";
  if (state.pendingAttack) return "先把结果卡逐一分配给部位，再拖动部位卡改变结算顺序。";
  if (state.pendingBody) return "攻击已命中，但受伤部位尚未知晓。选择一张背面部位卡。";
  if (state.pendingDeath) return "致命伤打断后续攻击。观察牌堆构成，再选择一张命运牌。";
  if (state.phase === "monster") return "红色幽灵是合规落点。偏离移动或原目标会永久增加命运值。";
  if (state.phase === "recovery") return "确认后摇后翻开下一张 Boss 行动卡，时点上限随之刷新。";
  if (state.phase === "player" && state.round === 1) return "点击猎人进入头部切面；选择【专注】后按空格，让物理骰子制造灵感。";
  return "观察 Boss 意图，安排猎人行动顺序，并留意每人的时点与行动卡恢复。";
}

export default function App() {
  const engineRef = useRef(new BattleEngine({ tutorial: true }));
  const [state, setState] = useState(engineRef.current.snapshot());
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [selectedActionCardId, setSelectedActionCardId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<number | null>(null);
  const [attackTarget, setAttackTarget] = useState("boss");
  const [showLog, setShowLog] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tuning, setTuning] = useState<SceneTuning>(DEFAULT_SCENE_TUNING);
  const [muted, setMuted] = useState(false);
  const [fast, setFast] = useState(false);
  const [unsupported] = useState(() => {
    try { return !document.createElement("canvas").getContext("webgl2"); } catch { return true; }
  });

  const dispatch = useCallback((command: BattleCommand) => {
    const result = engineRef.current.dispatch(command);
    setState(result.state);
    if (!muted && result.events.some((event) => event.type === "impact")) playImpact();
    if (!muted) result.events.filter((event) => event.type === "sound").forEach((event) => playCue(event.cue));
  }, [muted]);

  const reset = (tutorial: boolean) => {
    engineRef.current = new BattleEngine({ tutorial, seed: tutorial ? 20260805 : Date.now() });
    if (window.__HID3D__) window.__HID3D__.engine = engineRef.current;
    setState(engineRef.current.snapshot());
    setWorkspaceOpen(false);
    setSelectedActionCardId(null);
    setSelectedResult(null);
    setAttackTarget("boss");
  };

  useEffect(() => {
    if (!new URLSearchParams(location.search).has("debug")) return;
    window.__HID3D__ = {
      dispatch,
      engine: engineRef.current,
      refresh: () => setState(engineRef.current.snapshot())
    };
    return () => { delete window.__HID3D__; };
  }, [dispatch, state.round]);

  const selectedHunter = state.hunters.find((hunter) => hunter.id === state.selectedHunterId)!;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.repeat) return;
      if (event.key === "Escape") {
        setWorkspaceOpen(false);
        setSelectedActionCardId(null);
        setShowHelp(false);
        setShowLog(false);
        setShowSettings(false);
        if (state.pendingMove || state.pendingTurn) dispatch({ type: "cancelActionChoice" });
        return;
      }
      if (event.code !== "Space" || !workspaceOpen || !selectedActionCardId) return;
      event.preventDefault();
      const card = selectedHunter.cards.find((item) => item.id === selectedActionCardId);
      if (!card) return;
      if (card.faceUp) useAction(card.id);
      else dispatch({ type: "recover", cardId: card.id });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, selectedActionCardId, selectedHunter, state.pendingMove, state.pendingTurn, workspaceOpen]);

  const previousWorkspaceOpen = useRef(false);
  useEffect(() => {
    if (!muted && previousWorkspaceOpen.current !== workspaceOpen) playCue(workspaceOpen ? "headspaceOpen" : "headspaceClose");
    previousWorkspaceOpen.current = workspaceOpen;
  }, [muted, workspaceOpen]);

  const originalTarget = engineRef.current.getOriginalTarget();
  const compliant = engineRef.current.getCompliantEndpoint();
  const allAssigned = state.pendingAttack?.assignments.every((value) => value !== null);

  const onCell = (position: HexPosition) => {
    if (state.pendingMove) {
      dispatch({ type: "useAction", cardId: "move", position });
      setWorkspaceOpen(false);
    } else if (state.phase === "monster") dispatch({ type: "setBossEndpoint", position });
    else setWorkspaceOpen(false);
  };

  const useAction = (cardId: string) => {
    const card = selectedHunter.cards.find((item) => item.id === cardId);
    const hasValidPayment = Boolean(card?.storedMind.some((mind) => !mind.locked));
    dispatch({ type: "useAction", cardId, target: attackTarget });
    if (card?.cost === "any" && !hasValidPayment) return;
    if (cardId === "move" || cardId === "turn" || cardId === "focus") {
      setWorkspaceOpen(false);
      setSelectedActionCardId(null);
    }
  };

  const useWill = (action: "encourage" | "sprint" | "struggle") => {
    if (action === "encourage") {
      const target = state.hunters.find((hunter) => hunter.id !== selectedHunter.id && !hunter.dead);
      if (target) dispatch({ type: "will", action, targetId: target.id });
      return;
    }
    dispatch({ type: "will", action });
  };

  const assignToPart = (partIndex: number) => {
    if (selectedResult === null) return;
    dispatch({ type: "assignResult", resultIndex: selectedResult, partIndex });
    setSelectedResult(null);
  };

  if (unsupported) return <main className="unsupported"><h1>无法启动 3D 决战</h1><p>当前浏览器或显卡没有提供 WebGL 2。请使用最新版 Chrome、Edge 或 Firefox，并启用硬件加速。</p></main>;

  return <main className={`game-shell ${fast ? "fast" : ""}`}>
    <header className="topbar">
      <div className="brand"><span className="eyebrow">HUNTING IN DARKNESS</span><strong>裂颅屠影 · 决战纵切片</strong></div>
      <div className="round-state"><span>ROUND</span><b>{String(state.round).padStart(2, "0")}</b><em>{phaseName(state.phase)} · {state.currentAction.name}</em></div>
      <div className="top-actions">
        <button onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>配置</button>
        <button onClick={() => setFast((value) => !value)} aria-pressed={fast}>{fast ? "正常动画" : "动画加速"}</button>
        <button onClick={() => setMuted((value) => !value)} aria-pressed={muted}>{muted ? "开启声音" : "静音"}</button>
        <button onClick={() => setShowHelp(true)}>规则</button>
        <button onClick={() => reset(state.tutorial)}>重开</button>
      </div>
    </header>

    {showSettings && <TuningPanel tuning={tuning} onChange={setTuning} onClose={() => setShowSettings(false)} />}

    <section className="tutorial-strip"><span>{state.tutorial ? "首局引导" : "随机模式"}</span><p>{tutorialHint(state)}</p></section>

    <section className={`battle-stage ${workspaceOpen ? "workspace-active" : ""}`}>
      <BattleScene
        state={state}
        content={CONTENT}
        workspaceOpen={workspaceOpen}
        tuning={tuning}
        legalBossCells={engineRef.current.getLegalBossEndpoints()}
        onHunter={(id) => { if (state.pendingFocus) return; dispatch({ type: "selectHunter", hunterId: id }); setSelectedActionCardId(null); setWorkspaceOpen(true); }}
        onDeselect={() => { setWorkspaceOpen(false); setSelectedActionCardId(null); }}
        onCell={onCell}
        selectedActionCardId={selectedActionCardId}
        onSelectAction={(card) => setSelectedActionCardId((current) => current === card.id ? null : card.id)}
        onStoreMind={(mindId, cardId) => dispatch({ type: "storeMind", mindId, cardId })}
        onUnstowMind={(mindId, cardId) => dispatch({ type: "unstowMind", mindId, cardId })}
        onActionBurst={(cardId) => dispatch({ type: "burst", cardId })}
        onWill={useWill}
        onConfirmTurn={(facing) => dispatch({ type: "confirmTurn", facing })}
        onDiceComplete={(colors) => dispatch({ type: "resolveFocus", colors })}
        onDiceImpact={() => { if (!muted) playImpact(); }}
      />
      <div className="battle-vignette" />
      <aside className="boss-panel">
        <div className="boss-hp"><div><span>裂颅屠影</span><b>{state.monster.hp}/{state.monster.maxHp}</b></div><i style={{ width: `${Math.max(0, state.monster.hp / state.monster.maxHp * 100)}%` }} /></div>
        <div className="boss-stats"><span>韧性 {state.monster.toughness}</span><span>距离 {hexDistance(selectedHunter.position, state.monster.position)}</span></div>
        <div className="persistent-row">
          {state.monster.persistentParts.length ? state.monster.persistentParts.map((part) => <button key={part.instanceId} className={attackTarget === `part:${part.instanceId}` ? "active" : ""} onClick={() => setAttackTarget(`part:${part.instanceId}`)}>持续·{part.name} {part.currentHp}/{part.hp}</button>) : <small>暂无持续部位</small>}
          <button className={attackTarget === "boss" ? "active" : ""} onClick={() => setAttackTarget("boss")}>Boss 本体</button>
        </div>
      </aside>

      <aside className="party-rail">
        {state.hunters.map((hunter) => <button key={hunter.id} className={`party-card ${hunter.id === state.selectedHunterId ? "selected" : ""} ${hunter.dead ? "dead" : ""}`} onClick={() => { dispatch({ type: "selectHunter", hunterId: hunter.id }); setSelectedActionCardId(null); setWorkspaceOpen(true); }}>
          <span className="hunter-index">{hunter.id.slice(1)}</span><div><strong>{hunter.name}</strong><small>{hunter.weapon.name} · 力{hunter.strength} 敏{hunter.agility}</small></div>
          <div className="tempo"><b>{hunter.timeSpent}</b>/{state.currentAction.timeLimit}{hunter.overtime && <em>超时</em>}</div>
          <div className="fate" title="本场不产生即时效果；将影响未来事件">命运 {hunter.fate}</div>
        </button>)}
      </aside>

      <button className={`camera-toggle ${workspaceOpen ? "active" : ""}`} onClick={() => { setWorkspaceOpen((value) => !value); setSelectedActionCardId(null); }}>{workspaceOpen ? "退出头脑卡桌 · Esc" : "聚焦当前猎人头脑"}</button>
      {(state.pendingMove || state.pendingTurn) && <div className="action-choice-banner"><strong>{state.pendingMove ? "选择移动目的地" : "选择朝向"}</strong><span>{state.pendingMove ? "点击亮起的相邻格" : "点击角色周围的方向箭头"}</span><button onClick={() => dispatch({ type: "cancelActionChoice" })}>取消选择 · Esc</button></div>}
      {state.pendingFocus && <div className="scene-input-lock" aria-live="polite"><span>物理骰子结算中 · 镜头已锁定</span></div>}
    </section>

    <section className="hunter-console">
      <div className="hunter-sheet">
        <div className="hunter-title"><div><span>当前猎人</span><h2>{selectedHunter.name}</h2></div><div className="resource-pills"><span>意志 {selectedHunter.will}/{selectedHunter.maxWill}</span><span>命运 {selectedHunter.fate}</span></div></div>
        <div className="body-track">{Object.entries(selectedHunter.wounds).map(([part, hp]) => <div key={part} className={hp <= 0 ? "critical" : ""}><span>{PART_NAMES[part as keyof typeof PART_NAMES]}</span><b>{hp}</b><i style={{ width: `${Math.max(0, hp) / (part === "head" ? 2 : 3) * 100}%` }} /></div>)}</div>
        <div className="status-line">{selectedHunter.statuses.concat(selectedHunter.permanentInjuries).map((status) => <span key={status}>{status}</span>)}{!selectedHunter.statuses.length && !selectedHunter.permanentInjuries.length && <small>状态区为空</small>}</div>
      </div>
      <div className="console-message"><span className="panel-kicker">3D HEADSPACE</span><strong>灵感装填到实体行动卡</strong><small>{workspaceOpen ? selectedActionCardId ? "行动卡已选中：按 SPACE 请求使用或恢复。" : "拖动方形灵感到行动卡，再点击行动卡选择。" : "点击战场中的猎人或右侧猎人条目进入。"}</small></div>
    </section>

    <footer className="footer-bar"><button onClick={() => setShowLog((value) => !value)}>规则日志 {showLog ? "收起" : "展开"}</button><div className="turn-controls">
      {state.phase === "player" && <button className="primary" disabled={Boolean(state.pendingMove || state.pendingTurn || state.pendingAttack || state.pendingOverflow || state.pendingFocus || state.pendingBody || state.pendingDeath)} onClick={() => dispatch({ type: "endPlayerTurn" })}>结束全队前摇</button>}
      {state.phase === "recovery" && <button className="primary" onClick={() => dispatch({ type: "advanceRound" })}>确认后摇 · 下一轮</button>}
    </div></footer>

    {showLog && <aside className="log-drawer"><header><strong>规则事件日志</strong><button onClick={() => setShowLog(false)}>关闭</button></header>{state.log.map((entry, index) => <p key={`${entry}-${index}`}><span>{String(state.log.length - index).padStart(2, "0")}</span>{entry}</p>)}</aside>}

    {state.phase === "monster" && <section className="monster-controls floating-panel"><span className="panel-kicker">操控 Boss</span><h2>遵守，还是扭曲命运？</h2><div className="rule-preview"><div><span>合规落点</span><b>[{compliant.q}, {compliant.r}]</b></div><div><span>原索敌目标</span><b>{originalTarget?.name ?? "无"}</b></div></div><p>点击战场亮起格选择终点；点击猎人选择攻击目标。偏离会在执行前明确结算。</p><div className="target-buttons">{state.hunters.filter((h) => !h.dead).map((hunter) => <button key={hunter.id} className={state.bossPlan.targetId === hunter.id ? "active" : ""} onClick={() => dispatch({ type: "setBossTarget", hunterId: hunter.id })}>{hunter.name}{originalTarget?.id === hunter.id ? " · 规则目标" : ""}</button>)}</div><div className="deviation-preview"><span className={state.bossPlan.endpoint && !sameHex(state.bossPlan.endpoint, compliant) ? "danger" : "safe"}>移动：{state.bossPlan.endpoint && !sameHex(state.bossPlan.endpoint, compliant) ? "偏移 · 全员命运+1" : "合规"}</span><span className={state.bossPlan.targetId !== originalTarget?.id ? "danger" : "safe"}>索敌：{state.bossPlan.targetId !== originalTarget?.id ? `${originalTarget?.name}命运+1` : "合规"}</span></div><button className="primary" onClick={() => dispatch({ type: "executeBoss" })}>确认并执行 Boss 行动</button></section>}

    {state.pendingOverflow && <OverflowModal state={state} dispatch={dispatch} />}
    {state.pendingAttack && <AttackModal state={state} selectedResult={selectedResult} setSelectedResult={setSelectedResult} assignToPart={assignToPart} dispatch={dispatch} canResolve={Boolean(allAssigned)} />}
    {state.pendingBody && <BodyModal state={state} dispatch={dispatch} />}
    {state.pendingDeath && <DeathModal state={state} dispatch={dispatch} />}
    {(state.phase === "won" || state.phase === "lost") && <EndModal state={state} onReplay={() => reset(false)} onTutorial={() => reset(true)} />}
    {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
  </main>;
}

function TuningPanel({ tuning, onChange, onClose }: { tuning: SceneTuning; onChange: (value: SceneTuning) => void; onClose: () => void }) {
  const update = (key: keyof SceneTuning, rawValue: number) => {
    const field = SCENE_TUNING_FIELDS.find((item) => item.key === key)!;
    onChange({ ...tuning, [key]: clampTuningValue(field, rawValue) });
  };
  return <aside className="tuning-panel">
    <header><div><span className="panel-kicker">PRESENTATION CONFIG</span><h2>场景表现配置</h2></div><button onClick={onClose}>关闭</button></header>
    <div className="tuning-grid">{SCENE_TUNING_FIELDS.map((field) => <label key={field.key}>
      <span><strong>{field.label}</strong><small>{field.description}</small></span>
      <input type="range" min={field.min} max={field.max} step={field.step} value={tuning[field.key]} onChange={(event) => update(field.key, Number(event.target.value))} />
      <span className="tuning-number"><input type="number" min={field.min} max={field.max} step={field.step} value={tuning[field.key]} onChange={(event) => update(field.key, Number(event.target.value))} /><em>{field.unit}</em></span>
    </label>)}</div>
    <footer><small>配置只影响 3D 表现，不改变战斗规则。后续参数可继续加入此列表。</small><button onClick={() => onChange({ ...DEFAULT_SCENE_TUNING })}>恢复默认</button></footer>
  </aside>;
}

function OverflowModal({ state, dispatch }: { state: BattleState; dispatch: (command: BattleCommand) => void }) {
  const pending = state.pendingOverflow!;
  const hunter = state.hunters.find((item) => item.id === pending.hunterId)!;
  const incoming = pending.incoming[0];
  return <div className="modal-backdrop"><section className="decision-modal"><span className="panel-kicker">思维区满载</span><h2>新的灵感没有位置</h2><div className={`incoming-card ${incoming.color}`}>{COLOR_META[incoming.color].icon}<strong>{COLOR_META[incoming.color].label}</strong></div><p>选择一张可替换的旧灵感，或丢弃新卡。每张卡独占一格。</p><div className="replace-grid">{hunter.mind.map((card) => <button key={card.id} disabled={card.locked} className={card.color} onClick={() => dispatch({ type: "resolveOverflow", replaceId: card.id })}>替换 {COLOR_META[card.color].label}</button>)}</div><button className="subtle" onClick={() => dispatch({ type: "resolveOverflow" })}>丢弃新灵感</button></section></div>;
}

function AttackModal({ state, selectedResult, setSelectedResult, assignToPart, dispatch, canResolve }: { state: BattleState; selectedResult: number | null; setSelectedResult: (value: number | null) => void; assignToPart: (index: number) => void; dispatch: (command: BattleCommand) => void; canResolve: boolean }) {
  const pending = state.pendingAttack!;
  const used = new Set(pending.assignments.filter((value): value is number => value !== null));
  return <div className="modal-backdrop attack-backdrop"><section className="attack-modal"><div className="modal-title"><div><span className="panel-kicker">攻击结算</span><h2>分配结果，重排部位</h2></div><small>拖动卡牌改变从左到右的结算顺序</small></div><div className="result-cards">{pending.results.map((result, index) => <button key={index} disabled={used.has(index)} className={`${result} ${selectedResult === index ? "selected" : ""}`} onClick={() => setSelectedResult(index)}><b>{result === "success" ? "成功" : "失败"}</b><small>结果 {index + 1}</small></button>)}</div><div className="part-cards">{pending.parts.map((part, index) => {
    const assigned = pending.assignments[index];
    const result = assigned === null ? null : pending.results[assigned];
    const previous = index > 0 && pending.assignments[index - 1] !== null ? pending.results[pending.assignments[index - 1]!] : null;
    return <article key={part.instanceId} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dispatch({ type: "reorderPart", from: Number(event.dataTransfer.getData("text/plain")), to: index })} onClick={() => assignToPart(index)} className={result ?? ""}><span>{String(index + 1).padStart(2, "0")}</span><h3>{part.name}</h3><p>{part.text}</p><div className="part-meta"><small>耐久 {part.currentHp}</small>{part.persistent && <small>持续</small>}{part.temporary && <small>临时</small>}</div><div className="assignment">{result ? `已分配：${result === "success" ? "成功" : "失败"}` : selectedResult !== null ? "点击分配所选结果" : "等待结果卡"}</div>{part.previousSuccessArmor && previous === "success" && <em>顺序预览：前一张成功，本卡失败将触发收紧防御</em>}</article>;
  })}</div><button className="primary" disabled={!canResolve} onClick={() => dispatch({ type: "resolveAttack" })}>从左至右锁定结算</button></section></div>;
}

function BodyModal({ state, dispatch }: { state: BattleState; dispatch: (command: BattleCommand) => void }) {
  const pending = state.pendingBody!;
  const hunter = state.hunters.find((item) => item.id === pending.hunterId)!;
  return <div className="modal-backdrop"><section className="decision-modal wide"><span className="panel-kicker">受击部位抽取</span><h2>{hunter.name}受到【{pending.source}】命中</h2><p>四张卡背完全一致。选择一张翻开，随后进行该部位的护甲阻挡判定。</p><div className="hidden-cards">{pending.choices.map((_, index) => <button key={index} onClick={() => dispatch({ type: "chooseBody", index })}><span>HIT</span><b>?</b><small>选择部位</small></button>)}</div></section></div>;
}

function DeathModal({ state, dispatch }: { state: BattleState; dispatch: (command: BattleCommand) => void }) {
  const pending = state.pendingDeath!;
  const hunter = state.hunters.find((item) => item.id === pending.hunterId)!;
  const counts = pending.choices.reduce<Record<string, number>>((map, card) => { map[card.type] = (map[card.type] ?? 0) + 1; return map; }, {});
  return <div className="modal-backdrop death-backdrop"><section className="decision-modal wide"><span className="panel-kicker">致命伤 · {PART_NAMES[pending.part]}</span><h2>{hunter.name}的死亡牌堆</h2><div className="deck-composition"><span>存活 {counts.survive ?? 0}</span><span>生存卡 {counts.survival ?? 0}</span><span>死亡 {counts.death ?? 0}</span></div><div className="death-preview">{pending.choices.map((card, index) => <span key={`${card.id}-${index}`}>{card.name}</span>)}</div><p>上方是洗牌前公开的牌堆内容。现在所有卡已翻为相同卡背并洗混，选择一张面对命运。</p><div className="death-cards">{pending.choices.map((_, index) => <button key={index} onClick={() => dispatch({ type: "chooseDeath", index })}><span>HOPE</span><b>✦</b><small>翻开</small></button>)}</div></section></div>;
}

function EndModal({ state, onReplay, onTutorial }: { state: BattleState; onReplay: () => void; onTutorial: () => void }) {
  return <div className="modal-backdrop end-backdrop"><section className="end-modal"><span className="panel-kicker">战斗报告</span><h1>{state.phase === "won" ? "黑暗退去了一步" : "他们失去了希望"}</h1><p>历经 {state.round} 轮 · Boss 剩余 {Math.max(0, state.monster.hp)} 生命</p><div className="end-hunters">{state.hunters.map((hunter) => <article key={hunter.id}><strong>{hunter.name}</strong><span>{hunter.dead ? "永久死亡" : "存活"}</span><small>命运 {hunter.fate} · 永久损伤 {hunter.permanentInjuries.length}</small></article>)}</div><div className="summary-list">{state.summary.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</div><div className="end-actions"><button className="primary" onClick={onReplay}>随机重玩</button><button onClick={onTutorial}>重置首局教学</button></div></section></div>;
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop"><section className="help-modal"><header><div><span className="panel-kicker">规则说明</span><h2>这是一场桌面式 3D 决战</h2></div><button onClick={onClose}>关闭</button></header><div className="help-grid"><article><h3>时点与行动卡</h3><p>行动累积时点。点击行动卡选中，再按空格请求使用；结算后卡牌只在原位实体翻转 180°。移动和转向确认目标后才扣费、耗时并翻面。</p></article><article><h3>思维区与骰子</h3><p>红、蓝、黄灵感以方形卡独占一格。把灵感拖到行动卡上装填，右上角图标显示储量；点击图标可退回。专注骰会在角色身边落入战场。</p></article><article><h3>Boss 与命运</h3><p>Boss 意图以其身旁实体牌展示。玩家亲自操控 Boss；偏离合规移动会令全员命运 +1，偏离索敌会令原目标命运 +1。</p></article><article><h3>部位与死亡</h3><p>攻击结果分配给部位后按顺序结算。持续部位会留场。猎人致命伤时从公开构成、背面一致的死亡牌堆中选牌。</p></article><article className="assumption"><h3>原型假设：护甲</h3><p>设计文档尚未固定护甲结算位置。本原型在受击部位确定后，以该部位护甲与 Boss 精准构建阻挡/穿透临时牌堆。</p></article><article><h3>镜头与配置</h3><p>右键旋转，中键平移，滚轮缩放。顶部“配置”可实时调整脑桌仰角、相机观察仰角、大小与距离。</p></article></div></section></div>;
}

function playImpact() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(92, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(38, context.currentTime + 0.13);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.17);
  } catch { /* Audio feedback is optional. */ }
}

function playCue(cue: "cardPlace" | "cardFlip" | "headspaceOpen" | "headspaceClose") {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = cue === "cardFlip" ? "square" : "sine";
    const start = cue === "headspaceOpen" ? 108 : cue === "headspaceClose" ? 170 : cue === "cardPlace" ? 320 : 220;
    const end = cue === "headspaceOpen" ? 190 : cue === "headspaceClose" ? 92 : cue === "cardPlace" ? 210 : 410;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + 0.11);
    gain.gain.setValueAtTime(cue.startsWith("headspace") ? 0.045 : 0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  } catch { /* Audio feedback is optional. */ }
}
