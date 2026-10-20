function renderAdminView() {
  const pending = getPendingTeams();
  const approved = getApprovedTeams();
  const rematchRequests = allMatches.filter(m => Boolean(m.rematch_requested_by_team_id));

  setElText('navAdminCount', pending.length + rematchRequests.length);
  setElText('adminPendingBadge', `${pending.length} väntar`);
  setElText('adminApprovedCountBadge', `${approved.length} / 14 Lag`);
  setElText('adminRematchBadge', rematchRequests.length);

  // Rematch-ansökningar
  const rematchDiv = document.getElementById('adminRematchList');
  if (rematchDiv) {
    rematchDiv.innerHTML = rematchRequests.length === 0
      ? `<div class="text-gray-400 py-2">Inga väntande rematch-ansökningar.</div>`
      : rematchRequests.map(m => `
          <div class="p-3 bg-amber-50 border border-amber-200 rounded flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-slate-900">Omg ${m.round_number || 1}: ${m.home_name} vs ${m.away_name}</div>
              <div class="text-gray-600">Anledning: "${m.rematch_reason || '-'}"</div>
            </div>
            <div class="flex gap-1.5 shrink-0">
              <button type="button" onclick="resolveRematch(${m.id}, 'approve')" class="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded">Godkänn</button>
              <button type="button" onclick="resolveRematch(${m.id}, 'decline')" class="bg-gray-200 text-gray-700 font-bold px-2.5 py-1 rounded">Neka</button>
            </div>
          </div>
        `).join('');
  }

  // Väntande lagansökningar
  const appList = document.getElementById('adminApplicationsList');
  if (appList) {
    appList.innerHTML = pending.length === 0
      ? `<div class="text-gray-400 text-xs py-2">Inga väntande lagansökningar just nu.</div>`
      : pending.map(app => `
          <div class="bg-gray-50 border border-gray-200 rounded-sm p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div class="space-y-0.5 text-xs">
              <div class="flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded-full inline-block border border-gray-300" style="background:${app.primary_color || '#0284c7'}"></span>
                <span class="font-shl text-lg font-black uppercase text-slate-900">${app.name} (${app.tag})</span>
              </div>
              <div class="text-gray-600"><strong>Sökande Kapten:</strong> ${app.captain_name || app.captain_steam_id || '-'}</div>
              <div class="text-gray-500">${app.roster_notes || ''}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" onclick="adminHandleTeam(${app.id}, 'approve')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase px-3 py-1.5 rounded shadow">Godkänn</button>
              <button type="button" onclick="adminHandleTeam(${app.id}, 'delete')" class="bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold uppercase px-2.5 py-1.5 rounded">Neka</button>
            </div>
          </div>
        `).join('');
  }

  // Kapten-dropdown + Aktiva lag
  const capSelect = document.getElementById('adminNewTeamCaptain');
  if (capSelect) {
    capSelect.innerHTML = `<option value="">-- Välj lagkapten (valfritt) --</option>` +
      allPlayers.map(p => `<option value="${p.steamId}">#${p.number} ${p.name}</option>`).join('');
  }

  const activeTeamsDiv = document.getElementById('adminActiveTeamsList');
  if (activeTeamsDiv) {
    activeTeamsDiv.innerHTML = approved.length === 0
      ? `<div class="text-xs text-gray-400 py-2">Inga godkända lag ännu.</div>`
      : approved.map(t => `
          <div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded border border-gray-200 text-xs">
            <button type="button" onclick="openTeamProfile(${t.id})" class="flex items-center gap-2 font-bold text-slate-900 hover:text-shl-blue">
              ${renderTeamCrestSVG(t.id, 'w-5 h-5')}
              <span>${t.name} (${t.tag})</span>
            </button>
            <div class="flex items-center gap-2">
              <button type="button" onclick="openTeamProfile(${t.id})" class="text-shl-blue font-semibold hover:underline">Hantera trupp</button>
              <button type="button" onclick="adminHandleTeam(${t.id}, 'delete')" class="text-rose-600 hover:bg-rose-100 px-2 py-1 rounded font-bold">Radera</button>
            </div>
          </div>
        `).join('');
  }

  // Spelarlista för Admin-roll
  const roleListDiv = document.getElementById('adminPlayersRoleList');
  if (roleListDiv) {
    roleListDiv.innerHTML = allPlayers.map(p => {
      const isSuper = p.steamId === '76561198360771568';
      const isPlayerAdmin = p.accountRole === 'admin';
      return `
        <div class="py-2.5 flex items-center justify-between gap-2">
          <div>
            <span class="font-bold text-slate-900">#${p.number} ${p.name}</span>
            <span class="text-gray-400 font-mono text-[11px] ml-1">(${p.steamId})</span>
            ${isPlayerAdmin ? `<span class="ml-1 bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[10px]">ADMIN</span>` : ''}
          </div>
          <div>
            ${isSuper ? `<span class="text-[11px] text-gray-400 font-semibold">Huvud-Admin</span>` : `
              <button type="button" onclick="adminSetPlayerRole('${p.steamId}', '${isPlayerAdmin ? 'player' : 'admin'}')" class="px-2.5 py-1 rounded font-bold ${isPlayerAdmin ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}">
                ${isPlayerAdmin ? 'Ta bort Admin' : 'Gör till Admin'}
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // Dropdowns för matcher
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

async function adminGenerateSeason() {
  const meetingsPerPair = parseInt(document.getElementById('seasonMeetingsSelect')?.value, 10) || 2;
  const clearExisting = Boolean(document.getElementById('seasonClearExisting')?.checked);
  if (!confirm(`Vill du generera spelschemat (${meetingsPerPair} möten per lagpar)?`)) return;

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_generate_season', meetingsPerPair, clearExisting })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast(`Säsongen har startats! ${out.count} matcher med matchkoder skapades.`, 'success');
    await loadLeagueData();
    switchView('schedule');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminClearSchedule() {
  if (!confirm('Är du säker på att du vill nollställa hela spelschemat och alla matchresultat?')) return;
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_clear_schedule' })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Spelschemat har nollställts.', 'info');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminCreateTeamDirect(e) {
  e.preventDefault();
  const name = document.getElementById('adminNewTeamName')?.value.trim();
  const tag = document.getElementById('adminNewTeamTag')?.value.trim().toUpperCase();
  const primaryColor = document.getElementById('adminNewTeamPrimary')?.value || '#0284c7';
  const secondaryColor = document.getElementById('adminNewTeamSecondary')?.value || '#fbbf24';
  const captainSteamId = document.getElementById('adminNewTeamCaptain')?.value || null;

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_create_team', name, tag, primaryColor, secondaryColor, captainSteamId })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    e.target.reset();
    showToast(`Laget ${name} (${tag}) har skapats!`, 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminHandleTeam(teamId, decision) {
  if (decision === 'delete' && !confirm('Är du säker på att du vill radera laget helt?')) return;
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_team_status', teamId, decision })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast(decision === 'approve' ? 'Laget godkändes!' : 'Laget togs bort.', 'success');
    await loadLeagueData();
    if (decision === 'delete' && currentView === 'team-profile') switchView('teams');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminSetPlayerRole(targetSteamId, newRole) {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_set_role', targetSteamId, newRole })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Spelarens behörighet har uppdaterats!', 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminScheduleMatch() {
  const homeTeamId = document.getElementById('schedHomeTeam')?.value;
  const awayTeamId = document.getElementById('schedAwayTeam')?.value;
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
    return showToast('Välj två olika godkända lag.', 'error');
  }
  const roundNumber = parseInt(document.getElementById('schedRoundNum')?.value, 10) || 1;
  const playedAt = document.getElementById('schedDateTime')?.value;
  const serverIp = document.getElementById('schedServer')?.value;

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_schedule_match', homeTeamId, awayTeamId, roundNumber, playedAt, serverIp })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast(`Matchen lades till (Kod: ${out.matchCode})!`, 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminDeleteMatch(matchId) {
  if (!confirm('Vill du radera matchen?')) return;
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_delete_match', matchId })
    });
    if (res.ok) {
      showToast('Matchen raderades.', 'info');
      await loadLeagueData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitMatchReportToDB() {
  const homeTeamId = document.getElementById('simHomeTeam')?.value;
  const awayTeamId = document.getElementById('simAwayTeam')?.value;
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
    return showToast('Välj två olika godkända lag först!', 'error');
  }

  const homeScore = parseInt(document.getElementById('simHomeGoals')?.value, 10) || 0;
  const awayScore = parseInt(document.getElementById('simAwayGoals')?.value, 10) || 0;
  const isOvertime = Boolean(document.getElementById('simIsOvertime')?.checked);
  const starSteamId = document.getElementById('simStarPlayer')?.value;

  const playerStats = [];
  if (starSteamId) {
    playerStats.push({
      steamId: starSteamId,
      teamId: homeTeamId,
      goals: parseInt(document.getElementById('simPlayerG')?.value, 10) || 1,
      assists: parseInt(document.getElementById('simPlayerA')?.value, 10) || 1,
      topShotSpeedKmh: parseFloat(document.getElementById('simPlayerShotKmh')?.value) || 140
    });
  }

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'server_match_report',
        homeTeamId,
        awayTeamId,
        homeScore,
        awayScore,
        isOvertime,
        playerStats
      })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Matchresultatet har sparats i databasen!', 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
