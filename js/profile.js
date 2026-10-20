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
  renderProfileView(steamId);
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

  const btnOpen = document.getElementById('btnOpenLockerRoom');
  const drawer = document.getElementById('avatarEditorDrawer');
  if (canEdit) {
    if (btnOpen) { btnOpen.classList.remove('hidden'); btnOpen.classList.add('inline-flex'); }
  } else {
    if (btnOpen) { btnOpen.classList.add('hidden'); btnOpen.classList.remove('inline-flex'); }
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
        <span class="font-sans text-2xl font-extrabold text-shl-blue leading-none">${g.value}</span>
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
      btn.textContent = 'Spara Ändringar';
    }
  }
}
