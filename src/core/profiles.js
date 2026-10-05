// INKWAVE — local profiles (browser storage only; nothing leaves the device).
//
// Why this exists: the game keeps exactly one profile in localStorage under 'inkwave.profile'. That is fine until you
// want a second one — a fresh save, a different loadout, a profile for a friend — and there is nowhere to put it.
//
// Update safety is the whole point of this module, and it is the part that is easy to get wrong:
//   · the record carries a `version` and a `migrate()` that knows how to bring an OLDER record up to the current
//     shape, field by field, instead of relying on the spread-and-defaults trick (which silently keeps a field the
//     current build has stopped reading);
//   · a record NEWER than this build is refused with an explanation rather than partially applied and corrupted;
//   · the pre-profiles save key is migrated on first run into a default account, so nobody loses progress on upgrade.
// A player who downgrades and comes back keeps their data either way.
//
// Storage layout:
//   inkwave.accounts          → { version, activeId, accounts: [ { id, name, created, profile } … ] }
//   inkwave.touchLayout etc.  → untouched; layout stays per-device, not per-account
import { DEFAULT_PROFILE } from '../config.js';

export const ACCOUNTS_KEY = 'inkwave.accounts';
export const LEGACY_PROFILE_KEY = 'inkwave.profile';
export const ACCOUNTS_VERSION = 1;

let seq = 0;
/** A short, collision-resistant id. Not a security token — just a localStorage key. */
export const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const readRaw = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeRaw = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };

/** One profile's fields brought up to the current shape. Unknown fields are dropped; missing ones get the default. */
export function migrateProfile(raw) {
  const p = { ...DEFAULT_PROFILE, ...(raw && typeof raw === 'object' ? raw : {}) };
  // numeric fields are clamped to what the current build accepts — an imported or downgraded record can carry
  // anything, and a NaN level would poison the whole progression screen
  p.level = clampInt(p.level, 1, 999, DEFAULT_PROFILE.level);
  p.xp = clampInt(p.xp, 0, 1e9, DEFAULT_PROFILE.xp);
  p.matches = clampInt(p.matches, 0, 1e9, DEFAULT_PROFILE.matches);
  p.wins = clampInt(p.wins, 0, 1e9, DEFAULT_PROFILE.wins);
  p.totalTurf = clampInt(p.totalTurf, 0, 1e9, DEFAULT_PROFILE.totalTurf);
  p.name = String(p.name ?? DEFAULT_PROFILE.name).slice(0, 16);
  p.style = { ...(DEFAULT_PROFILE.style || {}), ...(p.style && typeof p.style === 'object' ? p.style : {}) };
  return p;
}

const clampInt = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : dflt);

/**
 * Load the account list, migrating the legacy single-profile save on first run.
 * Returns { accounts, activeId } — never null, and never throws on corrupt storage.
 */
export function loadAccounts() {
  let rec = readRaw(ACCOUNTS_KEY);
  if (!rec || typeof rec !== 'object' || !Array.isArray(rec.accounts)) {
    // first run on this build (or the key was cleared): adopt whatever the old single-profile save holds
    const legacy = readRaw(LEGACY_PROFILE_KEY);
    const id = newId();
    const accounts = [{ id, name: migrateProfile(legacy).name || DEFAULT_PROFILE.name, created: Date.now(), profile: migrateProfile(legacy) }];
    writeRaw(ACCOUNTS_KEY, { version: ACCOUNTS_VERSION, activeId: id, accounts });
    return { accounts, activeId: id };
  }
  if (rec.version > ACCOUNTS_VERSION) {
    // written by a NEWER build: leave it alone entirely rather than writing something it cannot read back
    console.warn('[inkwave] account file is newer than this build — kept as-is, not migrated');
    return { accounts: rec.accounts, activeId: rec.activeId, newerThanBuild: true };
  }
  const accounts = rec.accounts
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({ id: String(a.id || newId()), name: String(a.name ?? 'Player').slice(0, 16), created: a.created || Date.now(), profile: migrateProfile(a.profile) }));
  if (!accounts.length) {
    const id = newId();
    accounts.push({ id, name: DEFAULT_PROFILE.name, created: Date.now(), profile: migrateProfile(null) });
  }
  const activeId = accounts.some((a) => a.id === rec.activeId) ? rec.activeId : accounts[0].id;
  return { accounts, activeId };
}

export function saveAccounts(accounts, activeId) {
  const ok = writeRaw(ACCOUNTS_KEY, { version: ACCOUNTS_VERSION, activeId, accounts });
  // keep the legacy key in step so a build without this module still finds a usable profile
  const a = accounts.find((x) => x.id === activeId);
  if (a) writeRaw(LEGACY_PROFILE_KEY, a.profile);
  return ok;
}

/** The account being played right now. */
export function activeAccount(accounts, activeId) {
  return accounts.find((a) => a.id === activeId) || accounts[0];
}

export function createAccount(accounts, activeId, name) {
  const id = newId();
  const acc = { id, name: String(name || 'Player').slice(0, 16), created: Date.now(), profile: migrateProfile(null) };
  accounts.push(acc);
  return { accounts, activeId: id, account: acc };
}

/** Never remove the last account: the game always needs somewhere to be. */
export function deleteAccount(accounts, activeId, id) {
  if (accounts.length <= 1) return { accounts, activeId, refused: true };
  const i = accounts.findIndex((a) => a.id === id);
  if (i < 0) return { accounts, activeId };
  accounts.splice(i, 1);
  return { accounts, activeId: activeId === id ? accounts[0].id : activeId };
}

export function renameAccount(accounts, id, name) {
  const a = accounts.find((x) => x.id === id);
  if (a) { a.name = String(name || 'Player').slice(0, 16); if (a.profile) a.profile.name = a.name; }
  return accounts;
}