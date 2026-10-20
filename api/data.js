const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const SUPER_ADMIN_STEAM_ID = '76561198360771568'; // sidde

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

// Säkerställer att alla kolumner och tabeller (inklusive inkorg & transfers) finns
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS team_invites (
      id SERIAL PRIMARY KEY,
      team_id INT REFERENCES teams(id) ON DELETE CASCADE,
      steam_id VARCHAR(32) REFERENCES players(steam_id) ON DELETE CASCADE,
      invited_by VARCHAR(32) REFERENCES players(steam_id) ON DELETE SET NULL,
      status VARCHAR(16) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (team_id, steam_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transfer_history (
      id SERIAL PRIMARY KEY,
      steam_id VARCHAR(32) REFERENCES players(steam_id) ON DELETE CASCADE,
      from_team_id INT,
      to_team_id INT,
      transfer_type VARCHAR(16) DEFAULT 'join',
      transfer_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS team_role VARCHAR(16) DEFAULT 'player'
  `;
}

module.exports = async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const steamId = getVerifiedSteamId(req);

  try {
    await ensureSchema(sql);

    // =========================================================================
    // GET: HÄMTA ALL LIGADATA
    // =========================================================================
    if (req.method === 'GET') {
      const dbTeams = await sql`
        SELECT t.*, p.username AS captain_name
        FROM teams t
        LEFT JOIN players p ON t.captain_steam_id = p.steam_id
        ORDER BY t.name ASC
      `;

      const dbPlayers = await sql`
        SELECT 
          p.*,
          tm.team_role,
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
        LEFT JOIN team_members tm ON p.steam_id = tm.steam_id AND p.team_id = tm.team_id
        LEFT JOIN player_match_stats pms ON p.steam_id = pms.steam_id
        GROUP BY p.steam_id, tm.team_role
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

      const dbRosters = await sql`
        SELECT tm.*, p.username, p.jersey_number, p.preferred_position
        FROM team_members tm
        JOIN players p ON tm.steam_id = p.steam_id
        ORDER BY 
          CASE tm.team_role 
            WHEN 'captain' THEN 1 
            WHEN 'assistant' THEN 2 
            ELSE 3 
          END,
          tm.joined_at ASC
      `;

      const dbTransfers = await sql`
        SELECT 
          th.*,
          p.username AS player_name,
          ft.name AS from_team_name, ft.tag AS from_team_tag,
          tt.name AS to_team_name, tt.tag AS to_team_tag
        FROM transfer_history th
        LEFT JOIN players p ON th.steam_id = p.steam_id
        LEFT JOIN teams ft ON th.from_team_id = ft.id
        LEFT JOIN teams tt ON th.to_team_id = tt.id
        ORDER BY th.transfer_date DESC
        LIMIT 100
      `;

      let myInvites = [];
      if (steamId) {
        myInvites = await sql`
          SELECT ti.*, t.name AS team_name, t.tag AS team_tag, t.primary_color, t.secondary_color, p.username AS inviter_name
          FROM team_invites ti
          JOIN teams t ON ti.team_id = t.id
          LEFT JOIN players p ON ti.invited_by = p.steam_id
          WHERE ti.steam_id = ${steamId} AND ti.status = 'pending'
          ORDER BY ti.created_at DESC
        `;
      }

      const currentUser = steamId ? dbPlayers.find(p => p.steam_id === steamId) || null : null;

      return res.status(200).json({
        currentUser,
        teams: dbTeams,
        players: dbPlayers,
        matches: dbMatches,
        rosters: dbRosters,
        transfers: dbTransfers,
        myInvites
      });
    }

    // =========================================================================
    // POST: SPARA DATA & UTFÖR ÅTGÄRDER
    // =========================================================================
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { action } = body;

      let currentUser = null;
      if (steamId) {
        const found = await sql`SELECT * FROM players WHERE steam_id = ${steamId}`;
        currentUser = found[0] || null;
      }
      const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.steam_id === SUPER_ADMIN_STEAM_ID);

      // Helper: Kontrollera om inloggad spelare är Kapten/Assisterande i ett specifikt lag eller Admin
      async function canManageTeam(teamId, requireCaptainOrAdmin = false) {
        if (isAdmin) return true;
        if (!currentUser) return false;
        const memberRows = await sql`
          SELECT team_role FROM team_members WHERE team_id = ${teamId} AND steam_id = ${currentUser.steam_id}
        `;
        const role = memberRows[0]?.team_role;
        if (requireCaptainOrAdmin) {
          return role === 'captain';
        }
        return role === 'captain' || role === 'assistant';
      }

      // 1. SPARA PUCK-KARAKTÄR & POSITION (UTESPELARE / MÅLVAKT)
      if (action === 'save_character') {
        if (!currentUser) return res.status(401).json({ error: 'Du måste vara inloggad med Steam.' });

        const targetSteamId = (isAdmin && body.targetSteamId) ? body.targetSteamId : currentUser.steam_id;

        await sql`
          UPDATE players SET
            username = ${String(body.username || currentUser.username).slice(0, 64)},
            jersey_number = ${Math.min(99, Math.max(1, parseInt(body.jerseyNumber, 10) || 12))},
            preferred_position = ${String(body.preferredPosition || 'FORWARD').slice(0, 16)},
            stick_handedness = ${body.stickHandedness === 'Right' ? 'Right' : 'Left'},
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

        return res.status(200).json({ ok: true });
      }

      // 2. ANSÖK MED NYTT LAG
      if (action === 'apply_team') {
        if (!currentUser) return res.status(401).json({ error: 'Logga in med Steam för att ansöka med ett lag.' });
        if (currentUser.team_id && !isAdmin) {
          return res.status(400).json({ error: 'Du tillhör redan ett lag. Lämna ditt nuvarande lag först.' });
        }

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
          VALUES (${name}, ${tag}, ${currentUser.steam_id}, 'pending', ${primaryColor}, ${secondaryColor}, ${rosterNotes})
        `;

        return res.status(200).json({ ok: true });
      }

      // 3. ADMIN: SKAPA GODKÄNT LAG DIREKT (FÖR TEST / ADMIN)
      if (action === 'admin_create_team') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });

        const name = String(body.name || '').trim();
        const tag = String(body.tag || '').trim().toUpperCase();
        const primaryColor = String(body.primaryColor || '#0284c7').slice(0, 16);
        const secondaryColor = String(body.secondaryColor || '#ffffff').slice(0, 16);
        const captainSteamId = body.captainSteamId || null;

        if (!name || !tag) return res.status(400).json({ error: 'Lagnamn och tagg krävs.' });

        const created = await sql`
          INSERT INTO teams (name, tag, captain_steam_id, status, primary_color, secondary_color)
          VALUES (${name}, ${tag}, ${captainSteamId}, 'approved', ${primaryColor}, ${secondaryColor})
          RETURNING *
        `;
        const newTeam = created[0];

        if (captainSteamId) {
          await sql`DELETE FROM team_members WHERE steam_id = ${captainSteamId}`;
          await sql`
            UPDATE players SET 
              team_id = ${newTeam.id},
              jersey_primary_color = ${primaryColor},
              jersey_stripe_color = ${secondaryColor}
            WHERE steam_id = ${captainSteamId}
          `;
          await sql`
            INSERT INTO team_members (team_id, steam_id, team_role)
            VALUES (${newTeam.id}, ${captainSteamId}, 'captain')
          `;
          await sql`
            INSERT INTO transfer_history (steam_id, to_team_id, transfer_type)
            VALUES (${captainSteamId}, ${newTeam.id}, 'join')
          `;
        }

        return res.status(200).json({ ok: true, teamId: newTeam.id });
      }

      // 4. ADMIN: GODKÄNN ELLER RADERA LAG
      if (action === 'admin_team_status') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin har behörighet.' });

        const teamId = parseInt(body.teamId, 10);
        if (body.decision === 'approve') {
          const updated = await sql`
            UPDATE teams SET status = 'approved' WHERE id = ${teamId} RETURNING *
          `;
          const team = updated[0];
          if (team && team.captain_steam_id) {
            await sql`DELETE FROM team_members WHERE steam_id = ${team.captain_steam_id}`;
            await sql`
              UPDATE players SET 
                team_id = ${teamId},
                jersey_primary_color = COALESCE(${team.primary_color}, jersey_primary_color),
                jersey_stripe_color = COALESCE(${team.secondary_color}, jersey_stripe_color)
              WHERE steam_id = ${team.captain_steam_id}
            `;
            await sql`
              INSERT INTO team_members (team_id, steam_id, team_role)
              VALUES (${teamId}, ${team.captain_steam_id}, 'captain')
              ON CONFLICT (team_id, steam_id) DO UPDATE SET team_role = 'captain'
            `;
            await sql`
              INSERT INTO transfer_history (steam_id, to_team_id, transfer_type)
              VALUES (${team.captain_steam_id}, ${teamId}, 'join')
            `;
          }
        } else if (body.decision === 'delete') {
          await sql`UPDATE players SET team_id = NULL WHERE team_id = ${teamId}`;
          await sql`DELETE FROM team_members WHERE team_id = ${teamId}`;
          await sql`DELETE FROM team_invites WHERE team_id = ${teamId}`;
          await sql`DELETE FROM matches WHERE home_team_id = ${teamId} OR away_team_id = ${teamId}`;
          await sql`DELETE FROM teams WHERE id = ${teamId}`;
        }

        return res.status(200).json({ ok: true });
      }

      // 5. BJUDA IN FREE AGENT TILL LAG (ELLER DIREKTTILLÄGG FÖR ADMIN)
      if (action === 'invite_player') {
        const teamId = parseInt(body.teamId, 10);
        const targetSteamId = String(body.targetSteamId || '').trim();
        const directAdd = Boolean(body.directAdd) && isAdmin;

        if (!(await canManageTeam(teamId, false))) {
          return res.status(403).json({ error: 'Endast lagkapten, assisterande kapten eller admin kan bjuda in spelare.' });
        }

        // Kontrollera max 10 spelare i laget
        const countRows = await sql`SELECT COUNT(*)::int AS cnt FROM team_members WHERE team_id = ${teamId}`;
        if (countRows[0].cnt >= 10) {
          return res.status(400).json({ error: 'Laget är fullt (Max 10 spelare per lag).' });
        }

        // Kontrollera att spelaren är en Free Agent
        const targetRows = await sql`SELECT * FROM players WHERE steam_id = ${targetSteamId}`;
        const targetPlayer = targetRows[0];
        if (!targetPlayer) return res.status(404).json({ error: 'Spelaren hittades inte.' });
        if (targetPlayer.team_id) {
          return res.status(400).json({ error: 'Spelaren tillhör redan ett lag och är inte en Free Agent.' });
        }

        if (directAdd) {
          const teamRows = await sql`SELECT * FROM teams WHERE id = ${teamId}`;
          const team = teamRows[0];
          await sql`
            UPDATE players SET 
              team_id = ${teamId},
              jersey_primary_color = COALESCE(${team?.primary_color}, jersey_primary_color),
              jersey_stripe_color = COALESCE(${team?.secondary_color}, jersey_stripe_color)
            WHERE steam_id = ${targetSteamId}
          `;
          await sql`
            INSERT INTO team_members (team_id, steam_id, team_role)
            VALUES (${teamId}, ${targetSteamId}, 'player')
            ON CONFLICT (team_id, steam_id) DO NOTHING
          `;
          await sql`DELETE FROM team_invites WHERE steam_id = ${targetSteamId}`;
          await sql`
            INSERT INTO transfer_history (steam_id, to_team_id, transfer_type)
            VALUES (${targetSteamId}, ${teamId}, 'join')
          `;
          return res.status(200).json({ ok: true, direct: true });
        }

        await sql`
          INSERT INTO team_invites (team_id, steam_id, invited_by, status)
          VALUES (${teamId}, ${targetSteamId}, ${currentUser.steam_id}, 'pending')
          ON CONFLICT (team_id, steam_id) DO UPDATE SET status = 'pending', created_at = CURRENT_TIMESTAMP
        `;

        return res.status(200).json({ ok: true, direct: false });
      }

      // 6. SVARA PÅ LAGINBJUDAN I INKORGEN (ACCEPTERA / NEKA)
      if (action === 'respond_invite') {
        if (!currentUser) return res.status(401).json({ error: 'Logga in först.' });
        const inviteId = parseInt(body.inviteId, 10);
        const decision = body.decision; // 'accept' | 'decline'

        const invRows = await sql`SELECT * FROM team_invites WHERE id = ${inviteId} AND steam_id = ${currentUser.steam_id}`;
        const invite = invRows[0];
        if (!invite) return res.status(404).json({ error: 'Inbjudan hittades inte.' });

        if (decision === 'decline') {
          await sql`DELETE FROM team_invites WHERE id = ${inviteId}`;
          return res.status(200).json({ ok: true });
        }

        if (currentUser.team_id) {
          return res.status(400).json({ error: 'Du är redan med i ett lag. Lämna ditt nuvarande lag först.' });
        }

        const countRows = await sql`SELECT COUNT(*)::int AS cnt FROM team_members WHERE team_id = ${invite.team_id}`;
        if (countRows[0].cnt >= 10) {
          return res.status(400).json({ error: 'Laget har redan nått maxgränsen på 10 spelare.' });
        }

        const teamRows = await sql`SELECT * FROM teams WHERE id = ${invite.team_id}`;
        const team = teamRows[0];

        await sql`
          UPDATE players SET 
            team_id = ${invite.team_id},
            jersey_primary_color = COALESCE(${team?.primary_color}, jersey_primary_color),
            jersey_stripe_color = COALESCE(${team?.secondary_color}, jersey_stripe_color)
          WHERE steam_id = ${currentUser.steam_id}
        `;
        await sql`
          INSERT INTO team_members (team_id, steam_id, team_role)
          VALUES (${invite.team_id}, ${currentUser.steam_id}, 'player')
          ON CONFLICT (team_id, steam_id) DO NOTHING
        `;
        await sql`DELETE FROM team_invites WHERE steam_id = ${currentUser.steam_id}`;
        await sql`
          INSERT INTO transfer_history (steam_id, to_team_id, transfer_type)
          VALUES (${currentUser.steam_id}, ${invite.team_id}, 'join')
        `;

        return res.status(200).json({ ok: true, teamId: invite.team_id });
      }

      // 7. LÄMNA LAGET SJÄLV
      if (action === 'leave_team') {
        if (!currentUser) return res.status(401).json({ error: 'Logga in först.' });
        const teamId = parseInt(body.teamId, 10);

        await sql`DELETE FROM team_members WHERE team_id = ${teamId} AND steam_id = ${currentUser.steam_id}`;
        await sql`UPDATE players SET team_id = NULL WHERE steam_id = ${currentUser.steam_id}`;
        await sql`
          INSERT INTO transfer_history (steam_id, from_team_id, transfer_type)
          VALUES (${currentUser.steam_id}, ${teamId}, 'leave')
        `;

        // Om kaptenen lämnade laget, utse nästa medlem till kapten om någon finns kvar
        const teamRows = await sql`SELECT * FROM teams WHERE id = ${teamId}`;
        if (teamRows[0] && teamRows[0].captain_steam_id === currentUser.steam_id) {
          const remaining = await sql`SELECT * FROM team_members WHERE team_id = ${teamId} ORDER BY joined_at ASC LIMIT 1`;
          const nextCap = remaining[0]?.steam_id || null;
          await sql`UPDATE teams SET captain_steam_id = ${nextCap} WHERE id = ${teamId}`;
          if (nextCap) {
            await sql`UPDATE team_members SET team_role = 'captain' WHERE team_id = ${teamId} AND steam_id = ${nextCap}`;
          }
        }

        return res.status(200).json({ ok: true });
      }

      // 8. SPARKA SPELARE FRÅN LAGET (KAPTEN / ASSISTERANDE / ADMIN)
      if (action === 'kick_member') {
        const teamId = parseInt(body.teamId, 10);
        const targetSteamId = String(body.targetSteamId || '');

        if (!(await canManageTeam(teamId, false))) {
          return res.status(403).json({ error: 'Saknar behörighet.' });
        }

        const targetMem = await sql`SELECT * FROM team_members WHERE team_id = ${teamId} AND steam_id = ${targetSteamId}`;
        if (targetMem[0]?.team_role === 'captain' && !isAdmin) {
          return res.status(400).json({ error: 'Lagkaptenen kan inte sparkas.' });
        }

        await sql`DELETE FROM team_members WHERE team_id = ${teamId} AND steam_id = ${targetSteamId}`;
        await sql`UPDATE players SET team_id = NULL WHERE steam_id = ${targetSteamId}`;
        await sql`
          INSERT INTO transfer_history (steam_id, from_team_id, transfer_type)
          VALUES (${targetSteamId}, ${teamId}, 'kick')
        `;

        return res.status(200).json({ ok: true });
      }

      // 9. ÄNDRA MEDLEMSROLL (C / A / PLAYER) ELLER POSITION (GK / UTESPELARE)
      if (action === 'update_team_member') {
        const teamId = parseInt(body.teamId, 10);
        const targetSteamId = String(body.targetSteamId || '');
        const newTeamRole = body.newTeamRole; // 'captain' | 'assistant' | 'player'
        const newPosition = body.newPosition; // 'FORWARD' | 'CENTER' | 'BACK' | 'MÅLVAKT'

        if (!(await canManageTeam(teamId, false))) {
          return res.status(403).json({ error: 'Endast lagledning eller Admin kan ändra roller.' });
        }

        if (newPosition) {
          await sql`UPDATE players SET preferred_position = ${newPosition} WHERE steam_id = ${targetSteamId}`;
        }

        if (newTeamRole) {
          if (newTeamRole === 'captain') {
            // Endast nuvarande kapten eller Admin kan överlämna kaptensbindeln
            if (!(await canManageTeam(teamId, true))) {
              return res.status(403).json({ error: 'Endast nuvarande lagkapten eller Admin kan utse ny lagkapten.' });
            }
            await sql`UPDATE team_members SET team_role = 'player' WHERE team_id = ${teamId} AND team_role = 'captain'`;
            await sql`UPDATE team_members SET team_role = 'captain' WHERE team_id = ${teamId} AND steam_id = ${targetSteamId}`;
            await sql`UPDATE teams SET captain_steam_id = ${targetSteamId} WHERE id = ${teamId}`;
          } else {
            await sql`
              UPDATE team_members SET team_role = ${newTeamRole}
              WHERE team_id = ${teamId} AND steam_id = ${targetSteamId}
            `;
          }
        }

        return res.status(200).json({ ok: true });
      }

      // 10. ADMIN: GE ELLER TA BORT ADMIN-ROLL PÅ HEMSIDAN
      if (action === 'admin_set_role') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });
        const targetSteamId = String(body.targetSteamId || '');
        if (targetSteamId === SUPER_ADMIN_STEAM_ID) {
          return res.status(400).json({ error: 'Huvudadministratören kan inte ändras.' });
        }
        const newRole = body.newRole === 'admin' ? 'admin' : 'player';
        await sql`UPDATE players SET role = ${newRole} WHERE steam_id = ${targetSteamId}`;
        return res.status(200).json({ ok: true });
      }

      // 11. ADMIN: SCHEMALÄGG MATCH
      if (action === 'admin_schedule_match') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });
        const homeId = parseInt(body.homeTeamId, 10);
        const awayId = parseInt(body.awayTeamId, 10);
        const playedAt = body.playedAt ? new Date(body.playedAt).toISOString() : new Date().toISOString();
        const serverIp = String(body.serverIp || 'ELITSERIEN Ligaspel 1').slice(0, 64);

        await sql`
          INSERT INTO matches (home_team_id, away_team_id, status, played_at, server_ip)
          VALUES (${homeId}, ${awayId}, 'scheduled', ${playedAt}, ${serverIp})
        `;
        return res.status(200).json({ ok: true });
      }

      // 12. ADMIN: RADERA MATCH
      if (action === 'admin_delete_match') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });
        const matchId = parseInt(body.matchId, 10);
        await sql`DELETE FROM matches WHERE id = ${matchId}`;
        return res.status(200).json({ ok: true });
      }

      // 13. C# SERVER PLUGIN ELLER ADMIN: RAPPORTERA MATCHRESULTAT
      if (action === 'server_match_report') {
        const serverKey = req.headers['x-server-key'];
        const isAuthorizedServer = serverKey && process.env.STEAM_API_KEY && serverKey === process.env.STEAM_API_KEY;

        if (!isAuthorizedServer && !isAdmin) {
          return res.status(403).json({ error: 'Obehörigt anrop.' });
        }

        const homeTeamId = parseInt(body.homeTeamId, 10);
        const awayTeamId = parseInt(body.awayTeamId, 10);
        const homeScore = parseInt(body.homeScore, 10) || 0;
        const awayScore = parseInt(body.awayScore, 10) || 0;
        const isOvertime = Boolean(body.isOvertime);
        const isShootout = Boolean(body.isShootout);
        const homeShots = parseInt(body.homeShots, 10) || 0;
        const awayShots = parseInt(body.awayShots, 10) || 0;
        const serverIp = String(body.serverIp || 'ELITSERIEN Ligaspel 1').slice(0, 64);

        let matchId = body.matchId ? parseInt(body.matchId, 10) : null;

        if (matchId) {
          await sql`
            UPDATE matches SET
              home_score = ${homeScore}, away_score = ${awayScore},
              is_overtime = ${isOvertime}, is_shootout = ${isShootout},
              home_shots = ${homeShots}, away_shots = ${awayShots},
              status = 'completed', played_at = CURRENT_TIMESTAMP
            WHERE id = ${matchId}
          `;
        } else {
          const inserted = await sql`
            INSERT INTO matches (
              home_team_id, away_team_id, home_score, away_score,
              is_overtime, is_shootout, home_shots, away_shots,
              server_ip, status, played_at
            ) VALUES (
              ${homeTeamId}, ${awayTeamId}, ${homeScore}, ${awayScore},
              ${isOvertime}, ${isShootout}, ${homeShots}, ${awayShots},
              ${serverIp}, 'completed', CURRENT_TIMESTAMP
            ) RETURNING id
          `;
          matchId = inserted[0].id;
        }

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
                ${matchId}, ${ps.steamId}, ${pTeamId}, ${g}, ${a}, ${tp},
                ${sog}, ${topSpeed}, ${pm},
                ${poss}, ${toi},
                ${passComp}, ${passAtt},
                ${saves}, ${sa}, ${ga}, ${svPct}
              )
              ON CONFLICT (match_id, steam_id) DO UPDATE SET
                goals = EXCLUDED.goals, assists = EXCLUDED.assists, points = EXCLUDED.points,
                shots_on_goal = EXCLUDED.shots_on_goal,
                top_shot_speed_kmh = GREATEST(player_match_stats.top_shot_speed_kmh, EXCLUDED.top_shot_speed_kmh),
                plus_minus = EXCLUDED.plus_minus, possession_seconds = EXCLUDED.possession_seconds,
                passes_completed = EXCLUDED.passes_completed, passes_attempted = EXCLUDED.passes_attempted,
                saves = EXCLUDED.saves, shots_against = EXCLUDED.shots_against,
                goals_against = EXCLUDED.goals_against, save_percentage = EXCLUDED.save_percentage
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
