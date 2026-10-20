function renderTeamsView() {
  const container = document.getElementById('teamsGridContainer');
  const approved = getApprovedTeams();
  setElText('teamsCountSubtitle', `KLUBBAR (${approved.length} / 14 LAG)`);
  if (!container) return;

  if (approved.length === 0) {
    container.innerHTML = `
      <div class="col-span-4 bg-white border border-gray-200 rounded-sm p-10 text-center space-y-3">
        <p class="text-sm font-bold text-slate-800">Inga lag är godkända i ligan ännu.</p>
        <p class="text-xs text-gray-500">Klicka på "Ansök med ditt lag" för att skicka in en lagansökan!</p>
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
      <div onclick="openTeamProfile(${t.id})" class="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md cursor-pointer transition group">
        <div>
          <div class="h-2" style="background-color: ${t.primary_color || '#0284c7'}"></div>
          <div class="p-5 flex items-center gap-4 border-b border-gray-100">
            ${renderTeamCrestSVG(t.id, 'w-12 h-12')}
            <div>
              <h3 class="font-shl text-2xl font-black uppercase text-slate-900 group-hover:text-shl-blue leading-none">${t.name}</h3>
              <span class="text-xs text-gray-500 font-medium">${st.pts} poäng • ${teamPlayers.length}/10 spelare</span>
            </div>
          </div>
          <div class="p-4 space-y-1.5">
            <div class="text-[11px] font-bold uppercase tracking-wider text-gray-400">Kapten: ${t.captain_name || '-'}</div>
            ${teamPlayers.slice(0, 5).map(tp => `
              <div class="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-50">
                <span class="font-bold text-slate-800">#${tp.number}${tp.name}</span>
                <span class="text-[10px] font-bold text-gray-500">${isGoaliePos(tp.position) ? 'GK' : tp.position}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
          <span class="text-gray-500">Målskillnad: <strong>${st.gf}-${st.ga}</strong></span>
          <span class="text-shl-blue font-bold">Öppna lagprofil →</span>
        </div>
      </div>
    `;
  }).join('');
}

function openTeamProfile(teamId) {
  if (!teamId) return;
  activeTeamProfileId = Number(teamId);
  switchView('team-profile');
  renderTeamProfileView(activeTeamProfileId);
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

  const actionsDiv = document.getElementById('teamProfileHeaderActions');
  if (actionsDiv) {
    let actionButtonsHTML = '';
    if (isMember && !isCaptain) {
      actionButtonsHTML += `
        <button type="button" onclick="leaveTeam(${team.id})" class="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded shadow transition">
          Lämna laget
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
          Radera lag (Admin)
        </button>
      `;
    }
    actionsDiv.innerHTML = actionButtonsHTML;
  }

  const capPanel = document.getElementById('teamCaptainControlPanel');
  const directBtn = document.getElementById('btnAdminDirectAddPlayer');
  if (capPanel) {
    if (canManage) {
      capPanel.classList.remove('hidden');
      if (directBtn) {
        if (isAdmin) directBtn.classList.remove('hidden');
        else directBtn.classList.add('hidden');
      }

      const freeAgents = allPlayers.filter(p => !p.teamId);
      const faSelect = document.getElementById('captainFreeAgentSelect');
      if (faSelect) {
        if (teamPlayers.length >= 10) {
          faSelect.innerHTML = `<option value="">Laget är fullt (10 / 10 spelare)</option>`;
        } else if (freeAgents.length === 0) {
          faSelect.innerHTML = `<option value="">Inga lediga Free Agents registrerade just nu</option>`;
        } else {
          faSelect.innerHTML = freeAgents.map(fa =>
            `<option value="${fa.steamId}">#${fa.number} ${fa.name} (${isGoaliePos(fa.position) ? 'Målvakt GK' : fa.position})</option>`
          ).join('');
        }
      }
    } else {
      capPanel.classList.add('hidden');
    }
  }

  const rosterGrid = document.getElementById('teamProfileRosterGrid');
  if (rosterGrid) {
    if (teamPlayers.length === 0) {
      rosterGrid.innerHTML = `<div class="col-span-2 bg-gray-50 border border-gray-200 rounded p-6 text-center text-xs text-gray-500">Inga spelare i laget ännu.</div>`;
    } else {
      rosterGrid.innerHTML = teamPlayers.map(tp => {
        const rRow = allRosters.find(r => Number(r.team_id) === Number(team.id) && r.steam_id === tp.steamId);
        const tRole = rRow?.team_role || (team.captain_steam_id === tp.steamId ? 'captain' : 'player');
        const roleBadge = tRole === 'captain'
          ? `<span class="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">LAGKAPTEN (C)</span>`
          : tRole === 'assistant'
          ? `<span class="bg-sky-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">ASSISTERANDE (A)</span>`
          : `<span class="bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">SPELARE</span>`;

        const posBadge = isGoaliePos(tp.position)
          ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">MÅLVAKT (GK)</span>`
          : `<span class="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">${tp.position}</span>`;

        let controlsHTML = '';
        if (canManage) {
          controlsHTML = `
            <div class="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div class="flex items-center gap-1.5">
                <select onchange="updateMemberRoleOrPos(${team.id}, '${tp.steamId}', this.value, null)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                  <option value="player" ${tRole === 'player' ? 'selected' : ''}>Roll: Spelare</option>
                  <option value="assistant" ${tRole === 'assistant' ? 'selected' : ''}>Roll: Assisterande (A)</option>
                  ${(isCaptain || isAdmin) ? `<option value="captain" ${tRole === 'captain' ? 'selected' : ''}>Roll: Gör till Kapten (C)</option>` : ''}
                </select>
                <select onchange="updateMemberRoleOrPos(${team.id}, '${tp.steamId}', null, this.value)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                  <option value="FORWARD" ${tp.position === 'FORWARD' ? 'selected' : ''}>Forward</option>
                  <option value="CENTER" ${tp.position === 'CENTER' ? 'selected' : ''}>Center</option>
                  <option value="BACK" ${tp.position === 'BACK' ? 'selected' : ''}>Back</option>
                  <option value="MÅLVAKT" ${isGoaliePos(tp.position) ? 'selected' : ''}>Målvakt (GK)</option>
                </select>
              </div>
              ${(tRole !== 'captain' || isAdmin) ? `
                <button type="button" onclick="kickMember(${team.id}, '${tp.steamId}')" class="text-rose-600 hover:bg-rose-50 font-bold px-2 py-1 rounded transition">
                  Sparka
                </button>
              ` : ''}
            </div>
          `;
        }

        return `
          <div class="bg-white border border-gray-200 rounded-sm p-4 shadow-sm flex flex-col justify-between">
            <div onclick="openPlayerProfile('${tp.steamId}')" class="flex items-center gap-3.5 cursor-pointer group">
              <div class="w-14 h-16 bg-slate-900 rounded overflow-hidden flex items-center justify-center shrink-0">
                ${renderPuckCharacterSVG(tp)}
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1">${roleBadge} ${posBadge}</div>
                <div class="font-shl text-2xl font-black uppercase text-slate-900 group-hover:text-shl-blue transition">#${tp.number} ${tp.name}</div>
                <div class="text-xs text-gray-500">${tp.gp} GP • ${tp.g} G • ${tp.a} A • <strong>${tp.tp} TP</strong></div>
              </div>
            </div>
            ${controlsHTML}
          </div>
        `;
      }).join('');
    }
  }

  const teamMatches = allMatches.filter(m => Number(m.home_team_id) === Number(team.id) || Number(m.away_team_id) === Number(team.id));
  const mList = document.getElementById('teamProfileMatchesList');
  if (mList) {
    mList.innerHTML = teamMatches.length === 0
      ? `<div class="bg-gray-50 border border-gray-200 rounded p-6 text-center text-xs text-gray-500">Inga matcher registrerade för ${team.name} ännu.</div>`
      : teamMatches.map(m => {
          const isPlayed = m.status === 'completed';
          return `
            <div onclick="openMatchModal(${m.id})" class="bg-gray-50 hover:bg-white border border-gray-200 rounded p-3 flex items-center justify-between cursor-pointer transition text-xs">
              <span class="text-gray-500 font-medium">Omg ${m.round_number || 1} • ${formatDateShort(m.played_at)}</span>
              <div class="flex items-center gap-2 font-shl text-base font-bold uppercase">
                <span>${m.home_name}</span>
                <span class="px-2 py-0.5 bg-slate-900 text-white rounded font-black">${isPlayed ? `${m.home_score} - ${m.away_score}` : 'VS'}</span>
                <span>${m.away_name}</span>
              </div>
              <span class="text-[10px] font-bold uppercase ${isPlayed ? 'text-emerald-600' : 'text-shl-blue'}">Matchrum →</span>
            </div>
          `;
        }).join('');
  }

  const teamTransfers = allTransfers.filter(th => Number(th.from_team_id) === Number(team.id) || Number(th.to_team_id) === Number(team.id));
  const tList = document.getElementById('teamProfileTransfersList');
  if (tList) {
    tList.innerHTML = teamTransfers.length === 0
      ? `<div class="bg-gray-50 border border-gray-200 rounded p-6 text-center text-xs text-gray-500">Ingen transferhistorik ännu.</div>`
      : teamTransfers.map(th => {
          let badge = `<span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[10px]">ANSLÖT</span>`;
          if (th.transfer_type === 'leave') badge = `<span class="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[10px]">LÄMNADE</span>`;
          if (th.transfer_type === 'kick') badge = `<span class="bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded text-[10px]">SPARKAD</span>`;
          return `
            <div class="bg-white border border-gray-200 rounded p-3 flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">${badge} <span class="font-bold text-slate-900">${th.player_name || th.steam_id}</span></div>
              <span class="text-[11px] text-gray-400">${formatDateShort(th.transfer_date)}</span>
            </div>
          `;
        }).join('');
  }
}

