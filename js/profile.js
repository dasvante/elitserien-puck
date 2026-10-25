function openPlayerProfile(steamId) {
  if (!steamId) return;
  activeProfileSteamId = steamId;
  switchView('profile');
  renderProfileView(steamId);
}

function openMyProfile() {
  if (currentUser) {
    openPlayerProfile(currentUser.steam_id);
  } else if (allPlayers.length > 0) {
    openPlayerProfile(allPlayers[0].steamId);
  } else {
    switchView('profile');
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

function renderGaugeCircle(value, label, percent) {
  const p = Math.max(0, Math.min(100, percent));
  return `
    <div class="flex flex-col items-center">
      <div class="w-28 h-28 sm:w-32 sm:h-32 rounded-full gauge-ring flex items-center justify-center p-2.5 shadow-sm" style="--pct: ${p}%">
        <div class="w-full h-full rounded-full bg-white flex flex-col items-center justify-center">
          <span class="font-shl text-3xl sm:text-4xl font-black text-shl-blue leading-none">${value}</span>
          <span class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-1">${label}</span>
        </div>
      </div>
    </div>
  `;
}

function renderProfileCareerAndGauges(p) {
  const isGK = isGoaliePos(p.position);

  // Uppdatera de 4 rubrikerna i den blå SHL-baren genom att hitta deras text-element
  const gpEl = document.getElementById('careerGP');
  const tpEl = document.getElementById('careerTP');
  const gEl = document.getElementById('careerG');
  const aEl = document.getElementById('careerA');

  const gpLabel = gpEl?.nextElementSibling;
  const tpLabel = tpEl?.nextElementSibling;
  const gLabel = gEl?.nextElementSibling;
  const aLabel = aEl?.nextElementSibling;

  if (isGK) {
    // SHL Målvaktsvy (som Emil Larmi): Spelade matcher, Vinster, Räddningar, Hållna nollor
    setElText('careerGP', p.gp || 0);
    setElText('careerTP', p.wins || 0);
    setElText('careerG', p.saves || 0);
    setElText('careerA', p.shutouts || 0);

    if (gpLabel) gpLabel.textContent = 'Spelade matcher (GPI)';
    if (tpLabel) tpLabel.textContent = 'Vinster (W)';
    if (gLabel) gLabel.textContent = 'Räddningar (SVS)';
    if (aLabel) aLabel.textContent = 'Hållna nollor (SO)';

    const svPctStr = (p.savePct || 0).toFixed(1) + '%';
    setElHTML('profileSeasonGauges', [
      renderGaugeCircle(p.gp || 0, 'GPI', Math.min(100, (p.gp || 0) * 5)),
      renderGaugeCircle(p.wins || 0, 'W', p.gp > 0 ? ((p.wins || 0) / p.gp) * 100 : 0),
      renderGaugeCircle(p.saves || 0, 'SVS', Math.min(100, (p.saves || 0) * 2)),
      renderGaugeCircle(p.shutouts || 0, 'SO', Math.min(100, (p.shutouts || 0) * 20)),
      renderGaugeCircle(svPctStr, 'SVS%', p.savePct || 0)
    ].join(''));
  } else {
    // Utespelarvy: Matcher (GP), Poäng (TP), Mål (G), Assist (A)
    setElText('careerGP', p.gp || 0);
    setElText('careerTP', p.tp || 0);
    setElText('careerG', p.g || 0);
    setElText('careerA', p.a || 0);

    if (gpLabel) gpLabel.textContent = 'Matcher (GP)';
    if (tpLabel) tpLabel.textContent = 'Poäng (TP)';
    if (gLabel) gLabel.textContent = 'Mål (G)';
    if (aLabel) aLabel.textContent = 'Assist (A)';

    setElHTML('profileSeasonGauges', [
      renderGaugeCircle(p.gp || 0, 'GP', Math.min(100, (p.gp || 0) * 5)),
      renderGaugeCircle(p.g || 0, 'G', Math.min(100, (p.g || 0) * 4)),
      renderGaugeCircle(p.a || 0, 'A', Math.min(100, (p.a || 0) * 4)),
      renderGaugeCircle(p.tp || 0, 'TP', Math.min(100, (p.tp || 0) * 2.5)),
      renderGaugeCircle((p.passAccuracy || 0) + '%', 'PASS%', p.passAccuracy || 0)
    ].join(''));
  }
}

function renderProfileView(steamId) {
  const p = allPlayers.find(x => x.steamId === steamId) || allPlayers[0];
  if (!p) return;

  activeProfileSteamId = p.steamId;
  const team = getTeamById(p.teamId);

  setElHTML('profilePuckAvatarContainer', renderPuckCharacterSVG(p));
  setElText('profilePlayerName', p.name);
  const posLabel = isGoaliePos(p.position) ? 'MÅLVAKT (GK)' : p.position;
  setElText('profileNumberAndPos', `#${p.number} ${posLabel}`);
  setElHTML('profileTeamCrest', renderTeamCrestSVG(p.teamId, 'w-6 h-6'));
  setElText('profileTeamName', team.name);
  setElText('profileSteamId', p.steamId);
  setElText('profileHandedness', p.handedness === 'Right' ? 'Right (Höger)' : 'Left (Vänster)');

  // Om målvakt: visa Räddningsprocent och Räddningar i profil-infon också
  if (isGoaliePos(p.position)) {
    setElText('profileHardestShot', `${(p.savePct || 0).toFixed(1)}% (${p.saves || 0} räddningar)`);
  } else {
    setElText('profileHardestShot', p.hardestShot.toFixed(1) + ' km/h');
  }
  setElText('profilePassAcc', p.passAccuracy + '%');

  const roleBadge = document.getElementById('profileTeamRoleBadge');
  if (roleBadge) {
    if (p.teamRole === 'captain') {
      roleBadge.textContent = 'LAGKAPTEN (C)';
      roleBadge.classList.remove('hidden');
    } else if (p.teamRole === 'assistant') {
      roleBadge.textContent = 'ASSISTERANDE KAPTEN (A)';
      roleBadge.classList.remove('hidden');
    } else {
      roleBadge.classList.add('hidden');
    }
  }

  const admBadge = document.getElementById('profileAdminBadge');
  if (admBadge) {
    if (p.accountRole === 'admin') admBadge.classList.remove('hidden');
    else admBadge.classList.add('hidden');
  }

  const isMe = currentUser && currentUser.steam_id === p.steamId;
  const isAdmin = currentUser && currentUser.role === 'admin';
  const editBtn = document.getElementById('btnOpenLockerRoom');
  const drawer = document.getElementById('avatarEditorDrawer');

  if (editBtn) {
    if (isMe || isAdmin) {
      editBtn.classList.remove('hidden');
      editBtn.classList.add('inline-flex');
    } else {
      editBtn.classList.add('hidden');
      editBtn.classList.remove('inline-flex');
      if (drawer) drawer.classList.add('hidden');
    }
  }

  renderProfileCareerAndGauges(p);
  populateLockerRoomInputs(p);
}

function updateGoalieOrSkaterButtons(pos) {
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
  } else if (isGoaliePos(roleSelect.value)) {
    roleSelect.value = 'FORWARD';
  }
  previewAvatarFromInputs();
}

function populateLockerRoomInputs(p) {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
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

  const chk = document.getElementById('custShowChestNum');
  if (chk) chk.checked = p.avatar.showChestNum !== false;
  updateGoalieOrSkaterButtons(p.position);
}

function previewAvatarFromInputs() {
  const p = allPlayers.find(x => x.steamId === activeProfileSteamId);
  if (!p) return;

  const getVal = id => document.getElementById(id)?.value;
  p.name = getVal('custName') || p.name;
  p.number = parseInt(getVal('custNumber'), 10) || 12;
  p.position = getVal('custRole') || 'FORWARD';
  p.handedness = getVal('custHand') || 'Left';

  p.avatar.jerseyPrimary = getVal('custJerseyPrimary') || '#0284c7';
  p.avatar.jerseyStripe = getVal('custJerseyStripe') || '#0a0d12';
  p.avatar.helmetColor = getVal('custHelmetColor') || '#0a0d12';
  p.avatar.skinColor = getVal('custSkinColor') || '#c68b65';
  p.avatar.visor = getVal('custVisor') || 'tinted';
  p.avatar.beard = getVal('custBeard') || 'none';
  p.avatar.hairColor = getVal('custHairColor') || '#23170f';
  p.avatar.shaftTape = getVal('custShaftTape') || '#28b5e1';
  p.avatar.bladeTape = getVal('custBladeTape') || '#111111';
  p.avatar.showChestNum = document.getElementById('custShowChestNum')?.checked ?? true;

  updateGoalieOrSkaterButtons(p.position);
  setElHTML('profilePuckAvatarContainer', renderPuckCharacterSVG(p));
  setElText('profilePlayerName', p.name);
  const posLabel = isGoaliePos(p.position) ? 'MÅLVAKT (GK)' : p.position;
  setElText('profileNumberAndPos', `#${p.number} ${posLabel}`);

  // Byt direkt mellan Utespelar- och Målvaktsstatistik i profilen när man växlar modell!
  renderProfileCareerAndGauges(p);
  renderHeaderAuthArea();
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

    showToast('Spelarkaraktär sparad!', 'success');
    await loadLeagueData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Spara ändringar'; }
  }
}
