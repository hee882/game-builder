/**
 * 저장 직렬화와 **엄격 검증**.
 *
 * 규칙(docs/outpost-decisions.md §6 저장 관례):
 *   - `sim.serialize()` 결과 하나가 SAVE_KEY_RUN 에 들어간다(OutpostSave 봉투).
 *   - 설정·저장시각은 셸 소유의 별도 키. 여기서는 다루지 않는다.
 *   - parse 는 **절대 예외를 던지지 않는다.** 손상 시 기본 메타 + run: null 로 수렴한다.
 *   - 런만 손상되면 메타(통찰·퍼크·발견·최고기록)는 살린다.
 *   - 프로토타입 오염 차단: 파싱 결과를 그대로 상태로 쓰지 않고 항상 새 객체에 복사한다.
 */
import {
  GRID_W,
  OUTPOST_SAVE_VERSION,
  TILE_COUNT,
  type AutomationKey,
  type BuildingId,
  type ChapterId,
  type DiscoveryId,
  type MetaSave,
  type OutpostSave,
  type PerkId,
  type Phase,
  type RunSave,
  type SimStats,
  type TargetPolicy,
  type TechId,
  type TileIndex,
  type WaveStartEconomy,
} from './contract.ts';
import {
  BUILDING_IDS,
  CORE,
  DISCOVERY_IDS,
  PERKS,
  TECH_IDS,
  TERRAIN,
  TOTAL_WAVES,
  chapterSpec,
  parseLayout,
} from './content.ts';

const MAX_BUILDINGS = TILE_COUNT;
const MAX_DISCOVERED = 16;
const MAX_TECHS = 8;
const PHASES: readonly Phase[] = ['build', 'wave', 'chapterCleared', 'defeat', 'victory'];
const POLICIES: readonly TargetPolicy[] = ['nearest', 'leader', 'air'];
const AUTOMATION_KEYS: readonly AutomationKey[] = ['droneRole', 'autoRebuildWalls'];
const PERK_IDS: readonly PerkId[] = ['startScrap', 'subSpeed', 'wallHp'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** 신뢰할 수 없는 객체에서 키를 읽는다. 상속·오염된 키는 읽지 않는다. */
const own = (source: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(source, key) ? source[key] : undefined;

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  return Math.floor(num(value, fallback, min, max));
}

function strList<T extends string>(value: unknown, allowed: readonly T[], cap: number): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const match = allowed.find((candidate) => candidate === entry);
    if (match !== undefined) seen.add(match);
    if (seen.size >= cap) break;
  }
  return [...seen];
}

export function freshMeta(): MetaSave {
  return {
    version: OUTPOST_SAVE_VERSION,
    insight: 0,
    perks: { startScrap: 0, subSpeed: 0, wallHp: 0 },
    discovered: [],
    best: { wave: 0, chapter: 1, elapsed: 0 },
  };
}

export function freshSave(): OutpostSave {
  return { version: OUTPOST_SAVE_VERSION, meta: freshMeta(), run: null };
}

function parseMeta(value: unknown): MetaSave {
  const fresh = freshMeta();
  if (!isRecord(value)) return fresh;
  const perksRaw = own(value, 'perks');
  const perks: Record<PerkId, number> = { startScrap: 0, subSpeed: 0, wallHp: 0 };
  if (isRecord(perksRaw)) {
    for (const id of PERK_IDS) perks[id] = int(own(perksRaw, id), 0, 0, PERKS[id].maxLevel);
  }
  const bestRaw = own(value, 'best');
  const best = isRecord(bestRaw)
    ? {
        wave: int(own(bestRaw, 'wave'), 0, 0, TOTAL_WAVES),
        chapter: (int(own(bestRaw, 'chapter'), 1, 1, 2) as ChapterId) ?? 1,
        elapsed: num(own(bestRaw, 'elapsed'), 0, 0, 1e9),
      }
    : fresh.best;
  return {
    version: OUTPOST_SAVE_VERSION,
    insight: int(own(value, 'insight'), 0, 0, 1e6),
    perks,
    discovered: strList<DiscoveryId>(own(value, 'discovered'), DISCOVERY_IDS, MAX_DISCOVERED),
    best,
  };
}

