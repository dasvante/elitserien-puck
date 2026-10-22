const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const SUPER_ADMIN_STEAM_ID = '76561198360771568'; // sidde
const MAX_TEAMS_IN_LEAGUE = 14;

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

function isServerAuthorized(req) {
  const serverKey = req.headers['x-server-key'];
  if (!serverKey) return false;
  if (process.env.SERVER_API_KEY && serverKey === process.env.SERVER_API_KEY) return true;
  if (process.env.STEAM_API_KEY && serverKey === process.env.STEAM_API_KEY) return true;
  return false;
}

function generateMatchCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ES-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function buildRoundRobinSchedule(teamIds, meetingsPerPair = 2) {
  const list = [...teamIds];
  if (list.length % 2 !== 0) {
    list.push(null);
  }
  const n = list.length;
  const roundsPerCycle = n - 1;
  const half = n / 2;
  const fixtures = [];

  for (let cycle = 0; cycle < meetingsPerPair; cycle++) {
    const rotation = [...list];
    for (let r = 0; r < roundsPerCycle; r++) {
      const roundNumber = cycle * roundsPerCycle + r + 1;
      for (let i = 0; i < half; i++) {
        const t1 = rotation[i];
        const t2 = rotation[n - 1 - i];
        if (t1 !== null && t2 !== null) {
          const flip = (r + i + cycle) % 2 === 1;
          fixtures.push({
            roundNumber,
            homeTeamId: flip ? t2 : t1,
            awayTeamId: flip ? t1 : t2,
            matchCode: generateMatchCode()
          });
        }
      }
      const fixed = rotation[0];
      const moved = rotation.pop();
      rotation.splice(1, 0, moved);
      rotation[0] = fixed;
    }
  }
  return fixtures;
}

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
    ALTER TABLE players
      ADD COLUMN IF NOT EXISTS team_id INT,
      ADD COLUMN IF NOT EXISTS jersey_number INT DEFAULT 12,
      ADD COLUMN IF NOT EXISTS preferred_position VARCHAR(16) DEFAULT 'FORWARD',
      ADD COLUMN IF NOT EXISTS stick_handedness VARCHAR(16) DEFAULT 'Left',
      ADD COLUMN IF NOT EXISTS jersey_primary_color VARCHAR(16) DEFAULT '#0284c7',
      ADD COLUMN IF NOT EXISTS jersey_stripe_color VARCHAR(16) DEFAULT '#0a0d12',
      ADD COLUMN IF NOT EXISTS show_chest_number BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS helmet_color VARCHAR(16) DEFAULT '#0a0d12',
      ADD COLUMN IF NOT EXISTS skin_color VARCHAR(16) DEFAULT '#c68b65',
      ADD COLUMN IF NOT EXISTS visor_tint VARCHAR(16) DEFAULT 'tinted',
      ADD COLUMN IF NOT EXISTS facial_hair VARCHAR(16) DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS hair_color VARCHAR(16) DEFAULT '#23170f',
      ADD COLUMN IF NOT EXISTS stick_shaft_color VARCHAR(16) DEFAULT '#28b5e1',
      ADD COLUMN IF NOT EXISTS stick_blade_tape VARCHAR(16) DEFAULT '#111111'
  `;
  await sql`
    ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS primary_color VARCHAR(16) DEFAULT '#0284c7',
      ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(16) DEFAULT '#ffffff',
      ADD COLUMN IF NOT EXISTS roster_notes TEXT
  `;
  await sql`
    ALTER TABLE team_members
      ADD COLUMN IF NOT EXISTS team_role VARCHAR(16) DEFAULT 'player',
      ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  `;
  await sql`
    ALTER TABLE matches
      ADD COLUMN IF NOT EXISTS round_number INT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS match_code VARCHAR(16),
      ADD COLUMN IF NOT EXISTS is_overtime BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_shootout BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS home_shots INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS away_shots INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS server_ip VARCHAR(64),
      ADD COLUMN IF NOT EXISTS proposed_time TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS proposed_by_team_id INT,
      ADD COLUMN IF NOT EXISTS rematch_requested_by_team_id INT,
      ADD COLUMN IF NOT EXISTS rematch_reason TEXT
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS player_match_stats (
      id SERIAL PRIMARY KEY,
      match_id INT REFERENCES matches(id) ON DELETE CASCADE,
      steam_id VARCHAR(64),
      team_id INT,
      goals INT DEFAULT 0,
      assists INT DEFAULT 0,
      points INT DEFAULT 0,
      shots_on_goal INT DEFAULT 0,
      top_shot_speed_kmh NUMERIC(8, 2) DEFAULT 0.00,
      plus_minus INT DEFAULT 0,
      possession_seconds NUMERIC(8, 2) DEFAULT 0.00,
      time_on_ice_seconds NUMERIC(8, 2) DEFAULT 0.00,
      passes_completed INT DEFAULT 0,
      passes_attempted INT DEFAULT 0,
      saves INT DEFAULT 0,
      shots_against INT DEFAULT 0,
      goals_against INT DEFAULT 0,
      save_percentage NUMERIC(5, 2) DEFAULT 0.00
    )
  `;

  // Tvingar Postgres att expandera kolumnerna ifall tabellen redan skapades med för låg limit
  try {
    await sql`
      ALTER TABLE player_match_stats
        ALTER COLUMN top_shot_speed_kmh TYPE NUMERIC(8, 2),
        ALTER COLUMN possession_seconds TYPE NUMERIC(8, 2),
        ALTER COLUMN time_on_ice_seconds TYPE NUMERIC(8, 2)
    `;
  } catch (_) {}
}

module.exports = async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const steamId = getVerifiedSteamId(req);

  try {
    await ensureSchema(sql);

    // =========================================================================
    // C# SERVER-MOD ENDPOINT (GET): VERIFIERA MATCHKOD & HÄMTA ROSTERS
    // =========================================================================
    if (req.method === 'GET' && req.query.action === 'mod_verify_match') {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'Matchkod saknas.' });

      const mRows = await sql`
        SELECT m.*, ht.name AS home_name, ht.tag AS home_tag, ht.captain_steam_id AS home_captain,
               at.name AS away_name, at.tag AS away_tag, at.captain_steam_id AS away_captain
        FROM matches m
        LEFT JOIN teams ht ON m.home_team_id = ht.id
        LEFT JOIN teams at ON m.away_team_id = at.id
        WHERE UPPER(m.match_code) = ${code}
        LIMIT 1
      `;
      const match = mRows[0];
      if (!match) return res.status(404).json({ error: 'Ingen match hittades med den koden.' });
      if (match.status === 'completed') {
        return res.status(400).json({ error: 'Matchen är redan färdigspelad. Begär rematch på hemsidan om den ska spelas om.' });
      }

      const rosters = await sql`
        SELECT 
          p.team_id,
          p.steam_id,
          CASE
            WHEN t.captain_steam_id = p.steam_id THEN 'captain'
            ELSE COALESCE(tm.team_role, 'player')
          END AS team_role,
          p.username,
          p.jersey_number,
          p.preferred_position
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN team_members tm ON p.steam_id = tm.steam_id AND p.team_id = tm.team_id
        WHERE p.team_id IN (${match.home_team_id}, ${match.away_team_id})
      `;

      return res.status(200).json({
        ok: true,
        match: {
          id: match.id,
          matchCode: match.match_code,
          roundNumber: match.round_number,
          homeTeamId: match.home_team_id,
          homeName: match.home_name,
          homeTag: match.home_tag,
          awayTeamId: match.away_team_id,
          awayName: match.away_name,
          awayTag: match.away_tag,
          homeRoster: rosters.filter(r => Number(r.team_id) === Number(match.home_team_id)),
          awayRoster: rosters.filter(r => Number(r.team_id) === Number(match.away_team_id))
        }
      });
    }

    // =========================================================================
    // GET: HÄMTA ALL LIGADATA TILL HEMSIDAN
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
        ORDER BY tp DESC, g DESC, p.username ASC
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
          p.username ASC
      `;

      const dbMatchesRaw = await sql`
        SELECT 
          m.*,
          ht.name AS home_name, ht.tag AS home_tag,
          at.name AS away_name, at.tag AS away_tag
        FROM matches m
        LEFT JOIN teams ht ON m.home_team_id = ht.id
        LEFT JOIN teams at ON m.away_team_id = at.id
        ORDER BY COALESCE(m.round_number, 1) ASC, m.id ASC
      `;

      const dbMatchPlayerStats = await sql`
        SELECT 
          pms.*,
          p.username,
          p.jersey_number,
          t.tag AS team_tag
        FROM player_match_stats pms
        LEFT JOIN players p ON pms.steam_id = p.steam_id
        LEFT JOIN teams t ON pms.team_id = t.id
        ORDER BY pms.points DESC, pms.goals DESC
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
      const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.steam_id === SUPER_ADMIN_STEAM_ID);

      const myLeaderTeamIds = new Set(
        dbRosters
          .filter(r => r.steam_id === steamId && (r.team_role === 'captain' || r.team_role === 'assistant'))
          .map(r => Number(r.team_id))
      );
      dbTeams.forEach(t => {
        if (t.captain_steam_id === steamId) myLeaderTeamIds.add(Number(t.id));
      });

      const dbMatches = dbMatchesRaw.map(m => {
        const canSeeCode =
          isAdmin ||
          myLeaderTeamIds.has(Number(m.home_team_id)) ||
          myLeaderTeamIds.has(Number(m.away_team_id));
        return {
          ...m,
          match_code: canSeeCode ? m.match_code : null,
          can_manage_match: canSeeCode
        };
      });

      return res.status(200).json({
        currentUser,
        teams: dbTeams,
        players: dbPlayers,
        matches: dbMatches,
        matchPlayerStats: dbMatchPlayerStats,
        rosters: dbRosters,
        transfers: dbTransfers,
        myInvites
      });
    }

    // =========================================================================
    // POST: ALLA ÅTGÄRDER (SPELARE, KAPTEN, ADMIN & C# SERVER-MOD)
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

      async function canManageTeam(teamId, requireCaptainOrAdmin = false) {
        if (isAdmin) return true;
        if (!currentUser || !teamId) return false;
        const teamRows = await sql`SELECT captain_steam_id FROM teams WHERE id = ${teamId}`;
        if (teamRows[0]?.captain_steam_id === currentUser.steam_id) return true;

        const memberRows = await sql`
          SELECT team_role FROM team_members WHERE team_id = ${teamId} AND steam_id = ${currentUser.steam_id}
        `;
        const role = memberRows[0]?.team_role;
        if (requireCaptainOrAdmin) return role === 'captain';
        return role === 'captain' || role === 'assistant';
      }

      // 1. SPARA PUCK-KARAKTÄR
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

        const approvedCount = await sql`SELECT COUNT(*)::int AS cnt FROM teams WHERE status = 'approved'`;
        if (approvedCount[0].cnt >= MAX_TEAMS_IN_LEAGUE) {
          return res.status(400).json({ error: `Ligan är full (${MAX_TEAMS_IN_LEAGUE} lag är maxgränsen).` });
        }

        const name = String(body.name || '').trim();
        const tag = String(body.tag || '').trim().toUpperCase();
        const primaryColor = String(body.primaryColor || '#0284c7').slice(0, 16);
        const secondaryColor = String(body.secondaryColor || '#ffffff').slice(0, 16);
        const rosterNotes = String(body.rosterNotes || '').trim();

        if (!name || !tag) return res.status(400).json({ error: 'Lagnamn och förkortning krävs.' });

        const existing = await sql`
          SELECT id, name, tag, status FROM teams
          WHERE LOWER(name) = LOWER(${name}) OR UPPER(tag) = UPPER(${tag})
          LIMIT 1
        `;
        if (existing[0]) {
          const statusMsg = existing[0].status === 'pending'
            ? 'Laget ligger redan under Väntande lagansökningar i Adminpanelen!'
            : 'Laget finns redan registrerat i ligan.';
          return res.status(400).json({ error: `${existing[0].name} (${existing[0].tag}) finns redan! ${statusMsg}` });
        }

        await sql`
          INSERT INTO teams (name, tag, captain_steam_id, status, primary_color, secondary_color, roster_notes)
          VALUES (${name}, ${tag}, ${currentUser.steam_id}, 'pending', ${primaryColor}, ${secondaryColor}, ${rosterNotes})
        `;
        return res.status(200).json({ ok: true });
      }

      // 3. ADMIN: SKAPA GODKÄNT LAG DIREKT
      if (action === 'admin_create_team') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });

        const approvedCount = await sql`SELECT COUNT(*)::int AS cnt FROM teams WHERE status = 'approved'`;
        if (approvedCount[0].cnt >= MAX_TEAMS_IN_LEAGUE) {
          return res.status(400).json({ error: `Maxgränsen på ${MAX_TEAMS_IN_LEAGUE} godkända lag är nådd.` });
        }

        const name = String(body.name || '').trim();
        const tag = String(body.tag || '').trim().toUpperCase();
        const primaryColor = String(body.primaryColor || '#0284c7').slice(0, 16);
        const secondaryColor = String(body.secondaryColor || '#ffffff').slice(0, 16);
        const captainSteamId = body.captainSteamId || null;

        if (!name || !tag) return res.status(400).json({ error: 'Lagnamn och tagg krävs.' });

        const existing = await sql`
          SELECT id, name, tag FROM teams
          WHERE LOWER(name) = LOWER(${name}) OR UPPER(tag) = UPPER(${tag})
          LIMIT 1
        `;
        if (existing[0]) {
          return res.status(400).json({ error: `Ett lag med namnet eller förkortningen ${existing[0].name} (${existing[0].tag}) finns redan.` });
        }

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
          const approvedCount = await sql`SELECT COUNT(*)::int AS cnt FROM teams WHERE status = 'approved'`;
          if (approvedCount[0].cnt >= MAX_TEAMS_IN_LEAGUE) {
            return res.status(400).json({ error: `Max ${MAX_TEAMS_IN_LEAGUE} godkända lag tillåts i Elitserien.` });
          }

          const updated = await sql`UPDATE teams SET status = 'approved' WHERE id = ${teamId} RETURNING *`;
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
          await sql`DELETE FROM transfer_history WHERE from_team_id = ${teamId} OR to_team_id = ${teamId}`;
          await sql`DELETE FROM team_members WHERE team_id = ${teamId}`;
          await sql`DELETE FROM team_invites WHERE team_id = ${teamId}`;
          await sql`DELETE FROM matches WHERE home_team_id = ${teamId} OR away_team_id = ${teamId}`;
          await sql`DELETE FROM teams WHERE id = ${teamId}`;
        }
        return res.status(200).json({ ok: true });
      }

      // 5. ADMIN: GENERERA SÄSONG / AUTOMATISKT SPELSCHEMA (2-14 LAG)
      if (action === 'admin_generate_season') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin kan starta säsongen.' });

        const approvedTeams = await sql`SELECT id, name, tag FROM teams WHERE status IS NULL OR LOWER(status) = 'approved' ORDER BY id ASC`;
        if (approvedTeams.length < 2) {
          return res.status(400).json({ error: 'Det krävs minst 2 godkända lag för att generera en säsong.' });
        }
        if (approvedTeams.length > MAX_TEAMS_IN_LEAGUE) {
          return res.status(400).json({ error: `Max ${MAX_TEAMS_IN_LEAGUE} lag tillåts.` });
        }

        const meetingsPerPair = Math.min(4, Math.max(1, parseInt(body.meetingsPerPair, 10) || 2));
        const clearExisting = Boolean(body.clearExisting);

        if (clearExisting) {
          await sql`DELETE FROM player_match_stats`;
          await sql`DELETE FROM match_events`;
          await sql`DELETE FROM matches`;
        }

        const teamIds = approvedTeams.map(t => t.id);
        const fixtures = buildRoundRobinSchedule(teamIds, meetingsPerPair);

        for (const f of fixtures) {
          await sql`
            INSERT INTO matches (
              home_team_id, away_team_id, round_number, match_code, status, server_ip
            ) VALUES (
              ${f.homeTeamId}, ${f.awayTeamId}, ${f.roundNumber}, ${f.matchCode}, 'scheduled', 'ELITSERIEN Server'
            )
          `;
        }

        return res.status(200).json({ ok: true, count: fixtures.length });
      }

      // 6. ADMIN: NOLLSTÄLL / RENSA ALLA MATCHER I SÄSONGEN
      if (action === 'admin_clear_schedule') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });
        await sql`DELETE FROM player_match_stats`;
        await sql`DELETE FROM match_events`;
        await sql`DELETE FROM matches`;
        return res.status(200).json({ ok: true });
      }

      // 7. MATCHRUM: FÖRESLÅ SPELTID
      if (action === 'propose_match_time') {
        const matchId = parseInt(body.matchId, 10);
        const proposedTime = body.proposedTime ? new Date(body.proposedTime).toISOString() : null;
        if (!proposedTime) return res.status(400).json({ error: 'Ange ett giltigt datum och klockslag.' });

        const mRows = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
        const match = mRows[0];
        if (!match) return res.status(404).json({ error: 'Matchen hittades inte.' });

        const canHome = await canManageTeam(match.home_team_id, false);
        const canAway = await canManageTeam(match.away_team_id, false);
        if (!canHome && !canAway && !isAdmin) {
          return res.status(403).json({ error: 'Endast lagkaptener, assisterande eller Admin kan föreslå matchtid.' });
        }

        if (isAdmin && body.lockImmediately) {
          await sql`
            UPDATE matches SET played_at = ${proposedTime}, proposed_time = NULL, proposed_by_team_id = NULL
            WHERE id = ${matchId}
          `;
          return res.status(200).json({ ok: true, locked: true });
        }

        const proposerTeamId = canHome ? match.home_team_id : match.away_team_id;
        await sql`
          UPDATE matches SET proposed_time = ${proposedTime}, proposed_by_team_id = ${proposerTeamId}
          WHERE id = ${matchId}
        `;
        return res.status(200).json({ ok: true, locked: false });
      }

      // 8. MATCHRUM: GODKÄNN FÖRESLAGEN SPELTID
      if (action === 'accept_match_time') {
        const matchId = parseInt(body.matchId, 10);
        const mRows = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
        const match = mRows[0];
        if (!match || !match.proposed_time) {
          return res.status(400).json({ error: 'Inget tidsförslag finns att godkänna.' });
        }

        const otherTeamId =
          Number(match.proposed_by_team_id) === Number(match.home_team_id)
            ? match.away_team_id
            : match.home_team_id;

        const canAccept = isAdmin || (await canManageTeam(otherTeamId, false));
        if (!canAccept) {
          return res.status(403).json({ error: 'Endast motståndarlagets kapten/assisterande eller Admin kan godkänna tidsförslaget.' });
        }

        await sql`
          UPDATE matches SET
            played_at = proposed_time,
            proposed_time = NULL,
            proposed_by_team_id = NULL
          WHERE id = ${matchId}
        `;
        return res.status(200).json({ ok: true });
      }

      // 9. MATCHRUM: ANSÖK OM REMATCH
      if (action === 'request_rematch') {
        const matchId = parseInt(body.matchId, 10);
        const reason = String(body.reason || '').trim().slice(0, 300);
        if (!reason) return res.status(400).json({ error: 'Skriv en kort anledning till ansökan om omspel.' });

        const mRows = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
        const match = mRows[0];
        if (!match) return res.status(404).json({ error: 'Matchen hittades inte.' });

        const canHome = await canManageTeam(match.home_team_id, false);
        const canAway = await canManageTeam(match.away_team_id, false);
        if (!canHome && !canAway && !isAdmin) {
          return res.status(403).json({ error: 'Endast lagkaptener, assisterande eller Admin kan ansöka om rematch.' });
        }

        const reqTeamId = canHome ? match.home_team_id : match.away_team_id;
        await sql`
          UPDATE matches SET
            rematch_requested_by_team_id = ${reqTeamId},
            rematch_reason = ${reason}
          WHERE id = ${matchId}
        `;
        return res.status(200).json({ ok: true });
      }

      // 10. MATCHRUM / ADMIN: GODKÄNN ELLER NEKA REMATCH
      if (action === 'resolve_rematch') {
        const matchId = parseInt(body.matchId, 10);
        const decision = body.decision;
        const mRows = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
        const match = mRows[0];
        if (!match) return res.status(404).json({ error: 'Matchen hittades inte.' });

        const otherTeamId =
          Number(match.rematch_requested_by_team_id) === Number(match.home_team_id)
            ? match.away_team_id
            : match.home_team_id;

        const canResolve = isAdmin || (otherTeamId && (await canManageTeam(otherTeamId, false)));
        if (!canResolve) {
          return res.status(403).json({ error: 'Endast motståndarlagets kapten/assisterande eller Admin kan godkänna rematch.' });
        }

        if (decision === 'decline') {
          await sql`
            UPDATE matches SET rematch_requested_by_team_id = NULL, rematch_reason = NULL
            WHERE id = ${matchId}
          `;
          return res.status(200).json({ ok: true, reset: false });
        }

        const newCode = generateMatchCode();
        await sql`DELETE FROM player_match_stats WHERE match_id = ${matchId}`;
        await sql`DELETE FROM match_events WHERE match_id = ${matchId}`;
        await sql`
          UPDATE matches SET
            home_score = 0,
            away_score = 0,
            is_overtime = false,
            is_shootout = false,
            status = 'scheduled',
            match_code = ${newCode},
            rematch_requested_by_team_id = NULL,
            rematch_reason = NULL
          WHERE id = ${matchId}
        `;
        return res.status(200).json({ ok: true, reset: true, newCode });
      }

      // 11. BJUDA IN FREE AGENT TILL LAG (MAX 10 SPELARE)
      if (action === 'invite_player') {
        const teamId = parseInt(body.teamId, 10);
        const targetSteamId = String(body.targetSteamId || '').trim();
        const directAdd = Boolean(body.directAdd) && isAdmin;

        if (!(await canManageTeam(teamId, false))) {
          return res.status(403).json({ error: 'Endast lagkapten, assisterande kapten eller admin kan bjuda in spelare.' });
        }

        const countRows = await sql`SELECT COUNT(*)::int AS cnt FROM team_members WHERE team_id = ${teamId}`;
        if (countRows[0].cnt >= 10) {
          return res.status(400).json({ error: 'Laget är fullt (Max 10 spelare per lag).' });
        }

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

      // 12. SVARA PÅ LAGINBJUDAN I INKORGEN
      if (action === 'respond_invite') {
        if (!currentUser) return res.status(401).json({ error: 'Logga in först.' });
        const inviteId = parseInt(body.inviteId, 10);
        const decision = body.decision;

        const invRows = await sql`SELECT * FROM team_invites WHERE id = ${inviteId} AND steam_id = ${currentUser.steam_id}`;
        const invite = invRows[0];
        if (!invite) return res.status(404).json({ error: 'Inbjudan hittades inte.' });

        if (decision === 'decline') {
          await sql`DELETE FROM team_invites WHERE id = ${inviteId}`;
          return res.status(200).json({ ok: true });
        }

        if (currentUser.team_id) {
          return res.status(400).json({ error: 'Du är redan med i ett lag.' });
        }

        const countRows = await sql`SELECT COUNT(*)::int AS cnt FROM team_members WHERE team_id = ${invite.team_id}`;
        if (countRows[0].cnt >= 10) {
          return res.status(400).json({ error: 'Laget har redan 10 spelare.' });
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

      // 13. LÄMNA LAGET SJÄLV
      if (action === 'leave_team') {
        if (!currentUser) return res.status(401).json({ error: 'Logga in först.' });
        const teamId = parseInt(body.teamId, 10);

        await sql`DELETE FROM team_members WHERE team_id = ${teamId} AND steam_id = ${currentUser.steam_id}`;
        await sql`UPDATE players SET team_id = NULL WHERE steam_id = ${currentUser.steam_id}`;
        await sql`
          INSERT INTO transfer_history (steam_id, from_team_id, transfer_type)
          VALUES (${currentUser.steam_id}, ${teamId}, 'leave')
        `;

        const teamRows = await sql`SELECT * FROM teams WHERE id = ${teamId}`;
        if (teamRows[0] && teamRows[0].captain_steam_id === currentUser.steam_id) {
          const remaining = await sql`SELECT * FROM team_members WHERE team_id = ${teamId} ORDER BY steam_id ASC LIMIT 1`;
          const nextCap = remaining[0]?.steam_id || null;
          await sql`UPDATE teams SET captain_steam_id = ${nextCap} WHERE id = ${teamId}`;
          if (nextCap) {
            await sql`UPDATE team_members SET team_role = 'captain' WHERE team_id = ${teamId} AND steam_id = ${nextCap}`;
          }
        }
        return res.status(200).json({ ok: true });
      }

      // 14. SPARKA MEDLEM FRÅN LAGET
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

      // 15. ÄNDRA MEDLEMSROLL ELLER POSITION
      if (action === 'update_team_member') {
        const teamId = parseInt(body.teamId, 10);
        const targetSteamId = String(body.targetSteamId || '');
        const newTeamRole = body.newTeamRole;
        const newPosition = body.newPosition;

        if (!(await canManageTeam(teamId, false))) {
          return res.status(403).json({ error: 'Endast lagkapten, assisterande eller Admin kan ändra roller.' });
        }

        if (newPosition) {
          await sql`UPDATE players SET preferred_position = ${newPosition} WHERE steam_id = ${targetSteamId}`;
        }

        if (newTeamRole) {
          if (newTeamRole === 'captain') {
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

      // 16. ADMIN: TILLDELA ELLER TA BORT ADMIN-BEHÖRIGHET
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

      // 17. ADMIN: LÄGG TILL ENSTAKA KOMMANDE MATCH MANUELLT
      if (action === 'admin_schedule_match') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });
        const homeId = parseInt(body.homeTeamId, 10);
        const awayId = parseInt(body.awayTeamId, 10);
        const roundNumber = Math.max(1, parseInt(body.roundNumber, 10) || 1);
        const playedAt = body.playedAt ? new Date(body.playedAt).toISOString() : null;
        const serverIp = String(body.serverIp || 'ELITSERIEN Server').slice(0, 64);
        const matchCode = generateMatchCode();

        await sql`
          INSERT INTO matches (home_team_id, away_team_id, round_number, match_code, status, played_at, server_ip)
          VALUES (${homeId}, ${awayId}, ${roundNumber}, ${matchCode}, 'scheduled', ${playedAt}, ${serverIp})
        `;
        return res.status(200).json({ ok: true, matchCode });
      }

      // 18. ADMIN: RADERA ENSKILD MATCH
      if (action === 'admin_delete_match') {
        if (!isAdmin) return res.status(403).json({ error: 'Endast Admin.' });
        const matchId = parseInt(body.matchId, 10);
        await sql`DELETE FROM player_match_stats WHERE match_id = ${matchId}`;
        await sql`DELETE FROM match_events WHERE match_id = ${matchId}`;
        await sql`DELETE FROM matches WHERE id = ${matchId}`;
        return res.status(200).json({ ok: true });
      }

      // 19A. C# SERVER-MOD: MARKERA MATCH SOM LIVE ELLER AVBRUTEN
      if (action === 'server_match_live' || action === 'server_match_cancel') {
        if (!isServerAuthorized(req) && !isAdmin) {
          return res.status(403).json({ error: 'Obehörigt anrop. Kräver giltig SERVER_API_KEY.' });
        }
        const code = String(body.matchCode || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ error: 'Matchkod saknas.' });

        const mRows = await sql`SELECT * FROM matches WHERE UPPER(match_code) = ${code} LIMIT 1`;
        if (!mRows[0]) return res.status(404).json({ error: 'Matchen hittades inte.' });

        const matchId = mRows[0].id;
        await sql`DELETE FROM player_match_stats WHERE match_id = ${matchId}`;

        if (action === 'server_match_live') {
          await sql`
            UPDATE matches SET
              status = 'live',
              home_score = 0,
              away_score = 0,
              home_shots = 0,
              away_shots = 0,
              played_at = COALESCE(played_at, CURRENT_TIMESTAMP)
            WHERE id = ${matchId}
          `;
        } else {
          await sql`
            UPDATE matches SET
              status = 'scheduled',
              home_score = 0,
              away_score = 0,
              home_shots = 0,
              away_shots = 0
            WHERE id = ${matchId}
          `;
        }
        return res.status(200).json({ ok: true, matchId });
      }

      // 19B. C# SERVER-MOD ELLER ADMIN: LIVE-UPPDATERING ELLER SLUTRESULTAT (KRASCHSÄKRAD)
      if (action === 'server_match_report' || action === 'server_match_live_update') {
        const isAuthSrv = isServerAuthorized(req);
        if (!isAuthSrv && !isAdmin) {
          return res.status(403).json({ error: 'Obehörigt anrop. Kontrollera SERVER_API_KEY i Vercel.' });
        }

        const isFinalReport = (action === 'server_match_report');
        let matchId = body.matchId ? parseInt(body.matchId, 10) : null;
        let homeTeamId = body.homeTeamId ? parseInt(body.homeTeamId, 10) : null;
        let awayTeamId = body.awayTeamId ? parseInt(body.awayTeamId, 10) : null;

        if (body.matchCode) {
          const code = String(body.matchCode).trim().toUpperCase();
          const mRows = await sql`SELECT * FROM matches WHERE UPPER(match_code) = ${code} LIMIT 1`;
          if (!mRows[0]) {
            return res.status(404).json({ error: `Ingen match hittades med matchkod ${code}.` });
          }
          matchId = mRows[0].id;
          homeTeamId = mRows[0].home_team_id;
          awayTeamId = mRows[0].away_team_id;
        } else if (matchId) {
          const mRows = await sql`SELECT * FROM matches WHERE id = ${matchId} LIMIT 1`;
          if (mRows[0]) {
            homeTeamId = mRows[0].home_team_id;
            awayTeamId = mRows[0].away_team_id;
          }
        }

        const homeScore = Math.max(0, parseInt(body.homeScore, 10) || 0);
        const awayScore = Math.max(0, parseInt(body.awayScore, 10) || 0);
        const isOvertime = Boolean(body.isOvertime);
        const isShootout = Boolean(body.isShootout);
        const homeShots = Math.max(0, parseInt(body.homeShots, 10) || 0);
        const awayShots = Math.max(0, parseInt(body.awayShots, 10) || 0);
        const serverIp = String(body.serverIp || 'ELITSERIEN Server').slice(0, 64);
        const newStatus = isFinalReport ? 'completed' : 'live';

        if (matchId) {
          await sql`
            UPDATE matches SET
              home_score = ${homeScore},
              away_score = ${awayScore},
              is_overtime = ${isOvertime},
              is_shootout = ${isShootout},
              home_shots = ${homeShots},
              away_shots = ${awayShots},
              status = ${newStatus},
              played_at = COALESCE(played_at, CURRENT_TIMESTAMP),
              rematch_requested_by_team_id = NULL,
              rematch_reason = NULL
            WHERE id = ${matchId}
          `;
        } else {
          const inserted = await sql`
            INSERT INTO matches (
              home_team_id, away_team_id, home_score, away_score,
              is_overtime, is_shootout, home_shots, away_shots,
              match_code, server_ip, status, played_at
            ) VALUES (
              ${homeTeamId}, ${awayTeamId}, ${homeScore}, ${awayScore},
              ${isOvertime}, ${isShootout}, ${homeShots}, ${awayShots},
              ${generateMatchCode()}, ${serverIp}, ${newStatus}, CURRENT_TIMESTAMP
            ) RETURNING id
          `;
          matchId = inserted[0].id;
        }

        // Spara spelarstatistik och rapportera tillbaka exakt antal sparade spelare till C#-modden
        let savedPlayersCount = 0;
        const sqlErrors = [];

        try {
          const knownPlayers = await sql`SELECT steam_id, username, team_id FROM players`;
          const playerBySteamId = new Map();
          const playerByUsername = new Map();

          for (const p of knownPlayers) {
            const sid = String(p.steam_id).trim();
            playerBySteamId.set(sid, p);
            if (p.username) {
              playerByUsername.set(String(p.username).trim().toLowerCase(), p);
            }
          }

          if (Array.isArray(body.playerStats) && body.playerStats.length > 0) {
            await sql`DELETE FROM player_match_stats WHERE match_id = ${matchId}`;

            const mergedStats = new Map();

            for (const ps of body.playerStats) {
              const rawSid = String(ps.steamId || '').trim();
              const rawName = String(ps.username || rawSid || '').trim();
              const cleanName = rawName.replace(/^#\d+\s*/, '').trim();

              // 1. Matcha mot exakt SteamID
              let matchedPlayer = playerBySteamId.get(rawSid);

              // 2. Matcha mot exakt användarnamn (case-insensitive)
              if (!matchedPlayer && cleanName) {
                matchedPlayer = playerByUsername.get(cleanName.toLowerCase());
              }
              if (!matchedPlayer && rawSid) {
                matchedPlayer = playerByUsername.get(rawSid.toLowerCase());
              }

              // 3. Om namnet i spelet innehåller eller innehålls av namnet på hemsidan (t.ex. taggar)
              if (!matchedPlayer && cleanName.length >= 2) {
                const lowerClean = cleanName.toLowerCase();
                for (const [uKey, pObj] of playerByUsername.entries()) {
                  if (uKey === lowerClean || uKey.includes(lowerClean) || lowerClean.includes(uKey)) {
                    matchedPlayer = pObj;
                    break;
                  }
                }
              }

              const finalSteamId = matchedPlayer ? String(matchedPlayer.steam_id).trim() : rawSid;
              if (!finalSteamId) continue;

              const prev = mergedStats.get(finalSteamId) || {
                steamId: finalSteamId,
                username: matchedPlayer?.username || cleanName || finalSteamId,
                teamId: matchedPlayer?.team_id || ps.teamId || homeTeamId,
                goals: 0,
                assists: 0,
                shotsOnGoal: 0,
                topShotSpeedKmh: 0,
                passesCompleted: 0,
                passesAttempted: 0,
                possessionSeconds: 0
              };

              prev.goals = Math.max(prev.goals, parseInt(ps.goals, 10) || 0);
              prev.assists = Math.max(prev.assists, parseInt(ps.assists, 10) || 0);
              prev.shotsOnGoal = Math.max(prev.shotsOnGoal, parseInt(ps.shotsOnGoal, 10) || 0);
              prev.topShotSpeedKmh = Math.max(prev.topShotSpeedKmh, parseFloat(ps.topShotSpeedKmh) || 0);
              prev.passesCompleted = Math.max(prev.passesCompleted, parseInt(ps.passesCompleted, 10) || 0);
              prev.passesAttempted = Math.max(prev.passesAttempted, parseInt(ps.passesAttempted, 10) || 0);
              prev.possessionSeconds = Math.max(prev.possessionSeconds, parseFloat(ps.possessionSeconds) || 0);

              mergedStats.set(finalSteamId, prev);
            }

            for (const ps of mergedStats.values()) {
              try {
                const sId = String(ps.steamId).trim();
                const uName = String(ps.username || sId).slice(0, 64);
                const rawTeamId = parseInt(ps.teamId, 10) || Number(homeTeamId);
                const pTeamId = (rawTeamId === Number(homeTeamId) || rawTeamId === Number(awayTeamId))
                  ? rawTeamId
                  : Number(homeTeamId);

                if (!playerBySteamId.has(sId)) {
                  await sql`
                    INSERT INTO players (steam_id, username, team_id, role)
                    VALUES (${sId}, ${uName}, ${pTeamId}, 'player')
                    ON CONFLICT (steam_id) DO NOTHING
                  `;
                  playerBySteamId.set(sId, { steam_id: sId, username: uName, team_id: pTeamId });
                }

                const g = Math.max(0, ps.goals);
                const a = Math.max(0, ps.assists);
                const tp = g + a;
                const sog = Math.max(0, ps.shotsOnGoal);
                const topSpeed = Math.min(250, Math.max(0, Number((ps.topShotSpeedKmh || 0).toFixed(1))));
                const poss = Math.min(9999, Math.max(0, Number((ps.possessionSeconds || 0).toFixed(1))));
                const passComp = Math.max(0, ps.passesCompleted);
                const passAtt = Math.max(passComp, ps.passesAttempted);

                // Minimal och helt felsäker INSERT med endast de kolumner som hemsidan läser
                await sql`
                  INSERT INTO player_match_stats (
                    match_id, steam_id, team_id, goals, assists, points,
                    shots_on_goal, top_shot_speed_kmh, possession_seconds,
                    passes_completed, passes_attempted
                  ) VALUES (
                    ${matchId}, ${sId}, ${pTeamId}, ${g}, ${a}, ${tp},
                    ${sog}, ${topSpeed}, ${poss},
                    ${passComp}, ${passAtt}
                  )
                `;
                savedPlayersCount++;
              } catch (singleRowErr) {
                console.error('Row insert error:', singleRowErr.message);
                sqlErrors.push(`${ps.username}: ${singleRowErr.message}`);
              }
            }
          } else {
            sqlErrors.push('playerStats-listan från servern var tom');
          }
        } catch (statsBlockErr) {
          console.error('Stats block error:', statsBlockErr.message);
          sqlErrors.push(statsBlockErr.message);
        }

        return res.status(200).json({
          ok: true,
          matchId,
          savedPlayersCount,
          receivedPlayersCount: Array.isArray(body.playerStats) ? body.playerStats.length : 0,
          sqlErrors
        });
      }

      return res.status(400).json({ error: 'Okänd action.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message || 'Serverfel' });
  }
};
