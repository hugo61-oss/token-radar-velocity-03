// Velocity Radar — a social-velocity token launch radar (model velocity-3).
//
// Thesis: a token launch is a velocity event, not a size contest. Capital that is
// *moving* into a protocol this week, spreading across chains, and sitting in a
// protocol that has run for years without a token is the capital most likely to
// be rewarded when a token appears. So this model scores momentum, not bulk:
//
//   base          = 2.5 x tvl_usd^0.7        (sub-linear: a 10x bigger TVL is
//                                              worth ~5x, so fast mid-size
//                                              protocols can outrank giants)
//   velocity      = clamp(change_7d, -40, 150) per cent   (the week's speed)
//   velocityMult  = 1 + 0.9 x velocity / 100              (0.64 .. 2.35)
//   spreadMult    = 1 + 0.07 x min(chains - 1, 10)        (1 .. 1.7)
//   ripeness      = 0.75 + 0.45 x min(age_days, 1095) / 1095   (0.75 .. 1.2)
//   weeklyFlow    = tvl_usd x change_7d / 100             (dollars/week, shown)
//   implied       = max(1, round(base x velocityMult x spreadMult x ripeness))
//
// Every input comes from the sealed snapshot's own ten fields. No protocol name
// is ever special-cased: the same function scores every row. Protocols that
// already record a token are kept out of the ranked board and shown apart as
// the market's own values, never a model's.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The velocity model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_coefficient: number;
  base_exponent: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  spread_per_chain: number;
  spread_max_chains: number;
  ripeness_floor: number;
  ripeness_range: number;
  ripeness_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_coefficient: 2.5,
  base_exponent: 0.7,
  growth_weight: 0.9,
  growth_floor: -40,
  growth_cap: 150,
  spread_per_chain: 0.07,
  spread_max_chains: 10,
  ripeness_floor: 0.75,
  ripeness_range: 0.45,
  ripeness_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'velocity-3';

/** Pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** Live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  weekly_flow_usd: number;
  model: {
    base: number;
    growth_pct: number;
    velocity_multiplier: number;
    spread_multiplier: number;
    ripeness_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One board row, compact, for data.js. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  chain_count: number;
  tvl_usd: number;
  change_7d: number | null;
  weekly_flow_usd: number;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  velocity_multiplier: number;
  spread_multiplier: number;
  ripeness_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The velocity score of one protocol: base, multipliers, weekly flow, implied value. */
export function velocityScore(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; velocityMult: number; spreadMult: number; ripenessMult: number; weeklyFlow: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const velocityMult = 1 + (growthPct / 100) * model.growth_weight;
  const extraChains = Math.max(0, Math.min(protocol.chains.length - 1, model.spread_max_chains));
  const spreadMult = 1 + model.spread_per_chain * extraChains;
  const ageForModel = age ?? model.unknown_age_days;
  const ripenessMult =
    model.ripeness_floor +
    (Math.min(Math.max(ageForModel, 0), model.ripeness_days) / model.ripeness_days) * model.ripeness_range;
  const base = model.base_coefficient * Math.pow(Math.max(protocol.tvl_usd, 1), model.base_exponent);
  const weeklyFlow = Math.round((protocol.tvl_usd * rawGrowth) / 100);
  const implied = Math.max(1, Math.round(base * velocityMult * spreadMult * ripenessMult));
  return { implied, base: Math.round(base), growthPct, velocityMult, spreadMult, ripenessMult, weeklyFlow, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: action, then cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol again next week.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Farm capital tier, from the protocol's own TVL: small enough to repeat weekly. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** Hold window, from age: young protocols need a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 30;
}

/** The category's one core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the deposit earning.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep it in range.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} with ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Back one market on ${name} with $${capital} and let the position settle.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('liquid staking')) return `Stake $${capital} through ${name} and hold the liquid staking receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age) — the
 * weekly cadence is the point: velocity is earned by showing up every week,
 * not by one big deposit. Never a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = capital >= 200 ? 10 : 5;
  return [
    {
      text: `Open a fresh wallet for this farm only, fund it with $${capital} plus gas, and store its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 200 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Come back every week and do one real action — a deposit, a swap, a borrow, a vote — so the wallet reads as active, not parked.`,
      cost: `about $${weekly} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so it spans more than one snapshot window.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check the protocol's own points or rewards page before you move anything, and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates and every transaction hash, so you can repeat the farm or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The ranked board: every watchlist slug, plus the early pre-token finds below the floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: velocityScore(p, snapshot.as_of, model) }));
  scored.sort(
    (a, b) =>
      b.s.implied - a.s.implied ||
      b.s.weeklyFlow - a.s.weeklyFlow ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((x, i) => ({
    rank: i + 1,
    slug: x.p.slug,
    name: x.p.name,
    category: x.p.category,
    chains: x.p.chains,
    tvl_usd: x.p.tvl_usd,
    change_7d: x.p.change_7d,
    mcap_usd: x.p.mcap_usd,
    listed_at: x.p.listed_at,
    gecko_id: x.p.gecko_id,
    symbol: x.p.symbol,
    token_status: 'pre-token',
    age_days: x.s.age,
    implied_value_usd: x.s.implied,
    weekly_flow_usd: x.s.weeklyFlow,
    model: {
      base: x.s.base,
      growth_pct: x.s.growthPct,
      velocity_multiplier: round4(x.s.velocityMult),
      spread_multiplier: round4(x.s.spreadMult),
      ripeness_multiplier: round4(x.s.ripenessMult),
      age_days: x.s.age,
    },
    farm_steps: farmSteps(x.p, x.s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap: the market's own values, shown apart. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains.slice(0, 3),
    chain_count: row.chains.length,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    weekly_flow_usd: row.weekly_flow_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    velocity_multiplier: row.model.velocity_multiplier,
    spread_multiplier: row.model.spread_multiplier,
    ripeness_multiplier: row.model.ripeness_multiplier,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watch)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
