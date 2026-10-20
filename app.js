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
let activeModalMatchId = null;

// =========================================================================
// 1. LADDA LIGADATA FRÅN NEON (/api/data)
// =========================================================================
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
    if (activeModalMatchId) {
      const stillExists = allMatches.find(m => Number(m.id) === Number(activeModalMatchId));
      if (stillExists) renderMatchModalContent(stillExists);
    }
  } catch (err) {
    console.error(err);
    document.getElementById('topStatsCounter').textContent = 'Databasen är tom eller otillgänglig';
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
  return allTeams.filter(t => t.status === 'approved');
}

function getPendingTeams() {
  return allTeams.filter(t => t.status === 'pending');
}

function getTeamById(id) {
  if (!id) return { id: null, name: 'Fria Agenter', tag: 'FRI', primary_color: '#1e293b', secondary_color: '#649eff' };
  return allTeams.find(t => Number(t.id) === Number(id)) || { id, name: 'Okänt lag', tag: 'LAG', primary_color: '#1e293b', secondary_color: '#649eff' };
}

function renderTeamCrestSVG(teamId, sizeClass = 'w-6 h-6') {
  const t = getTeamById(teamId);
  const primary = t.primary_color || '#0284c7';
  const secondary = t.secondary_color || '#ffffff';
  const tag = (t.tag || 'FRI').slice(0, 4);
  return `
    <svg viewBox="0 0 40 44" class="${sizeClass} shrink-0 drop-shadow-sm select-none">
      <path d="M4 4 H36 V22 C36 33 20 41 20 41 C20 41 4 33 4 22 Z" fill="${primary}" stroke="${secondary}" stroke-width="3" />
      <path d="M7 18 H33 V23 H7 Z" fill="${secondary}" opacity="0.85" />
      <text x="20" y="24" text-anchor="middle" fill="#ffffff" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-size="11" stroke="#000" stroke-width="1.5" paint-order="stroke fill">${tag}</text>
    </svg>
  `;
}

// Hjälpfunktion för att avgöra om en match är försenad
function isMatchDelayed(m) {
  if (m.status === 'completed' || !m.played_at) return false;
  const scheduledMs = new Date(m.played_at).getTime();
  // Försenad om utsatt tid har passerats med mer än 90 minuter utan att resultat rapporterats
  return Date.now() > scheduledMs + 90 * 60 * 1000;
}

function getMatchStatusBadge(m) {
  if (m.rematch_requested_by_team_id) {
    return { label: 'REMATCH BEGÄRD', cls: 'bg-amber-500 text-slate-950' };
  }
  if (m.status === 'completed') {
    const sub = m.is_shootout ? ' (SO)' : m.is_overtime ? ' (ÖT)' : '';
    return { label: `SPELAD${sub}`, cls: 'bg-gray-200 text-gray-800' };
  }
  if (isMatchDelayed(m)) {
    return { label: 'FÖRSENAD', cls: 'bg-rose-600 text-white' };
  }
  if (m.proposed_time) {
    return { label: 'TID FÖRESLAGEN', cls: 'bg-amber-100 text-amber-800 border border-amber-300' };
  }
  if (m.played_at) {
    return { label: 'BOKAD TID', cls: 'bg-emerald-100 text-emerald-800' };
  }
  return { label: 'EJ TIDSATT', cls: 'bg-slate-100 text-slate-600' };
}

// =========================================================================
// 2. 3D/SVG PUCK KARAKTÄR (UTESPELARE ELLER MÅLVAKT / GK)
// =========================================================================
function isGoaliePos(pos) {
  const p = String(pos || '').toUpperCase();
  return p === 'MÅLVAKT' || p === 'GK' || p === 'GOALIE';
}

