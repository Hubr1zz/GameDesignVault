import { Html } from "@react-three/drei";
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Color } from "../game/types";

const FACE_COLORS: Color[] = ["red", "red", "blue", "blue", "yellow", "yellow"];
const MATERIALS = ["#b83b3d", "#b83b3d", "#3f79bd", "#3f79bd", "#d9aa38", "#d9aa38"];
const COLOR_NAMES: Record<Color, string> = { red: "红", blue: "蓝", yellow: "黄" };
const LOCAL_NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
];

function upwardColor(body: RapierRigidBody): Color {
  const rotation = body.rotation();
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  let best = 0;
  let bestY = -Infinity;
  LOCAL_NORMALS.forEach((normal, index) => {
    const y = normal.clone().applyQuaternion(quaternion).y;
    if (y > bestY) { bestY = y; best = index; }
  });
  return FACE_COLORS[best];
}

function Die({ index, origin, onResult, onImpact }: { index: number; origin: [number, number]; onResult: (index: number, color: Color) => void; onImpact: () => void }) {
  const body = useRef<RapierRigidBody>(null);
  const reported = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = body.current;
      if (!current) return;
      current.setLinvel({ x: index ? -1.25 : 1.1, y: 4.8, z: (Math.random() - 0.5) * 1.8 }, true);
      current.setAngvel({ x: 9 + Math.random() * 8, y: 11 + Math.random() * 8, z: 8 + Math.random() * 8 }, true);
    }, 120 + index * 70);
    return () => window.clearTimeout(timer);
  }, [index]);
  return <RigidBody
    ref={body}
    colliders="cuboid"
    canSleep
    restitution={0.58}
    friction={0.76}
    linearDamping={0.36}
    angularDamping={0.42}
    position={[origin[0] + (index ? 0.36 : -0.36), 2.35 + index * 0.22, origin[1]]}
    onCollisionEnter={onImpact}
    onSleep={() => {
      if (!body.current || reported.current) return;
      reported.current = true;
      onResult(index, upwardColor(body.current));
    }}
  >
    <mesh castShadow>
      <boxGeometry args={[0.48, 0.48, 0.48]} />
      {MATERIALS.map((color, materialIndex) => <meshStandardMaterial key={materialIndex} attach={`material-${materialIndex}`} color={color} roughness={0.38} metalness={0.12} />)}
    </mesh>
  </RigidBody>;
}

function DiceAttempt({ origin, onComplete, onImpact }: { origin: [number, number]; onComplete: (colors: Color[]) => void; onImpact: () => void }) {
  const [results, setResults] = useState<Array<Color | undefined>>([undefined, undefined]);
  const lastImpact = useRef(0);
  useEffect(() => {
    if (!results.every(Boolean)) return;
    const timer = window.setTimeout(() => onComplete(results as Color[]), 700);
    return () => window.clearTimeout(timer);
  }, [onComplete, results]);
  const report = (index: number, color: Color) => setResults((current) => {
    if (current[index]) return current;
    const next = [...current];
    next[index] = color;
    return next;
  });
  const impact = () => {
    const now = Date.now();
    if (now - lastImpact.current < 90) return;
    lastImpact.current = now;
    onImpact();
  };
  return <>
    <Physics gravity={[0, -14, 0]} timeStep="vary">
      <RigidBody type="fixed" colliders={false} position={[origin[0], 0.02, origin[1]]}>
        <CuboidCollider args={[2.1, 0.08, 1.65]} />
        <CuboidCollider args={[0.08, 0.6, 1.65]} position={[-2.02, 0.55, 0]} />
        <CuboidCollider args={[0.08, 0.6, 1.65]} position={[2.02, 0.55, 0]} />
        <CuboidCollider args={[2.1, 0.6, 0.08]} position={[0, 0.55, -1.57]} />
        <CuboidCollider args={[2.1, 0.6, 0.08]} position={[0, 0.55, 1.57]} />
      </RigidBody>
      <Die index={0} origin={origin} onResult={report} onImpact={impact} />
      <Die index={1} origin={origin} onResult={report} onImpact={impact} />
    </Physics>
    <Html center position={[origin[0], 1.35, origin[1]]} distanceFactor={8} zIndexRange={[7, 1]}>
      <div className="world-dice-status"><strong>专注 · 物理灵感骰</strong><span>{results.every(Boolean) ? `结果：${(results as Color[]).map((color) => COLOR_NAMES[color]).join(" · ")}` : "相机已锁定 · 等待骰子稳定"}</span></div>
    </Html>
  </>;
}

export default function WorldDiceRoll({ origin, onComplete, onImpact }: { origin: [number, number]; onComplete: (colors: Color[]) => void; onImpact: () => void }) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => setAttempt((value) => value + 1), 8500);
    return () => window.clearTimeout(timeout);
  }, [attempt]);
  return <DiceAttempt key={attempt} origin={origin} onComplete={onComplete} onImpact={onImpact} />;
}
