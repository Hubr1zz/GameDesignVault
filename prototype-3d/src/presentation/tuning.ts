export interface SceneTuning {
  headspaceTiltDeg: number;
  cameraPitchDeg: number;
  headspaceScale: number;
  headspaceCameraDistance: number;
}

export const DEFAULT_SCENE_TUNING: SceneTuning = {
  headspaceTiltDeg: 15,
  cameraPitchDeg: 15,
  headspaceScale: 0.1,
  headspaceCameraDistance: 0.82
};

export interface TuningField {
  key: keyof SceneTuning;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export const SCENE_TUNING_FIELDS: TuningField[] = [
  { key: "headspaceTiltDeg", label: "脑桌仰角", description: "脑桌相对角色水平面的倾斜角度", min: -10, max: 45, step: 1, unit: "°" },
  { key: "cameraPitchDeg", label: "相机观察仰角", description: "相对战斗桌面的独立观察角；不受脑桌仰角影响", min: 0, max: 45, step: 1, unit: "°" },
  { key: "headspaceScale", label: "脑桌大小", description: "脑桌及其所有卡片的统一缩放", min: 0.06, max: 0.16, step: 0.005, unit: "×" },
  { key: "headspaceCameraDistance", label: "观察距离", description: "相机聚焦脑桌时与桌面中心的距离", min: 0.5, max: 1.8, step: 0.02, unit: "" }
];

export function clampTuningValue(field: TuningField, value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SCENE_TUNING[field.key];
  return Math.min(field.max, Math.max(field.min, value));
}
