let currentUser = null;
let allTeams = [];
let allPlayers = [];
let allMatches = [];
let allRosters = [];
let allTransfers = [];
let myInvites = [];

let currentView = 'home';
let homeMatchFilter = 'upcoming';
let activeProfileSteamId = null;
let activeTeamProfileId = null;

// Säker hjälpfunktion som aldrig kraschar om ett HTML-element saknas
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setElHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// =========================================================================
// 0. SJÄLVLÄKANDE DOM: SKAPAR NYA VYER AUTOMATISKT OM DE SAKNAS I INDEX.HTML
// =========================================================================
function ensureDynamicDOM() {
  const main = document.querySelector('main');

  // 1. Lägg till Målvakt/Utespelare-knappar i Locker Room om de saknas
  const custNameInput = document.getElementById('custName');
  if (custNameInput && !document.getElementById('btnTypeSkater')) {
    const col1 = custNameInput.closest('.space-y-3');
    if (col1) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <label class="block text-gray-300 mb-1">Spelarmodell (Utespelare / Målvakt)</label>
        <div class="grid grid-cols-2 gap-1.5 bg-[#0b101b] p-1 rounded border border-white/15 mb-2">
          <button type="button" id="btnTypeSkater" onclick="setPlayerType('skater')" class="py-1.5 rounded font-bold uppercase text-[11px] bg-shl-blue text-white transition">
            Utespelare
          </button>
          <button type="button" id="btnTypeGoalie" onclick="setPlayerType('goalie')" class="py-1.5 rounded font-bold uppercase text-[11px] text-gray-400 hover:text-white transition">
            Målvakt (GK)
          </button>
        </div>
      `;
      col1.insertBefore(wrapper, col1.children[1] || null);
    }
  }

  // 2. Gör lagnamnet på spelarprofilen klickbart + lägg till kaptens-badge
  const profTeamName = document.getElementById('profileTeamName');
  if (profTeamName && !profTeamName.dataset.boundClick) {
    profTeamName.dataset.boundClick = 'true';
    profTeamName.classList.add('cursor-pointer', 'hover:underline', 'hover:text-shl-lightBlue');
    profTeamName.title = 'Klicka för att öppna lagprofilen';
    profTeamName.addEventListener('click', () => openProfilePlayerTeam());
  }
  const profTeamCrest = document.getElementById('profileTeamCrest');
  if (profTeamCrest && !profTeamCrest.dataset.boundClick) {
    profTeamCrest.dataset.boundClick = 'true';
    profTeamCrest.classList.add('cursor-pointer');
    profTeamCrest.addEventListener('click', () => openProfilePlayerTeam());
  }
  const profRoleBadge = document.getElementById('profileRoleBadge');
  if (profRoleBadge && !document.getElementById('profileTeamRoleBadge')) {
    const badge = document.createElement('span');
    badge.id = 'profileTeamRoleBadge';
    badge.className = 'hidden bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded border border-emerald-400/30';
    profRoleBadge.parentNode.insertBefore(badge, profRoleBadge.nextSibling);
  }

  // 3. Injicera Helskärms-Lagprofil (#view-team-profile) om den saknas i index.html
  if (main && !document.getElementById('view-team-profile')) {
    const teamSec = document.createElement('section');
    teamSec.id = 'view-team-profile';
    teamSec.className = 'hidden flex-1 bg-white';
    teamSec.innerHTML = `
      <div class="profile-hero-bg text-white relative overflow-hidden border-b border-white/10">
        <div class="max-w-[1160px] mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div class="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div id="teamProfileCrest" class="w-28 h-32 flex items-center justify-center shrink-0"></div>
            <div class="space-y-2">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span id="teamProfileRankBadge" class="bg-shl-blue/25 border border-shl-lightBlue/40 text-shl-lightBlue text-xs font-bold uppercase tracking-widest px-3 py-0.5 rounded">#- I TABELLEN</span>
                <span id="teamProfileRosterCount" class="bg-white/10 text-gray-200 text-xs font-bold uppercase tracking-widest px-3 py-0.5 rounded">0 / 10 SPELARE</span>
              </div>
              <h1 id="teamProfileName" class="font-shl text-4xl sm:text-6xl font-black uppercase tracking-tight leading-none">-</h1>
              <p id="teamProfileMeta" class="text-xs text-gray-300 font-medium">Lagkapten: -</p>
            </div>
          </div>
          <div id="teamProfileHeaderActions" class="flex flex-wrap items-center gap-3"></div>
        </div>
      </div>

      <div class="shl-career-gradient text-white py-6 shadow-inner">
        <div class="max-w-[1160px] mx-auto px-4">
          <div class="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/20 text-center">
            <div class="py-2"><div id="tpStatGP" class="font-shl text-3xl font-black">0</div><div class="text-xs text-white/80">Spelade matcher</div></div>
            <div class="py-2"><div id="tpStatPTS" class="font-shl text-3xl font-black">0</div><div class="text-xs text-white/80">Poäng</div></div>
            <div class="py-2"><div id="tpStatDiff" class="font-shl text-3xl font-black">0</div><div class="text-xs text-white/80">Målskillnad (+/-)</div></div>
            <div class="py-2"><div id="tpStatGoals" class="font-shl text-3xl font-black">0 - 0</div><div class="text-xs text-white/80">Gjorda - Insläppta</div></div>
          </div>
        </div>
      </div>

      <div id="teamCaptainControlPanel" class="hidden bg-slate-900 text-white border-b border-slate-800">
        <div class="max-w-[1160px] mx-auto px-4 sm:px-6 py-6 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-crown text-amber-400"></i>
              <h3 class="font-shl text-2xl font-extrabold uppercase tracking-wide">LAGKAPTEN & ROSTER-HANTERING (MAX 10 SPELARE)</h3>
            </div>
            <span class="text-xs text-gray-400">Endast Free Agents (spelare utan lag) kan bjudas in</span>
          </div>
          <div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div class="flex-1">
              <label class="block text-xs font-bold uppercase text-gray-300 mb-1">Välj Free Agent att bjuda in till laget</label>
              <select id="captainFreeAgentSelect" class="w-full bg-[#0b101b] border border-white/20 rounded px-3 py-2 text-sm text-white font-semibold"></select>
            </div>
            <button type="button" onclick="sendTeamInvite(false)" class="bg-[#4a8af4] hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded shadow transition shrink-0">
              <i class="fa-solid fa-paper-plane mr-1.5"></i> Skicka Laginbjudan (Inkorg)
            </button>
            <button type="button" id="btnAdminDirectAddPlayer" onclick="sendTeamInvite(true)" class="hidden bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded shadow transition shrink-0">
              <i class="fa-solid fa-bolt mr-1"></i> Lägg in direkt (Admin)
            </button>
          </div>
        </div>
      </div>

      <div class="max-w-[1160px] mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div class="space-y-4">
          <div class="flex items-center gap-2.5 border-b border-gray-200 pb-2">
            <span class="w-1.5 h-6 bg-[#649eff] rounded-sm"></span>
            <h2 class="font-shl text-2xl font-extrabold uppercase text-slate-900">SPELARTRUPP (ROSTER)</h2>
          </div>
          <div id="teamProfileRosterGrid" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-7 space-y-4">
            <div class="flex items-center gap-2.5 border-b border-gray-200 pb-2">
              <span class="w-1.5 h-6 bg-[#649eff] rounded-sm"></span>
              <h2 class="font-shl text-2xl font-extrabold uppercase text-slate-900">KOMMANDE & SPELADE MATCHER</h2>
            </div>
            <div id="teamProfileMatchesList" class="space-y-2.5"></div>
          </div>

          <div class="lg:col-span-5 space-y-4">
            <div class="flex items-center gap-2.5 border-b border-gray-200 pb-2">
              <span class="w-1.5 h-6 bg-[#649eff] rounded-sm"></span>
              <h2 class="font-shl text-2xl font-extrabold uppercase text-slate-900">TRANSFERHISTORIK</h2>
            </div>
            <div id="teamProfileTransfersList" class="space-y-2"></div>
          </div>
        </div>
      </div>
    `;
    main.appendChild(teamSec);
  }

  // 4. Injicera Inkorg-modalen (#inboxModal) om den saknas
  if (!document.getElementById('inboxModal')) {
    const modal = document.createElement('div');
    modal.id = 'inboxModal';
    modal.className = 'hidden fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-sm max-w-md w-full overflow-hidden shadow-2xl">
        <div class="bg-[#0e1420] text-white px-5 py-3.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-envelope text-shl-lightBlue"></i>
            <h3 class="font-shl text-xl font-bold uppercase">INKORG – LAGINBJUDNINGAR</h3>
          </div>
          <button type="button" onclick="closeInboxModal()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="inboxListContainer" class="p-5 space-y-3 max-h-96 overflow-y-auto"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // 5. Injicera Admin-verktyg för att skapa/radera lag & ge Admin-roll om de saknas i #view-admin
  const adminAppList = document.getElementById('adminApplicationsList');
  if (adminAppList && !document.getElementById('adminActiveTeamsList')) {
    const leftCol = adminAppList.parentNode.parentNode;
    const extraAdminBox = document.createElement('div');
    extraAdminBox.className = 'space-y-6 mt-6';
    extraAdminBox.innerHTML = `
      <div class="bg-white p-5 rounded-sm border border-gray-200 shadow-sm space-y-4">
        <h3 class="font-shl text-xl font-extrabold uppercase text-slate-900">SKAPA TESTLAG DIREKT / RADERA LAG</h3>
        <form onsubmit="adminCreateTeamDirect(event)" class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input type="text" id="adminNewTeamName" required placeholder="Lagnamn (t.ex. Brynäs IF)" class="sm:col-span-2 border border-gray-300 rounded px-2.5 py-2" />
          <input type="text" id="adminNewTeamTag" required maxlength="4" placeholder="Tagg (BIF)" class="border border-gray-300 rounded px-2.5 py-2 uppercase font-bold" />
          <div class="flex items-center gap-1">
            <input type="color" id="adminNewTeamPrimary" value="#0284c7" class="w-1/2 h-9 border border-gray-300 rounded cursor-pointer" />
            <input type="color" id="adminNewTeamSecondary" value="#fbbf24" class="w-1/2 h-9 border border-gray-300 rounded cursor-pointer" />
          </div>
          <select id="adminNewTeamCaptain" class="sm:col-span-2 border border-gray-300 rounded px-2.5 py-2"></select>
          <button type="submit" class="sm:col-span-2 bg-shl-blue hover:bg-blue-600 text-white font-bold uppercase tracking-wider py-2 rounded transition">
            + Skapa Godkänt Lag
          </button>
        </form>
        <div class="border-t border-gray-100 pt-3">
          <div class="text-xs font-bold uppercase text-gray-500 mb-2">Godkända lag i ligan</div>
          <div id="adminActiveTeamsList" class="space-y-2 max-h-60 overflow-y-auto"></div>
        </div>
      </div>

      <div class="bg-white p-5 rounded-sm border border-gray-200 shadow-sm space-y-3">
        <h3 class="font-shl text-xl font-extrabold uppercase text-slate-900">SPELARE & GE ADMIN-BEHÖRIGHET</h3>
        <div id="adminPlayersRoleList" class="divide-y divide-gray-100 max-h-64 overflow-y-auto text-xs"></div>
      </div>
    `;
    leftCol.appendChild(extraAdminBox);
  }
}

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

// =========================================================================
// 2. 3D/SVG PUCK KARAKTÄR (UTESPELARE ELLER MÅLVAKT / GK)
// =========================================================================
function isGoaliePos(pos) {
  const p = String(pos || '').toUpperCase();
  return p === 'MÅLVAKT' || p === 'GK' || p === 'GOALIE';
}

function renderPuckCharacterSVG(player) {
  const av = player?.avatar || {
    jerseyPrimary: '#0284c7', jerseyStripe: '#0a0d12', helmetColor: '#0a0d12',
    skinColor: '#c68b65', visor: 'tinted', beard: 'none', hairColor: '#23170f',
    shaftTape: '#28b5e1', bladeTape: '#111111', showChestNum: true
  };
  const isGK = isGoaliePos(player?.position);

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
    ? `<text x="150" y="182" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-style="italic" font-size="36" fill="#ffffff" stroke="${av.jerseyStripe}" stroke-width="4" paint-order="stroke fill" opacity="0.95">#${player?.number || 12}</text>`
    : '';
  const stickTransform = player?.handedness === 'Right' ? 'transform="translate(310, 0) scale(-1, 1)"' : '';

  // MÅLVAKTSMODELL (GK)
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
        <!-- Benskydd på isen -->
        <g>
          <polygon points="28,236 106,262 94,302 18,272" fill="#0d1016" stroke="#262d3d" stroke-width="1.5" />
          <polygon points="28,236 106,262 100,275 23,249" fill="#ffffff" opacity="0.08" />
          <polygon points="154,268 246,246 258,282 166,308" fill="#0d1016" stroke="#262d3d" stroke-width="1.5" />
          <polygon points="154,268 246,246 250,260 158,282" fill="#ffffff" opacity="0.08" />
        </g>
        <!-- Framåtlutad Torso -->
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
        <!-- Målvaktshjälm med galler & halsskydd -->
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
        <!-- Målvaktsklubba ("CLASSIC") -->
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

  // UTESPELARMODELL (DEFAULT)
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
// 3. RENDER ALL VIEWS & HEADER (INKLUSIVE INKORG)
// =========================================================================
function renderAll() {
  try {
    const approvedTeams = getApprovedTeams();
    setElText('topStatsCounter', `${allPlayers.length} spelare • ${approvedTeams.length} lag • ${allMatches.filter(m => m.status === 'completed').length} matcher`);

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
  } catch (err) {
    console.error('renderAll error:', err);
  }
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

    container.innerHTML = `
      <a href="/api/auth?action=login" class="bg-[#171a21] hover:bg-[#2a475e] text-white text-xs font-bold px-3.5 py-2 rounded border border-white/20 flex items-center gap-2 transition shadow">
        <i class="fa-brands fa-steam text-base"></i> Logga in med Steam
      </a>
    `;
  } else {
    const me = allPlayers.find(p => p.steamId === currentUser.steam_id) || normalizePlayer(currentUser);
    const isAdmin = me.accountRole === 'admin';
    if (hint) hint.innerHTML = `Inloggad via Steam: <strong class="text-white">${me.name}</strong>`;

    if (isAdmin) {
      if (navAdmin) { navAdmin.classList.remove('hidden'); navAdmin.classList.add('flex'); }
      if (mobileAdmin) mobileAdmin.classList.remove('hidden');
    } else {
      if (navAdmin) { navAdmin.classList.add('hidden'); navAdmin.classList.remove('flex'); }
      if (mobileAdmin) mobileAdmin.classList.add('hidden');
    }

    const roleBadge = isAdmin
      ? `<span class="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-1.5 py-0.2 rounded uppercase">ADMIN</span>`
      : `<span class="text-[10px] text-emerald-400 font-mono">#${me.number}</span>`;

    const inviteBadge = myInvites.length > 0
      ? `<span class="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold px-1.5 rounded-full animate-pulse">${myInvites.length}</span>`
      : '';

    container.innerHTML = `
      <div class="flex items-center gap-2">
        <button type="button" onclick="openInboxModal()" class="relative p-2 rounded bg-white/5 hover:bg-white/15 border border-white/15 text-gray-200 hover:text-white transition" title="Inkorg (Laginbjudningar)">
          <i class="fa-solid fa-envelope text-sm"></i>
          ${inviteBadge}
        </button>

        <button type="button" onclick="openPlayerProfile('${me.steamId}')" class="flex items-center gap-2.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-1 rounded transition">
          <div class="w-7 h-8 rounded bg-slate-800 overflow-hidden flex items-center justify-center">
            ${renderPuckCharacterSVG(me)}
          </div>
          <div class="text-left leading-tight hidden sm:block">
            <div class="text-xs font-bold text-white flex items-center gap-1.5">${me.name} ${roleBadge}</div>
            <div class="text-[10px] text-gray-400">Min Puck-Profil</div>
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
// 4. SCORE TICKER & MATCHLISTOR
// =========================================================================
function formatDateShort(dateStr) {
  if (!dateStr) return 'Datum ej satt';
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderScoreTicker() {
  const wrapper = document.getElementById('tickerWrapper');
  const container = document.getElementById('scoreTickerContainer');
  if (!container) return;

  if (allMatches.length === 0) {
    if (wrapper) wrapper.classList.add('hidden');
    return;
  }

  if (wrapper) wrapper.classList.remove('hidden');
  container.innerHTML = allMatches.map(m => {
    const isPlayed = m.status === 'completed';
    const statusText = isPlayed ? (m.is_shootout ? 'SPELAD SO' : m.is_overtime ? 'SPELAD ÖT' : 'SPELAD') : 'KOMMANDE';
    const centerText = isPlayed ? `${m.home_score} - ${m.away_score}` : formatDateShort(m.played_at);

    return `
      <div onclick="openMatchModal(${m.id})" class="px-4 py-1.5 flex flex-col justify-between min-w-[185px] bg-[#f8fafc] hover:bg-white cursor-pointer transition shrink-0">
        <div class="text-[9px] font-extrabold uppercase tracking-wider text-center ${isPlayed ? 'text-slate-600' : 'text-shl-blue'}">
          ${statusText}
        </div>
        <div class="flex items-center justify-between gap-2 my-auto">
          <div class="flex items-center gap-1.5">
            <span class="font-shl font-bold text-xs text-slate-800">${m.home_tag || 'HEM'}</span>
            ${renderTeamCrestSVG(m.home_team_id, 'w-5 h-5')}
          </div>
          <span class="font-shl ${isPlayed ? 'text-base font-black text-slate-900' : 'text-xs font-bold text-shl-blue'} px-1">${centerText}</span>
          <div class="flex items-center gap-1.5">
            ${renderTeamCrestSVG(m.away_team_id, 'w-5 h-5')}
            <span class="font-shl font-bold text-xs text-slate-800">${m.away_tag || 'BOR'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function scrollTicker(amount) {
  const el = document.getElementById('scoreTickerContainer');
  if (el) el.scrollBy({ left: amount, behavior: 'smooth' });
}

function setHomeMatchFilter(filter) {
  homeMatchFilter = filter;
  const btnUp = document.getElementById('homeMatchFilterUpcoming');
  const btnPl = document.getElementById('homeMatchFilterPlayed');
  if (btnUp && btnPl) {
    if (filter === 'upcoming') {
      btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#4a8af4] text-white shadow-sm transition';
      btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-gray-200 transition';
    } else {
      btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#4a8af4] text-white shadow-sm transition';
      btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-gray-200 transition';
    }
  }
  renderHomeMatches();
}

function renderHomeMatches() {
  const container = document.getElementById('homeMatchesContainer');
  if (!container) return;
  const filtered = allMatches.filter(m => homeMatchFilter === 'upcoming' ? m.status !== 'completed' : m.status === 'completed');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-[#f8fafc] border border-gray-200 rounded-sm p-8 text-center text-sm font-semibold text-gray-500">
        Inga ${homeMatchFilter === 'upcoming' ? 'kommande' : 'spelade'} matcher registrerade.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.slice(0, 6).map(m => {
    const isPlayed = m.status === 'completed';
    const centerDisplay = isPlayed ? `${m.home_score} - ${m.away_score}` : 'VS';
    return `
      <div class="bg-[#f8fafc] border border-gray-200 rounded-sm p-4 match-card-hover">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-xs text-gray-600 font-medium w-32 text-center sm:text-left shrink-0">
            ${formatDateShort(m.played_at || m.created_at)}
          </div>
          <div class="flex items-center justify-center gap-3 sm:gap-5 flex-1">
            <button type="button" onclick="openTeamProfile(${m.home_team_id})" class="flex items-center justify-end gap-2.5 flex-1 text-right hover:text-shl-blue transition">
              <span class="font-shl text-lg font-extrabold uppercase text-slate-900">${m.home_name || 'Hemmalag'}</span>
              ${renderTeamCrestSVG(m.home_team_id, 'w-8 h-8')}
            </button>
            <div class="text-center px-2 shrink-0">
              <div class="font-shl text-3xl font-black text-slate-900 leading-none">${centerDisplay}</div>
              <div class="text-[10px] text-gray-500 mt-1 font-medium">${m.server_ip || 'ELITSERIEN Server'}</div>
            </div>
            <button type="button" onclick="openTeamProfile(${m.away_team_id})" class="flex items-center justify-start gap-2.5 flex-1 text-left hover:text-shl-blue transition">
              ${renderTeamCrestSVG(m.away_team_id, 'w-8 h-8')}
              <span class="font-shl text-lg font-extrabold uppercase text-slate-900">${m.away_name || 'Bortalag'}</span>
            </button>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" onclick="openMatchModal(${m.id})" class="border border-[#649eff] text-[#4a8af4] hover:bg-[#4a8af4] hover:text-white text-xs font-semibold px-4 py-1.5 rounded-sm transition">
              Matchfakta
            </button>
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
}

function renderStandingsTables() {
  const sorted = computeStandings();
  const homeBody = document.getElementById('homeStandingsBody');
  const fullBody = document.getElementById('fullStandingsBody');

  if (sorted.length === 0) {
    const emptyRow = `<tr><td colspan="10" class="py-8 text-center text-xs text-gray-500">Inga godkända lag i tabellen ännu. Ansök med ett lag!</td></tr>`;
    if (homeBody) homeBody.innerHTML = emptyRow;
    if (fullBody) fullBody.innerHTML = emptyRow;
    return;
  }

  if (homeBody) {
    homeBody.innerHTML = sorted.map((t, idx) => {
      const diff = t.gf - t.ga;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      return `
        <tr onclick="openTeamProfile(${t.id})" class="hover:bg-blue-50/70 cursor-pointer transition">
          <td class="py-3 pl-4 pr-2 font-bold text-slate-900">${idx + 1}</td>
          <td class="py-3 px-2">
            <div class="flex items-center gap-2.5">
              ${renderTeamCrestSVG(t.id, 'w-6 h-6')}
              <span class="font-medium text-slate-800 hover:text-shl-blue">${t.name}</span>
            </div>
          </td>
          <td class="py-3 px-2 text-center text-gray-600">${t.gp}</td>
          <td class="py-3 px-2 text-center text-gray-600">${diffStr}</td>
          <td class="py-3 pl-2 pr-4 text-right font-bold text-slate-900">${t.pts}</td>
        </tr>
      `;
    }).join('');
  }

  if (fullBody) {
    fullBody.innerHTML = sorted.map((t, idx) => {
      const diff = t.gf - t.ga;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      return `
        <tr onclick="openTeamProfile(${t.id})" class="hover:bg-blue-50/60 cursor-pointer transition">
          <td class="py-3.5 pl-4 pr-2 font-bold text-slate-900">${idx + 1}</td>
          <td class="py-3.5 px-3">
            <div class="flex items-center gap-3">
              ${renderTeamCrestSVG(t.id, 'w-7 h-7')}
              <span class="font-bold text-slate-900 hover:text-shl-blue">${t.name}</span>
            </div>
          </td>
          <td class="py-3.5 px-3 text-center">${t.gp}</td>
          <td class="py-3.5 px-3 text-center">${t.w}</td>
          <td class="py-3.5 px-3 text-center">${t.otw}</td>
          <td class="py-3.5 px-3 text-center">${t.otl}</td>
          <td class="py-3.5 px-3 text-center">${t.l}</td>
          <td class="py-3.5 px-3 text-center text-gray-600">${t.gf} - ${t.ga}</td>
          <td class="py-3.5 px-3 text-center font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${diffStr}</td>
          <td class="py-3.5 pl-3 pr-5 text-right font-shl text-xl font-black text-slate-900">${t.pts}</td>
        </tr>
      `;
    }).join('');
  }
}

function renderHomeTopScorers() {
  const container = document.getElementById('homeTopScorersGrid');
  if (!container) return;

  if (allPlayers.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 bg-gray-50 border border-gray-200 rounded-sm p-6 text-center text-xs text-gray-500">
        Inga spelare har loggat in ännu. Var först med att logga in med Steam uppe till höger!
      </div>
    `;
    return;
  }

  const top3 = allPlayers.slice(0, 3);
  container.innerHTML = top3.map((p, i) => `
    <div onclick="openPlayerProfile('${p.steamId}')" class="bg-[#0e1420] text-white rounded-sm p-4 border border-slate-800 hover:border-shl-lightBlue cursor-pointer transition group relative overflow-hidden">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-widest text-shl-lightBlue">#${i + 1} ${isGoaliePos(p.position) ? 'MÅLVAKT (GK)' : p.position}</span>
        ${renderTeamCrestSVG(p.teamId, 'w-5 h-5')}
      </div>
      <div class="flex items-center gap-3">
        <div class="w-14 h-16 shrink-0 bg-white/5 rounded overflow-hidden flex items-center justify-center">
          ${renderPuckCharacterSVG(p)}
        </div>
        <div>
          <div class="font-shl text-xl font-black uppercase group-hover:text-shl-lightBlue transition">#${p.number} ${p.name}</div>
          <div class="text-xs text-gray-400">${p.g} Mål • ${p.a} Assist</div>
          <div class="text-sm font-extrabold text-amber-400 mt-0.5">${p.tp} Poäng</div>
        </div>
      </div>
    </div>
  `).join('');
}

// =========================================================================
// 6. SPELARPROFIL & PUCK LOCKER ROOM
// =========================================================================
function openMyProfile() {
  if (currentUser) {
    openPlayerProfile(currentUser.steam_id);
  } else if (allPlayers.length > 0) {
    openPlayerProfile(allPlayers[0].steamId);
  } else {
    showToast('Logga in med Steam uppe till höger för att spara din egen profil!', 'info');
    switchView('profile');
  }
}

function openPlayerProfile(steamId) {
  activeProfileSteamId = steamId;
  switchView('profile');
  try {
    renderProfileView(steamId);
  } catch (err) {
    console.error('renderProfileView error:', err);
  }
}

function openProfilePlayerTeam() {
  const p = allPlayers.find(x => x.steamId === activeProfileSteamId);
  if (p && p.teamId) {
    openTeamProfile(p.teamId);
  } else {
    switchView('teams');
  }
}

function renderProfileView(steamId) {
  const p = allPlayers.find(x => x.steamId === steamId) || allPlayers[0];
  if (!p) return;

  const team = getTeamById(p.teamId);
  const canEdit = currentUser && (currentUser.steam_id === p.steamId || currentUser.role === 'admin');

  setElHTML('profilePuckAvatarContainer', renderPuckCharacterSVG(p));
  setElText('profilePlayerName', p.name);
  setElText('profileNumberAndPos', `#${p.number} ${isGoaliePos(p.position) ? 'MÅLVAKT (GK)' : p.position}`);
  setElHTML('profileTeamCrest', renderTeamCrestSVG(p.teamId, 'w-6 h-6'));
  setElText('profileTeamName', team.name);
  setElText('profileSteamId', p.steamId);
  setElText('profileHandedness', p.handedness);
  setElText('profileHardestShot', `${p.hardestShot.toFixed(1)} km/h`);
  setElText('profilePassAcc', `${p.passAccuracy}%`);

  const tRoleBadge = document.getElementById('profileTeamRoleBadge');
  if (tRoleBadge) {
    if (p.teamId && p.teamRole === 'captain') {
      tRoleBadge.textContent = 'LAGKAPTEN (C)';
      tRoleBadge.classList.remove('hidden');
    } else if (p.teamId && p.teamRole === 'assistant') {
      tRoleBadge.textContent = 'ASSISTERANDE KAPTEN (A)';
      tRoleBadge.classList.remove('hidden');
    } else {
      tRoleBadge.classList.add('hidden');
    }
  }

  const adminBadge = document.getElementById('profileAdminBadge');
  if (adminBadge) {
    if (p.accountRole === 'admin') adminBadge.classList.remove('hidden');
    else adminBadge.classList.add('hidden');
  }

  const btnFloat = document.getElementById('btnEditAvatarFloating');
  const btnOpen = document.getElementById('btnOpenLockerRoom');
  const drawer = document.getElementById('avatarEditorDrawer');
  if (canEdit) {
    if (btnFloat) { btnFloat.classList.remove('hidden'); btnFloat.classList.add('flex'); }
    if (btnOpen) { btnOpen.classList.remove('hidden'); btnOpen.classList.add('flex'); }
  } else {
    if (btnFloat) { btnFloat.classList.add('hidden'); btnFloat.classList.remove('flex'); }
    if (btnOpen) { btnOpen.classList.add('hidden'); btnOpen.classList.remove('flex'); }
    if (drawer) drawer.classList.add('hidden');
  }

  setElText('careerGP', p.gp);
  setElText('careerTP', p.tp);
  setElText('careerG', p.g);
  setElText('careerA', p.a);

  const gauges = [
    { label: 'GP', value: p.gp },
    { label: 'TP', value: p.tp },
    { label: 'G', value: p.g },
    { label: 'A', value: p.a }
  ];
  setElHTML('profileSeasonGauges', gauges.map(g => `
    <div class="relative w-32 h-32 flex items-center justify-center">
      <svg viewBox="0 0 120 120" class="w-full h-full">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#d1d5db" stroke-width="7" stroke-dasharray="2 3.2" />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="font-sans text-2xl font-extrabold text-[#4a8af4] leading-none">${g.value}</span>
        <span class="text-[11px] font-bold text-slate-800 uppercase mt-1">${g.label}</span>
      </div>
    </div>
  `).join(''));

  populateAvatarCustomizerInputs(p);
}

function updatePlayerTypeButtons(pos) {
  const btnSkater = document.getElementById('btnTypeSkater');
  const btnGoalie = document.getElementById('btnTypeGoalie');
  if (!btnSkater || !btnGoalie) return;

  if (isGoaliePos(pos)) {
    btnGoalie.className = 'py-1.5 rounded font-bold uppercase text-[11px] bg-shl-blue text-white transition';
    btnSkater.className = 'py-1.5 rounded font-bold uppercase text-[11px] text-gray-400 hover:text-white transition';
  } else {
    btnSkater.className = 'py-1.5 rounded font-bold uppercase text-[11px] bg-shl-blue text-white transition';
    btnGoalie.className = 'py-1.5 rounded font-bold uppercase text-[11px] text-gray-400 hover:text-white transition';
  }
}

function setPlayerType(type) {
  const roleSelect = document.getElementById('custRole');
  if (!roleSelect) return;
  if (type === 'goalie') {
    roleSelect.value = 'MÅLVAKT';
  } else {
    if (isGoaliePos(roleSelect.value)) roleSelect.value = 'FORWARD';
  }
  previewAvatarFromInputs();
}

function populateAvatarCustomizerInputs(p) {
  const teamSel = document.getElementById('custTeamId');
  if (teamSel) {
    const approved = getApprovedTeams();
    teamSel.innerHTML = `<option value="">Fria Agenter (Inget lag)</option>` +
      approved.map(t => `<option value="${t.id}" ${Number(t.id) === Number(p.teamId) ? 'selected' : ''}>${t.name} (${t.tag})</option>`).join('');
  }

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('custName', p.name);
  setVal('custNumber', p.number);
  setVal('custRole', isGoaliePos(p.position) ? 'MÅLVAKT' : p.position);
  setVal('custHand', p.handedness);
  setVal('custJerseyPrimary', p.avatar.jerseyPrimary);
  setVal('custJerseyStripe', p.avatar.jerseyStripe);
  setVal('custHelmetColor', p.avatar.helmetColor);
  setVal('custSkinColor', p.avatar.skinColor);
  setVal('custVisor', p.avatar.visor);
  setVal('custBeard', p.avatar.beard);
  setVal('custHairColor', p.avatar.hairColor);
  setVal('custShaftTape', p.avatar.shaftTape);
  setVal('custBladeTape', p.avatar.bladeTape);

  const chestChk = document.getElementById('custShowChestNum');
  if (chestChk) chestChk.checked = p.avatar.showChestNum;
  updatePlayerTypeButtons(p.position);
}

function previewAvatarFromInputs() {
  const p = allPlayers.find(x => x.steamId === activeProfileSteamId);
  if (!p) return;

  const getVal = (id, fallback) => { const el = document.getElementById(id); return el ? el.value : fallback; };
  p.name = getVal('custName', p.name) || 'Spelare';
  p.number = parseInt(getVal('custNumber', p.number), 10) || 12;
  p.position = getVal('custRole', p.position);
  p.handedness = getVal('custHand', p.handedness);

  p.avatar.jerseyPrimary = getVal('custJerseyPrimary', p.avatar.jerseyPrimary);
  p.avatar.jerseyStripe = getVal('custJerseyStripe', p.avatar.jerseyStripe);
  p.avatar.helmetColor = getVal('custHelmetColor', p.avatar.helmetColor);
  p.avatar.skinColor = getVal('custSkinColor', p.avatar.skinColor);
  p.avatar.visor = getVal('custVisor', p.avatar.visor);
  p.avatar.beard = getVal('custBeard', p.avatar.beard);
  p.avatar.hairColor = getVal('custHairColor', p.avatar.hairColor);
  p.avatar.shaftTape = getVal('custShaftTape', p.avatar.shaftTape);
  p.avatar.bladeTape = getVal('custBladeTape', p.avatar.bladeTape);

  const chestChk = document.getElementById('custShowChestNum');
  if (chestChk) p.avatar.showChestNum = chestChk.checked;

  updatePlayerTypeButtons(p.position);

  setElHTML('profilePuckAvatarContainer', renderPuckCharacterSVG(p));
  setElText('profilePlayerName', p.name);
  setElText('profileNumberAndPos', `#${p.number} ${isGoaliePos(p.position) ? 'MÅLVAKT (GK)' : p.position}`);
  setElText('profileHandedness', p.handedness);
}

function applyTeamPresetToAvatar(teamId) {
  if (teamId) {
    const t = getTeamById(teamId);
    const pEl = document.getElementById('custJerseyPrimary');
    const sEl = document.getElementById('custJerseyStripe');
    if (pEl && t.primary_color) pEl.value = t.primary_color;
    if (sEl && t.secondary_color) sEl.value = t.secondary_color;
  }
  previewAvatarFromInputs();
}

function setQuickTape(shaftHex, bladeHex) {
  const sEl = document.getElementById('custShaftTape');
  const bEl = document.getElementById('custBladeTape');
  if (sEl) sEl.value = shaftHex;
  if (bEl) bEl.value = bladeHex;
  previewAvatarFromInputs();
}

function toggleAvatarEditor() {
  const el = document.getElementById('avatarEditorDrawer');
  if (el) el.classList.toggle('hidden');
}

async function saveAvatarChangesToDB() {
  const p = allPlayers.find(x => x.steamId === activeProfileSteamId);
  if (!p) return;

  const btn = document.getElementById('btnSaveCharacter');
  if (btn) { btn.disabled = true; btn.textContent = 'Sparar...'; }

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_character',
        targetSteamId: p.steamId,
        username: p.name,
        jerseyNumber: p.number,
        preferredPosition: p.position,
        stickHandedness: p.handedness,
        jerseyPrimary: p.avatar.jerseyPrimary,
        jerseyStripe: p.avatar.jerseyStripe,
        showChestNum: p.avatar.showChestNum,
        helmetColor: p.avatar.helmetColor,
        skinColor: p.avatar.skinColor,
        visorTint: p.avatar.visor,
        facialHair: p.avatar.beard,
        hairColor: p.avatar.hairColor,
        shaftTape: p.avatar.shaftTape,
        bladeTape: p.avatar.bladeTape
      })
    });

    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Kunde inte spara');

    showToast('Din Puck-karaktär har sparats!', 'success');
    const drawer = document.getElementById('avatarEditorDrawer');
    if (drawer) drawer.classList.add('hidden');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Spara Puck-Karaktär';
    }
  }
}