function renderPuckCharacterSVG(player) {
  const av = player.avatar;
  const isGK = isGoaliePos(player.position);

  let facialHairSVG = '';
  if (av.beard === 'full') {
    facialHairSVG = `
      <polygon points="122,94 134,110 156,113 176,108 182,90 176,82 170,96 154,101 136,98 128,84" fill="${av.hairColor}" />
      <polygon points="138,89 152,85 166,89 162,94 142,94" fill="${av.hairColor}" />
    `;
  } else if (av.beard === 'mustache') {
    facialHairSVG = `<polygon points="136,88 152,84 168,88 164,95 140,95" fill="${av.hairColor}" />`;
  } else if (av.beard === 'goatee') {
    facialHairSVG = `
      <polygon points="138,89 152,85 166,89 162,94 142,94" fill="${av.hairColor}" />
      <polygon points="142,101 162,101 157,112 146,112" fill="${av.hairColor}" />
    `;
  }

  const chestNumberSVG = av.showChestNum
    ? `<text x="150" y="182" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-style="italic" font-size="36" fill="#ffffff" stroke="${av.jerseyStripe}" stroke-width="4" paint-order="stroke fill" opacity="0.95">#${player.number}</text>`
    : '';
  const stickTransform = player.handedness === 'Right' ? 'transform="translate(310, 0) scale(-1, 1)"' : '';

  if (isGK) {
    return `
      <svg viewBox="0 0 320 340" class="w-full h-full drop-shadow-[0_18px_28px_rgba(0,0,0,0.75)]">
        <defs>
          <linearGradient id="iceShadowGK" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <ellipse cx="155" cy="312" rx="115" ry="16" fill="url(#iceShadowGK)" />
        <g>
          <polygon points="28,236 106,262 94,302 18,272" fill="#0d1016" stroke="#262d3d" stroke-width="1.5" />
          <polygon points="28,236 106,262 100,275 23,249" fill="#ffffff" opacity="0.08" />
          <polygon points="154,268 246,246 258,282 166,308" fill="#0d1016" stroke="#262d3d" stroke-width="1.5" />
          <polygon points="154,268 246,246 250,260 158,282" fill="#ffffff" opacity="0.08" />
        </g>
        <g>
          <polygon points="104,212 178,214 166,274 96,264" fill="${av.jerseyPrimary}" />
          <polygon points="104,212 178,214 166,274 96,264" fill="#000000" opacity="0.18" />
          <polygon points="82,126 206,132 196,216 92,212" fill="${av.jerseyPrimary}" />
          <polygon points="82,126 112,138 106,212 72,184" fill="${av.jerseyPrimary}" />
          <polygon points="82,126 112,138 106,212 72,184" fill="#000000" opacity="0.22" />
          <polygon points="206,132 222,172 196,216 184,144" fill="${av.jerseyPrimary}" />
          <polygon points="206,132 222,172 196,216 184,144" fill="#000000" opacity="0.26" />
          <polygon points="92,202 198,206 194,218 94,214" fill="${av.jerseyStripe}" />
          ${chestNumberSVG}
        </g>
        <g>
          <polygon points="124,62 182,62 178,98 156,112 132,108 122,88" fill="${av.skinColor}" />
          ${facialHairSVG}
          <polygon points="130,96 172,96 164,138 142,144 126,122" fill="${av.helmetColor}" />
          <polygon points="130,96 172,96 164,138 142,144 126,122" fill="#000000" opacity="0.25" />
          <polygon points="112,48 134,22 174,22 194,46 188,88 174,98 156,64 124,64 114,88" fill="${av.helmetColor}" />
          <polygon points="134,22 174,22 182,42 126,42" fill="#ffffff" opacity="0.1" />
          <polygon points="122,60 184,60 176,98 154,104 126,96" fill="rgba(15,23,42,0.35)" stroke="#cbd5e1" stroke-width="2" />
          <line x1="136" y1="60" x2="134" y2="98" stroke="#cbd5e1" stroke-width="1.8" />
          <line x1="152" y1="60" x2="152" y2="103" stroke="#cbd5e1" stroke-width="1.8" />
          <line x1="168" y1="60" x2="166" y2="99" stroke="#cbd5e1" stroke-width="1.8" />
          <line x1="123" y1="71" x2="182" y2="71" stroke="#cbd5e1" stroke-width="1.8" />
          <line x1="124" y1="82" x2="180" y2="82" stroke="#cbd5e1" stroke-width="1.8" />
          <line x1="126" y1="92" x2="177" y2="92" stroke="#cbd5e1" stroke-width="1.8" />
        </g>
        <g ${stickTransform}>
          <polygon points="42,118 56,108 112,162 98,174" fill="${av.shaftTape}" />
          <polygon points="112,162 96,178 192,268 210,250" fill="#d5b384" stroke="#9c7a4c" stroke-width="1" />
          <line x1="103" y1="171" x2="119" y2="155" stroke="#18181b" stroke-width="3" />
          <line x1="109" y1="177" x2="125" y2="161" stroke="#18181b" stroke-width="2" />
          <line x1="176" y1="252" x2="194" y2="234" stroke="#18181b" stroke-width="2" />
          <line x1="182" y1="258" x2="200" y2="240" stroke="#18181b" stroke-width="3" />
          <g transform="translate(152, 212) rotate(43)">
            <text x="0" y="0" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-style="italic" font-size="18" letter-spacing="2" fill="#18181b">CLASSIC</text>
          </g>
          <polygon points="192,268 210,250 232,264 218,284" fill="#c69f6d" />
          <polygon points="218,284 228,262 304,284 294,312" fill="#c69f6d" />
          <polygon points="220,283 230,262 294,281 284,309" fill="${av.bladeTape}" />
        </g>
      </svg>
    `;
  }

  let visorFill = 'rgba(20, 18, 18, 0.78)';
  let visorShine = 'rgba(255, 255, 255, 0.25)';
  if (av.visor === 'mirror') {
    visorFill = 'rgba(37, 99, 235, 0.78)';
    visorShine = 'rgba(147, 197, 253, 0.65)';
  } else if (av.visor === 'gold') {
    visorFill = 'rgba(217, 119, 6, 0.8)';
    visorShine = 'rgba(253, 224, 71, 0.75)';
  } else if (av.visor === 'clear') {
    visorFill = 'rgba(226, 232, 240, 0.32)';
    visorShine = 'rgba(255, 255, 255, 0.55)';
  }

  return `
    <svg viewBox="0 0 320 340" class="w-full h-full drop-shadow-[0_18px_28px_rgba(0,0,0,0.75)]">
      <defs>
        <linearGradient id="iceShadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="316" rx="75" ry="12" fill="url(#iceShadow)" />
      <g>
        <polygon points="116,226 150,228 150,295 112,268" fill="${av.jerseyPrimary}" />
        <polygon points="116,226 150,228 150,295 112,268" fill="#000000" opacity="0.12" />
        <polygon points="150,228 184,225 188,266 150,295" fill="${av.jerseyPrimary}" />
        <polygon points="112,268 150,295 188,266 150,302" fill="#000000" opacity="0.28" />
      </g>
      <g>
        <polygon points="114,120 186,118 196,125 104,126" fill="${av.jerseyStripe}" />
        <polygon points="104,126 196,125 214,145 88,147" fill="${av.jerseyPrimary}" />
        <polygon points="104,126 196,125 214,145 88,147" fill="#ffffff" opacity="0.14" />
        <polygon points="88,147 152,148 148,200 100,198" fill="${av.jerseyPrimary}" />
        <polygon points="152,148 214,145 202,196 148,200" fill="${av.jerseyPrimary}" />
        <polygon points="152,148 214,145 202,196 148,200" fill="#000000" opacity="0.1" />
        <polygon points="88,147 100,198 112,208 85,172" fill="${av.jerseyPrimary}" />
        <polygon points="88,147 100,198 112,208 85,172" fill="#000000" opacity="0.24" />
        <polygon points="214,145 216,170 190,206 202,196" fill="${av.jerseyPrimary}" />
        <polygon points="214,145 216,170 190,206 202,196" fill="#000000" opacity="0.28" />
        <polygon points="100,198 148,200 202,196 190,213 150,216 112,213" fill="${av.jerseyStripe}" />
        ${chestNumberSVG}
      </g>
      <g>
        <polygon points="122,64 180,64 178,96 156,112 134,109 120,90" fill="${av.skinColor}" />
        <polygon points="154,64 180,64 178,96 156,112" fill="#000000" opacity="0.14" />
        ${facialHairSVG}
        <polygon points="114,48 134,26 168,25 188,45 186,68 152,65 114,68" fill="${av.helmetColor}" />
        <polygon points="134,26 168,25 178,42 126,44" fill="#ffffff" opacity="0.09" />
        <polygon points="114,62 123,62 123,86 115,80" fill="${av.helmetColor}" />
        <polygon points="178,60 186,60 184,84 177,86" fill="${av.helmetColor}" />
        <polygon points="112,58 152,55 188,58 183,81 152,85 117,80" fill="${visorFill}" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
        <polygon points="122,60 138,59 130,79 119,77" fill="${visorShine}" />
      </g>
      <g ${stickTransform}>
        <polygon points="298,125 310,136 108,298 96,287" fill="#0c1017" />
        <polygon points="242,170 254,181 162,255 150,244" fill="#1e3a5f" opacity="0.7" />
        <line x1="238" y1="175" x2="158" y2="249" stroke="#38bdf8" stroke-width="2" stroke-dasharray="8 4" opacity="0.75" />
        <polygon points="298,125 311,137 242,192 230,180" fill="${av.shaftTape}" />
        <polygon points="296,120 314,135 307,142 290,127" fill="${av.shaftTape}" filter="brightness(1.1)" />
        <polygon points="108,284 114,296 22,324 16,301 24,292" fill="#090b10" stroke="#1e293b" stroke-width="1" />
        <polygon points="82,290 87,304 34,320 30,298" fill="${av.bladeTape}" />
        <g transform="translate(46, 308)">
          <path d="M0,8 L0,20 A24,8 0 0,0 48,20 L48,8 Z" fill="#090b0e" />
          <ellipse cx="24" cy="8" rx="24" ry="8" fill="#1e242d" stroke="#cbd5e1" stroke-width="1" />
          <text x="24" y="10.5" text-anchor="middle" fill="#e2e8f0" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-size="8" letter-spacing="1.5">PUCK</text>
        </g>
      </g>
    </svg>
  `;
}

