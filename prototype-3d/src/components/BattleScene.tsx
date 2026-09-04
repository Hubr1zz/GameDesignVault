import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { axialToWorld, cells, facingToWorldAngle, HEX_DIRECTIONS, hexDistance, sameHex } from "../game/geometry";
import type { ActionCardState, BattleState, Color, GameContent, HexPosition } from "../game/types";
import { getHeadspaceCameraBasis } from "../presentation/headspaceTransform";
import type { SceneTuning } from "../presentation/tuning";

const WorldDiceRoll = lazy(() => import("./DiceTray"));

type WillAction = "encourage" | "sprint" | "struggle";

interface Props {
  state: BattleState;
  content: GameContent;
  workspaceOpen: boolean;
  tuning: SceneTuning;
  onHunter: (id: string) => void;
  onDeselect: () => void;
  onCell: (position: HexPosition) => void;
  selectedActionCardId: string | null;
  onSelectAction: (card: ActionCardState) => void;
  onStoreMind: (mindId: string, cardId: string) => void;
  onUnstowMind: (mindId: string, cardId: string) => void;
  onActionBurst: (cardId: string) => void;
  onWill: (action: WillAction) => void;
  onConfirmTurn: (facing: number) => void;
  onDiceComplete: (colors: Color[]) => void;
  onDiceImpact: () => void;
  legalBossCells: HexPosition[];
}

const COLOR_META: Record<Color, { icon: string; label: string; color: string }> = {
  red: { icon: "◆", label: "红·残暴", color: "#a84442" },
  blue: { icon: "●", label: "蓝·精湛", color: "#357ba5" },
  yellow: { icon: "▲", label: "黄·速度", color: "#b9872d" }
};

const HEADSPACE_CENTER_Y = 1.05;

function CameraDirector({ state, workspaceOpen, tuning, controlsRef }: Pick<Props, "state" | "workspaceOpen" | "tuning"> & { controlsRef: RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const mode: "battle" | "headspace" | "dice" = state.pendingFocus ? "dice" : workspaceOpen ? "headspace" : "battle";
  const previousMode = useRef<typeof mode>("battle");
  const modeRef = useRef(mode);
  const hasSavedBattleView = useRef(false);
  const savedPosition = useRef(new THREE.Vector3(8, 11, 10));
  const savedTarget = useRef(new THREE.Vector3());
  const savedUp = useRef(camera.up.clone());
  const desiredPosition = useRef(camera.position.clone());
  const desiredTarget = useRef(new THREE.Vector3());
  const desiredUp = useRef(camera.up.clone());
  const animating = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    modeRef.current = mode;
    if (mode !== "battle") {
      controls.minDistance = 0.45;
      if (previousMode.current === "battle" && !hasSavedBattleView.current) {
        savedPosition.current.copy(camera.position);
        savedTarget.current.copy(controls.target);
        savedUp.current.copy(camera.up);
        hasSavedBattleView.current = true;
      }
      const focusHunterId = mode === "dice" ? state.pendingFocus : state.selectedHunterId;
      const hunter = state.hunters.find((item) => item.id === focusHunterId);
      if (hunter) {
        const [x, , z] = axialToWorld(hunter.position);
        if (mode === "headspace") {
          const cameraBasis = getHeadspaceCameraBasis(hunter.facing, tuning.cameraPitchDeg);
          desiredTarget.current.set(x, 0.2 + HEADSPACE_CENTER_Y, z);
          desiredPosition.current.copy(desiredTarget.current).addScaledVector(cameraBasis.direction, tuning.headspaceCameraDistance);
          desiredUp.current.copy(cameraBasis.up);
        } else {
          desiredTarget.current.set(x + 0.55, 0.58, z + 0.1);
          desiredPosition.current.copy(desiredTarget.current).add(new THREE.Vector3(3.2, 3.5, 4.2));
          desiredUp.current.set(0, 1, 0);
        }
        animating.current = true;
      }
    } else if (previousMode.current !== "battle") {
      controls.minDistance = 0.45;
      desiredPosition.current.copy(savedPosition.current);
      desiredTarget.current.copy(savedTarget.current);
      desiredUp.current.copy(savedUp.current);
      animating.current = true;
    } else {
      controls.minDistance = 5;
    }
    previousMode.current = mode;
  }, [camera, controlsRef, mode, state.hunters, state.pendingFocus, state.selectedHunterId, tuning.cameraPitchDeg, tuning.headspaceCameraDistance]);

  useFrame((_, delta) => {
    if (!animating.current || !controlsRef.current) return;
    const factor = 1 - Math.exp(-delta * 7.5);
    camera.position.lerp(desiredPosition.current, factor);
    camera.up.lerp(desiredUp.current, factor).normalize();
    controlsRef.current.target.lerp(desiredTarget.current, factor);
    controlsRef.current.update();
    if (camera.position.distanceToSquared(desiredPosition.current) < 0.0008 && controlsRef.current.target.distanceToSquared(desiredTarget.current) < 0.0008) {
      camera.position.copy(desiredPosition.current);
      camera.up.copy(desiredUp.current);
      controlsRef.current.target.copy(desiredTarget.current);
      controlsRef.current.update();
      animating.current = false;
      if (modeRef.current === "battle") {
        controlsRef.current.minDistance = 5;
        hasSavedBattleView.current = false;
      }
    }
  });
  return null;
}