async function sendTeamInvite(directAdd = false) {
  const targetSteamId = document.getElementById('captainFreeAgentSelect')?.value || '';
  if (!targetSteamId) return showToast('Välj en Free Agent i listan först.', 'error');
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invite_player', teamId: activeTeamProfileId, targetSteamId, directAdd })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast(out.direct ? 'Spelaren lades in i laget direkt!' : 'Inbjudan har skickats till spelarens inkorg!', 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function leaveTeam(teamId) {
  if (!confirm('Är du säker på att du vill lämna laget?')) return;
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave_team', teamId })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Du har lämnat laget och är nu Free Agent.', 'info');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function kickMember(teamId, targetSteamId) {
  if (!confirm('Vill du sparka spelaren från laget?')) return;
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kick_member', teamId, targetSteamId })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Spelaren togs bort från laget.', 'info');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateMemberRoleOrPos(teamId, targetSteamId, newTeamRole, newPosition) {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_team_member', teamId, targetSteamId, newTeamRole, newPosition })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    showToast('Spelarens roll/position har uppdaterats!', 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openTeamApplicationModal() {
  if (!currentUser) return showToast('Logga in med Steam uppe till höger först.', 'info');
  document.getElementById('teamApplicationModal')?.classList.remove('hidden');
}