// =========================================================================
// 3. RENDER ALL VIEWS
// =========================================================================
function renderAll() {
  const approvedTeams = getApprovedTeams();
  document.getElementById('topStatsCounter').textContent =
    `${approvedTeams.length} lag • ${allPlayers.length} spelare • ${allMatches.filter(m => m.status === 'completed').length} spelade matcher`;

  const teamsSub = document.getElementById('teamsCountSubtitle');
  if (teamsSub) teamsSub.textContent = `KLUBBAR (${approvedTeams.length} / 14 LAG)`;

  renderHeaderAuthArea();
  renderScoreTicker();
  renderHomeMatches();
  renderStandingsTables();
  renderHomeTopScorers();
  renderFullScheduleView();
  renderFullStatsView();
  renderTeamsView();
  renderAdminView();

  if (activeProfileSteamId) renderProfileView(activeProfileSteamId);
  if (activeTeamProfileId) renderTeamProfileView(activeTeamProfileId);
}

function renderHeaderAuthArea() {
  const container = document.getElementById('headerAuthArea');
  const hint = document.getElementById('topAuthHint');
  const navAdmin = document.getElementById('nav-admin');
  const mobileAdmin = document.getElementById('mobileAdminBtn');

  if (!currentUser) {
    hint.textContent = 'Utloggad';
    if (navAdmin) { navAdmin.classList.add('hidden'); navAdmin.classList.remove('flex'); }
    if (mobileAdmin) mobileAdmin.classList.add('hidden');

    container.innerHTML = `
      <a href="/api/auth?action=login" class="bg-[#171a21] hover:bg-[#2a475e] text-white text-xs font-bold px-3.5 py-2 rounded border border-white/20 flex items-center gap-2 transition">
        <i class="fa-brands fa-steam text-base"></i> Logga in med Steam
      </a>
    `;
  } else {
    const me = allPlayers.find(p => p.steamId === currentUser.steam_id) || normalizePlayer(currentUser);
    const isAdmin = me.accountRole === 'admin';
    hint.innerHTML = `Inloggad: <strong class="text-white">${me.name}</strong>`;

    if (isAdmin) {
      navAdmin.classList.remove('hidden');
      navAdmin.classList.add('flex');
      mobileAdmin.classList.remove('hidden');
    } else {
      navAdmin.classList.add('hidden');
      navAdmin.classList.remove('flex');
      mobileAdmin.classList.add('hidden');
    }

    const roleBadge = isAdmin
      ? `<span class="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-1.5 py-0.2 rounded uppercase">ADMIN</span>`
      : `<span class="text-[10px] text-gray-400 font-mono">#${me.number}</span>`;

    const inviteBadge = myInvites.length > 0
      ? `<span class="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold px-1.5 rounded-full">${myInvites.length}</span>`
      : '';

    container.innerHTML = `
      <div class="flex items-center gap-2">
        <button onclick="openInboxModal()" class="relative p-2 rounded bg-white/5 hover:bg-white/15 border border-white/15 text-gray-200 hover:text-white transition" title="Inkorg">
          <i class="fa-solid fa-envelope text-sm"></i>
          ${inviteBadge}
        </button>

        <button onclick="openPlayerProfile('${me.steamId}')" class="flex items-center gap-2.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-1 rounded transition">
          <div class="w-7 h-8 rounded bg-slate-800 overflow-hidden flex items-center justify-center">
            ${renderPuckCharacterSVG(me)}
          </div>
          <div class="text-left leading-tight hidden sm:block">
            <div class="text-xs font-bold text-white flex items-center gap-1.5">${me.name} ${roleBadge}</div>
            <div class="text-[10px] text-gray-400">Min Profil</div>
          </div>
        </button>

        <a href="/api/auth?action=logout" title="Logga ut" class="p-2 rounded bg-white/5 hover:bg-rose-600/30 border border-white/10 text-gray-300 hover:text-white text-xs transition">
          <i class="fa-solid fa-right-from-bracket"></i>
        </a>
      </div>
    `;
  }
}