function HexTile({ position, type, highlighted, ghost, onClick }: { position: HexPosition; type?: string; highlighted: boolean; ghost: boolean; onClick: () => void }) {
  const [x, , z] = axialToWorld(position);
  const color = highlighted ? "#d8a74e" : type === "grass" ? "#2d4939" : type === "rock" ? "#45423b" : "#20272a";
  return <group position={[x, 0, z]}>
    <mesh onClick={(event) => { event.stopPropagation(); onClick(); }} receiveShadow>
      <cylinderGeometry args={[1.08, 1.08, 0.14, 6]} />
      <meshStandardMaterial color={color} emissive={highlighted ? "#6b4312" : "#000000"} roughness={0.78} />
    </mesh>
    {ghost && <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.8, 6]} /><meshBasicMaterial color="#d3544b" transparent opacity={0.75} side={THREE.DoubleSide} /></mesh>}
  </group>;
}

interface WorldCardProps {
  id: string;
  position: [number, number, number];
  size?: [number, number];
  color: string;
  selected?: boolean;
  disabled?: boolean;
  back?: boolean;
  className?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

function WorldCard({ id, position, size = [0.66, 0.96], color, selected, disabled, back, className = "", onPrimary, onSecondary, draggable, onDragStart, onDrop, children }: WorldCardProps) {
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!cardRef.current) return;
    cardRef.current.rotation.x = THREE.MathUtils.damp(cardRef.current.rotation.x, back ? Math.PI : 0, 10, delta);
  });
  useEffect(() => {
    if (!hovered || disabled) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = previous; };
  }, [disabled, hovered]);
  const primary = () => { if (!disabled) onPrimary?.(); };
  const secondary = () => { if (!disabled) onSecondary?.(); };
  return <group ref={cardRef} position={position}>
    <mesh castShadow onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)} onClick={(event) => { event.stopPropagation(); primary(); }} onContextMenu={(event) => { event.stopPropagation(); secondary(); }}>
      <boxGeometry args={[size[0], 0.055, size[1]]} />
      <meshStandardMaterial color={back ? "#171c20" : color} roughness={0.52} metalness={0.08} emissive={selected || hovered ? color : "#000000"} emissiveIntensity={selected ? 0.62 : hovered ? 0.25 : 0} />
    </mesh>
    <Html transform position={[0, back ? -0.034 : 0.034, 0]} rotation={back ? [Math.PI / 2, 0, Math.PI] : [-Math.PI / 2, 0, 0]} scale={0.23} zIndexRange={[9, 1]}>
      <button
        type="button"
        data-world-card-id={id}
        className={`world-card-face ${className} ${selected ? "selected" : ""} ${back ? "back" : ""}`}
        disabled={disabled}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDrop ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } : undefined}
        onDrop={onDrop}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); primary(); }}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); secondary(); }}
      >{children}</button>
    </Html>
  </group>;
}

