let currentUser = null;
let allTeams = [];
let allPlayers = [];
let allMatches = [];

let currentView = 'home';
let homeMatchFilter = 'upcoming';
let activeProfileSteamId = null;

// Huvudfunktion för att ladda data
async function loadLeagueData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Kunde inte hämta data');
    const data = await res.json();

    currentUser = data.currentUser || null;
    allTeams = data.teams || [];
    allPlayers = (data.players || []).map(normalizePlayer);
    allMatches = data.matches || [];

    if (!activeProfileSteamId) {
      if (currentUser) activeProfileSteamId = currentUser.steam_id;
      else if (allPlayers.length > 0) activeProfileSteamId = allPlayers[0].steamId;
    }

    renderAll();
  } catch (err) {
    console.error(err);
    document.getElementById('topStatsCounter').textContent = 'Databasen är tom eller otillgänglig';
    // Även om det kraschar måste vi rita upp sidan så att man kan logga in!
    renderAll(); 
  }
}

// Städar och normaliserar spelardata från databasen
function normalizePlayer(p) {
  const passAtt = p.passes_attempted || 0;
  const passComp = p.passes_completed || 0;
  const passAcc = passAtt > 0 ? Math.round((passComp / passAtt) * 100) : 0;

  return {
    steamId: p.steam_id,
    name: p.username || 'Spelare',
    avatarUrl: p.avatar_url || '',
    accountRole: p.role || 'player',
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

// Renderar lag-logotyper (SVG)
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

// Renderar Puck-karaktären i 3D/SVG
function renderPuckCharacterSVG(player) {
  const av = player.avatar;
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

  const chestNumberSVG = av.showChestNum ? `<text x="150" y="182" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-style="italic" font-size="38" fill="#ffffff" stroke="${av.jerseyStripe}" stroke-width="4" paint-order="stroke fill" opacity="0.95">#${player.number}</text>` : '';
  const stickTransform = player.handedness === 'Right' ? 'transform="translate(310, 0) scale(-1, 1)"' : '';

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

// Kallar på alla under-funktioner
function renderAll() {
  const approvedTeams = getApprovedTeams();
  document.getElementById('topStatsCounter').textContent = `${allPlayers.length} registrerade spelare • ${approvedTeams.length} lag`;

  renderHeaderAuthArea();
  renderScoreTicker();
  renderHomeMatches();
  renderStandingsTables();
  renderHomeTopScorers();
  renderFullScheduleView();
  renderFullStatsView();
  renderTeamsView();
  renderAdminView();

  if (activeProfileSteamId) {
    renderProfileView(activeProfileSteamId);
  }
}

// FIX FÖR INLOGGNINGSKNAPPEN
function renderHeaderAuthArea() {
  const container = document.getElementById('headerAuthArea');
  const hint = document.getElementById('topAuthHint');
  const navAdmin = document.getElementById('nav-admin');
  const mobileAdmin = document.getElementById('mobileAdminBtn');

  if (!currentUser) {
    hint.textContent = 'Utloggad besökare';
    if(navAdmin) {
      navAdmin.classList.add('hidden');
      navAdmin.classList.remove('flex');
    }
    if(mobileAdmin) mobileAdmin.classList.add('hidden');

    container.innerHTML = `
      <a href="/api/auth?action=login" class="bg-[#171a21] hover:bg-[#2a475e] text-white text-xs font-bold px-3.5 py-2 rounded border border-white/20 flex items-center gap-2 transition shadow">
        <i class="fa-brands fa-steam text-base"></i> Logga in med Steam
      </a>
    `;
  } else {
    const me = allPlayers.find(p => p.steamId === currentUser.steam_id) || normalizePlayer(currentUser);
    const isAdmin = me.accountRole === 'admin';
    hint.innerHTML = `Inloggad via Steam: <strong class="text-white">${me.name}</strong>`;

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
      : `<span class="text-[10px] text-emerald-400 font-mono">#${me.number}</span>`;

    container.innerHTML = `
      <div class="flex items-center gap-2">
        <button onclick="openPlayerProfile('${me.steamId}')" class="flex items-center gap-2.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-1 rounded transition">
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

// FIX FÖR RULLANDE SPELSCEHMAT (DÖLJS OM DET ÄR TOMT)
function formatDateShort(dateStr) {
  if (!dateStr) return 'Datum ej satt';
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderScoreTicker() {
  const wrapper = document.getElementById('tickerWrapper');
  const container = document.getElementById('scoreTickerContainer');
  
  if (allMatches.length === 0) {
    wrapper.classList.add('hidden'); // Döljer hela rutan om den är tom!
    return;
  }
  
  wrapper.classList.remove('hidden');
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
  document.getElementById('scoreTickerContainer').scrollBy({ left: amount, behavior: 'smooth' });
}

function setHomeMatchFilter(filter) {
  homeMatchFilter = filter;
  const btnUp = document.getElementById('homeMatchFilterUpcoming');
  const btnPl = document.getElementById('homeMatchFilterPlayed');
  if (filter === 'upcoming') {
    btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#4a8af4] text-white shadow-sm transition';
    btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-gray-200 transition';
  } else {
    btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#4a8af4] text-white shadow-sm transition';
    btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-gray-200 transition';
  }
  renderHomeMatches();
}

function renderHomeMatches() {
  const container = document.getElementById('homeMatchesContainer');
  const filtered = allMatches.filter(m => homeMatchFilter === 'upcoming' ? m.status !== 'completed' : m.status === 'completed');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-[#f8fafc] border border-gray-200 rounded-sm p-8 text-center text-sm font-semibold text-gray-500">
        <i class="fa-solid fa-calendar-xmark text-2xl text-gray-300 mb-2"></i><br/>
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
            <div class="flex items-center justify-end gap-2.5 flex-1 text-right">
              <span class="font-shl text-lg font-extrabold uppercase text-slate-900">${m.home_name || 'Hemmalag'}</span>
              ${renderTeamCrestSVG(m.home_team_id, 'w-8 h-8')}
            </div>
            <div class="text-center px-2 shrink-0">
              <div class="font-shl text-3xl font-black text-slate-900 leading-none">${centerDisplay}</div>
              <div class="text-[10px] text-gray-500 mt-1 font-medium">${m.server_ip || 'ELITSERIEN Server'}</div>
            </div>
            <div class="flex items-center justify-start gap-2.5 flex-1 text-left">
              ${renderTeamCrestSVG(m.away_team_id, 'w-8 h-8')}
              <span class="font-shl text-lg font-extrabold uppercase text-slate-900">${m.away_name || 'Bortalag'}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="openMatchModal(${m.id})" class="border border-[#649eff] text-[#4a8af4] hover:bg-[#4a8af4] hover:text-white text-xs font-semibold px-4 py-1.5 rounded-sm transition">
              Matchfakta
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Beräknar Serietabellen
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
    const emptyRow = `<tr><td colspan="10" class="py-8 text-center text-xs text-gray-500"><i class="fa-solid fa-ghost text-2xl text-gray-300 mb-2 block"></i>Inga godkända lag i tabellen ännu. Ansök med ett lag!</td></tr>`;
    if(homeBody) homeBody.innerHTML = emptyRow;
    if (fullBody) fullBody.innerHTML = emptyRow;
    return;
  }

  if(homeBody) {
    homeBody.innerHTML = sorted.map((t, idx) => {
      const diff = t.gf - t.ga;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      return `
        <tr onclick="switchView('teams')" class="hover:bg-blue-50/50 cursor-pointer transition">
          <td class="py-3 pl-4 pr-2 font-bold text-slate-900">${idx + 1}</td>
          <td class="py-3 px-2">
            <div class="flex items-center gap-2.5">
              ${renderTeamCrestSVG(t.id, 'w-6 h-6')}
              <span class="font-medium text-slate-800">${t.name}</span>
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
        <tr class="hover:bg-gray-50 transition">
          <td class="py-3.5 pl-4 pr-2 font-bold text-slate-900">${idx + 1}</td>
          <td class="py-3.5 px-3">
            <div class="flex items-center gap-3">
              ${renderTeamCrestSVG(t.id, 'w-7 h-7')}
              <span class="font-bold text-slate-900">${t.name}</span>
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
  if (allPlayers.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 bg-gray-50 border border-gray-200 rounded-sm p-6 text-center text-xs text-gray-500">
        <i class="fa-solid fa-user-astronaut text-2xl text-gray-300 block mb-2"></i>
        Inga spelare har loggat in ännu. Var först med att logga in med Steam uppe till höger!
      </div>
    `;
    return;
  }

  const top3 = allPlayers.slice(0, 3);
  container.innerHTML = top3.map((p, i) => `
    <div onclick="openPlayerProfile('${p.steamId}')" class="bg-[#0e1420] text-white rounded-sm p-4 border border-slate-800 hover:border-shl-lightBlue cursor-pointer transition group relative overflow-hidden">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-widest text-shl-lightBlue">#${i + 1} SPELARE</span>
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

// Spelarprofil & Locker Room
function openMyProfile() {
  if (currentUser) {
    openPlayerProfile(currentUser.steam_id);
  } else if (allPlayers.length > 0) {
    openPlayerProfile(allPlayers[0].steamId);
  } else {
    showToast('Logga in med Steam uppe till höger för att skapa din profil!', 'info');
  }
}

function openPlayerProfile(steamId) {
  activeProfileSteamId = steamId;
  renderProfileView(steamId);
  switchView('profile');
}

function renderProfileView(steamId) {
  const p = allPlayers.find(x => x.steamId === steamId) || allPlayers[0];
  if (!p) return;

  const team = getTeamById(p.teamId);
  const canEdit = currentUser && (currentUser.steam_id === p.steamId || currentUser.role === 'admin');

  document.getElementById('profilePuckAvatarContainer').innerHTML = renderPuckCharacterSVG(p);
  document.getElementById('profilePlayerName').textContent = p.name;
  document.getElementById('profileNumberAndPos').textContent = `#${p.number} ${p.position}`;
  document.getElementById('profileTeamCrest').innerHTML = renderTeamCrestSVG(p.teamId, 'w-6 h-6');
  document.getElementById('profileTeamName').textContent = team.name;
  document.getElementById('profileSteamId').textContent = p.steamId;
  document.getElementById('profileHandedness').textContent = p.handedness;
  document.getElementById('profileHardestShot').textContent = `${p.hardestShot.toFixed(1)} km/h`;
  document.getElementById('profilePassAcc').textContent = `${p.passAccuracy}%`;

  const adminBadge = document.getElementById('profileAdminBadge');
  if (p.accountRole === 'admin') adminBadge.classList.remove('hidden');
  else adminBadge.classList.add('hidden');

  const btnFloat = document.getElementById('btnEditAvatarFloating');
  const btnOpen = document.getElementById('btnOpenLockerRoom');
  if (canEdit) {
    btnFloat.classList.remove('hidden');
    btnFloat.classList.add('flex');
    btnOpen.classList.remove('hidden');
    btnOpen.classList.add('flex');
  } else {
    btnFloat.classList.add('hidden');
    btnFloat.classList.remove('flex');
    btnOpen.classList.add('hidden');
    btnOpen.classList.remove('flex');
    document.getElementById('avatarEditorDrawer').classList.add('hidden');
  }

  document.getElementById('careerGP').textContent = p.gp;
  document.getElementById('careerTP').textContent = p.tp;
  document.getElementById('careerG').textContent = p.g;
  document.getElementById('careerA').textContent = p.a;

  const gauges = [
    { label: 'GP', value: p.gp },
    { label: 'TP', value: p.tp },
    { label: 'G', value: p.g },
    { label: 'A', value: p.a }
  ];
  document.getElementById('profileSeasonGauges').innerHTML = gauges.map(g => `
    <div class="relative w-32 h-32 flex items-center justify-center">
      <svg viewBox="0 0 120 120" class="w-full h-full">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#d1d5db" stroke-width="7" stroke-dasharray="2 3.2" />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="font-sans text-2xl font-extrabold text-[#4a8af4] leading-none">${g.value}</span>
        <span class="text-[11px] font-bold text-slate-800 uppercase mt-1">${g.label}</span>
      </div>
    </div>
  `).join('');

  populateAvatarCustomizerInputs(p);
}

function populateAvatarCustomizerInputs(p) {
  const teamSel = document.getElementById('custTeamId');
  const approved = getApprovedTeams();
  teamSel.innerHTML = `<option value="">Fria Agenter (Inget lag)</option>` +
    approved.map(t => `<option value="${t.id}" ${Number(t.id) === Number(p.teamId) ? 'selected' : ''}>${t.name} (${t.tag})</option>`).join('');

  document.getElementById('custName').value = p.name;
  document.getElementById('custNumber').value = p.number;
  document.getElementById('custRole').value = p.position;
  document.getElementById('custHand').value = p.handedness;
  document.getElementById('custJerseyPrimary').value = p.avatar.jerseyPrimary;
  document.getElementById('custJerseyStripe').value = p.avatar.jerseyStripe;
  document.getElementById('custHelmetColor').value = p.avatar.helmetColor;
  document.getElementById('custSkinColor').value = p.avatar.skinColor;
  document.getElementById('custVisor').value = p.avatar.visor;
  document.getElementById('custBeard').value = p.avatar.beard;
  document.getElementById('custHairColor').value = p.avatar.hairColor;
  document.getElementById('custShaftTape').value = p.avatar.shaftTape;
  document.getElementById('custBladeTape').value = p.avatar.bladeTape;
  document.getElementById('custShowChestNum').checked = p.avatar.showChestNum;
}

function previewAvatarFromInputs() {
  const p = allPlayers.find(x => x.steamId === activeProfileSteamId);
  if (!p) return;

  p.name = document.getElementById('custName').value || 'Spelare';
  p.number = parseInt(document.getElementById('custNumber').value, 10) || 12;
  p.position = document.getElementById('custRole').value;
  p.handedness = document.getElementById('custHand').value;
  const tVal = document.getElementById('custTeamId').value;
  p.teamId = tVal ? parseInt(tVal, 10) : null;

  p.avatar.jerseyPrimary = document.getElementById('custJerseyPrimary').value;
  p.avatar.jerseyStripe = document.getElementById('custJerseyStripe').value;
  p.avatar.helmetColor = document.getElementById('custHelmetColor').value;
  p.avatar.skinColor = document.getElementById('custSkinColor').value;
  p.avatar.visor = document.getElementById('custVisor').value;
  p.avatar.beard = document.getElementById('custBeard').value;
  p.avatar.hairColor = document.getElementById('custHairColor').value;
  p.avatar.shaftTape = document.getElementById('custShaftTape').value;
  p.avatar.bladeTape = document.getElementById('custBladeTape').value;
  p.avatar.showChestNum = document.getElementById('custShowChestNum').checked;

  const team = getTeamById(p.teamId);
  document.getElementById('profilePuckAvatarContainer').innerHTML = renderPuckCharacterSVG(p);
  document.getElementById('profilePlayerName').textContent = p.name;
  document.getElementById('profileNumberAndPos').textContent = `#${p.number} ${p.position}`;
  document.getElementById('profileTeamCrest').innerHTML = renderTeamCrestSVG(p.teamId, 'w-6 h-6');
  document.getElementById('profileTeamName').textContent = team.name;
  document.getElementById('profileHandedness').textContent = p.handedness;
}

function applyTeamPresetToAvatar(teamId) {
  if (teamId) {
    const t = getTeamById(teamId);
    if (t.primary_color) document.getElementById('custJerseyPrimary').value = t.primary_color;
    if (t.secondary_color) document.getElementById('custJerseyStripe').value = t.secondary_color;
  }
  previewAvatarFromInputs();
}

function setQuickTape(shaftHex, bladeHex) {
  document.getElementById('custShaftTape').value = shaftHex;
  document.getElementById('custBladeTape').value = bladeHex;
  previewAvatarFromInputs();
}

function toggleAvatarEditor() {
  document.getElementById('avatarEditorDrawer').classList.toggle('hidden');
}

async function saveAvatarChangesToDB() {
  const p = allPlayers.find(x => x.steamId === activeProfileSteamId);
  if (!p) return;

  const btn = document.getElementById('btnSaveCharacter');
  btn.disabled = true;
  btn.textContent = 'Sparar...';

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
        teamId: p.teamId,
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

    showToast('Din Puck-karaktär har sparats i databasen!', 'success');
    document.getElementById('avatarEditorDrawer').classList.add('hidden');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Spara Puck-Karaktär';
  }
}

// Spelschema, Statistik & Lag-Vyer
function renderFullScheduleView() {
  const container = document.getElementById('fullScheduleContainer');
  if (allMatches.length === 0) {
    container.innerHTML = `<div class="bg-gray-50 border border-gray-200 rounded-sm p-8 text-center text-xs text-gray-500">Inga matcher i spelschemat ännu.</div>`;
    return;
  }

  const isAdmin = currentUser && currentUser.role === 'admin';
  container.innerHTML = allMatches.map(m => {
    const isPlayed = m.status === 'completed';
    return `
      <div class="bg-white border border-gray-200 rounded-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs font-bold px-2 py-0.5 rounded ${isPlayed ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-800'}">
            ${isPlayed ? 'SPELAD' : 'KOMMANDE'}
          </span>
          <span class="text-xs text-gray-600 font-medium">${formatDateShort(m.played_at || m.created_at)}</span>
        </div>
        <div class="flex items-center justify-center gap-4 flex-1">
          <div class="flex items-center justify-end gap-2 flex-1 text-right font-shl text-xl font-bold uppercase">
            ${m.home_name || 'Hemmalag'} ${renderTeamCrestSVG(m.home_team_id, 'w-7 h-7')}
          </div>
          <div class="font-shl text-2xl font-black px-3 py-1 bg-gray-100 rounded min-w-[75px] text-center">
            ${isPlayed ? `${m.home_score} -${m.away_score}` : 'VS'}
          </div>
          <div class="flex items-center justify-start gap-2 flex-1 text-left font-shl text-xl font-bold uppercase">
            ${renderTeamCrestSVG(m.away_team_id, 'w-7 h-7')} ${m.away_name || 'Bortalag'}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openMatchModal(${m.id})" class="border border-shl-blue text-shl-blue hover:bg-shl-blue hover:text-white text-xs font-bold px-3.5 py-1.5 rounded-sm transition">
            Detaljer
          </button>
          ${isAdmin ? `<button onclick="adminDeleteMatch(${m.id})" class="text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded text-xs" title="Radera match"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderFullStatsView() {
  const tbody = document.getElementById('fullPlayerStatsBody');
  if (allPlayers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-xs text-gray-500">Inga spelare har loggat in med Steam ännu.</td></tr>`;
    return;
  }

  tbody.innerHTML = allPlayers.map((p, idx) => {
    const team = getTeamById(p.teamId);
    return `
      <tr onclick="openPlayerProfile('${p.steamId}')" class="hover:bg-blue-50/60 cursor-pointer transition">
        <td class="py-3.5 pl-4 pr-2 font-bold text-gray-600">${idx + 1}</td>
        <td class="py-3.5 px-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-10 bg-slate-900 rounded overflow-hidden flex items-center justify-center shrink-0">
              ${renderPuckCharacterSVG(p)}
            </div>
            <div>
              <div class="font-bold text-slate-900 hover:text-shl-blue">#${p.number} ${p.name}</div>
              <div class="text-[11px] text-gray-400 font-mono">SteamID: ${p.steamId}</div>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-3">
          <div class="flex items-center gap-2">
            ${renderTeamCrestSVG(p.teamId, 'w-5 h-5')}
            <span class="font-semibold">${team.tag}</span>
          </div>
        </td>
        <td class="py-3.5 px-3 text-center text-xs font-bold text-gray-600">${p.position}</td>
        <td class="py-3.5 px-3 text-center">${p.gp}</td>
        <td class="py-3.5 px-3 text-center font-semibold">${p.g}</td>
        <td class="py-3.5 px-3 text-center font-semibold">${p.a}</td>
        <td class="py-3.5 px-3 text-center font-shl text-xl font-black text-shl-blue bg-blue-50/50">${p.tp}</td>
        <td class="py-3.5 px-3 text-center font-semibold text-emerald-600">${p.passAccuracy}%</td>
        <td class="py-3.5 px-4 text-right font-mono text-xs font-bold text-amber-600">${p.hardestShot.toFixed(1)} km/h</td>
      </tr>
    `;
  }).join('');
}

function renderTeamsView() {
  const container = document.getElementById('teamsGridContainer');
  const approved = getApprovedTeams();

  if (approved.length === 0) {
    container.innerHTML = `
      <div class="col-span-4 bg-gray-50 border border-gray-200 rounded-sm p-10 text-center space-y-3">
        <p class="text-sm font-bold text-slate-800">Inga lag är godkända i ligan ännu.</p>
        <p class="text-xs text-gray-500">Klicka på "Ansök med ditt lag" för att skicka in den första lagansökan!</p>
      </div>
    `;
    return;
  }

  const standingsMap = {};
  computeStandings().forEach(s => { standingsMap[s.id] = s; });

  container.innerHTML = approved.map(t => {
    const teamPlayers = allPlayers.filter(p => Number(p.teamId) === Number(t.id));
    const st = standingsMap[t.id] || { pts: 0, gp: 0, gf: 0, ga: 0 };
    return `
      <div class="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition">
        <div>
          <div class="h-2" style="background-color: ${t.primary_color || '#0284c7'}"></div>
          <div class="p-5 flex items-center gap-4 border-b border-gray-100">
            ${renderTeamCrestSVG(t.id, 'w-12 h-12')}
            <div>
              <h3 class="font-shl text-2xl font-black uppercase text-slate-900 leading-none">${t.name}</h3>
              <span class="text-xs text-gray-500 font-medium">${st.pts} poäng • ${st.gp} matcher</span>
            </div>
          </div>
          <div class="p-4 space-y-2">
            <div class="text-[11px] font-bold uppercase tracking-wider text-gray-400">Spelare i truppen</div>
            ${teamPlayers.length > 0 ? teamPlayers.map(tp => `
              <div onclick="openPlayerProfile('${tp.steamId}')" class="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-gray-100 cursor-pointer">
                <span class="font-bold text-slate-800">#${tp.number}${tp.name}</span>
                <span class="text-shl-blue font-semibold">${tp.tp} TP</span>
              </div>
            `).join('') : `<div class="text-xs text-gray-400 italic py-2">${t.roster_notes || 'Inga spelare har valt laget i Locker Room ännu'}</div>`}
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
          <span class="text-gray-500">Målskillnad: <strong>${st.gf}-${st.ga}</strong></span>
          <span class="font-mono text-[11px] text-gray-400">${t.tag}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminView() {
  const pending = getPendingTeams();
  const approved = getApprovedTeams();

  document.getElementById('navAdminCount').textContent = pending.length;
  document.getElementById('adminPendingBadge').textContent = `${pending.length} väntar`;

  const appList = document.getElementById('adminApplicationsList');
  if (pending.length === 0) {
    appList.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-sm p-6 text-center text-gray-500 text-xs">
        Inga väntande lagansökningar just nu.
      </div>
    `;
  } else {
    appList.innerHTML = pending.map(app => `
      <div class="bg-white border border-gray-200 rounded-sm p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="w-4 h-4 rounded-full inline-block border border-gray-300" style="background:${app.primary_color || '#0284c7'}"></span>
            <span class="font-shl text-xl font-black uppercase text-slate-900">${app.name} (${app.tag})</span>
          </div>
          <div class="text-xs text-gray-500"><strong>Kapten SteamID:</strong> ${app.captain_steam_id || '-'}</div>
          <div class="text-xs text-gray-600"><strong>Trupp/Notering:</strong> ${app.roster_notes || '-'}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="adminHandleTeam(${app.id}, 'approve')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase px-3.5 py-2 rounded-sm shadow transition">
            Godkänn
          </button>
          <button onclick="adminHandleTeam(${app.id}, 'delete')" class="bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold uppercase px-3 py-2 rounded-sm transition">
            Ta bort
          </button>
        </div>
      </div>
    `).join('');
  }

  const teamOptions = approved.map(t => `<option value="${t.id}">${t.name} (${t.tag})</option>`).join('');
  ['simHomeTeam', 'simAwayTeam', 'schedHomeTeam', 'schedAwayTeam'].forEach(selId => {
    const el = document.getElementById(selId);
    if (el) el.innerHTML = teamOptions || `<option value="">Inga godkända lag ännu</option>`;
  });

  const starSel = document.getElementById('simStarPlayer');
  if (starSel) {
    starSel.innerHTML = `<option value="">-- Ingen specifik spelare --</option>` +
      allPlayers.map(p => `<option value="${p.steamId}">#${p.number} ${p.name}</option>`).join('');
  }
}

// Navigation och Gränssnitt
function switchView(viewName) {
  currentView = viewName;
  const views = ['home', 'profile', 'schedule', 'standings', 'stats', 'teams', 'admin'];
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
  const activeNav = document.getElementById('nav-' + viewName);
  if (activeNav) activeNav.classList.add('text-shl-lightBlue', 'font-semibold');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
  document.getElementById('mobileMenuDrawer').classList.toggle('hidden');
}

// Sökfunktion
function handleQuickSearch(query) {
  const box = document.getElementById('quickSearchResults');
  const q = query.trim().toLowerCase();
  if (!q) {
    box.classList.add('hidden');
    return;
  }

  const matchedPlayers = allPlayers.filter(p => p.name.toLowerCase().includes(q) || String(p.number).includes(q));
  const matchedTeams = getApprovedTeams().filter(t => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q));

  if (matchedPlayers.length === 0 && matchedTeams.length === 0) {
    box.innerHTML = `<div class="px-4 py-2 text-xs text-gray-400">Inga träffar på "${query}"</div>`;
  } else {
    let html = '';
    matchedPlayers.forEach(p => {
      html += `
        <button onclick="openPlayerProfile('${p.steamId}'); document.getElementById('quickSearchResults').classList.add('hidden');" class="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center justify-between">
          <span class="font-bold text-white">#${p.number} ${p.name}</span>
          <span class="text-xs text-shl-lightBlue">${p.position}</span>
        </button>
      `;
    });
    matchedTeams.forEach(t => {
      html += `
        <button onclick="switchView('teams'); document.getElementById('quickSearchResults').classList.add('hidden');" class="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center justify-between border-t border-white/5">
          <span class="font-semibold text-gray-200">${t.name}</span>
          <span class="text-xs text-amber-400">${t.tag}</span>
        </button>
      `;
    });
    box.innerHTML = html;
  }
  box.classList.remove('hidden');
}

// Toast-meddelanden
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const colors = {
    success: 'bg-emerald-600 border-emerald-400',
    error: 'bg-rose-600 border-rose-400',
    info: 'bg-[#0e1420] border-shl-lightBlue'
  };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.info} text-white text-xs font-semibold px-4 py-3 rounded shadow-2xl border-l-4 flex items-center gap-2.5 pointer-events-auto transition duration-300`;
  toast.innerHTML = `<i class="fa-solid fa-hockey-puck text-shl-lightBlue"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

// Modaler
function openMatchModal(matchId) {
  const m = allMatches.find(x => Number(x.id) === Number(matchId));
  if (!m) return;
  const isPlayed = m.status === 'completed';

  document.getElementById('modalMatchHeaderStatus').textContent = `${isPlayed ? 'SLUTRESULTAT' : 'KOMMANDE MATCH'} • ${m.server_ip || 'ELITSERIEN'}`;
  document.getElementById('modalMatchContent').innerHTML = `
    <div class="flex items-center justify-between bg-slate-900 text-white p-6 rounded-sm">
      <div class="flex flex-col items-center gap-2 flex-1">
        ${renderTeamCrestSVG(m.home_team_id, 'w-14 h-14')}
        <span class="font-shl text-2xl font-black uppercase">${m.home_name || 'Hemmalag'}</span>
      </div>
      <div class="text-center px-4">
        <div class="font-shl text-5xl font-black text-amber-400">${isPlayed ? `${m.home_score} -${m.away_score}` : 'VS'}</div>
        <div class="text-xs text-gray-400 mt-1">${formatDateShort(m.played_at || m.created_at)}</div>
      </div>
      <div class="flex flex-col items-center gap-2 flex-1">
        ${renderTeamCrestSVG(m.away_team_id, 'w-14 h-14')}
        <span class="font-shl text-2xl font-black uppercase">${m.away_name || 'Bortalag'}</span>
      </div>
    </div>
  `;
  document.getElementById('matchDetailModal').classList.remove('hidden');
}
function closeMatchModal() { document.getElementById('matchDetailModal').classList.add('hidden'); }
function openTeamApplicationModal() {
  if (!currentUser) return showToast('Logga in med Steam först.', 'info');
  document.getElementById('teamApplicationModal').classList.remove('hidden');
}
function closeTeamApplicationModal() { document.getElementById('teamApplicationModal').classList.add('hidden'); }
function openPlayerSelectorModal() {
  const list = document.getElementById('playerSelectorList');
  if (allPlayers.length === 0) {
    list.innerHTML = `<div class="p-4 text-xs text-gray-500 text-center">Inga registrerade spelare ännu.</div>`;
  } else {
    list.innerHTML = allPlayers.map(p => `
      <button onclick="openPlayerProfile('${p.steamId}'); closePlayerSelectorModal()" class="w-full py-2.5 px-3 hover:bg-blue-50 flex items-center justify-between text-left transition rounded">
        <div class="flex items-center gap-3">
          ${renderTeamCrestSVG(p.teamId, 'w-6 h-6')}
          <div>
            <div class="font-bold text-sm text-slate-900">#${p.number} ${p.name}</div>
            <div class="text-xs text-gray-500">${p.position} • ${p.tp} Poäng</div>
          </div>
        </div>
        <span class="text-xs font-bold text-shl-blue">Visa →</span>
      </button>
    `).join('');
  }
  document.getElementById('playerSelectorModal').classList.remove('hidden');
}
function closePlayerSelectorModal() { document.getElementById('playerSelectorModal').classList.add('hidden'); }

// Kör igång när sidan laddas
window.addEventListener('DOMContentLoaded', () => {
  renderHeaderAuthArea(); // Visar inloggningsknappen DIRKET, utan att vänta på databasen
  loadLeagueData();       // Hämtar datan i bakgrunden
});
