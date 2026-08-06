export {};

type Officer = {
  id: string;
  name: string;
  alternateName: string;
  rarity: string;
  officerAbility: string;
  officerAbilityValues: Array<number | null>;
  captainManeuver: string;
  captainValue: number | null;
  group: string;
  type: string;
  fullSynergy: number | null;
  halfSynergy: number | null;
  effects: Record<string, boolean>;
  belowDeck: boolean;
  belowDeckAbility: string;
  belowDeckValues: Array<number | null>;
  scores: Array<number | string | null>;
  stats: number[][];
};

type Ship = { name: string; level: number; maxLevel: number; ability: string };
type Preset = { name: string; captain: string; captainRank: number; firstOfficer: string; firstOfficerRank: number; secondOfficer: string; secondOfficerRank: number; notes: string; filters: string[] };
type Mission = { name: string; rarity: string; keyStat: string; primaryRewards: string[]; criticalReward: string; traits: string[]; duration: string; minimumCriticalChance: number; criticalChancePerTrait: number; traitPoints: number; maximumCriticalChance: number };
type Crew = { bridge: Array<string | null>; lower: Array<string | null> };
type Dock = Crew & { id: number; name: string; ship: string };
type SavedSetup = Crew & { id: number; name: string; ship: string; notes: string };
type AtaPlan = { mission: string; officers: Array<string | null> };
type AppState = {
  roster: Record<string, { level: number; rank: number }>;
  bonuses: { attack: number; defence: number; health: number };
  operationsLevel: number;
  rosterLoadout: Crew & { ship: string };
  docks: Dock[];
  savedSetups: SavedSetup[];
  ataPlans: AtaPlan[];
};

const data = await fetch('/data/workbook.json').then((response) => {
  if (!response.ok) throw new Error('Unable to load the workbook data.');
  return response.json();
}) as { officers: Officer[]; ships: Ship[]; presetCrews: Preset[]; awayMissions: Mission[] };
const officers = data.officers;
const ships = data.ships;
const presets = data.presetCrews;
const missions = data.awayMissions;
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const STORAGE_KEY = 'stfc-officer-tool-web-v1';

const defaultCrew = (): Crew => ({ bridge: [null, null, null], lower: Array(6).fill(null) });
const defaultState: AppState = {
  roster: {},
  bonuses: { attack: 0, defence: 0, health: 0 },
  operationsLevel: 39,
  rosterLoadout: { ship: ships[0]?.name ?? '', ...defaultCrew() },
  docks: [0, 1, 2].map((index) => ({ id: index + 1, name: `Dock ${String.fromCharCode(65 + index)}`, ship: '', ...defaultCrew() })),
  savedSetups: [],
  ataPlans: Array.from({ length: 3 }, () => ({ mission: '', officers: [null, null, null] })),
};

function loadState(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      bonuses: { ...defaultState.bonuses, ...(saved.bonuses ?? {}) },
      rosterLoadout: { ...structuredClone(defaultState.rosterLoadout), ...(saved.rosterLoadout ?? {}) },
      docks: Array.isArray(saved.docks) ? saved.docks : structuredClone(defaultState.docks),
      savedSetups: Array.isArray(saved.savedSetups) ? saved.savedSetups : [],
      ataPlans: Array.isArray(saved.ataPlans) ? saved.ataPlans : structuredClone(defaultState.ataPlans),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadState();
let activeView = 'main';
let activePresetFilters = new Set<string>();
let selectedPresetIndex = 0;
let dialogTarget: { area: 'roster' | 'dock'; dockId?: number; group: 'bridge' | 'lower'; index: number } | null = null;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string) => Array.from(document.querySelectorAll<T>(selector));
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
const officerByName = new Map(officers.map((officer) => [officer.name, officer]));

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message: string) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.setTimeout(() => toast.classList.remove('is-visible'), 2500);
}

const identity: Record<string, [string, string]> = {
  main: ['Main', 'Tool Navigation'], bonuses: ['Bonuses', 'Player Bonuses'], roster: ['Roster', 'Officers & Loadout'], docks: ['All Docks', 'Multi-Ship Planner'],
  saved: ['Saved Setups', 'Crew Library'], presets: ['Pre-set Crew', 'Loadouts'], ships: ['Ship', 'Statistics'],
  'ata-overview': ['Away Missions', 'And Traits Overview'], 'ata-analysis': ['ATA', 'Analysis'], 'ata-planning': ['Away Missions', 'Planning'],
  migration: ['Migration', 'Version Transfer'], changes: ['Change Log', 'Web Edition'],
};