function buildableTerrain(chapter: ChapterId): Int8Array {
  return parseLayout(chapterSpec(chapter).layout).terrain;
}

const canHoldBuilding = (terrain: Int8Array, tile: TileIndex): boolean =>
  tile >= 0 && tile < TILE_COUNT && (terrain[tile] === TERRAIN.water || terrain[tile] === TERRAIN.thermal);

function parseStats(value: unknown): SimStats {
  const source = isRecord(value) ? value : {};
  return {
    manualSalvage: num(own(source, 'manualSalvage'), 0, 0, 1e9),
    autoSalvage: num(own(source, 'autoSalvage'), 0, 0, 1e9),
    kills: int(own(source, 'kills'), 0, 0, 1e7),
    wallsLost: int(own(source, 'wallsLost'), 0, 0, 1e7),
    perfects: int(own(source, 'perfects'), 0, 0, 1e7),
    abilityUses: int(own(source, 'abilityUses'), 0, 0, 1e7),
    leaks: int(own(source, 'leaks'), 0, 0, 1e7),
    elapsed: num(own(source, 'elapsed'), 0, 0, 1e9),
  };
}

function parseWaveStartEconomy(value: unknown): WaveStartEconomy | null {
  if (!isRecord(value)) return null; // 구버전 저장 — 복원은 저장 시점 값으로 대체한다
  const resources = own(value, 'resources');
  if (!isRecord(resources)) return null;
  return {
    resources: {
      scrap: num(own(resources, 'scrap'), 0, 0, 1e9),
      biomass: num(own(resources, 'biomass'), 0, 0, 1e9),
    },
    coreHp: num(own(value, 'coreHp'), CORE.maxHp, 0, CORE.maxHp),
    salvageRemaining: num(own(value, 'salvageRemaining'), 0, 0, 1e9),
  };
}

