const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const ADMIN_STEAM_IDS = ['76561198360771568']; // sidde

function signSession(steamId) {
  const secret = process.env.STEAM_API_KEY || process.env.DATABASE_URL || 'elitserien_secret';
  const sig = crypto.createHmac('sha256', secret).update(steamId).digest('hex');
  return `${steamId}.${sig}`;
}

module.exports = async function handler(req, res) {
  const action = req.query.action || 'login';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;

  // 1. LOGGA UT
  if (action === 'logout') {
    res.setHeader('Set-Cookie', 'elit_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // 2. SKICKA TILL STEAM OPENID
  if (action === 'login') {
    const returnUrl = `${baseUrl}/api/auth?action=callback`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl,
      'openid.realm': baseUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });
    res.writeHead(302, { Location: `https://steamcommunity.com/openid/login?${params.toString()}` });
    return res.end();
  }

  // 3. TA EMOT SVAR FRÅN STEAM & SPARA I NEON
  if (action === 'callback') {
    try {
      const verifyParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key.startsWith('openid.')) {
          verifyParams.append(key, Array.isArray(value) ? value[0] : value);
        }
      }
      verifyParams.set('openid.mode', 'check_authentication');

      const verifyRes = await fetch('https://steamcommunity.com/openid/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams.toString()
      });
      const verifyText = await verifyRes.text();

      if (!verifyText.includes('is_valid:true')) {
        return res.status(401).send('Steam-verifiering misslyckades.');
      }

      const claimedId = req.query['openid.claimed_id'] || '';
      const match = String(claimedId).match(/\/id\/(\d+)$/) || String(claimedId).match(/(\d{17})/);
      if (!match) {
        return res.status(400).send('Kunde inte läsa ut SteamID64.');
      }
      const steamId = match[1];

      // Hämta visningsnamn och profilbild från Steam Web API
      let username = `Spelare_${steamId.slice(-4)}`;
      let avatarUrl = '';
      if (process.env.STEAM_API_KEY) {
        try {
          const apiRes = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`
          );
          const apiData = await apiRes.json();
          const playerSummary = apiData?.response?.players?.[0];
          if (playerSummary) {
            username = playerSummary.personaname || username;
            avatarUrl = playerSummary.avatarfull || '';
          }
        } catch (err) {
          console.error('Steam API profilhämtning misslyckades:', err);
        }
      }

      const assignedRole = ADMIN_STEAM_IDS.includes(steamId) ? 'admin' : 'player';
      const sql = neon(process.env.DATABASE_URL);

      // Skapa spelare om den inte finns, annars uppdatera avatar (och säkra admin-roll för sidde)
      await sql`
        INSERT INTO players (steam_id, username, avatar_url, role)
        VALUES (${steamId},${username}, ${avatarUrl},${assignedRole})
        ON CONFLICT (steam_id) DO UPDATE SET
          avatar_url = EXCLUDED.avatar_url,
          role = CASE WHEN players.steam_id = '76561198360771568' THEN 'admin' ELSE players.role END
      `;

      const token = signSession(steamId);
      res.setHeader(
        'Set-Cookie',
        `elit_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
      );
      res.writeHead(302, { Location: '/' });
      return res.end();
    } catch (error) {
      console.error('Auth callback error:', error);
      return res.status(500).send('Ett serverfel uppstod vid inloggningen.');
    }
  }

  return res.status(400).json({ error: 'Ogiltig auth-action' });
};