function showView(view: string) {
  activeView = view;
  $('.tool-app')?.setAttribute('data-active-view', view);
  $$('.sheet-view').forEach((page) => page.classList.toggle('is-visible', page.getAttribute('data-page') === view));
  $$('[data-results-page]').forEach((page) => page.classList.toggle('is-visible', page.getAttribute('data-results-page') === view));
  $$('.sheet-tab').forEach((tab) => tab.classList.toggle('is-active', tab.getAttribute('data-view') === view));
  const [title, subtitle] = identity[view] ?? [view, ''];
  $('#identity-title')!.textContent = title;
  $('#identity-subtitle')!.textContent = subtitle;
  $('#sheet-tab-list')?.classList.remove('is-open');
  if (view === 'roster') renderRoster();
  if (view === 'docks') renderDocks();
  if (view === 'saved') renderSavedSetups();
  if (view === 'presets') renderPresets();
  if (view === 'ships') renderShips();
  if (view === 'ata-overview') renderAtaOverview();
  if (view === 'ata-analysis') renderAtaAnalysis();
  if (view === 'ata-planning') renderAtaPlanning();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function rosterRecord(name: string) {
  return state.roster[name] ?? { level: 0, rank: 0 };
}

function officerStats(officer: Officer, forceMax = false) {
  const record = rosterRecord(officer.name);
  const level = forceMax ? Math.max(record.rank * 10, record.level) : record.level;
  const row = officer.stats[Math.max(0, Math.min(officer.stats.length - 1, level - 1))] ?? [0, 0, 0];
  if (level <= 0) return [0, 0, 0];
  const isActive = [...state.rosterLoadout.bridge, ...state.rosterLoadout.lower].includes(officer.name);
  const apply = ($('#apply-bonuses') as HTMLInputElement | null)?.checked && isActive;
  return row.map((value, index) => {
    const bonus = index === 0 ? state.bonuses.attack : index === 1 ? state.bonuses.defence : state.bonuses.health;
    return Math.round(value * (apply ? 1 + bonus / 100 : 1));
  });
}

function selectOptions(items: string[], selected = '', placeholder = 'Select') {
  return `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}`;
}

function fillShipSelects() {
  const names = ships.map((ship) => ship.name);
  const rosterShip = $('#roster-ship') as HTMLSelectElement | null;
  const setupShip = $('#setup-ship') as HTMLSelectElement | null;
  if (rosterShip) rosterShip.innerHTML = selectOptions(names, state.rosterLoadout.ship, 'Select Ship');
  if (setupShip) setupShip.innerHTML = selectOptions(names, state.rosterLoadout.ship, 'Select Ship');
}

function renderBonuses() {
  const totals = state.bonuses;
  $('#roster-attack-bonus')!.textContent = `${totals.attack}%`;
  $('#roster-attack-all')!.textContent = `${totals.attack}%`;
  $('#roster-defence-bonus')!.textContent = `${totals.defence}%`;
  $('#roster-defence-all')!.textContent = `${totals.defence}%`;
  $('#roster-health-bonus')!.textContent = `${totals.health}%`;
  $('#roster-health-all')!.textContent = `${totals.health}%`;
  ($('#operations-level') as HTMLInputElement).value = String(state.operationsLevel);
  ($('#bonus-attack') as HTMLInputElement).value = String(totals.attack);
  ($('#bonus-defence') as HTMLInputElement).value = String(totals.defence);
  ($('#bonus-health') as HTMLInputElement).value = String(totals.health);
}

function renderRosterSlots() {
  $$('.mini-slots button').forEach((button, index) => {
    const name = state.rosterLoadout.bridge[index];
    button.innerHTML = name ? `<b>${escapeHtml(name)}</b><span>${index === 0 ? 'Captain' : 'Bridge'}</span>` : (index === 0 ? 'Captain' : 'Bridge');
    button.classList.toggle('is-filled', Boolean(name));
  });
  const totals = [...state.rosterLoadout.bridge, ...state.rosterLoadout.lower].reduce((sum, name) => {
    const officer = name ? officerByName.get(name) : undefined;
    const stats = officer ? officerStats(officer) : [0, 0, 0];
    return [sum[0] + stats[0], sum[1] + stats[1], sum[2] + stats[2]];
  }, [0, 0, 0]);
  $('#loadout-attack')!.textContent = number.format(totals[0]);
  $('#loadout-defence')!.textContent = number.format(totals[1]);
  $('#loadout-health')!.textContent = number.format(totals[2]);
}

function rarityLabel(code: string) {
  return ({ C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic' } as Record<string, string>)[code] ?? code;
}

function renderRoster() {
  renderBonuses();
  fillShipSelects();
  renderRosterSlots();
  const body = $('#roster-body');
  if (!body) return;
  const query = (($('#roster-search') as HTMLInputElement | null)?.value ?? '').trim().toLowerCase();
  const mode = ($('#roster-display') as HTMLSelectElement | null)?.value ?? 'abilities';
  const forceMax = ($('#max-levels') as HTMLInputElement | null)?.checked ?? false;
  const filtered = officers.filter((officer) => !query || `${officer.name} ${officer.group} ${officer.officerAbility} ${officer.captainManeuver}`.toLowerCase().includes(query));
  body.innerHTML = filtered.map((officer) => {
    const record = rosterRecord(officer.name);
    const stats = officerStats(officer, forceMax);
    const active = [...state.rosterLoadout.bridge, ...state.rosterLoadout.lower].includes(officer.name);
    const ability = mode === 'below' ? officer.belowDeckAbility || '—' : mode === 'stats' ? '' : `<b>${escapeHtml(officer.captainManeuver)}</b><span>${escapeHtml(officer.officerAbility)}</span>`;
    return `<tr class="${active ? 'is-active-officer' : ''}" data-officer="${escapeHtml(officer.name)}">
      <td><strong>${escapeHtml(officer.name)}</strong><small>${escapeHtml(rarityLabel(officer.rarity))}</small></td>
      <td><input class="roster-level" type="number" min="0" max="90" value="${record.level}" aria-label="${escapeHtml(officer.name)} level" /></td>
      <td><select class="roster-rank" aria-label="${escapeHtml(officer.name)} rank">${[0,1,2,3,4,5].map((rank) => `<option value="${rank}" ${rank === record.rank ? 'selected' : ''}>${rank}</option>`).join('')}</select></td>
      <td>${number.format(stats[0])}</td><td>${number.format(stats[1])}</td><td>${number.format(stats[2])}</td>
      <td>${escapeHtml(officer.group)}</td><td>${escapeHtml(officer.type)}</td><td class="ability-cell">${ability}</td>
    </tr>`;
  }).join('');
}

function crewSlot(name: string | null, group: 'bridge' | 'lower', index: number, dockId?: number) {
  const officer = name ? officerByName.get(name) : undefined;
  return `<button class="crew-cell ${name ? 'is-filled' : ''}" data-crew-area="${dockId ? 'dock' : 'roster'}" ${dockId ? `data-dock-id="${dockId}"` : ''} data-group="${group}" data-index="${index}" type="button"><span>${name ? escapeHtml(name) : 'Select officer'}</span>${officer ? `<small>${escapeHtml(officer.type)} · ${escapeHtml(officer.group)}</small>` : '<small>＋</small>'}</button>`;
}

function renderDocks() {
  const list = $('#dock-list');
  if (!list) return;
  list.innerHTML = state.docks.map((dock) => {
    const total = [...dock.bridge, ...dock.lower].reduce((sum, name) => {
      const officer = name ? officerByName.get(name) : undefined;
      const stats = officer ? officerStats(officer) : [0, 0, 0];
      return [sum[0] + stats[0], sum[1] + stats[1], sum[2] + stats[2]];
    }, [0, 0, 0]);
    return `<article class="dock-card" data-dock="${dock.id}"><div class="dock-title"><h2>${escapeHtml(dock.name)}</h2><label>Select Ship<select class="dock-ship">${selectOptions(ships.map((ship) => ship.name), dock.ship, 'Select Ship')}</select></label><button class="dock-remove" type="button" ${state.docks.length <= 1 ? 'disabled' : ''}>Remove</button></div>
      <div class="dock-crews"><div><h3>Bridge</h3><div class="bridge-cells">${dock.bridge.map((name, index) => crewSlot(name, 'bridge', index, dock.id)).join('')}</div></div><div><h3>Lower Deck</h3><div class="lower-cells">${dock.lower.map((name, index) => crewSlot(name, 'lower', index, dock.id)).join('')}</div></div></div>
      <div class="dock-totals"><span>Attack Bonus <b>${number.format(total[0])}</b></span><span>Defence Bonus <b>${number.format(total[1])}</b></span><span>Health Bonus <b>${number.format(total[2])}</b></span></div></article>`;
  }).join('');
}

function renderSavedSetups() {
  const list = $('#saved-setup-list');
  if (!list) return;
  if (!state.savedSetups.length) {
    list.innerHTML = '<div class="empty-row">No saved setups yet. Build a roster loadout, then save it here.</div>';
    return;
  }
  list.innerHTML = state.savedSetups.map((setup) => `<article class="saved-setup" data-setup="${setup.id}"><div><span>Name</span><strong>${escapeHtml(setup.name)}</strong><small>${escapeHtml(setup.ship || 'No ship')}</small></div><div><span>Bridge</span><p>${setup.bridge.map((name) => escapeHtml(name || '—')).join(' · ')}</p><span>Lower Deck</span><p>${setup.lower.filter(Boolean).map(escapeHtml).join(' · ') || '—'}</p></div><div><span>Notes</span><p>${escapeHtml(setup.notes || '—')}</p></div><button class="setup-load" type="button">Load</button><button class="setup-delete" type="button">Delete</button></article>`).join('');
}

const presetFilterGroups = [
  { id: 'activity', filters: ['PvP', 'Bases', 'XP Grinding', 'Mining'] },
  { id: 'ship', filters: ['For Explorers', 'For Interceptors', 'For Battleships', 'Vs Explorers', 'Vs Interceptors', 'Vs Battleships', 'Vs Survey'] },
  { id: 'target', filters: ['Hostiles', 'Mission Bosses', 'Probes', 'Swarms', 'Eclipse'] },
  { id: 'armada', filters: ['Armadas - Normal', 'Armadas - Eclipse', 'Armadas - Swarm', 'Armadas - Borg'] },
];

function presetFilterLabel(filter: string) {
  return filter.replace('Armadas - Normal', 'Armada - General').replace('Armadas - ', 'Armada - ');
}

function renderPresetFilters() {
  const counts = new Map<string, number>();
  presets.forEach((preset) => preset.filters.forEach((filter) => counts.set(filter, (counts.get(filter) ?? 0) + 1)));
  const container = $('#preset-filter-list');
  if (!container) return;
  container.innerHTML = presetFilterGroups.map((group) => `<div class="preset-filter-group preset-filter-${group.id}">${group.filters.map((filter) => `<label title="${counts.get(filter) ?? 0} matching crews"><input type="checkbox" data-preset-filter="${escapeHtml(filter)}" ${activePresetFilters.has(filter) ? 'checked' : ''} /><span>${escapeHtml(presetFilterLabel(filter))}</span></label>`).join('')}</div>`).join('');
}

function renderPresetSelection(availablePresets = getFilteredPresets()) {
  const selector = $('#preset-select') as HTMLSelectElement | null;
  if (!selector || !presets.length) return;
  const availableIndexes = availablePresets.map((preset) => presets.indexOf(preset));
  if (!availableIndexes.length) {
    selector.innerHTML = '<option value="">No matching crews</option>';
    $('#preset-captain')!.textContent = 'Captain';
    $('#preset-first-officer')!.textContent = '1st Officer';
    $('#preset-second-officer')!.textContent = '2nd Officer';
    $('#preset-notes')!.textContent = 'No crews match the selected filters.';
    $('#preset-recommended-rank')!.textContent = '— / — / —';
    return;
  }
  if (!availableIndexes.includes(selectedPresetIndex)) selectedPresetIndex = availableIndexes[0];
  selector.innerHTML = availableIndexes.map((index) => `<option value="${index}" ${index === selectedPresetIndex ? 'selected' : ''}>${escapeHtml(presets[index].name)}</option>`).join('');
  selector.value = String(selectedPresetIndex);
  const preset = presets[selectedPresetIndex];
  $('#preset-captain')!.textContent = preset.captain || 'Captain';
  $('#preset-first-officer')!.textContent = preset.firstOfficer || '1st Officer';
  $('#preset-second-officer')!.textContent = preset.secondOfficer || '2nd Officer';
  $('#preset-notes')!.textContent = preset.notes || 'No additional crew notes.';
  $('#preset-recommended-rank')!.textContent = `${preset.captainRank || '—'} / ${preset.firstOfficerRank || '—'} / ${preset.secondOfficerRank || '—'}`;
}

function matchesPresetFilters(preset: Preset) {
  return [...activePresetFilters].every((filter) => preset.filters.includes(filter));
}

function getFilteredPresets() {
  const query = (($('#preset-search') as HTMLInputElement | null)?.value ?? '').trim().toLowerCase();
  return presets
    .filter(matchesPresetFilters)
    .filter((preset) => !query || preset.name.toLowerCase().includes(query));
}

function renderPresets() {
  renderPresetFilters();
  const filtered = getFilteredPresets();
  renderPresetSelection(filtered);
  $('#preset-count')!.textContent = `${filtered.length} of ${presets.length} crews`;
  $('#preset-body')!.innerHTML = filtered.map((preset) => `<tr><td><button class="preset-name" data-select-preset="${presets.indexOf(preset)}" type="button">${escapeHtml(preset.name)}</button><small>${escapeHtml(preset.filters.slice(0, 3).join(' · '))}</small></td><td>${escapeHtml(preset.captain)}</td><td>${escapeHtml(preset.firstOfficer)}</td><td>${escapeHtml(preset.secondOfficer)}</td><td>${preset.captainRank || '—'} / ${preset.firstOfficerRank || '—'} / ${preset.secondOfficerRank || '—'}</td><td>${escapeHtml(preset.notes)}</td><td><button class="preset-use" data-preset-index="${presets.indexOf(preset)}" type="button">Use crew</button></td></tr>`).join('');
}

function renderShips() {
  const selector = $('#ship-select') as HTMLSelectElement | null;
  if (!selector) return;
  if (!selector.options.length) selector.innerHTML = selectOptions(ships.map((ship) => ship.name), ships[0]?.name, 'Select Ship');
  const selected = ships.find((ship) => ship.name === selector.value) ?? ships[0];
  if (!selected) return;
  $('#ship-max-level')!.textContent = String(selected.maxLevel);
  const levelInput = $('#ship-level') as HTMLInputElement;
  levelInput.max = String(selected.maxLevel);
  if (Number(levelInput.value) > selected.maxLevel) levelInput.value = String(selected.maxLevel);
  $('#ship-ability')!.textContent = selected.ability || 'Ability data is available after selecting a ship level in the original workbook.';
  $('#ship-rounds')!.innerHTML = Array.from({ length: 8 }, (_, index) => `<span><b>Round ${index + 1}</b><i>${index % 3 === 0 ? 'Energy' : index % 3 === 1 ? 'Kinetic' : '—'}</i></span>`).join('');
  $('#ship-body')!.innerHTML = ships.map((ship) => `<tr><td><strong>${escapeHtml(ship.name)}</strong></td><td>${ship.level}</td><td>${ship.maxLevel}</td><td>${escapeHtml(ship.ability)}</td></tr>`).join('');
}

function renderAtaOverview() {
  const select = $('#ata-mission') as HTMLSelectElement | null;
  if (!select) return;
  if (!select.options.length) select.innerHTML = selectOptions(missions.map((mission) => mission.name), missions[0]?.name, 'Select Away Mission');
  const mission = missions.find((item) => item.name === select.value) ?? missions[0];
  if (!mission) return;
  $('#ata-details')!.innerHTML = `<div><dt>Rarity</dt><dd>${escapeHtml(mission.rarity)}</dd></div><div><dt>Key Stat</dt><dd>${escapeHtml(mission.keyStat)}</dd></div><div><dt>Duration</dt><dd>${escapeHtml(mission.duration)}</dd></div><div><dt>Primary Rewards</dt><dd>${escapeHtml(mission.primaryRewards.join(' · '))}</dd></div><div><dt>Critical Reward</dt><dd>${escapeHtml(mission.criticalReward)}</dd></div><div><dt>Critical Chance</dt><dd>${Math.round((mission.minimumCriticalChance ?? 0) * 100)}%–${Math.round((mission.maximumCriticalChance ?? 0) * 100)}%</dd></div>`;
  $('#ata-traits')!.innerHTML = mission.traits.map((trait, index) => `<article><span>Trait ${index + 1}</span><strong>${escapeHtml(trait)}</strong><small>${mission.traitPoints ?? 0} total mission points</small></article>`).join('');
  $('#ata-mission-body')!.innerHTML = missions.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.rarity)}</td><td>${escapeHtml(item.keyStat)}</td><td>${escapeHtml(item.primaryRewards.join(' · '))}</td><td>${escapeHtml(item.criticalReward)}</td><td>${escapeHtml(item.duration)}</td></tr>`).join('');
}

function renderAtaAnalysis() {
  const selectors = $('#analysis-selectors');
  if (!selectors) return;
  if (!selectors.children.length) selectors.innerHTML = [0, 1, 2].map((index) => `<label>Mission ${index + 1}<select data-analysis-index="${index}">${selectOptions(missions.map((mission) => mission.name), missions[index]?.name, 'Select Mission')}</select></label>`).join('');
  const selected = $$<HTMLSelectElement>('[data-analysis-index]').map((select) => missions.find((mission) => mission.name === select.value)).filter(Boolean) as Mission[];
  $('#analysis-cards')!.innerHTML = selected.map((mission) => `<article><p>${escapeHtml(mission.rarity)} · ${escapeHtml(mission.duration)}</p><h2>${escapeHtml(mission.name)}</h2><dl><div><dt>Key Stat</dt><dd>${escapeHtml(mission.keyStat)}</dd></div><div><dt>Rewards</dt><dd>${escapeHtml(mission.primaryRewards.join(' · '))}</dd></div><div><dt>Critical</dt><dd>${escapeHtml(mission.criticalReward)}</dd></div><div><dt>Traits</dt><dd>${escapeHtml(mission.traits.join(' · '))}</dd></div></dl></article>`).join('');
}

function renderAtaPlanning() {
  const list = $('#ata-plan-list');
  if (!list) return;
  while (state.ataPlans.length < 3) state.ataPlans.push({ mission: '', officers: [null, null, null] });
  list.innerHTML = state.ataPlans.map((plan, planIndex) => {
    const mission = missions.find((item) => item.name === plan.mission);
    return `<article class="ata-plan" data-plan="${planIndex}"><div class="plan-number">${planIndex + 1}</div><label>Away Mission<select class="plan-mission">${selectOptions(missions.map((item) => item.name), plan.mission, 'Select Away Mission')}</select></label><div class="plan-rewards"><span>Rewards</span><strong>${escapeHtml(mission?.primaryRewards.join(' · ') || '—')}</strong><small>Critical: ${escapeHtml(mission?.criticalReward || '—')}</small></div><div class="plan-officers">${plan.officers.map((name, officerIndex) => `<label>Officer ${officerIndex + 1}<select data-plan-officer="${officerIndex}">${selectOptions(officers.map((officer) => officer.name), name ?? '', 'Select Officer')}</select></label>`).join('')}</div><div class="plan-traits"><span>Required Traits</span><strong>${escapeHtml(mission?.traits.join(' · ') || '—')}</strong></div></article>`;
  }).join('');
}

function openOfficerDialog(target: typeof dialogTarget) {
  dialogTarget = target;
  ($('#dialog-search') as HTMLInputElement).value = '';
  $('#dialog-title')!.textContent = target?.group === 'bridge' && target.index === 0 ? 'Select captain' : 'Select an officer';
  renderDialogOfficers();
  ($('#officer-dialog') as HTMLDialogElement).showModal();
}

function renderDialogOfficers() {
  const query = ($('#dialog-search') as HTMLInputElement).value.trim().toLowerCase();
  const filtered = officers.filter((officer) => !query || `${officer.name} ${officer.group} ${officer.type}`.toLowerCase().includes(query));
  $('#dialog-officers')!.innerHTML = filtered.map((officer) => { const record = rosterRecord(officer.name); return `<button data-dialog-officer="${escapeHtml(officer.name)}" type="button"><span>${escapeHtml(officer.name)}</span><small>${escapeHtml(officer.type)} · ${escapeHtml(officer.group)}</small><b>L${record.level} · R${record.rank}</b></button>`; }).join('');
}

function assignOfficer(name: string) {
  if (!dialogTarget) return;
  const crew = dialogTarget.area === 'roster' ? state.rosterLoadout : state.docks.find((dock) => dock.id === dialogTarget?.dockId);
  if (!crew) return;
  const allSlots = [...crew.bridge, ...crew.lower];
  const existingIndex = allSlots.indexOf(name);
  if (existingIndex >= 0) {
    if (existingIndex < crew.bridge.length) crew.bridge[existingIndex] = null;
    else crew.lower[existingIndex - crew.bridge.length] = null;
  }
  crew[dialogTarget.group][dialogTarget.index] = name;
  saveState();
  ($('#officer-dialog') as HTMLDialogElement).close();
  dialogTarget = null;
  if (activeView === 'docks') renderDocks(); else renderRoster();
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const tab = target.closest<HTMLElement>('[data-view]');
  if (tab) return showView(tab.dataset.view ?? 'main');
  const open = target.closest<HTMLElement>('[data-open-view]');
  if (open) return showView(open.dataset.openView ?? 'main');
  const rosterSlot = target.closest<HTMLElement>('[data-roster-slot]');
  if (rosterSlot) return openOfficerDialog({ area: 'roster', group: 'bridge', index: Number(rosterSlot.dataset.rosterSlot) });
  const crewCell = target.closest<HTMLElement>('[data-crew-area]');
  if (crewCell) return openOfficerDialog({ area: crewCell.dataset.crewArea as 'roster' | 'dock', dockId: Number(crewCell.dataset.dockId) || undefined, group: crewCell.dataset.group as 'bridge' | 'lower', index: Number(crewCell.dataset.index) });
  const dialogOfficer = target.closest<HTMLElement>('[data-dialog-officer]');
  if (dialogOfficer) return assignOfficer(dialogOfficer.dataset.dialogOfficer ?? '');
  const selectPreset = target.closest<HTMLElement>('[data-select-preset]');
  if (selectPreset) { selectedPresetIndex = Number(selectPreset.dataset.selectPreset) || 0; renderPresetSelection(); return; }
  const usePreset = target.closest<HTMLElement>('[data-preset-index]');
  if (usePreset) {
    const preset = presets[Number(usePreset.dataset.presetIndex)];
    if (!preset) return;
    state.rosterLoadout.bridge = [preset.captain, preset.firstOfficer, preset.secondOfficer];
    [preset.captain, preset.firstOfficer, preset.secondOfficer].forEach((name, index) => { if (!state.roster[name]) state.roster[name] = { level: 0, rank: [preset.captainRank, preset.firstOfficerRank, preset.secondOfficerRank][index] || 0 }; });
    saveState(); showView('roster'); showToast(`${preset.name} loaded into the roster bridge.`); return;
  }
  const setupArticle = target.closest<HTMLElement>('[data-setup]');
  if (setupArticle && target.closest('.setup-load')) {
    const setup = state.savedSetups.find((item) => item.id === Number(setupArticle.dataset.setup)); if (!setup) return;
    state.rosterLoadout = { ship: setup.ship, bridge: [...setup.bridge], lower: [...setup.lower] }; saveState(); showView('roster'); showToast(`${setup.name} loaded.`); return;
  }
  if (setupArticle && target.closest('.setup-delete')) { state.savedSetups = state.savedSetups.filter((item) => item.id !== Number(setupArticle.dataset.setup)); saveState(); renderSavedSetups(); return; }
  const dockArticle = target.closest<HTMLElement>('[data-dock]');
  if (dockArticle && target.closest('.dock-remove')) { state.docks = state.docks.filter((dock) => dock.id !== Number(dockArticle.dataset.dock)); saveState(); renderDocks(); }
});

document.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.matches('.roster-level, .roster-rank')) {
    const row = target.closest<HTMLElement>('[data-officer]'); if (!row) return; const name = row.dataset.officer!; const record = rosterRecord(name);
    if (target.classList.contains('roster-level')) record.level = Math.max(0, Math.min(90, Number(target.value) || 0)); else record.rank = Math.max(0, Math.min(5, Number(target.value) || 0));
    state.roster[name] = record; saveState(); renderRoster(); return;
  }
  if (target.id === 'roster-ship') { state.rosterLoadout.ship = target.value; saveState(); fillShipSelects(); return; }
  if (target.matches('.dock-ship')) { const dock = target.closest<HTMLElement>('[data-dock]'); const record = state.docks.find((item) => item.id === Number(dock?.dataset.dock)); if (record) { record.ship = target.value; saveState(); } return; }
  if (target.id === 'ship-select') return renderShips();
  if (target.id === 'preset-select') { selectedPresetIndex = Number(target.value) || 0; return renderPresetSelection(); }
  if (target.matches('[data-preset-filter]')) {
    const filter = target.dataset.presetFilter ?? '';
    if ((target as HTMLInputElement).checked) activePresetFilters.add(filter); else activePresetFilters.delete(filter);
    return renderPresets();
  }
  if (target.id === 'ata-mission') return renderAtaOverview();
  if (target.matches('[data-analysis-index]')) return renderAtaAnalysis();
  if (target.matches('.plan-mission, [data-plan-officer]')) {
    const planElement = target.closest<HTMLElement>('[data-plan]'); const plan = state.ataPlans[Number(planElement?.dataset.plan)]; if (!plan) return;
    if (target.matches('.plan-mission')) plan.mission = target.value; else plan.officers[Number(target.dataset.planOfficer)] = target.value || null;
    saveState(); renderAtaPlanning(); return;
  }
});

$('#roster-search')?.addEventListener('input', renderRoster);
$('#roster-display')?.addEventListener('change', renderRoster);
$('#max-levels')?.addEventListener('change', renderRoster);
$('#apply-bonuses')?.addEventListener('change', renderRoster);
$('#preset-search')?.addEventListener('input', renderPresets);
$('#dialog-search')?.addEventListener('input', renderDialogOfficers);
$('#mobile-nav-toggle')?.addEventListener('click', () => $('#sheet-tab-list')?.classList.toggle('is-open'));

['attack', 'defence', 'health'].forEach((stat) => {
  $(`#bonus-${stat}`)?.addEventListener('change', (event) => { state.bonuses[stat as keyof typeof state.bonuses] = Math.max(0, Number((event.target as HTMLInputElement).value) || 0); saveState(); renderBonuses(); });
});
$('#operations-level')?.addEventListener('change', (event) => { state.operationsLevel = Math.max(1, Math.min(80, Number((event.target as HTMLInputElement).value) || 1)); saveState(); });