// =========================================================================
// 7. HELSKÄRMS LAGPROFIL (ROSTER, KAPTEN-VERKTYG, MATCHER & TRANSFERS)
// =========================================================================
function openTeamProfile(teamId) {
  if (!teamId) return;
  ensureDynamicDOM();
  activeTeamProfileId = Number(teamId);
  switchView('team-profile');
  try {
    renderTeamProfileView(activeTeamProfileId);
  } catch (err) {
    console.error('renderTeamProfileView error:', err);
  }
}

function renderTeamProfileView(teamId) {
  const team = allTeams.find(t => Number(t.id) === Number(teamId));
  if (!team) return;

  const standings = computeStandings();
  const rankIdx = standings.findIndex(s => Number(s.id) === Number(team.id));
  const st = standings[rankIdx] || { gp: 0, pts: 0, gf: 0, ga: 0 };
  const diff = st.gf - st.ga;
  const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

  const teamPlayers = allPlayers.filter(p => Number(p.teamId) === Number(team.id));
  const isAdmin = currentUser && currentUser.role === 'admin';
  const myMemberRow = currentUser
    ? allRosters.find(r => Number(r.team_id) === Number(team.id) && r.steam_id === currentUser.steam_id)
    : null;
  const isCaptain = (myMemberRow && myMemberRow.team_role === 'captain') || (currentUser && team.captain_steam_id === currentUser.steam_id);
  const isAssistant = myMemberRow && myMemberRow.team_role === 'assistant';
  const isMember = Boolean(myMemberRow) || (currentUser && Number(currentUser.team_id) === Number(team.id));
  const canManage = isAdmin || isCaptain || isAssistant;

  setElHTML('teamProfileCrest', renderTeamCrestSVG(team.id, 'w-24 h-28'));
  setElText('teamProfileRankBadge', rankIdx >= 0 ? `#${rankIdx + 1} I SERIETABELLEN` : 'EJ I TABELL');
  setElText('teamProfileRosterCount', `${teamPlayers.length} / 10 SPELARE`);
  setElText('teamProfileName', `${team.name} (${team.tag})`);
  setElText('teamProfileMeta', `Lagkapten: ${team.captain_name || 'Ej utsedd'}`);

  setElText('tpStatGP', st.gp);
  setElText('tpStatPTS', st.pts);
  setElText('tpStatDiff', diffStr);
  setElText('tpStatGoals', `${st.gf} - ${st.ga}`);

  // Knappar uppe till höger (Lämna lag för medlemmar / Radera lag för Admin)
  const actionsDiv = document.getElementById('teamProfileHeaderActions');
  if (actionsDiv) {
    let actionButtonsHTML = '';
    if (isMember && !isCaptain) {
      actionButtonsHTML += `
        <button type="button" onclick="leaveTeam(${team.id})" class="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded shadow transition">
          <i class="fa-solid fa-person-walking-arrow-right mr-1"></i> Lämna laget
        </button>
      `;
    } else if (isMember && isCaptain && teamPlayers.length > 1) {
      actionButtonsHTML += `
        <button type="button" onclick="leaveTeam(${team.id})" class="bg-white/10 hover:bg-rose-600 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded border border-white/20 transition">
          Lämna laget
        </button>
      `;
    }
    if (isAdmin) {
      actionButtonsHTML += `
        <button type="button" onclick="adminHandleTeam(${team.id}, 'delete')" class="bg-rose-900/80 hover:bg-rose-700 text-rose-100 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded border border-rose-500/40 transition">
          <i class="fa-solid fa-trash mr-1"></i> Radera lag (Admin)
        </button>
      `;
    }
    actionsDiv.innerHTML = actionButtonsHTML;
  }

  // Kapten / Assisterande / Admin kontrollpanel för att bjuda in Free Agents
  const capPanel = document.getElementById('teamCaptainControlPanel');
  const directBtn = document.getElementById('btnAdminDirectAddPlayer');
  if (capPanel) {
    if (canManage) {
      capPanel.classList.remove('hidden');
      if (directBtn) {
        if (isAdmin) directBtn.classList.remove('hidden
