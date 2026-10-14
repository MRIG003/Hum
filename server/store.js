// Storage behind a small synchronous interface. MemoryStore keeps nothing across restarts
// (tests, quick local runs). SqliteStore uses node:sqlite so a restart or deploy does not
// lose meetings. Meetings are stored as JSON snapshots; tokens inside are already hashed.

export class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.meetings = new Map();
    this.users = new Map();
    this.sessions = new Map();
  }

  saveMeeting(code, ownerId, data) {
    this.meetings.set(code, { ownerId, data: JSON.stringify(data) });
  }

  loadMeetings() {
    return [...this.meetings.values()].map((row) => JSON.parse(row.data));
  }

  deleteMeeting(code) {
    this.meetings.delete(code);
  }

  createUser(user) {
    if ([...this.users.values()].some((u) => u.email === user.email)) return false;
    this.users.set(user.id, user);
    return true;
  }

  getUserByEmail(email) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  getUser(id) {
    return this.users.get(id) ?? null;
  }

  createSession(hash, userId, expiresAt) {
    this.sessions.set(hash, { userId, expiresAt });
  }

  getSession(hash) {
    return this.sessions.get(hash) ?? null;
  }

  deleteSession(hash) {
    this.sessions.delete(hash);
  }

  purgeSessions(now) {
    for (const [hash, s] of this.sessions) if (s.expiresAt <= now) this.sessions.delete(hash);
  }

  close() {}
}

export const openSqliteStore = async (file) => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meetings (
      code TEXT PRIMARY KEY, owner_id TEXT, data TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS meetings_owner ON meetings(owner_id);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
  const q = {
    save: db.prepare('INSERT INTO meetings (code, owner_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET owner_id = excluded.owner_id, data = excluded.data, updated_at = excluded.updated_at'),
    all: db.prepare('SELECT data FROM meetings'),
    del: db.prepare('DELETE FROM meetings WHERE code = ?'),
    addUser: db.prepare('INSERT INTO users (id, email, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    addSession: db.prepare('INSERT OR REPLACE INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE hash = ?'),
    delSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };
  const toUser = (row) => row && { id: row.id, email: row.email, salt: row.salt, hash: row.hash, createdAt: row.created_at };

  return {
    kind: 'sqlite',
    saveMeeting: (code, ownerId, data) => q.save.run(code, ownerId ?? null, JSON.stringify(data), Date.now()),
    loadMeetings: () => q.all.all().map((row) => JSON.parse(row.data)),
    deleteMeeting: (code) => q.del.run(code),
    createUser: (user) => {
      try {
        q.addUser.run(user.id, user.email, user.salt, user.hash, user.createdAt);
        return true;
      } catch {
        return false;
      }
    },
    getUserByEmail: (email) => toUser(q.userByEmail.get(email)),
    getUser: (id) => toUser(q.userById.get(id)),
    createSession: (hash, userId, expiresAt) => q.addSession.run(hash, userId, expiresAt),
    getSession: (hash) => {
      const row = q.session.get(hash);
      return row && { userId: row.user_id, expiresAt: row.expires_at };
    },
    deleteSession: (hash) => q.delSession.run(hash),
    purgeSessions: (now) => q.purge.run(now),
    close: () => db.close(),
  };
};

// Postgres (Render, Supabase, any hosted Postgres). Reads are served from an in-memory copy
// loaded at start, because this app runs as a single process; every change is written through
// to Postgres in order. That keeps the store interface synchronous like the other two.
export const openPostgresStore = async (connectionString) => {
  const { default: pg } = await import('pg');
  const ssl = /localhost|127\.0\.0\.1|sslmode=disable/.test(connectionString) ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString, ssl, max: 4 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engage_meetings (
      code TEXT PRIMARY KEY, owner_id TEXT, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS engage_users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS engage_sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL
    );
  `);

  const cache = new MemoryStore();
  for (const row of (await pool.query('SELECT data FROM engage_meetings')).rows) {
    cache.meetings.set(row.data.code, { ownerId: row.data.ownerId ?? null, data: JSON.stringify(row.data) });
  }
  for (const u of (await pool.query('SELECT * FROM engage_users')).rows) {
    cache.users.set(u.id, { id: u.id, email: u.email, salt: u.salt, hash: u.hash, createdAt: Number(u.created_at) });
  }
  for (const s of (await pool.query('SELECT * FROM engage_sessions')).rows) {
    cache.sessions.set(s.hash, { userId: s.user_id, expiresAt: Number(s.expires_at) });
  }

  let queue = Promise.resolve();
  const write = (sql, params) => {
    queue = queue.then(() => pool.query(sql, params)).catch((error) => console.error('Postgres write failed:', error.message));
  };

  return {
    kind: 'postgres',
    saveMeeting: (code, ownerId, data) => {
      cache.saveMeeting(code, ownerId, data);
      write(
        'INSERT INTO engage_meetings (code, owner_id, data, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (code) DO UPDATE SET owner_id = $2, data = $3, updated_at = now()',
        [code, ownerId ?? null, JSON.stringify(data)],
      );
    },
    loadMeetings: () => cache.loadMeetings(),
    deleteMeeting: (code) => {
      cache.deleteMeeting(code);
      write('DELETE FROM engage_meetings WHERE code = $1', [code]);
    },
    createUser: (user) => {
      if (!cache.createUser(user)) return false;
      write('INSERT INTO engage_users (id, email, salt, hash, created_at) VALUES ($1, $2, $3, $4, $5)', [user.id, user.email, user.salt, user.hash, user.createdAt]);
      return true;
    },
    getUserByEmail: (email) => cache.getUserByEmail(email),
    getUser: (id) => cache.getUser(id),
    createSession: (hash, userId, expiresAt) => {
      cache.createSession(hash, userId, expiresAt);
      write('INSERT INTO engage_sessions (hash, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (hash) DO UPDATE SET expires_at = $3', [hash, userId, expiresAt]);
    },
    getSession: (hash) => cache.getSession(hash),
    deleteSession: (hash) => {
      cache.deleteSession(hash);
      write('DELETE FROM engage_sessions WHERE hash = $1', [hash]);
    },
    purgeSessions: (now) => {
      cache.purgeSessions(now);
      write('DELETE FROM engage_sessions WHERE expires_at <= $1', [now]);
    },
    close: async () => {
      await queue;
      await pool.end();
    },
  };
};
