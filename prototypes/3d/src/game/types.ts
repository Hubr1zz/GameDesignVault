export type Color = "red" | "blue" | "yellow";
export type BodyPart = "head" | "torso" | "arms" | "legs";
export type Phase = "player" | "monster" | "recovery" | "won" | "lost";
export type CardResult = "success" | "failure";

export interface HexPosition { q: number; r: number }
export interface Weapon { name: string; speed: number; power: number; range: number }
export interface InspirationCard { id: string; color: Color; locked?: boolean }

export interface ActionCardDefinition {
  id: string;
  name: string;
  time: number;
  cost: "none" | "any";
  text: string;
  recovery: string;
  burst: string;
  hunterOnly?: string;
}

export interface ActionCardState extends ActionCardDefinition {
  faceUp: boolean;
  storedMind: InspirationCard[];
}

export interface HunterDefinition {
  id: string;
  name: string;
  strength: number;
  agility: number;
  will: number;
  weapon: Weapon;
  position: HexPosition;
  facing: number;
  inspiration: Color[];
  traits?: string[];
}

export interface HunterState extends Omit<HunterDefinition, "inspiration"> {
  maxWill: number;
  timeSpent: number;
  debt: number;
  ended: boolean;
  overtime: boolean;
  wounds: Record<BodyPart, number>;
  armor: Record<BodyPart, number>;
  mind: InspirationCard[];
  cards: ActionCardState[];
  fate: number;
  statuses: string[];
  permanentInjuries: string[];
  deathDeck: DeathCard[];
  usedWill: string[];
  dead: boolean;
}

export interface MonsterAction {
  id: string;
  name: string;
  timeLimit: number;
  move: number;
  target: "nearest" | "wounded" | "any";
  count: number;
  precision: number;
  damage: number;
  range: number;
  windup: string;
  after: string;
  fallback: string;
  temporaryPart?: string;
}

export interface HitLocationDefinition {
  id: string;
  name: string;
  hp: number;
  text: string;
  persistent?: boolean;
  temporary?: boolean;
  onFailure?: "counter" | "armor";
  onSuccess?: "damage" | "red" | "weakenHowl";
  onDestroyed?: "extraDamage";
  previousSuccessArmor?: boolean;
}

export interface HitLocationState extends HitLocationDefinition {
  instanceId: string;
  currentHp: number;
}

export interface DeathCard {
  id: string;
  type: "survive" | "survival" | "death";
  name: string;
  text: string;
}

export interface TerrainCell extends HexPosition { type: "grass" | "rock" }
export interface BoardObject extends HexPosition { id: string; name: string; hp: number; passable: boolean }

export interface GameContent {
  radius: number;
  hunters: HunterDefinition[];
  actions: ActionCardDefinition[];
  monster: {
    id: string;
    name: string;
    hp: number;
    toughness: number;
    position: HexPosition;
    actions: MonsterAction[];
    hitLocations: HitLocationDefinition[];
  };
  terrain: TerrainCell[];
  objects: BoardObject[];
}

export interface PendingAttack {
  hunterId: string;
  target: "boss" | string;
  parts: HitLocationState[];
  results: CardResult[];
  assignments: Array<number | null>;
}

export interface PendingOverflow { hunterId: string; incoming: InspirationCard[] }
export interface DamageRequest { hunterId: string; amount: number; precision: number; source: string }
export interface PendingBodyDraw extends DamageRequest { choices: BodyPart[] }
export interface PendingDeath { hunterId: string; part: BodyPart; choices: DeathCard[] }

export interface BattleState {
  phase: Phase;
  round: number;
  tutorial: boolean;
  selectedHunterId: string;
  pendingMove: boolean;
  pendingTurn: string | null;
  currentAction: MonsterAction;
  actionDeck: MonsterAction[];
  monster: {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    toughness: number;
    position: HexPosition;
    facing: number;
    persistentParts: HitLocationState[];
    partHp: Record<string, number>;
    tailTriggeredRound: number | null;
    temporaryPartActive: boolean;
    howlWeakened: boolean;
  };
  hunters: HunterState[];
  objects: BoardObject[];
  pendingAttack: PendingAttack | null;
  pendingOverflow: PendingOverflow | null;
  pendingFocus: string | null;
  pendingBody: PendingBodyDraw | null;
  pendingDeath: PendingDeath | null;
  damageQueue: DamageRequest[];
  bossPlan: { endpoint: HexPosition | null; targetId: string | null };
  log: string[];
  summary: string[];
}

export type BattleEvent =
  | { type: "log"; text: string }
  | { type: "focus"; target: string }
  | { type: "impact"; strength: number }
  | { type: "dice"; hunterId: string }
  | { type: "sound"; cue: "cardPlace" | "cardFlip" };

export interface DispatchResult { state: BattleState; events: BattleEvent[] }

export type BattleCommand =
  | { type: "selectHunter"; hunterId: string }
  | { type: "storeMind"; mindId: string; cardId: string }
  | { type: "unstowMind"; mindId: string; cardId: string }
  | { type: "useAction"; cardId: string; position?: HexPosition; target?: string }
  | { type: "confirmTurn"; facing: number }
  | { type: "cancelActionChoice" }
  | { type: "resolveFocus"; colors: Color[] }
  | { type: "resolveOverflow"; replaceId?: string }
  | { type: "assignResult"; resultIndex: number; partIndex: number }
  | { type: "reorderPart"; from: number; to: number }
  | { type: "resolveAttack" }
  | { type: "setBossEndpoint"; position: HexPosition }
  | { type: "setBossTarget"; hunterId: string }
  | { type: "executeBoss" }
  | { type: "chooseBody"; index: number }
  | { type: "chooseDeath"; index: number }
  | { type: "endPlayerTurn" }
  | { type: "advanceRound" }
  | { type: "recover"; cardId: string }
  | { type: "burst"; cardId: string }
  | { type: "will"; action: "encourage" | "sprint" | "struggle"; targetId?: string };

export interface RandomSource {
  next(): number;
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

export interface DiceRoller { roll(): Promise<Color[]> }
