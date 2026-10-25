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
        <polygon points="86,293 116,298 22,324 16,301 24,292" fill="${av.bladeTape}" />
        <g transform="translate(46, 308)">
          <path d="M0,8 L0,20 A24,8 0 0,0 48,20 L48,8 Z" fill="#090b0e" />
          <ellipse cx="24" cy="8" rx="24" ry="8" fill="#1e242d" stroke="#cbd5e1" stroke-width="1" />
          <text x="24" y="10.5" text-anchor="middle" fill="#e2e8f0" font-family="'Barlow Condensed', sans-serif" font-weight="900" font-size="8" letter-spacing="1.5">PUCK</text>
        </g>
      </g>
    </svg>
  `;
}