function closeTeamApplicationModal() {
  document.getElementById('teamApplicationModal')?.classList.add('hidden');
}

async function submitTeamApplication(e) {
  e.preventDefault();
  const name = document.getElementById('appTeamName')?.value.trim();
  const tag = document.getElementById('appTeamShort')?.value.trim().toUpperCase();
  const primaryColor = document.getElementById('appTeamColor')?.value || '#0284c7';
  const secondaryColor = document.getElementById('appTeamSecondary')?.value || '#ffffff';
  const rosterNotes = document.getElementById('appTeamRoster')?.value.trim() || '';

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apply_team', name, tag, primaryColor, secondaryColor, rosterNotes })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    closeTeamApplicationModal();
    e.target.reset();
    showToast(`Lagansökan för ${name} har skickats till Admin!`, 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openInboxModal() {
  const list = document.getElementById('inboxListContainer');
  if (list) {
    list.innerHTML = myInvites.length === 0
      ? `<div class="text-center text-xs text-gray-500 py-6">Du har inga väntande laginbjudningar i din inkorg.</div>`
      : myInvites.map(inv => `
          <div class="border border-gray-200 rounded p-4 flex flex-col gap-3 bg-gray-50">
            <div class="flex items-center gap-3">
              ${renderTeamCrestSVG(inv.team_id, 'w-10 h-10')}
              <div>
                <div class="font-shl text-xl font-black uppercase text-slate-900">${inv.team_name} (${inv.team_tag})</div>
                <div class="text-xs text-gray-500">Inbjuden av: <strong>${inv.inviter_name || 'Lagkapten'}</strong></div>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2">
              <button type="button" onclick="respondToInvite(${inv.id}, 'decline')" class="px-3 py-1.5 rounded text-xs font-bold text-gray-600 hover:bg-gray-200">Neka</button>
              <button type="button" onclick="respondToInvite(${inv.id}, 'accept')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-xs font-bold uppercase shadow">Acceptera & Gå med</button>
            </div>
          </div>
        `).join('');
  }
  document.getElementById('inboxModal')?.classList.remove('hidden');
}

function closeInboxModal() {
  document.getElementById('inboxModal')?.classList.add('hidden');
}

async function respondToInvite(inviteId, decision) {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond_invite', inviteId, decision })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    closeInboxModal();
    await loadLeagueData();
    if (decision === 'accept' && out.teamId) {
      showToast('Du har gått med i laget!', 'success');
      openTeamProfile(out.teamId);
    } else {
      showToast('Inbjudan avböjdes.', 'info');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}