// =========================================================================
// 4. SCORE TICKER & HEMSIDANS MATCHER / SPELARE
// =========================================================================
function formatDateShort(dateStr) {
  if (!dateStr) return 'Tid ej satt';
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderScoreTicker() {
  const wrapper = document.getElementById('tickerWrapper');
  const container = document.getElementById('scoreTickerContainer');

  if (allMatches.length === 0) {
    wrapper.classList.add('hidden');
    return;
  }

  wrapper.classList.remove('hidden');
  container.innerHTML = allMatches.map(m => {
    const isPlayed = m.status === 'completed';
    const delayed = isMatchDelayed(m);
    const topLabel = m.rematch_requested_by_team_id
      ? 'REMATCH BEGÄRD'
      : isPlayed
      ? (m.is_shootout ? 'SLUT (SO)' : m.is_overtime ? 'SLUT (ÖT)' : 'SLUT')
      : delayed
      ? 'FÖRSENAD'
      : `OMGÅNG ${m.round_number || 1}`;

    const centerText = isPlayed ? `${m.home_score} - ${m.away_score}` : (m.played_at ? formatDateShort(m.played_at) : 'VS');

    return `
      <div onclick="openMatchModal(${m.id})" class="px-4 py-1.5 flex flex-col justify-between min-w-[180px] bg-white hover:bg-gray-50 cursor-pointer transition shrink-0">
        <div class="text-[9px] font-bold uppercase tracking-wider text-center ${delayed ? 'text-rose-600' : isPlayed ? 'text-gray-500' : 'text-shl-blue'}">
          ${topLabel}
        </div>
        <div class="flex items-center justify-between gap-2 my-auto">
          <div class="flex items-center gap-1.5">
            <span class="font-shl font-bold text-xs text-slate-900">${m.home_tag || 'HEM'}</span>
            ${renderTeamCrestSVG(m.home_team_id, 'w-5 h-5')}
          </div>
          <span class="font-shl ${isPlayed ? 'text-base font-black text-slate-900' : 'text-xs font-bold text-gray-600'} px-1">${centerText}</span>
          <div class="flex items-center gap-1.5">
            ${renderTeamCrestSVG(m.away_team_id, 'w-5 h-5')}
            <span class="font-shl font-bold text-xs text-slate-900">${m.away_tag || 'BOR'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function scrollTicker(amount) {
  document.getElementById('scoreTickerContainer').scrollBy({ left: amount, behavior: 'smooth' });
}

function setHomeMatchFilter(filter) {
  homeMatchFilter = filter;
  const btnUp = document.getElementById('homeMatchFilterUpcoming');
  const btnPl = document.getElementById('homeMatchFilterPlayed');
  if (filter === 'upcoming') {
    btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-slate-900 text-white transition';
    btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-200 text-gray-700 hover:bg-gray-300 transition';
  } else {
    btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-slate-900 text-white transition';
    btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-200 text-gray-700 hover:bg-gray-300 transition';
  }
  renderHomeMatches();
}

function renderHomeMatches() {
  const container = document.getElementById('homeMatchesContainer');
  const filtered = allMatches.filter(m => homeMatchFilter === 'upcoming' ? m.status !== 'completed' : m.status === 'completed');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-sm p-8 text-center text-xs text-gray-500">
        Inga ${homeMatchFilter === 'upcoming' ? 'kommande' : 'spelade'} matcher registrerade.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.slice(0, 6).map(m => {
    const isPlayed = m.status === 'completed';
    const badge = getMatchStatusBadge(m);
    const centerDisplay = isPlayed ? `${m.home_score} - ${m.away_score}` : 'VS';
    return `
      <div onclick="openMatchModal(${m.id})" class="bg-white border border-gray-200 rounded-sm p-4 match-card-hover cursor-pointer">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="w-36 text-center sm:text-left shrink-0 space-y-1">
            <div class="text-[10px] font-bold uppercase text-gray-400">Omgång ${m.round_number || 1}</div>
            <div class="text-xs text-gray-700 font-medium">${formatDateShort(m.played_at)}</div>
            <span class="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${badge.cls}">${badge.label}</span>
          </div>
          <div class="flex items-center justify-center gap-3 sm:gap-5 flex-1">
            <div class="flex items-center justify-end gap-2.5 flex-1 text-right">
              <span class="font-shl text-lg font-extrabold uppercase text-slate-900">${m.home_name || 'Hemmalag'}</span>
              ${renderTeamCrestSVG(m.home_team_id, 'w-8 h-8')}
            </div>
            <div class="text-center px-2 shrink-0">
              <div class="font-shl text-3xl font-black text-slate-900 leading-none">${centerDisplay}</div>
              ${m.match_code ? `<div class="text-[10px] font-mono font-bold text-shl-blue mt-1">${m.match_code}</div>` : ''}
            </div>
            <div class="flex items-center justify-start gap-2.5 flex-1 text-left">
              ${renderTeamCrestSVG(m.away_team_id, 'w-8 h-8')}
              <span class="font-shl text-lg font-extrabold uppercase text-slate-900">${m.away_name || 'Bortalag'}</span>
            </div>
          </div>
          <div class="shrink-0">
            <span class="border border-gray-300 text-slate-800 hover:bg-slate-900 hover:text-white text-xs font-semibold px-3.5 py-1.5 rounded-sm transition inline-block">
              Matchrum
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// UTAN #1 / #2 NUMRERING PÅ SPELARKORTEN
function renderHomeTopScorers() {
  const container = document.getElementById('homeTopScorersGrid');
  if (allPlayers.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 bg-white border border-gray-200 rounded-sm p-6 text-center text-xs text-gray-500">
        Inga spelare har loggat in ännu.
      </div>
    `;
    return;
  }

  const top3 = allPlayers.slice(0, 6);
  container.innerHTML = top3.map(p => {
    const team = getTeamById(p.teamId);
    const posText = isGoaliePos(p.position) ? 'MÅLVAKT' : p.position;
    return `
      <div onclick="openPlayerProfile('${p.steamId}')" class="bg-[#0c111b] text-white rounded-sm p-4 border border-slate-800 hover:border-shl-lightBlue cursor-pointer transition group">
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">${posText} • ${team.tag}</span>
          ${renderTeamCrestSVG(p.teamId, 'w-5 h-5')}
        </div>
        <div class="flex items-center gap-3">
          <div class="w-14 h-16 shrink-0 bg-white/5 rounded overflow-hidden flex items-center justify-center">
            ${renderPuckCharacterSVG(p)}
          </div>
          <div>
            <div class="font-shl text-2xl font-black uppercase group-hover:text-shl-lightBlue transition leading-none">#${p.number} ${p.name}</div>
            <div class="text-xs text-gray-400 mt-1">${p.g} Mål • ${p.a} Assist</div>
            <div class="text-sm font-bold text-amber-400 mt-0.5">${p.tp} Poäng</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================================
// 5. SERIETABELL
// =========================================================================
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
