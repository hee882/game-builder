import raw from './content/combat.json';

export type WindowTicks = readonly number[];
export interface Edge { input: string; beat: string; to: string }
export interface ComboNode {
  id: string; name: string; clips: string[]; animCost: string;
  active: WindowTicks; hits?: number[][]; duration: number;
  attackCancel: number | null; dodgeCancel: number; hitstop: number;
  damage: number; range: number; shape: string; motion: string; edges: Edge[];
}
export interface EnemyAttack {
  id: string; name: string; grade: string; lead: number; active: number;
  recovery: number; color: string; range: number; damage: number;
}
export const CONTENT = raw;
export const TIMING = raw.timing;
export const NODES: readonly ComboNode[] = raw.nodes;
export const ENEMY_ATTACKS: readonly EnemyAttack[] = raw.enemyAttacks;
export const TICK_MS = 1000 / raw.hz;
export const CONTENT_HASH = hashContent(JSON.stringify(raw));
function hashContent(text:string):string {
  let hash=2166136261;
  for(let index=0;index<text.length;index++) hash=Math.imul(hash^text.charCodeAt(index),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function inWindow(tick: number, window: WindowTicks): boolean {
  return tick >= (window[0] ?? 0) && tick < (window[1] ?? 0);
}
export function nodeById(id: string): ComboNode {
  const result = NODES.find(node => node.id === id);
  if (!result) throw new Error(`알 수 없는 콤보: ${id}`);
  return result;
}
export function attackById(id: string): EnemyAttack {
  const result = ENEMY_ATTACKS.find(attack => attack.id === id);
  if (!result) throw new Error(`알 수 없는 적 공격: ${id}`);
  return result;
}

export function validateContent(data: typeof raw = raw): string[] {
  const errors: string[] = [];
  validateIntegers(data,'combat',errors);
  const ids = new Set(data.nodes.map(node => node.id));
  if (data.hz !== 30) errors.push('전투는 30Hz');
  if ((data.timing.parry[1] ?? 0) - (data.timing.parry[0] ?? 0) < 5) errors.push('튕겨내기 최소 5틱');
  if (data.nodes.length !== 14 || ids.size !== 14) errors.push('고유 콤보 14노드 필요');
  for (const node of data.nodes) validateNode(node, ids, errors);
  const minimum: Record<string, number> = { light: 12, heavy: 18, bossSingle: 18, bossArea: 24, bossName: 120 };
  for (const attack of data.enemyAttacks) {
    if (!Number.isInteger(attack.lead) || attack.lead < (minimum[attack.grade] ?? Infinity)) errors.push(`${attack.id}: 예고 최소치`);
    if (attack.color === 'yellow' && attack.active + attack.recovery + attack.lead < 12) errors.push(`${attack.id}: 연속 노랑 간격`);
    if (attack.damage > 60 || attack.active < 1) errors.push(`${attack.id}: 판정/피해 상한`);
  }
  return errors;
}

function validateIntegers(value:unknown,path:string,errors:string[]):void {
  if(typeof value==='number' && (!Number.isInteger(value) || value<0)) errors.push(`${path}: 음이 아닌 정수 필요`);
  if(typeof value!=='object' || value===null) return;
  for(const [key,child] of Object.entries(value)) validateIntegers(child,`${path}.${key}`,errors);
}

function validateNode(node: ComboNode, ids: Set<string>, errors: string[]): void {
  const start = node.active[0] ?? -1;
  const end = node.active[1] ?? -1;
  if (![start, end, node.duration, node.dodgeCancel, node.hitstop].every(Number.isInteger)) errors.push(`${node.id}: 정수 틱 필요`);
  if (start < 0 || end <= start || end > node.duration) errors.push(`${node.id}: 판정 구간`);
  if (node.dodgeCancel < end || node.dodgeCancel > node.duration) errors.push(`${node.id}: 회피 캔슬`);
  if (node.attackCancel !== null && (node.attackCancel < end || node.attackCancel > node.duration)) errors.push(`${node.id}: 공격 캔슬`);
  if (node.hitstop < 0 || node.clips.length !== (node.id === 'hw_charge' ? 3 : 1)) errors.push(`${node.id}: 클립/히트스톱`);
  for (const edge of node.edges) if (!ids.has(edge.to)) errors.push(`${node.id}: 없는 간선 ${edge.to}`);
  for (const hit of node.hits ?? [node.active]) {
    if ((hit[0] ?? -1) < start || (hit[1] ?? Infinity) > end || (hit[1] ?? 0) <= (hit[0] ?? 0)) errors.push(`${node.id}: 타격 마커`);
  }
}