function ZoneLabel({ position, title, note }: { position: [number, number, number]; title: string; note: string }) {
  return <Html transform center position={position} rotation={[-Math.PI / 2, 0, 0]} scale={0.25} zIndexRange={[8, 1]}><div className="world-zone-label"><strong>{title}</strong><span>{note}</span></div></Html>;
}

function HeadWorkspace({ state, hunter, tuning, selectedActionCardId, onSelectAction, onStoreMind, onUnstowMind, onActionBurst, onWill }: Pick<Props, "state" | "tuning" | "selectedActionCardId" | "onSelectAction" | "onStoreMind" | "onUnstowMind" | "onActionBurst" | "onWill"> & { hunter: BattleState["hunters"][number] }) {
  const mindPositions: Array<[number, number, number]> = [[-2.35, 0.12, -0.61], [-1.62, 0.12, -0.61], [-2.35, 0.12, 0.39], [-1.62, 0.12, 0.39]];
  const actionPositions: Array<[number, number, number]> = [[-0.82, 0.12, -0.11], [-0.1, 0.12, -0.11], [0.62, 0.12, -0.11], [1.34, 0.12, -0.11], [2.06, 0.12, -0.11]];
  const willCards: Array<{ id: string; name: string; note: string; action?: WillAction }> = [
    { id: "will-encourage", name: "鼓舞", note: "援助队友", action: "encourage" },
    { id: "will-sprint", name: "冲刺", note: "迅速接敌", action: "sprint" },
    { id: "will-struggle", name: "奋力一搏", note: "强行行动", action: "struggle" },
    { id: "will-endure", name: "硬撑", note: "规则未定义" }
  ];
  return <group position={[0, HEADSPACE_CENTER_Y, 0]} rotation={[0, facingToWorldAngle(hunter.facing), 0]} scale={tuning.headspaceScale}>
    <group rotation={[THREE.MathUtils.degToRad(tuning.headspaceTiltDeg), 0, 0]}>
      <mesh receiveShadow><boxGeometry args={[6.15, 0.1, 2.9]} /><meshStandardMaterial color="#151a1d" roughness={0.82} metalness={0.08} /></mesh>
      <mesh position={[0, 0.06, 1.1]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.37, 28]} /><meshStandardMaterial color="#1a1414" emissive="#89511e" emissiveIntensity={0.42} /></mesh>
      <ZoneLabel position={[-1.98, 0.07, -1.25]} title="思维区" note={`${hunter.mind.length}/4 · 拖到行动卡装填`} />
      <ZoneLabel position={[0.62, 0.07, -0.81]} title="行动区" note="选中后按空格请求使用" />
      <ZoneLabel position={[2.62, 0.07, -1.25]} title="意志行动区" note={`${hunter.will}/${hunter.maxWill} 意志`} />
      {mindPositions.map((position, index) => {
        const card = hunter.mind[index];
        if (!card) return <group key={`empty-${index}`} position={position}><mesh><boxGeometry args={[0.5, 0.025, 0.5]} /><meshStandardMaterial color="#0e1113" wireframe /></mesh><Html transform center position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.23}><span className="world-empty mind-empty">空槽</span></Html></group>;
        const meta = COLOR_META[card.color];
        return <WorldCard key={card.id} id={`mind-${card.id}`} position={position} size={[0.5, 0.5]} color={meta.color} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-hid-mind", card.id); }} className={`mind ${card.color}`}><b className="world-card-icon">{meta.icon}</b><strong>{meta.label}</strong><small>拖动装填</small></WorldCard>;
      })}
      {hunter.cards.map((card, index) => <WorldCard key={card.id} id={card.id} position={actionPositions[index] ?? [0, 0.12, 0]} color={card.faceUp ? "#755731" : "#22282c"} back={!card.faceUp} selected={selectedActionCardId === card.id} disabled={hunter.dead || state.phase !== "player"} onPrimary={() => onSelectAction(card)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const mindId = event.dataTransfer.getData("application/x-hid-mind"); if (mindId) onStoreMind(mindId, card.id); }} onSecondary={card.faceUp ? () => onActionBurst(card.id) : undefined} className="action">
        <span className="world-card-kicker">{card.time} 时点</span><strong>{card.name}</strong><p>{card.faceUp ? card.text : card.recovery}</p><small>{selectedActionCardId === card.id ? "已选择 · SPACE 确认" : card.faceUp ? (card.cost === "any" ? "拖入灵感 · 点击选择" : "点击选择 · 无费用") : "点击选择以恢复"}</small>
        {card.storedMind.length > 0 && <span className="stored-mind" aria-label={`已储存 ${card.storedMind.length} 枚灵感`}>{Array.from(new Set(card.storedMind.map((mind) => mind.color))).map((color) => { const matches = card.storedMind.filter((mind) => mind.color === color); const mind = matches.at(-1)!; return <span key={color} role="button" title="点击退回思维区" className={color} onClick={(event) => { event.stopPropagation(); onUnstowMind(mind.id, card.id); }}>{COLOR_META[color].icon}{matches.length > 1 && <b>{matches.length}</b>}</span>; })}</span>}
      </WorldCard>)}
      {willCards.map((card, index) => <WorldCard key={card.id} id={card.id} position={[2.66, 0.12, -0.81 + index * 0.54]} size={[0.7, 0.44]} color="#51416c" disabled={!card.action || hunter.dead || state.phase !== "player" || hunter.usedWill.includes(card.action)} onPrimary={() => card.action && onWill(card.action)} className="will"><strong>{card.name}</strong><small>{card.note}{card.action && hunter.usedWill.includes(card.action) ? " · 已使用" : ""}</small></WorldCard>)}
    </group>
  </group>;
}

