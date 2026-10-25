let currentUser = null;
let allTeams = [];
let allPlayers = [];
let allMatches = [];
let allMatchPlayerStats = [];
let allRosters = [];
let allTransfers = [];
let myInvites = [];

let currentView = 'home';
let homeMatchFilter = 'upcoming';
let scheduleFilter = 'all';
let activeProfileSteamId = null;
let activeTeamProfileId = null;

function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setElHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

async function loadLeagueData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Kunde inte hämta data');
    const data = await res.json();

    currentUser = data.currentUser || null;
    allTeams = data.teams || [];
    allPlayers = (data.players || []).map(normalizePlayer);
    allMatches = data.matches || [];
    allMatchPlayerStats = data.matchPlayerStats || [];
    allRosters = data.rosters || [];
    allTransfers = data.transfers || [];
    myInvites = data.myInvites || [];

    if (!activeProfileSteamId) {
      if (currentUser) activeProfileSteamId = currentUser.steam_id;
      else if (allPlayers.length > 0) activeProfileSteamId = allPlayers[0].steamId;
    }

    renderAll();
  } catch (err) {
    console.error('loadLeagueData error:', err);
    setElText('topStatsCounter', 'Redo – väntar på ligadata');
    renderAll();
  }
}

function normalizePlayer(p) {
  const passAtt = p.passes_attempted || 0;
  const passComp = p.passes_completed || 0;
  const passAcc = passAtt > 0 ? Math.round((passComp / passAtt) * 100) : 0;

  return {
    steamId: p.steam_id,
    name: p.username || 'Spelare',
    avatarUrl: p.avatar_url || '',
    accountRole: p.role || 'player',
    teamRole: p.team_role || 'player',
    number: p.jersey_number || 12,
    position: (p.preferred_position || 'FORWARD').toUpperCase(),
    handedness: p.stick_handedness === 'Right' ? 'Right' : 'Left',
    teamId: p.team_id || null,
    gp: p.gp || 0,
    g: p.g || 0,
    a: p.a || 0,
    tp: p.tp || 0,
    plusMinus: p.plus_minus || 0,
    hardestShot: Number(p.hardest_shot || 0),
    passAccuracy: passAcc,
    avatar: {
      jerseyPrimary: p.jersey_primary_color || '#0284c7',
      jerseyStripe: p.jersey_stripe_color || '#0a0d12',
      helmetColor: p.helmet_color || '#0a0d12',
      skinColor: p.skin_color || '#c68b65',
      visor: p.visor_tint || 'tinted',
      beard: p.facial_hair || 'none',
      hairColor: p.hair_color || '#23170f',
      shaftTape: p.stick_shaft_color || '#28b5e1',
      bladeTape: p.stick_blade_tape || '#111111',
      showChestNum: p.show_chest_number !== false
    }
  };
}

function getApprovedTeams() {
  return allTeams.filter(t => !t.status || String(t.status).toLowerCase() === 'approved');
}

function getPendingTeams() {
  return allTeams.filter(t => t.status && String(t.status).toLowerCase() === 'pending');
}

function getTeamById(id) {
  if (!id) return { id: null, name: 'Fria Agenter', tag: 'FRI', primary_color: '#1e293b', secondary_color: '#649eff' };
  return allTeams.find(t => Number(t.id) === Number(id)) || { id, name: 'Okänt lag', tag: 'LAG', primary_color: '#1e293b', secondary_color: '#649eff' };
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'Tid ej bokad';
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function computeStandings() {
  const statsMap = {};
  getApprovedTeams().forEach(t => {
    statsMap[t.id] = { id: t.id, name: t.name, tag: t.tag, gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  });

  allMatches.filter(m => m.status === 'completed').forEach(m => {
    const h = statsMap[m.home_team_id];
    const a = statsMap[m.away_team_id];
    if (!h || !a) return;

    const hs = Number(m.home_score || 0);
    const as = Number(m.away_score || 0);
    const isOT = Boolean(m.is_overtime || m.is_shootout);

    h.gp++; a.gp++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;

    if (hs > as) {
      if (isOT) { h.otw++; h.pts += 2; a.otl++; a.pts += 1; }
      else { h.w++; h.pts += 3; a.l++; }
    } else if (as > hs) {
      if (isOT) { a.otw++; a.pts += 2; h.otl++; h.pts += 1; }
      else { a.w++; a.pts += 3; h.l++; }
    } else {
      h.pts += 1; a.pts += 1;
    }
  });

  return Object.values(statsMap).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const diffB = b.gf - b.ga;
    const diffA = a.gf - a.ga;
    if (diffB !== diffA) return diffB - diffA;
    return b.gf - a.gf;
  });
}

