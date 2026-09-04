import * as THREE from "three";
import { facingToWorldAngle } from "../game/geometry";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function getHeadspaceCameraBasis(facing: number, cameraPitchDeg: number) {
  const cameraPitch = THREE.MathUtils.degToRad(cameraPitchDeg);
  const facingYaw = facingToWorldAngle(facing);
  return {
    direction: new THREE.Vector3(0, Math.cos(cameraPitch), Math.sin(cameraPitch)).applyAxisAngle(WORLD_UP, facingYaw),
    up: new THREE.Vector3(0, Math.sin(cameraPitch), -Math.cos(cameraPitch)).applyAxisAngle(WORLD_UP, facingYaw)
  };
}

export function getHeadspaceHingeAxis(facing: number) {
  return new THREE.Vector3(1, 0, 0).applyAxisAngle(WORLD_UP, facingToWorldAngle(facing));
}