function HunterFigure({ state, hunter, selected, workspaceOpen, tuning, onClick, selectedActionCardId, onSelectAction, onStoreMind, onUnstowMind, onActionBurst, onWill }: { state: BattleState; hunter: BattleState["hunters"][number]; selected: boolean; workspaceOpen: boolean; onClick: () => void } & Pick<Props, "tuning" | "selectedActionCardId" | "onSelectAction" | "onStoreMind" | "onUnstowMind" | "onActionBurst" | "onWill">) {
  const [x, , z] = axialToWorld(hunter.position);
  const injury = Math.min(1, Object.values(hunter.wounds).filter((value) => value <= 0).length * 0.28);
  const figureRef = useRef<THREE.Group>(null);
  const capRef = useRef<THREE.Group>(null);
  const workspaceRef = useRef<THREE.Group>(null);
  const reveal = useRef(0);
  useFrame((_, delta) => {
    if (!figureRef.current) return;
    figureRef.current.position.x = THREE.MathUtils.damp(figureRef.current.position.x, x, 9, delta);
    figureRef.current.position.z = THREE.MathUtils.damp(figureRef.current.position.z, z, 9, delta);
    reveal.current = THREE.MathUtils.damp(reveal.current, selected && workspaceOpen ? 1 : 0, 9, delta);
    if (capRef.current) {
      capRef.current.rotation.x = -1.18 * reveal.current;
      capRef.current.position.y = 1.18 + reveal.current * 0.06;
    }
    if (workspaceRef.current) {
      workspaceRef.current.visible = reveal.current > 0.015;
      workspaceRef.current.scale.setScalar(Math.max(0.001, reveal.current));
      workspaceRef.current.position.y = (1 - reveal.current) * -0.16;
    }
  });
  return <group ref={figureRef} position={[x, 0.2, z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
    <mesh castShadow position={[0, 0.55, 0]}><cylinderGeometry args={[0.32, 0.46, 0.9, 8]} /><meshStandardMaterial color={hunter.dead ? "#35383a" : selected ? "#4fa2c8" : "#356b86"} roughness={0.62} /></mesh>
    <mesh castShadow position={[0, 1.18, 0]}><sphereGeometry args={[0.32, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /><meshStandardMaterial color="#c9aa8f" emissive={injury ? "#5a0e0e" : "#000"} emissiveIntensity={injury} /></mesh>
    <mesh position={[0, 1.185, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.305, 24]} /><meshStandardMaterial color="#371a17" emissive="#a66a31" emissiveIntensity={reveal.current * 0.8} /></mesh>
    <group ref={capRef} position={[0, 1.18, -0.28]}>
      <mesh castShadow position={[0, 0, 0.28]}><sphereGeometry args={[0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#c9aa8f" emissive={injury ? "#5a0e0e" : "#000"} emissiveIntensity={injury} /></mesh>
    </group>
    <group rotation={[0, facingToWorldAngle(hunter.facing), 0]}>
      <mesh castShadow position={[0, 0.12, 0.43]}><boxGeometry args={[0.09, 0.07, 0.52]} /><meshStandardMaterial color="#f2c56e" emissive="#8a5716" emissiveIntensity={0.65} /></mesh>
      <mesh castShadow position={[0, 0.12, 0.78]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.17, 0.34, 4]} /><meshStandardMaterial color="#ffe09a" emissive="#a76918" emissiveIntensity={0.85} /></mesh>
      <mesh position={[0, 0.66, 0.4]}><boxGeometry args={[0.18, 0.16, 0.04]} /><meshStandardMaterial color="#f1c36b" emissive="#74440e" emissiveIntensity={0.55} /></mesh>
    </group>
    {selected && workspaceOpen && <group ref={workspaceRef}><HeadWorkspace state={state} hunter={hunter} tuning={tuning} selectedActionCardId={selectedActionCardId} onSelectAction={onSelectAction} onStoreMind={onStoreMind} onUnstowMind={onUnstowMind} onActionBurst={onActionBurst} onWill={onWill} /></group>}
    {hunter.fate > 0 && Array.from({ length: Math.min(5, hunter.fate) }, (_, index) => {
      const angle = (index / Math.max(1, hunter.fate)) * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * 0.55, 1.35 + index * 0.04, Math.sin(angle) * 0.55]}><octahedronGeometry args={[0.08]} /><meshBasicMaterial color="#b66cff" /></mesh>;
    })}
    {!workspaceOpen && <Html center position={[0, 1.75, 0]} distanceFactor={10} zIndexRange={[5, 0]}><div className={`unit-label ${selected ? "selected" : ""}`}>{hunter.name}{hunter.dead ? " · 已死亡" : ""}</div></Html>}
  </group>;
}

function FacingPicker({ hunter, onConfirm }: { hunter: BattleState["hunters"][number]; onConfirm: (facing: number) => void }) {
  const [x, , z] = axialToWorld(hunter.position);
  return <group>
    {HEX_DIRECTIONS.map((direction, index) => {
      const [tx, , tz] = axialToWorld({ q: hunter.position.q + direction.q, r: hunter.position.r + direction.r });
      const vector = new THREE.Vector2(tx - x, tz - z).normalize().multiplyScalar(0.88);
      const angle = Math.atan2(vector.y, vector.x);
      return <group key={index} position={[x + vector.x, 0.27, z + vector.y]}>
        <mesh rotation={[-Math.PI / 2, 0, angle - Math.PI / 2]} onClick={(event) => { event.stopPropagation(); if (hunter.facing !== index) onConfirm(index); }}>
          <circleGeometry args={[0.31, 3]} />
          <meshStandardMaterial color={hunter.facing === index ? "#e8b85f" : "#4f9dc2"} emissive={hunter.facing === index ? "#845719" : "#174963"} emissiveIntensity={0.7} side={THREE.DoubleSide} />
        </mesh>
        <Html center position={[0, 0.18, 0]} distanceFactor={9} zIndexRange={[7, 1]}><button className="facing-choice" disabled={hunter.facing === index} onClick={(event) => { event.stopPropagation(); onConfirm(index); }}>方向 {index + 1}{hunter.facing === index ? " · 当前" : ""}</button></Html>
      </group>;
    })}
  </group>;
}

function MonsterFigure({ state, workspaceOpen }: { state: BattleState; workspaceOpen: boolean }) {
  const [x, , z] = axialToWorld(state.monster.position);
  const ghost = state.phase === "monster" ? state.bossPlan.endpoint : null;
  const ghostWorld = ghost ? axialToWorld(ghost) : null;
  return <>
    <group position={[x, 0.28, z]}>
      <mesh castShadow position={[0, 0.65, 0]}><dodecahedronGeometry args={[0.86]} /><meshStandardMaterial color="#7e2f2b" roughness={0.72} emissive="#250605" emissiveIntensity={0.5} /></mesh>
      <mesh castShadow position={[0.65, 0.65, 0]} rotation={[0, 0, -0.45]}><coneGeometry args={[0.18, 0.9, 6]} /><meshStandardMaterial color="#d8cbb0" /></mesh>
      <mesh castShadow position={[-0.65, 0.65, 0]} rotation={[0, 0, 0.45]}><coneGeometry args={[0.18, 0.9, 6]} /><meshStandardMaterial color="#d8cbb0" /></mesh>
      {!workspaceOpen && <group position={[1.35, 0.16, 0]} rotation={[0, -0.35, 0]}>
        <mesh castShadow><boxGeometry args={[0.92, 0.05, 1.25]} /><meshStandardMaterial color="#5e2824" roughness={0.64} emissive="#210706" emissiveIntensity={0.35} /></mesh>
        <Html transform position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.28} zIndexRange={[6, 1]}><article className="boss-intent-card"><span>BOSS 意图</span><strong>{state.currentAction.name}</strong><p>{state.currentAction.windup}</p><small>时点 {state.currentAction.timeLimit} · 移动 {state.currentAction.move} · 攻击 {state.currentAction.count}×{state.currentAction.damage}</small>{state.monster.temporaryPartActive && <em>临时部位：震颤喉囊</em>}</article></Html>
      </group>}
      {!workspaceOpen && <Html center position={[0, 1.8, 0]} distanceFactor={10} zIndexRange={[5, 0]}><div className="unit-label boss-label">裂颅屠影 · {state.monster.hp}/{state.monster.maxHp}</div></Html>}
    </group>
    {ghostWorld && !sameHex(ghost!, state.monster.position) && <><Line points={[[x, 0.22, z], [ghostWorld[0], 0.22, ghostWorld[2]]]} color="#d4564c" lineWidth={2} dashed dashSize={0.18} gapSize={0.12} /><group position={[ghostWorld[0], 0.28, ghostWorld[2]]}><mesh><dodecahedronGeometry args={[0.86]} /><meshStandardMaterial color="#dc5e50" transparent opacity={0.25} wireframe /></mesh></group></>}
  </>;
}

function Scene(props: Props) {
  const { state, content, workspaceOpen, tuning, onHunter, onCell, legalBossCells, selectedActionCardId, onSelectAction, onStoreMind, onUnstowMind, onActionBurst, onWill, onConfirmTurn, onDiceComplete, onDiceImpact } = props;
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const terrain = (position: HexPosition) => content.terrain.find((cell) => sameHex(cell, position))?.type;
  const selected = state.hunters.find((hunter) => hunter.id === state.selectedHunterId)!;
  return <>
    <color attach="background" args={["#080b0d"]} />
    <fog attach="fog" args={["#080b0d", 13, 27]} />
    <ambientLight intensity={0.8} />
    <directionalLight position={[5, 11, 5]} intensity={2.2} color="#ffe1ae" castShadow />
    <pointLight position={[-7, 5, -4]} intensity={20} color="#365c82" />
    <CameraDirector state={state} workspaceOpen={workspaceOpen} tuning={tuning} controlsRef={controlsRef} />
    <OrbitControls ref={controlsRef} makeDefault enabled={!workspaceOpen && !state.pendingFocus} minDistance={0.45} maxDistance={22} mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }} />
    <group>
      {cells(content.radius).map((position) => {
        const occupied = state.hunters.some((hunter) => !hunter.dead && hunter.id !== selected.id && sameHex(hunter.position, position)) || sameHex(state.monster.position, position);
        const canMove = state.pendingMove && hexDistance(selected.position, position) === 1 && !occupied;
        const canBoss = state.phase === "monster" && legalBossCells.some((candidate) => sameHex(candidate, position));
        return <HexTile key={`${position.q},${position.r}`} position={position} type={terrain(position)} highlighted={canMove || canBoss} ghost={Boolean(state.phase === "monster" && state.bossPlan.endpoint && sameHex(state.bossPlan.endpoint, position))} onClick={() => onCell(position)} />;
      })}
      {content.terrain.filter((tile) => tile.type === "grass").map((tile) => {
        const [x, , z] = axialToWorld(tile);
        return <group key={`grass-${tile.q}-${tile.r}`} position={[x, 0.16, z]}>{[-0.4, -0.15, 0.2, 0.44].map((dx) => <mesh key={dx} position={[dx, 0.2, 0]} rotation={[0, 0, dx]}><coneGeometry args={[0.08, 0.55, 5]} /><meshStandardMaterial color="#497459" /></mesh>)}</group>;
      })}
      {state.objects.filter((object) => object.hp > 0).map((object) => {
        const [x, , z] = axialToWorld(object);
        return <group key={object.id} position={[x, 0.2, z]}><mesh castShadow position={[0, 0.55, 0]}><cylinderGeometry args={[0.25, 0.45, 1.2, 7]} /><meshStandardMaterial color="#82735d" /></mesh>{!workspaceOpen && <Html center position={[0, 1.35, 0]} distanceFactor={12} zIndexRange={[5, 0]}><div className="object-label">{object.name} {object.hp}</div></Html>}</group>;
      })}
      {state.hunters.map((hunter) => <HunterFigure key={hunter.id} state={state} hunter={hunter} selected={hunter.id === state.selectedHunterId} workspaceOpen={workspaceOpen} tuning={tuning} onClick={() => onHunter(hunter.id)} selectedActionCardId={selectedActionCardId} onSelectAction={onSelectAction} onStoreMind={onStoreMind} onUnstowMind={onUnstowMind} onActionBurst={onActionBurst} onWill={onWill} />)}
      <MonsterFigure state={state} workspaceOpen={workspaceOpen} />
      {state.pendingTurn && <FacingPicker hunter={state.hunters.find((hunter) => hunter.id === state.pendingTurn)!} onConfirm={onConfirmTurn} />}
      {state.pendingFocus && (() => {
        const hunter = state.hunters.find((item) => item.id === state.pendingFocus)!;
        const [x, , z] = axialToWorld(hunter.position);
        return <Suspense fallback={null}><WorldDiceRoll origin={[x + 1.1, z + 0.35]} onComplete={onDiceComplete} onImpact={onDiceImpact} /></Suspense>;
      })()}
    </group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow><circleGeometry args={[13, 64]} /><meshStandardMaterial color="#111416" roughness={0.95} /></mesh>
  </>;
}

export default function BattleScene(props: Props) {
  return <Canvas shadows camera={{ position: [8, 11, 10], fov: 43, near: 0.03, far: 100 }} dpr={[1, 1.6]} gl={{ antialias: true }} onPointerMissed={() => { if (!props.state.pendingFocus) props.onDeselect(); }}>
    <Scene {...props} />
  </Canvas>;
}