function renderAll() {
  const approvedTeams = getApprovedTeams();
  const playedCount = allMatches.filter(m => m.status === 'completed').length;
  setElText(
    'topStatsCounter',
    allPlayers.length + ' spelare • ' + approvedTeams.length + ' lag • ' + playedCount + ' spelade matcher'
  );

  const tasks = [
    () => typeof renderHeaderAuthArea === 'function' && renderHeaderAuthArea(),
    () => typeof renderScoreTicker === 'function' && renderScoreTicker(),
    () => typeof renderHomeMatches === 'function' && renderHomeMatches(),
    () => typeof renderStandingsTables === 'function' && renderStandingsTables(),
    () => typeof renderHomeTopScorers === 'function' && renderHomeTopScorers(),
    () => typeof renderFullScheduleView === 'function' && renderFullScheduleView(),
    () => typeof renderFullStatsView === 'function' && renderFullStatsView(),
    () => typeof renderTeamsView === 'function' && renderTeamsView(),
    () => typeof renderAdminView === 'function' && renderAdminView(),
    () => activeProfileSteamId && typeof renderProfileView === 'function' && renderProfileView(activeProfileSteamId),
    () => activeTeamProfileId && typeof renderTeamProfileView === 'function' && renderTeamProfileView(activeTeamProfileId)
  ];

  tasks.forEach(fn => {
    try { fn(); } catch (e) { console.error('Render error:', e); }
  });
}

function renderHeaderAuthArea() {
  const container = document.getElementById('headerAuthArea');
  const hint = document.getElementById('topAuthHint');
  const navAdmin = document.getElementById('nav-admin');
  const mobileAdmin = document.getElementById('mobileAdminBtn');
  if (!container) return;

  if (!currentUser) {
    if (hint) hint.textContent = 'Utloggad besökare';
    if (navAdmin) { navAdmin.classList.add('hidden'); navAdmin.classList.remove('flex'); }
    if (mobileAdmin) mobileAdmin.classList.add('hidden');

    container.innerHTML = '<a href="/api/auth?action=login" class="bg-[#171a21] hover:bg-[#2a475e] text-white text-xs font-bold px-3.5 py-2 rounded border border-white/20 flex items-center gap-2 transition shadow"><i class="fa-brands fa-steam text-base"></i> Logga in med Steam</a>';
  } else {
    const me = allPlayers.find(p => p.steamId === currentUser.steam_id) || normalizePlayer(currentUser);
    const isAdmin = me.accountRole === 'admin';
    if (hint) hint.innerHTML = 'Inloggad via Steam: <strong class="text-white">' + me.name + '</strong>';

    if (isAdmin) {
      if (navAdmin) { navAdmin.classList.remove('hidden'); navAdmin.classList.add('flex'); }
      if (mobileAdmin) mobileAdmin.classList.remove('hidden');
    } else {
      if (navAdmin) { navAdmin.classList.add('hidden'); navAdmin.classList.remove('flex'); }
      if (mobileAdmin) mobileAdmin.classList.add('hidden');
    }

    const roleBadge = isAdmin
      ? '<span class="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-1.5 py-0.2 rounded uppercase">ADMIN</span>'
      : ('<span class="text-[10px] text-emerald-400 font-mono">#' + me.number + '</span>');

    const inviteBadge = myInvites.length > 0
      ? ('<span class="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold px-1.5 rounded-full animate-pulse">' + myInvites.length + '</span>')
      : '';

    const charSvg = typeof renderPuckCharacterSVG === 'function' ? renderPuckCharacterSVG(me) : '';

    container.innerHTML = [
      '<div class="flex items-center gap-2">',
        '<button type="button" onclick="openInboxModal()" class="relative p-2 rounded bg-white/5 hover:bg-white/15 border border-white/15 text-gray-200 hover:text-white transition" title="Inkorg (Laginbjudningar)">',
          '<i class="fa-solid fa-envelope text-sm"></i>' + inviteBadge,
        '</button>',
        '<button type="button" onclick="openPlayerProfile(\'' + me.steamId + '\')" class="flex items-center gap-2.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-1 rounded transition">',
          '<div class="w-7 h-8 rounded bg-slate-800 overflow-hidden flex items-center justify-center">' + charSvg + '</div>',
          '<div class="text-left leading-tight hidden sm:block">',
            '<div class="text-xs font-bold text-white flex items-center gap-1.5">' + me.name + ' ' + roleBadge + '</div>',
            '<div class="text-[10px] text-gray-400">Min Profil</div>',
          '</div>',
        '</button>',
        '<a href="/api/auth?action=logout" title="Logga ut" class="p-2 rounded bg-white/5 hover:bg-rose-600/30 border border-white/10 text-gray-300 hover:text-white text-xs transition">',
          '<i class="fa-solid fa-right-from-bracket"></i>',
        '</a>',
      '</div>'
    ].join('');
  }
}

