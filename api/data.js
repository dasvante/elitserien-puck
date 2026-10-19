const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

function getVerifiedSteamId(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
  const raw = cookies.elit_session;
  if (!raw || !raw.includes('.')) return null;
  const [steamId, sig] = raw.split('.');
  const secret = process.env.STEAM_API_KEY || process.env.DATABASE_URL || 'elitserien_secret';
  const expected = crypto.createHmac('sha256', secret).update(steamId).digest('hex');
  return sig === expected ? steamId : null;
}

module.exports = async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const steamId = getVerifiedSteamId(req);

  try {
    // =========================================================================
    // GET: HÄMTA ALL DATA FRÅN NEON (SPELARE, LAG, MATCHER, INLOGGAD PROFIL)
    // =========================================================================
    if (req.method === 'GET') {
      const dbTeams = await sql`
        SELECT id, name, tag, logo_url, captain_steam_id, status, primary_color, secondary_color, roster_notes, created_at
        FROM teams
        ORDER BY name ASC
      `;

      const dbPlayers = await sql`
        SELECT 
          p.*,
          COALESCE(COUNT(pms.id), 0)::int AS gp,
          COALESCE(SUM(pms.goals), 0)::int AS g,
          COALESCE(SUM(pms.assists), 0)::int AS a,
          COALESCE(SUM(pms.points), 0)::int AS tp,
          COALESCE(SUM(pms.plus_minus), 0)::int AS plus_minus,
          COALESCE(MAX(pms.top_shot_speed_kmh), 0)::float AS hardest_shot,
          COALESCE(SUM(pms.passes_completed), 0)::int AS passes_completed,
          COALESCE(SUM(pms.passes_attempted), 0)::int AS passes_attempted,
          COALESCE(SUM(pms.saves), 0)::int AS saves,
          COALESCE(SUM(pms.shots_against), 0)::int AS shots_against
        FROM players p
        LEFT JOIN player_match_stats pms ON p.steam_id = pms.steam_id
        GROUP BY p.steam_id
        ORDER BY tp DESC, g DESC, p.created_at ASC
      `;

      const dbMatches = await sql`
        SELECT 
          m.*,
          ht.name AS home_name, ht.tag AS home_tag,
          at.name AS away_name, at.tag AS away_tag
        FROM matches m
        LEFT JOIN teams ht ON m.home_team_id = ht.id
        LEFT JOIN teams at ON m.away_team_id = at.id
        ORDER BY COALESCE(m.played_at, m.created_at) DESC
      `;

      const currentUser = steamId ? dbPlayers.find(p => p.steam_id === steamId) || null : null;

      return res.status(200).json({
        currentUser,
        teams: dbTeams,
        players: dbPlayers,
        matches: dbMatches
      });
    }

    // =========================================================================
    // POST: SPARA PROFIL, SKAPA LAG, ADMIN-ÅTGÄRDER & C# SERVER WEBHOOK
    // =========================================================================
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { action } = body;

      // Hämta inloggad användare om session finns
      let currentUser = null;
      if (steamId) {
        const found = await sql`SELECT * FROM players WHERE steam_id = ${steamId}`;
        currentUser = found[0] || null;
      }

      // 1. SPARA PUCK-KARAKTÄR FRÅN LOCKER ROOM
      if (action === 'save_character') {
        if (!currentUser) return res.status(401).json({ error: 'Du måste vara inloggad med Steam.' });

        const targetSteamId = (currentUser.role === 'admin' && body.targetSteamId) ? body.targetSteamId : currentUser.steam_id;
        const teamIdVal = body.teamId ? parseInt(body.teamId, 10) : null;

        await sql`
          UPDATE players SET
            username = ${String(body.username || currentUser.username).slice(0, 64)},
            jersey_number = ${Math.min(99, Math.max(1, parseInt(body.jerseyNumber, 10) || 12))},
            preferred_position = ${String(body.preferredPosition || 'FORWARD').slice(0, 16)},
            stick_handedness = ${body.stickHandedness === 'Right' ? 'Right' : 'Left'},
            team_id = ${teamIdVal},
            jersey_primary_color = ${String(body.jerseyPrimary || '#0284c7').slice(0, 16)},
            jersey_stripe_color = ${String(body.jerseyStripe || '#0a0d12').slice(0, 16)},
            show_chest_number = ${Boolean(body.showChestNum)},
            helmet_color = ${String(body.helmetColor || '#0a0d12').slice(0, 16)},
            skin_color = ${String(body.skinColor || '#c68b65').slice(0, 16)},
            visor_tint = ${String(body.visorTint || 'tinted').slice(0, 16)},
            facial_hair = ${String(body.facialHair || 'none').slice(0, 16)},
            hair_color = ${String(body.hairColor || '#23170f').slice(0, 16)},
            stick_shaft_color = ${String(body.shaftTape || '#28b5e1').slice(0, 16)},
            stick_blade_tape = ${String(body.bladeTape || '#111111').slice(0, 16)}
          WHERE steam_id = ${targetSteamId}
        `;

        if (teamIdVal) {
          await sql`
            INSERT INTO team_members (team_id, steam_id)
            VALUES (${teamIdVal},${targetSteamId})
            ON CONFLICT (team_id, steam_id) DO NOTHING
          `;
        }

        return res.status(200).json({ ok: true });
      }

      // 2. ANSÖK MED NYTT LAG
      if (action === 'apply_team') {
        if (!currentUser) return res.status(401).json({ error: 'Logga in med Steam för att ansöka med ett lag.' });

        const name = String(body.name || '').trim();
        const tag = String(body.tag || '').trim().toUpperCase();
        const primaryColor = String(body.primaryColor || '#0284c7').slice(0, 16);
        const secondaryColor = String(body.secondaryColor || '#ffffff').slice(0, 16);
        const rosterNotes = String(body.rosterNotes || '').trim();

        if (!name || !tag) {
          return res.status(400).json({ error: 'Lagnamn och förkortning (tagg) krävs.' });
        }

        await sql`
          INSERT INTO teams (name, tag, captain_steam_id, status, primary_color, secondary_color, roster_notes)
          VALUES (${name},${tag}, ${currentUser.steam_id}, 'pending',${primaryColor}, ${secondaryColor},${rosterNotes})
        `;

        return res.status(200).json({ ok: true });
      }

      // 3. ADMIN: GODKÄNN ELLER RADERA LAG
      if (action === 'admin_team_status') {
        if (!currentUser || currentUser.role !== 'admin') {
          return res.status(403).json({ error: 'Endast Admin har behörighet.' });
        }

        const teamId = parseInt(body.teamId, 10);
        if (body.decision === 'approve') {
          const updated = await sql`
            UPDATE teams SET status = 'approved' WHERE id = ${teamId} RETURNING *
          `;
          if (updated[0] && updated[0].captain_steam_id) {
            await sql`
              UPDATE players SET team_id = ${teamId} WHERE steam_id =${updated[0].captain_steam_id}
            `;
            await sql`
              INSERT INTO team_members (team_id, steam_id)
              VALUES (${teamId},${updated[0].captain_steam_id})
              ON CONFLICT DO NOTHING
            `;
          }
        } else if (body.decision === 'delete') {
          await sql`DELETE FROM teams WHERE id = ${teamId}`;
        }

        return res.status(200).json({ ok: true });
      }

      // 4. ADMIN: SCHEMALÄGG KOMMANDE MATCH
      if (action === 'admin_schedule_match') {
        if (!currentUser || currentUser.role !== 'admin') {
          return res.status(403).json({ error: 'Endast Admin har behörighet.' });
        }

        const homeId = parseInt(body.homeTeamId, 10);
        const awayId = parseInt(body.awayTeamId, 10);
        const playedAt = body.playedAt ? new Date(body.playedAt).toISOString() : new Date().toISOString();
        const serverIp = String(body.serverIp || 'ELITSERIEN Server 1').slice(0, 64);

        await sql`
          INSERT INTO matches (home_team_id, away_team_id, status, played_at, server_ip)
          VALUES (${homeId},${awayId}, 'scheduled', ${playedAt},${serverIp})
        `;

        return res.status(200).json({ ok: true });
      }

      // 5. ADMIN: RADERA MATCH
      if (action === 'admin_delete_match') {
        if (!currentUser || currentUser.role !== 'admin') {
          return res.status(403).json({ error: 'Endast Admin har behörighet.' });
        }
        const matchId = parseInt(body.matchId, 10);
        await sql`DELETE FROM matches WHERE id = ${matchId}`;
        return res.status(200).json({ ok: true });
      }

      // 6. C# SERVER PLUGIN ELLER ADMIN: RAPPORTERA MATCHRESULTAT & SPELARSTATISTIK
      // Kan anropas av C#-servermodden med Header: x-server-key: <STEAM_API_KEY> eller av inloggad Admin
      if (action === 'server_match_report') {
        const serverKey = req.headers['x-server-key'];
        const isAuthorizedServer = serverKey && process.env.STEAM_API_KEY && serverKey === process.env.STEAM_API_KEY;
        const isAdminUser = currentUser && currentUser.role === 'admin';

        if (!isAuthorizedServer && !isAdminUser) {
          return res.status(403).json({ error: 'Obehörigt anrop. Kräver Admin-session eller x-server-key.' });
        }

        const homeTeamId = parseInt(body.homeTeamId, 10);
        const awayTeamId = parseInt(body.awayTeamId, 10);
        const homeScore = parseInt(body.homeScore, 10) || 0;
        const awayScore = parseInt(body.awayScore, 10) || 0;
        const isOvertime = Boolean(body.isOvertime);
        const isShootout = Boolean(body.isShootout);
        const homeShots = parseInt(body.homeShots, 10) || 0;
        const awayShots = parseInt(body.awayShots, 10) || 0;
        const serverIp = String(body.serverIp || 'ELITSERIEN Server 1').slice(0, 64);

        let matchId = body.matchId ? parseInt(body.matchId, 10) : null;

        if (matchId) {
          await sql`
            UPDATE matches SET
              home_score = ${homeScore},
              away_score = ${awayScore},
              is_overtime = ${isOvertime},
              is_shootout = ${isShootout},
              home_shots = ${homeShots},
              away_shots = ${awayShots},
              status = 'completed',
              played_at = CURRENT_TIMESTAMP
            WHERE id = ${matchId}
          `;
        } else {
          const inserted = await sql`
            INSERT INTO matches (
              home_team_id, away_team_id, home_score, away_score,
              is_overtime, is_shootout, home_shots, away_shots,
              server_ip, status, played_at
            ) VALUES (
              ${homeTeamId}, ${awayTeamId},${homeScore}, ${awayScore},${isOvertime}, ${isShootout},${homeShots}, ${awayShots},${serverIp}, 'completed', CURRENT_TIMESTAMP
            ) RETURNING id
          `;
          matchId = inserted[0].id;
        }

        // Spara individuell spelarstatistik från matchen (om skickad från C#-pluginet eller Admin)
        if (Array.isArray(body.playerStats)) {
          for (const ps of body.playerStats) {
            if (!ps.steamId) continue;
            const g = parseInt(ps.goals, 10) || 0;
            const a = parseInt(ps.assists, 10) || 0;
            const tp = g + a;
            const sog = parseInt(ps.shotsOnGoal, 10) || 0;
            const topSpeed = parseFloat(ps.topShotSpeedKmh) || 0;
            const pm = parseInt(ps.plusMinus, 10) || 0;
            const poss = parseFloat(ps.possessionSeconds) || 0;
            const toi = parseFloat(ps.timeOnIceSeconds) || 0;
            const passComp = parseInt(ps.passesCompleted, 10) || 0;
            const passAtt = parseInt(ps.passesAttempted, 10) || 0;
            const saves = parseInt(ps.saves, 10) || 0;
            const sa = parseInt(ps.shotsAgainst, 10) || 0;
            const ga = parseInt(ps.goalsAgainst, 10) || 0;
            const svPct = sa > 0 ? ((saves / sa) * 100).toFixed(2) : 0;
            const pTeamId = ps.teamId ? parseInt(ps.teamId, 10) : homeTeamId;

            await sql`
              INSERT INTO player_match_stats (
                match_id, steam_id, team_id, goals, assists, points,
                shots_on_goal, top_shot_speed_kmh, plus_minus,
                possession_seconds, time_on_ice_seconds,
                passes_completed, passes_attempted,
                saves, shots_against, goals_against, save_percentage
              ) VALUES (
                ${matchId}, ${ps.steamId},${pTeamId}, ${g},${a}, ${tp},${sog}, ${topSpeed},${pm},
                ${poss},${toi},
                ${passComp},${passAtt},
                ${saves},${sa}, ${ga},${svPct}
              )
              ON CONFLICT (match_id, steam_id) DO UPDATE SET
                goals = EXCLUDED.goals,
                assists = EXCLUDED.assists,
                points = EXCLUDED.points,
                shots_on_goal = EXCLUDED.shots_on_goal,
                top_shot_speed_kmh = GREATEST(player_match_stats.top_shot_speed_kmh, EXCLUDED.top_shot_speed_kmh),
                plus_minus = EXCLUDED.plus_minus,
                possession_seconds = EXCLUDED.possession_seconds,
                passes_completed = EXCLUDED.passes_completed,
                passes_attempted = EXCLUDED.passes_attempted,
                saves = EXCLUDED.saves,
                shots_against = EXCLUDED.shots_against,
                goals_against = EXCLUDED.goals_against,
                save_percentage = EXCLUDED.save_percentage
            `;
          }
        }

        return res.status(200).json({ ok: true, matchId });
      }

      return res.status(400).json({ error: 'Okänd action.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message || 'Serverfel' });
  }
};
