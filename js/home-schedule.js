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
    const statusText = isPlayed
      ? (m.is_shootout ? 'SPELAD SO' : m.is_overtime ? 'SPELAD ÖT' : 'SPELAD')
      : `OMGÅNG ${m.round_number || 1}`;
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
      btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-slate-900 text-white transition';
      btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-200 text-gray-700 hover:bg-gray-300 transition';
    } else {
      btnPl.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-slate-900 text-white transition';
      btnUp.className = 'px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-gray-200 text-gray-700 hover:bg-gray-300 transition';
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
      <div class="bg-white border border-gray-200 rounded-sm p-8 text-center text-xs font-semibold text-gray-500">
        Inga ${homeMatchFilter === 'upcoming' ? 'kommande' : 'spelade'} matcher registrerade.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.slice(0, 6).map(m => {
    const isPlayed = m.status === 'completed';
    const centerDisplay = isPlayed ? `${m.home_score} - ${m.away_score}` : 'VS';
    return `
      <div class="bg-white border border-gray-200 rounded-sm p-4 match-card-hover">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-xs text-gray-600 font-medium w-36 text-center sm:text-left shrink-0">
            <div class="font-bold text-slate-800">Omgång ${m.round_number || 1}</div>
            <div>${formatDateShort(m.played_at)}</div>
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
            <button type="button" onclick="openMatchModal(${m.id})" class="border border-shl-blue text-shl-blue hover:bg-shl-blue hover:text-white text-xs font-semibold px-4 py-1.5 rounded-sm transition">
              Matchrum
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderStandingsTables() {
  const sorted = computeStandings();
  const homeBody = document.getElementById('homeStandingsBody');
  const fullBody = document.getElementById('fullStandingsBody');

  if (sorted.length === 0) {
    const emptyRow = `<tr><td colspan="10" class="py-8 text-center text-xs text-gray-500">Inga godkända lag i tabellen ännu.</td></tr>`;
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

// Visar BARA positionen (t.ex. CENTER eller MÅLVAKT (GK)) utan #1 framför!
function renderHomeTopScorers() {
  const container = document.getElementById('homeTopScorersGrid');
  if (!container) return;

  if (allPlayers.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 bg-white border border-gray-200 rounded-sm p-6 text-center text-xs text-gray-500">
        Inga spelare har loggat in ännu.
      </div>
    `;
    return;
  }

  const top3 = allPlayers.slice(0, 3);
  container.innerHTML = top3.map(p => `
    <div onclick="openPlayerProfile('${p.steamId}')" class="bg-[#0e1420] text-white rounded-sm p-4 border border-slate-800 hover:border-shl-lightBlue cursor-pointer transition group relative overflow-hidden">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-widest text-shl-lightBlue">${isGoaliePos(p.position) ? 'MÅLVAKT (GK)' : p.position}</span>
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

function setScheduleFilter(filter) {
  scheduleFilter = filter;
  ['All', 'Upcoming', 'Played'].forEach(f => {
    const btn = document.getElementById('schedFilter' + f);
    if (btn) {
      const active = f.toLowerCase() === filter;
      btn.className = active
        ? 'px-3 py-1.5 rounded-sm text-xs font-bold uppercase bg-slate-900 text-white'
        : 'px-3 py-1.5 rounded-sm text-xs font-bold uppercase bg-gray-200 text-gray-700 hover:bg-gray-300';
    }
  });
  renderFullScheduleView();
}

function renderFullScheduleView() {
  const container = document.getElementById('fullScheduleContainer');
  if (!container) return;

  let filtered = allMatches;
  if (scheduleFilter === 'upcoming') filtered = allMatches.filter(m => m.status !== 'completed');
  if (scheduleFilter === 'played') filtered = allMatches.filter(m => m.status === 'completed');

  if (filtered.length === 0) {
    container.innerHTML = `<div class="bg-white border border-gray-200 rounded-sm p-8 text-center text-xs text-gray-500">Inga matcher hittades för valt filter.</div>`;
    return;
  }

  // Gruppera per omgång (round_number)
  const rounds = {};
  filtered.forEach(m => {
    const r = m.round_number || 1;
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(m);
  });

  const isAdmin = currentUser && currentUser.role === 'admin';
  container.innerHTML = Object.keys(rounds).sort((a, b) => Number(a) - Number(b)).map(rNum => `
    <div class="space-y-2.5">
      <div class="flex items-center gap-2 border-b border-gray-200 pb-1.5">
        <span class="bg-slate-900 text-white font-shl font-bold text-sm px-2.5 py-0.5 rounded-sm uppercase">OMGÅNG ${rNum}</span>
      </div>
      ${rounds[rNum].map(m => {
        const isPlayed = m.status === 'completed';
        const codePill = m.match_code
          ? `<span class="font-mono text-[11px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-300" title="Matchkod för C/A">Kod: ${m.match_code}</span>`
          : '';
        const rematchPill = m.rematch_requested_by_team_id
          ? `<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Rematch begärd</span>`
          : '';

        return `
          <div class="bg-white border border-gray-200 rounded-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div class="flex flex-wrap items-center gap-2 w-56">
              <span class="text-xs font-bold px-2 py-0.5 rounded ${isPlayed ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-800'}">
                ${isPlayed ? 'SPELAD' : 'KOMMANDE'}
              </span>
              <span class="text-xs text-gray-600 font-medium">${formatDateShort(m.played_at)}</span>${rematchPill}
            </div>
            <div class="flex items-center justify-center gap-4 flex-1">
              <button type="button" onclick="openTeamProfile(${m.home_team_id})" class="flex items-center justify-end gap-2 flex-1 text-right font-shl text-xl font-bold uppercase hover:text-shl-blue">
                ${m.home_name \vert{}\vert{} 'Hemmalag'}${renderTeamCrestSVG(m.home_team_id, 'w-7 h-7')}
              </button>
              <div class="font-shl text-2xl font-black px-3 py-1 bg-gray-100 rounded min-w-[75px] text-center">
                ${isPlayed ? `${m.home_score} - ${m.away_score}` : 'VS'}
              </div>
              <button type="button" onclick="openTeamProfile(${m.away_team_id})" class="flex items-center justify-start gap-2 flex-1 text-left font-shl text-xl font-bold uppercase hover:text-shl-blue">
                ${renderTeamCrestSVG(m.away_team_id, 'w-7 h-7')}${m.away_name || 'Bortalag'}
              </button>
            </div>
            <div class="flex items-center gap-2">
              ${codePill}
              <button type="button" onclick="openMatchModal(${m.id})" class="bg-slate-900 hover:bg-shl-blue text-white text-xs font-bold px-3.5 py-1.5 rounded-sm transition">
                Matchrum
              </button>
              ${isAdmin ? `<button type="button" onclick="adminDeleteMatch(${m.id})" class="text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded text-xs" title="Radera match"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderFullStatsView() {
  const tbody = document.getElementById('fullPlayerStatsBody');
  if (!tbody) return;
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
        <td class="py-3.5 px-3 text-center text-xs font-bold text-gray-600">${isGoaliePos(p.position) ? 'GK' : p.position}</td>
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

// =========================================================================
// MATCHRUMMET (MODAL MED MATCHKOD FÖR C/A, TIDSBOKNING & REMATCH)
// =========================================================================
function openMatchModal(matchId) {
  const m = allMatches.find(x => Number(x.id) === Number(matchId));
  if (!m) return;
  const isPlayed = m.status === 'completed';
  const isAdmin = currentUser && currentUser.role === 'admin';
  const canManage = Boolean(m.can_manage_match) || isAdmin;
  const mStats = allMatchPlayerStats.filter(s => Number(s.match_id) === Number(m.id));

  setElText('modalMatchHeaderStatus', `OMGÅNG ${m.round_number || 1} • ${isPlayed ? 'SLUTRESULTAT' : 'KOMMANDE MATCH'} • ${m.server_ip || 'ELITSERIEN'}`);

  const codeBoxHTML = m.match_code ? `
    <div class="bg-amber-50 border border-amber-300 rounded p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div>
        <div class="text-[11px] font-bold uppercase text-amber-900">Officiell Matchkod (Endast synlig för Lagkaptener, Assisterande & Admin)</div>
        <div class="text-xs text-amber-800">Skriv in koden i Puck-servern för att starta och logga matchen automatiskt.</div>
      </div>
      <div class="font-mono text-xl font-black bg-slate-900 text-amber-400 px-4 py-2 rounded select-all shrink-0">${m.match_code}</div>
    </div>
  ` : '';

  let timeBookingHTML = '';
  if (!isPlayed && canManage) {
    const proposedInfo = m.proposed_time ? `
      <div class="bg-blue-50 border border-blue-200 rounded p-3 flex items-center justify-between text-xs mb-3">
        <div>
          <strong>Föreslagen matchtid:</strong> ${formatDateShort(m.proposed_time)}
          <span class="text-gray-500">(${Number(m.proposed_by_team_id) === Number(m.home_team_id) ? m.home_tag : m.away_tag})</span>
        </div>
        <button type="button" onclick="acceptMatchTime(${m.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded uppercase">
          Acceptera tid
        </button>
      </div>
    ` : '';

    timeBookingHTML = `
      <div class="border border-gray-200 rounded p-4 space-y-2 bg-gray-50 text-xs">
        <div class="font-bold uppercase text-slate-800">Boka eller föreslå matchtid</div>
        ${proposedInfo}
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="datetime-local" id="modalProposeTimeInput" class="border border-gray-300 rounded px-3 py-1.5 flex-1 bg-white" />
          <button type="button" onclick="proposeMatchTime(${m.id}, false)" class="bg-shl-blue hover:bg-blue-600 text-white font-bold uppercase px-4 py-1.5 rounded">
            Föreslå tid till motståndaren
          </button>
          ${isAdmin ? `<button type="button" onclick="proposeMatchTime(${m.id}, true)" class="bg-slate-900 text-white font-bold uppercase px-3 py-1.5 rounded">Lås direkt (Admin)</button>` : ''}
        </div>
      </div>
    `;
  }

  let rematchHTML = '';
  if (m.rematch_requested_by_team_id) {
    const reqTag = Number(m.rematch_requested_by_team_id) === Number(m.home_team_id) ? m.home_name : m.away_name;
    rematchHTML = `
      <div class="bg-rose-50 border border-rose-200 rounded p-4 space-y-2 text-xs">
        <div class="font-bold text-rose-900 uppercase">Rematch / Omspel begärt av ${reqTag}</div>
        <p class="text-rose-800">Anledning: "${m.rematch_reason || '-'}"</p>
        ${canManage ? `
          <div class="flex gap-2 pt-1">
            <button type="button" onclick="resolveRematch(${m.id}, 'approve')" class="bg-emerald-600 text-white font-bold uppercase px-3 py-1.5 rounded">Godkänn Omspel (Nollställer match)</button>
            <button type="button" onclick="resolveRematch(${m.id}, 'decline')" class="bg-gray-200 text-gray-700 font-bold uppercase px-3 py-1.5 rounded">Neka</button>
          </div>
        ` : ''}
      </div>
    `;
  } else if (canManage) {
    rematchHTML = `
      <div class="border border-gray-200 rounded p-4 space-y-2 text-xs">
        <div class="font-bold uppercase text-gray-700">Problem med servern? Ansök om Rematch / Omspel</div>
        <div class="flex gap-2">
          <input type="text" id="modalRematchReason" placeholder="Beskriv kort varför matchen behöver spelas om..." class="border border-gray-300 rounded px-3 py-1.5 flex-1" />
          <button type="button" onclick="requestRematch(${m.id})" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase px-3.5 py-1.5 rounded shrink-0">
            Begär Rematch
          </button>
        </div>
      </div>
    `;
  }

  const statsTableHTML = mStats.length > 0 ? `
    <div class="space-y-2">
      <div class="text-xs font-bold uppercase text-slate-700">Spelarstatistik i matchen</div>
      <div class="border border-gray-200 rounded overflow-hidden">
        <table class="w-full text-xs">
          <thead class="bg-gray-100 text-gray-600 font-bold uppercase">
            <tr>
              <th class="py-2 px-3 text-left">Spelare</th>
              <th class="py-2 px-2 text-center">Lag</th>
              <th class="py-2 px-2 text-center">G</th>
              <th class="py-2 px-2 text-center">A</th>
              <th class="py-2 px-2 text-center">TP</th>
              <th class="py-2 px-3 text-right">Skott km/h</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${mStats.map(s => `
              <tr>
                <td class="py-2 px-3 font-bold">#${s.jersey_number \vert{}\vert{} 12}${s.username || s.steam_id}</td>
                <td class="py-2 px-2 text-center">${s.team_tag || '-'}</td>
                <td class="py-2 px-2 text-center">${s.goals}</td>
                <td class="py-2 px-2 text-center">${s.assists}</td>
                <td class="py-2 px-2 text-center font-bold text-shl-blue">${s.points}</td>
                <td class="py-2 px-3 text-right font-mono">${Number(s.top_shot_speed_kmh || 0).toFixed(1)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  setElHTML('modalMatchContent', `
    <div class="flex items-center justify-between bg-slate-900 text-white p-6 rounded-sm">
      <button type="button" onclick="closeMatchModal(); openTeamProfile(${m.home_team_id})" class="flex flex-col items-center gap-2 flex-1 hover:text-shl-lightBlue transition">
        ${renderTeamCrestSVG(m.home_team_id, 'w-14 h-14')}
        <span class="font-shl text-2xl font-black uppercase">${m.home_name || 'Hemmalag'}</span>
      </button>
      <div class="text-center px-4">
        <div class="font-shl text-5xl font-black text-amber-400">${isPlayed ? `${m.home_score} -${m.away_score}` : 'VS'}</div>
        <div class="text-xs text-gray-400 mt-1">${formatDateShort(m.played_at)}</div>
      </div>
      <button type="button" onclick="closeMatchModal(); openTeamProfile(${m.away_team_id})" class="flex flex-col items-center gap-2 flex-1 hover:text-shl-lightBlue transition">
        ${renderTeamCrestSVG(m.away_team_id, 'w-14 h-14')}
        <span class="font-shl text-2xl font-black uppercase">${m.away_name || 'Bortalag'}</span>
      </button>
    </div>
    ${codeBoxHTML}
    ${statsTableHTML}
    ${timeBookingHTML}
    ${rematchHTML}
  `);

  const modal = document.getElementById('matchDetailModal');
  if (modal) modal.classList.remove('hidden');
}

function closeMatchModal() {
  const el = document.getElementById('matchDetailModal');
  if (el) el.classList.add('hidden');
}

async function proposeMatchTime(matchId, lockImmediately = false) {
  const proposedTime = document.getElementById('modalProposeTimeInput')?.value;
  if (!proposedTime) return showToast('Välj datum och tid först.', 'error');
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'propose_match_time', matchId, proposedTime, lockImmediately })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast(out.locked ? 'Matchtiden är nu låst!' : 'Tidsförslag skickat till motståndaren!', 'success');
    await loadLeagueData();
    openMatchModal(matchId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function acceptMatchTime(matchId) {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept_match_time', matchId })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Speltiden är godkänd och bokad!', 'success');
    await loadLeagueData();
    openMatchModal(matchId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function requestRematch(matchId) {
  const reason = document.getElementById('modalRematchReason')?.value.trim();
  if (!reason) return showToast('Skriv en kort anledning.', 'error');
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_rematch', matchId, reason })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Rematch-ansökan har skickats!', 'success');
    await loadLeagueData();
    openMatchModal(matchId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function resolveRematch(matchId, decision) {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_rematch', matchId, decision })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast(out.reset ? `Omspel godkänt! Ny matchkod: ${out.newCode}` : 'Rematch nekades.', 'success');
    await loadLeagueData();
    openMatchModal(matchId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