$('#add-dock')?.addEventListener('click', () => {
  if (state.docks.length >= 8) return showToast('The workbook supports up to eight docks.');
  const id = Math.max(0, ...state.docks.map((dock) => dock.id)) + 1;
  state.docks.push({ id, name: `Dock ${String.fromCharCode(64 + id)}`, ship: '', ...defaultCrew() }); saveState(); renderDocks();
});

$('#save-setup-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = ($('#setup-name') as HTMLInputElement).value.trim(); if (!name) return;
  state.savedSetups.push({ id: Date.now(), name, ship: ($('#setup-ship') as HTMLSelectElement).value, notes: ($('#setup-notes') as HTMLInputElement).value.trim(), bridge: [...state.rosterLoadout.bridge], lower: [...state.rosterLoadout.lower] });
  saveState(); (event.target as HTMLFormElement).reset(); fillShipSelects(); renderSavedSetups(); showToast('Setup saved to this device.');
});

$('#save-ata-plan')?.addEventListener('click', () => { saveState(); showToast('Away Team plan saved.'); });

$('#export-data')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'stfc-officer-tool-snapshot.json'; link.click(); URL.revokeObjectURL(link.href);
});

$('#import-data')?.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
  try { const payload = JSON.parse(await file.text()); if (!payload?.state?.roster || !Array.isArray(payload.state.docks)) throw new Error('Invalid snapshot'); state = { ...structuredClone(defaultState), ...payload.state }; saveState(); renderAll(); showToast('Snapshot imported successfully.'); }
  catch { showToast('That file is not a valid Officer Tool snapshot.'); }
  input.value = '';
});

function renderAll() {
  fillShipSelects(); renderBonuses(); renderRoster(); renderDocks(); renderSavedSetups(); renderPresets(); renderShips(); renderAtaOverview(); renderAtaAnalysis(); renderAtaPlanning();
}

renderAll();
showView('main');