function parseRun(value: unknown): RunSave | null {
  if (!isRecord(value)) return null;
  if (own(value, 'version') !== OUTPOST_SAVE_VERSION) return null;
  const chapter = (int(own(value, 'chapter'), 1, 1, 2) || 1) as ChapterId;
  const terrain = buildableTerrain(chapter);
  const phaseRaw = own(value, 'phase');
  const phase = PHASES.find((candidate) => candidate === phaseRaw) ?? 'build';
  const resourcesRaw = own(value, 'resources');
  const resources = isRecord(resourcesRaw)
    ? {
        scrap: num(own(resourcesRaw, 'scrap'), 0, 0, 1e9),
        biomass: num(own(resourcesRaw, 'biomass'), 0, 0, 1e9),
      }
    : { scrap: 0, biomass: 0 };

  const seenTiles = new Set<TileIndex>();
  const buildings: RunSave['buildings'][number][] = [];
  const buildingsRaw = own(value, 'buildings');
  if (Array.isArray(buildingsRaw)) {
    for (const entry of buildingsRaw) {
      if (buildings.length >= MAX_BUILDINGS) break;
      if (!isRecord(entry)) continue;
      const idRaw = own(entry, 'id');
      const id = BUILDING_IDS.find((candidate) => candidate === idRaw);
      if (id === undefined) continue; // 모르는 건물은 그 항목만 버린다
      const tile = int(own(entry, 'tile'), -1, -1, TILE_COUNT - 1);
      if (!canHoldBuilding(terrain, tile) || seenTiles.has(tile)) continue; // 중복 타일은 첫 항목만
      seenTiles.add(tile);
      const policyRaw = own(entry, 'policy');
      buildings.push({
        tile,
        id,
        level: int(own(entry, 'level'), 0, 0, 2),
        hp: num(own(entry, 'hp'), 1, 1, 1e6),
        policy: POLICIES.find((candidate) => candidate === policyRaw) ?? 'nearest',
      });
    }
  }

  const snapshotTiles = new Set<TileIndex>();
  const waveStartBuildings: RunSave['waveStartBuildings'][number][] = [];
  const snapshotRaw = own(value, 'waveStartBuildings');
  if (Array.isArray(snapshotRaw)) {
    for (const entry of snapshotRaw) {
      if (waveStartBuildings.length >= MAX_BUILDINGS) break;
      if (!isRecord(entry)) continue;
      const idRaw = own(entry, 'id');
      const id = BUILDING_IDS.find((candidate) => candidate === idRaw);
      if (id === undefined) continue;
      const tile = int(own(entry, 'tile'), -1, -1, TILE_COUNT - 1);
      if (!canHoldBuilding(terrain, tile) || snapshotTiles.has(tile)) continue;
      snapshotTiles.add(tile);
      waveStartBuildings.push({ tile, id, level: int(own(entry, 'level'), 0, 0, 2) });
    }
  }

  const automationRaw = own(value, 'automation');
  const automation: Record<AutomationKey, number> = { droneRole: 0, autoRebuildWalls: 0 };
  if (isRecord(automationRaw)) {
    automation.droneRole = int(own(automationRaw, 'droneRole'), 0, 0, 2);
    automation.autoRebuildWalls = int(own(automationRaw, 'autoRebuildWalls'), 0, 0, 1);
  }

  const floodedRaw = own(value, 'flooded');
  const flooded: number[] = new Array<number>(TILE_COUNT).fill(0);
  if (Array.isArray(floodedRaw)) {
    for (let i = 0; i < Math.min(TILE_COUNT, floodedRaw.length); i++) {
      flooded[i] = int(floodedRaw[i], 0, 0, 9);
    }
  }

  return {
    version: OUTPOST_SAVE_VERSION,
    seed: int(own(value, 'seed'), 1, 0, 0xffffffff),
    chapter,
    tick: int(own(value, 'tick'), 0, 0, 1e9),
    phase,
    wave: int(own(value, 'wave'), 1, 1, TOTAL_WAVES),
    resources,
    coreHp: num(own(value, 'coreHp'), CORE.maxHp, 0, CORE.maxHp),
    // 소진된 리저브가 재충전되지 않도록 저장값을 그대로 믿되 음수·NaN만 막는다.
    salvageRemaining: num(own(value, 'salvageRemaining'), 0, 0, 1e9),
    buildings,
    waveStartBuildings,
    researched: strList<TechId>(own(value, 'researched'), TECH_IDS, MAX_TECHS),
    automation,
    flooded,
    retryAttempts: int(own(value, 'retryAttempts'), 0, 0, 1e4),
    stats: parseStats(own(value, 'stats')),
    waveStartEconomy: parseWaveStartEconomy(own(value, 'waveStartEconomy')),
    consecutiveFlawless: int(own(value, 'consecutiveFlawless'), 0, 0, TOTAL_WAVES),
  };
}

export function serializeSave(save: OutpostSave): string {
  return JSON.stringify({ version: OUTPOST_SAVE_VERSION, meta: save.meta, run: save.run });
}

/** 캠페인 초기화용: 런만 버리고 메타(통찰·퍼크·발견·최고 기록)는 이어 간다. */
export function withoutRun(raw: string | null): string {
  return serializeSave({ ...parseSave(raw), run: null });
}

/** 어떤 입력에도 예외를 던지지 않는다. 손상 시 기본값으로 수렴한다. */
export function parseSave(raw: string | null): OutpostSave {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2_000_000) return freshSave();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return freshSave(); // 손상된 저장은 플레이 가능한 기본값으로
  }
  if (!isRecord(data) || own(data, 'version') !== OUTPOST_SAVE_VERSION) return freshSave();
  const meta = parseMeta(own(data, 'meta'));
  let run: RunSave | null = null;
  try {
    run = parseRun(own(data, 'run')); // 런만 깨진 경우 메타는 보존된다
  } catch {
    run = null;
  }
  return { version: OUTPOST_SAVE_VERSION, meta, run };
}

/** 저장 왕복 검증용 — 디버그·테스트에서 쓴다. */
export function tileLabel(tile: TileIndex): string {
  return `${tile % GRID_W},${Math.floor(tile / GRID_W)}`;
}