function switchView(viewName) {
  currentView = viewName;
  const views = ['home', 'profile', 'team-profile', 'schedule', 'standings', 'stats', 'teams', 'admin'];
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) {
      if (v === viewName) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.classList.remove('text-shl-lightBlue', 'font-semibold');
  });
  const activeNav = document.getElementById('nav-' + (viewName === 'team-profile' ? 'teams' : viewName));
  if (activeNav) activeNav.classList.add('text-shl-lightBlue', 'font-semibold');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
  const el = document.getElementById('mobileMenuDrawer');
  if (el) el.classList.toggle('hidden');
}

function handleQuickSearch(query) {
  const box = document.getElementById('quickSearchResults');
  if (!box) return;
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    box.classList.add('hidden');
    return;
  }

  const matchedPlayers = allPlayers.filter(p => p.name.toLowerCase().includes(q) || String(p.number).includes(q));
  const matchedTeams = getApprovedTeams().filter(t => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q));

  if (matchedPlayers.length === 0 && matchedTeams.length === 0) {
    box.innerHTML = '<div class="px-4 py-2 text-xs text-gray-400">Inga träffar på "' + query + '"</div>';
  } else {
    let html = '';
    matchedPlayers.forEach(p => {
      const posTxt = isGoaliePos(p.position) ? 'GK' : p.position;
      html += '<button type="button" onclick="openPlayerProfile(\'' + p.steamId + '\'); document.getElementById(\'quickSearchResults\').classList.add(\'hidden\');" class="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center justify-between"><span class="font-bold text-white">#' + p.number + ' ' + p.name + '</span><span class="text-xs text-shl-lightBlue">' + posTxt + '</span></button>';
    });
    matchedTeams.forEach(t => {
      html += '<button type="button" onclick="openTeamProfile(' + t.id + '); document.getElementById(\'quickSearchResults\').classList.add(\'hidden\');" class="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center justify-between border-t border-white/5"><span class="font-semibold text-gray-200">' + t.name + '</span><span class="text-xs text-amber-400">' + t.tag + '</span></button>';
    });
    box.innerHTML = html;
  }
  box.classList.remove('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const colors = {
    success: 'bg-emerald-600 border-emerald-400',
    error: 'bg-rose-600 border-rose-400',
    info: 'bg-[#0e1420] border-shl-lightBlue'
  };
  const toast = document.createElement('div');
  toast.className = (colors[type] || colors.info) + ' text-white text-xs font-semibold px-4 py-3 rounded shadow-2xl border-l-4 flex items-center gap-2.5 pointer-events-auto transition duration-300';
  toast.innerHTML = '<i class="fa-solid fa-hockey-puck text-shl-lightBlue"></i> <span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

window.addEventListener('DOMContentLoaded', () => {
  renderHeaderAuthArea();
  loadLeagueData();
});
