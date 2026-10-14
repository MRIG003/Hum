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
