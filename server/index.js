import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import qrcode from 'qrcode-generator';
import { ActionError, Meeting, newCode, PLATFORMS } from './meeting.js';
import { AuthError, createAuth } from './auth.js';
import { meetingCsv } from './export.js';
import { createMailer, resetEmail, summaryEmail, verifyEmail } from './mail.js';
import { MemoryStore, openPostgresStore, openSqliteStore } from './store.js';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEET_SDK = join(ROOT_DIR, 'node_modules', '@googleworkspace', 'meet-addons', 'meet.addons.mjs');
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const MEETING_TTL_MS = 12 * 60 * 60_000;
const DEMO_MS = 30 * 60_000; // public /try demo meetings are throwaway
const MAX_LIVE_DEMOS = 60;
const HOUR_MS = 60 * 60_000;
const FLUSH_MS = 3000;
// Ended meetings are deleted after this many hours (accounts keep theirs longer).
const idleEndMs = () => (Number(process.env.ENGAGE_IDLE_END_MIN) || 60) * 60_000;
const retentionMs = () => (Number(process.env.ENGAGE_RETENTION_HOURS) || 24) * HOUR_MS;
const accountRetentionMs = () => (Number(process.env.ENGAGE_ACCOUNT_RETENTION_DAYS) || 30) * 24 * HOUR_MS;
const BROADCAST_DELAY_MS = 150;
const MAX_MESSAGES_PER_SECOND = 25;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const CSP = (frameAncestors) =>
  `default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors ${frameAncestors}`;

// Only the add-on panel and the attendee page may be framed, and only by Google Meet.
const EMBEDDABLE_CSP = CSP("'self' https://meet.google.com");

// Microsoft Clarity runs on the landing page only (never in the Meet panel or a meeting). It is
// switched on by setting ENGAGE_CLARITY_ID, and only then does the page's policy allow its hosts.
const CLARITY_ID = () => {
  const id = String(process.env.ENGAGE_CLARITY_ID || '').trim();
  return /^[a-z0-9]{6,20}$/i.test(id) ? id : null;
};
const LANDING_CSP = (clarityId) => clarityId
  ? `default-src 'self'; script-src 'self' https://www.clarity.ms https://scripts.clarity.ms; connect-src 'self' ws: wss: https://*.clarity.ms https://c.bing.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.clarity.ms https://c.bing.com; base-uri 'none'; frame-ancestors 'none'`
  : null;

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP("'none'"),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const clientIp = (req) => {
  if (process.env.TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
};

export const createApp = ({ clock = Date.now, store = new MemoryStore(), mailer = createMailer() } = {}) => {
  const meetings = new Map();
  const auth = createAuth({ store, clock });
  const dirty = new Set();
  for (const data of store.loadMeetings()) {
    const restored = Meeting.restore(data, { clock });
    // Meetings that ended before summaries were emailed are not emailed after a restart.
    if (restored.status === 'ended' && !restored.summaryEmailedAt) restored.summaryEmailedAt = restored.endedAt ?? clock();
    meetings.set(restored.code, restored);
  }

  const demos = new Map(); // code -> expiry time for throwaway demo meetings (never stored)
  const flush = () => {
    for (const code of dirty) {
      const meeting = meetings.get(code);
      if (meeting && !demos.has(code)) store.saveMeeting(code, meeting.ownerId, meeting.serialize());
    }
    dirty.clear();
  };
  const sockets = new Map(); // ws -> { code, role, pid, windowStart, count }
  const createLog = new Map(); // ip -> timestamps

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  const pending = new Set();

  const send = (ws, message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };

  const pushState = (ws) => {
    const info = sockets.get(ws);
    const meeting = info && meetings.get(info.code);
    if (!meeting) return;
    const snapshot = info.role === 'host' ? meeting.hostSnapshot() : meeting.attendeeSnapshot(info.pid);
    if (snapshot) send(ws, { t: 'state', state: snapshot });
  };

  const broadcastNow = (code) => {
    for (const [ws, info] of sockets) {
      if (info.code === code) pushState(ws);
    }
  };

  const scheduleBroadcast = (code) => {
    dirty.add(code);
    if (pending.has(code)) return;
    pending.add(code);
    setTimeout(() => {
      pending.delete(code);
      broadcastNow(code);
    }, BROADCAST_DELAY_MS);
  };

  const hostActions = {
    launchMoment: (m, msg) => m.launchMoment(msg),
    closeMoment: (m) => m.closeMoment(),
    dismissMoment: (m) => m.dismissMoment(),
    focus: (m, msg) => m.setFocus(msg.on),
    games: (m, msg) => m.setGames(msg.on),
    addWindow: (m, msg) => m.addGameWindow(msg),
    removeWindow: (m, msg) => m.removeGameWindow(msg.id),
    bingoWords: (m, msg) => m.setBingoWords(Array.isArray(msg.words) ? msg.words : []),
    setPrediction: (m, msg) => m.setPrediction(msg.question),
    resolvePrediction: (m, msg) => m.resolvePrediction(msg.result),
    answered: (m, msg) => m.setQuestionAnswered(msg.id, msg.answered),
    removeQuestion: (m, msg) => m.removeQuestion(msg.id),
    pin: (m, msg) => m.pinQuestion(msg.id, msg.on !== false),
    merge: (m, msg) => m.mergeQuestions(msg.from, msg.into),
    addPrompt: (m, msg) => m.addPrompt(msg),
    removePrompt: (m, msg) => m.removePrompt(msg.id),
    launchPrepared: (m, msg) => m.launchPrepared(msg.id, { override: Boolean(msg.override) }),
    quiet: (m, msg) => m.setQuiet(msg.on, msg.everyMin),
    floor: (m) => m.openTheFloor(),
    setAgenda: (m, msg) => m.setAgenda(msg.text),
    resetClock: (m) => m.resetClock(),
    removeParticipant: (m, msg) => m.removeParticipant(msg.pid),
    person: (m, msg) => ({ t: 'person', detail: m.personDetail(msg.pid) }),
    end: (m) => m.end(),
  };

  const attendeeActions = {
    react: (m, pid, msg) => m.react(pid, msg.kind),
    ask: (m, pid, msg) => m.ask(pid, msg.text),
    presenting: (m, pid, msg) => m.setPresenting(pid, msg.on),
    upvote: (m, pid, msg) => m.upvote(pid, msg.id),
    respond: (m, pid, msg) => m.respond(pid, msg.momentId, msg.value),
    bingo: (m, pid, msg) => m.markBingo(pid, msg.word),
    predict: (m, pid, msg) => m.predict(pid, msg.choice),
  };

  const handleHello = (ws, msg) => {
    const meeting = meetings.get(String(msg.code ?? '').toUpperCase());
    if (!meeting) return send(ws, { t: 'fatal', error: 'Meeting not found.' });

    if (msg.role === 'host') {
      // A host proves themselves with the private host link (token) or by being signed in as
      // the meeting's owner. Cookie auth also requires a same-origin upgrade (no cross-site hijack).
      const user = sameOrigin(ws.req) ? auth.userFromRequest(ws.req) : null;
      const byToken = meeting.checkHostToken(msg.hostToken);
      const byOwner = Boolean(user && meeting.ownerId === user.id);
      if (!byToken && !byOwner) {
        return send(ws, { t: 'fatal', error: 'This browser is not the host of this meeting.' });
      }
      if (byToken && user) meeting.claim(user.id);
      sockets.set(ws, { code: meeting.code, role: 'host', pid: null, windowStart: 0, count: 0 });
      send(ws, { t: 'welcome', role: 'host' });
      return pushState(ws);
    }

    const participant = meeting.join({
      name: msg.name,
      pid: msg.pid,
      token: msg.token,
    });
    sockets.set(ws, { code: meeting.code, role: 'attendee', pid: participant.id, windowStart: 0, count: 0 });
    send(ws, {
      t: 'welcome',
      role: 'attendee',
      pid: participant.id,
      token: participant.token ?? msg.token,
      name: participant.name,
    });
    pushState(ws);
    scheduleBroadcast(meeting.code);
  };

  const handleMessage = (ws, raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const info = sockets.get(ws);
    try {
      if (msg.t === 'hello') {
        if (info) return;
        return handleHello(ws, msg);
      }
      if (!info) return;

      const now = clock();
      if (now - info.windowStart > 1000) {
        info.windowStart = now;
        info.count = 0;
      }
      if (++info.count > MAX_MESSAGES_PER_SECOND) return;

      const meeting = meetings.get(info.code);
      if (!meeting) return;

      if (msg.t === 'ping') return send(ws, { t: 'pong' });

      if (info.role === 'host') {
        const handler = hostActions[msg.t];
        if (!handler) return;
        const reply = handler(meeting, msg);
        if (reply?.t) return send(ws, reply);
      } else {
        const handler = attendeeActions[msg.t];
        if (!handler) return;
        handler(meeting, info.pid, msg);
      }
      scheduleBroadcast(meeting.code);
    } catch (error) {
      if (error instanceof ActionError) {
        send(ws, { t: msg.t === 'hello' ? 'fatal' : 'error', error: error.message });
      } else {
        console.error('Unhandled message error', error);
        send(ws, { t: 'error', error: 'Something went wrong.' });
      }
    }
  };

  wss.on('connection', (ws, req) => {
    ws.req = req;
    ws.on('message', (raw) => handleMessage(ws, raw));
    ws.on('close', () => {
      const info = sockets.get(ws);
      sockets.delete(ws);
      if (!info || info.role !== 'attendee') return;
      const stillConnected = [...sockets.values()].some(
        (other) => other.code === info.code && other.pid === info.pid,
      );
      if (!stillConnected) {
        meetings.get(info.code)?.setConnected(info.pid, false);
        scheduleBroadcast(info.code);
      }
    });
  });

  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  const isHttps = (req) =>
    process.env.ENGAGE_PUBLIC_URL?.startsWith('https:') ||
    (Boolean(process.env.TRUST_PROXY) && req.headers['x-forwarded-proto'] === 'https');

  // The host name ends up in share-card tags and the sitemap, so only a plain host name is accepted.
  const publicBase = (req) => {
    const fixed = process.env.ENGAGE_PUBLIC_URL?.replace(/\/$/, '');
    if (fixed) return fixed;
    const host = String(req.headers.host ?? '');
    return `${isHttps(req) ? 'https' : 'http'}://${/^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host : 'localhost'}`;
  };

  const maskEmail = (address) => address.replace(/^(.).*(@.*)$/, '$1***$2');

  const sendVerification = (user, req) => {
    const token = auth.requestVerification(user);
    mailer.send({ to: user.email, ...verifyEmail(`${publicBase(req)}/verify?token=${token}`) });
  };

  // The host's account email gets the coach summary. Only a confirmed address receives it.
  let lastBase = process.env.ENGAGE_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost';
  const emailSummary = async (meeting, owner, base) => {
    meeting.summaryEmailedAt = clock();
    dirty.add(meeting.code);
    const mail = summaryEmail({ title: meeting.title, summary: meeting.summary(), link: `${base}/h/${meeting.code}` });
    return mailer.send({ to: owner.email, ...mail });
  };

  // The caller may manage a meeting if they hold the private host token or own it.
  const canManage = (req, meeting) => {
    if (meeting.checkHostToken(req.headers['x-host-token'])) return true;
    const user = auth.userFromRequest(req);
    return Boolean(user && meeting.ownerId === user.id);
  };

  const findLinked = (platform, id) =>
    [...meetings.values()].find((m) => m.status === 'live' && m.link?.platform === platform && m.link.id === id) ?? null;

  const destroyMeeting = (code) => {
    for (const [ws, info] of sockets) {
      if (info.code !== code) continue;
      send(ws, { t: 'fatal', error: 'This meeting was deleted by the host.' });
      ws.close();
    }
    meetings.delete(code);
    dirty.delete(code);
    store.deleteMeeting(code);
  };

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 4096) {
          reject(new Error('Body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });

  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
    res.end(JSON.stringify(body));
  };

  const allowCreate = (ip) => {
    const now = clock();
    const recent = (createLog.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
    if (recent.length >= 30) return false;
    createLog.set(ip, [...recent, now]);
    return true;
  };

  // Text assets are sent gzipped (cached in memory) with an ETag, so a repeat load costs a 304.
  const COMPRESSIBLE = /^(text\/|application\/javascript|application\/json|image\/svg)/;
  const packed = new Map();
  const sendAsset = (req, res, headers, body, { cache = true } = {}) => {
    const type = headers['Content-Type'] ?? '';
    const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && COMPRESSIBLE.test(type) && body.length > 800;
    let payload = body;
    let etag = null;
    if (cache) {
      const key = `${type}:${body.length}:${createHash('sha1').update(body).digest('base64url').slice(0, 20)}`;
      etag = `"${key.split(':')[2]}${wantsGzip ? '-gz' : ''}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'], ...SECURITY_HEADERS });
        return res.end();
      }
      if (wantsGzip) {
        if (!packed.has(key)) packed.set(key, gzipSync(body, { level: 6 }));
        payload = packed.get(key);
      }
    } else if (wantsGzip) payload = gzipSync(body, { level: 1 });
    res.writeHead(200, { ...headers, Vary: 'Accept-Encoding', ...(wantsGzip ? { 'Content-Encoding': 'gzip' } : {}), ...(etag ? { ETag: etag } : {}) });
    res.end(payload);
  };

  const servePage = async (req, res, file, { embeddable = false } = {}) => {
    let body = await readFile(join(PUBLIC_DIR, file));
    let csp = null;
    if (file === 'index.html' || file === 'try.html') {
      const base = publicBase(req);
      let html = body.toString('utf8').replaceAll('__BASE__', base);
      const clarity = file === 'index.html' ? CLARITY_ID() : null;
      if (clarity) {
        html = html.replace('</head>', `  <script async src="https://www.clarity.ms/tag/${clarity}"></script>\n</head>`);
        csp = LANDING_CSP(clarity);
      }
      body = Buffer.from(html);
    }
    // The Meet panel must open its SDK session straight away, so it gets the project number inline
    // instead of waiting for a config request (slow when the server has been asleep).
    if (file === 'meet/panel.html') {
      const number = String(process.env.ENGAGE_GOOGLE_CLOUD_PROJECT_NUMBER || '').replace(/\D/g, '');
      body = Buffer.from(body.toString('utf8').replace('content=""', `content="${number}"`));
    }
    const headers = embeddable
      ? { ...SECURITY_HEADERS, 'Content-Security-Policy': EMBEDDABLE_CSP }
      : csp ? { ...SECURITY_HEADERS, 'Content-Security-Policy': csp } : SECURITY_HEADERS;
    sendAsset(req, res, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', ...headers }, body, { cache: false });
  };

  const serveStatic = async (req, res, pathname) => {
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC_DIR, safe);
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const body = await readFile(file);
      sendAsset(req, res, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ...SECURITY_HEADERS,
      }, body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      if (req.method === 'GET' && !pathname.startsWith('/api/') && req.headers.host) lastBase = publicBase(req);
      if (req.method === 'GET' && pathname === '/healthz') return json(res, 200, { ok: true });
      if (req.method === 'GET' && pathname === '/api/config') {
        return json(res, 200, {
          surveyUrl: process.env.ENGAGE_SURVEY_URL || null,
          googleCloudProjectNumber: process.env.ENGAGE_GOOGLE_CLOUD_PROJECT_NUMBER || null,
          build: (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7),
        });
      }

      if (req.method === 'POST' && pathname === '/api/meetings') {
        if (!allowCreate(clientIp(req))) {
          return json(res, 429, { error: 'Too many meetings created. Try again later.' });
        }
        const body = await readJson(req);
        const demo = body.demo === true;
        if (demo && demos.size >= MAX_LIVE_DEMOS) return json(res, 429, { error: 'The demo is busy right now. Try again in a minute.' });
        let code = newCode();
        while (meetings.has(code)) code = newCode();
        const link = body.link && typeof body.link === 'object' ? body.link : null;
        if (link) {
          const existing = findLinked(link.platform, link.id);
          if (existing) return json(res, 409, { error: 'Engage is already running in this meeting.', code: existing.code });
        }
        const meeting = new Meeting({
          code,
          title: demo ? 'Demo meeting' : body.title,
          expected: demo ? undefined : body.expected,
          agenda: demo ? 'Welcome, 5\nDiscussion, 10\nWrap up, 5' : body.agenda,
          platform: PLATFORMS.includes(body.platform) ? body.platform : link?.platform,
          link,
          clock,
        });
        const user = sameOrigin(req) ? auth.userFromRequest(req) : null;
        if (user && !demo) meeting.claim(user.id);
        meetings.set(code, meeting);
        if (demo) {
          demos.set(code, clock() + DEMO_MS);
          return json(res, 201, { code, hostToken: meeting.hostToken, expiresAt: demos.get(code) });
        }
        dirty.add(code);
        return json(res, 201, { code, hostToken: meeting.hostToken });
      }

      if (pathname === '/api/auth/me' && req.method === 'GET') {
        const user = auth.userFromRequest(req);
        return json(res, 200, { email: user?.email ?? null, verified: Boolean(user?.verifiedAt), mail: mailer.enabled });
      }
      if (req.method === 'POST' && /^\/api\/auth\/(register|login|logout)$/.test(pathname)) {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked.' });
        const action = pathname.split('/').pop();
        if (action === 'logout') {
          auth.logout(req);
          return json(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie(isHttps(req)) });
        }
        const body = await readJson(req);
        const result = action === 'register'
          ? auth.register(body.email, body.password, clientIp(req))
          : auth.login(body.email, body.password, clientIp(req));
        if (action === 'register') sendVerification(result.user, req);
        return json(res, action === 'register' ? 201 : 200, { email: result.user.email }, {
          'Set-Cookie': auth.cookie(result.token, isHttps(req)),
        });
      }
      if (req.method === 'POST' && pathname === '/api/auth/forgot') {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked.' });
        const body = await readJson(req);
        const found = auth.requestReset(body.email, clientIp(req));
        if (found) {
          const mail = resetEmail(`${publicBase(req)}/reset?token=${found.token}`);
          mailer.send({ to: found.user.email, ...mail });
        }
        // The same answer whether or not the address has an account.
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/api/auth/reset') {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked.' });
        const body = await readJson(req);
        const result = auth.resetPassword(body.token, body.password, clientIp(req));
        return json(res, 200, { email: result.user.email }, { 'Set-Cookie': auth.cookie(result.token, isHttps(req)) });
      }
      if (req.method === 'POST' && pathname === '/api/auth/verify') {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked.' });
        const body = await readJson(req);
        const user = auth.verifyEmail(body.token, clientIp(req));
        return json(res, 200, { email: user.email });
      }
      if (req.method === 'POST' && pathname === '/api/auth/verify/resend') {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked.' });
        const user = auth.userFromRequest(req);
        if (!user) return json(res, 401, { error: 'Not signed in.' });
        if (user.verifiedAt) return json(res, 200, { ok: true, already: true });
        sendVerification(user, req);
        return json(res, 200, { ok: true });
      }

      const summaryMatch = pathname.match(/^\/api\/meetings\/([A-Za-z0-9]{6})\/email-summary$/);
      if (req.method === 'POST' && summaryMatch) {
        const meeting = meetings.get(summaryMatch[1].toUpperCase());
        if (!meeting || !canManage(req, meeting)) return json(res, 404, { error: 'Meeting not found.' });
        if (meeting.status !== 'ended') return json(res, 409, { error: 'End the meeting first.' });
        const owner = meeting.ownerId ? store.getUser(meeting.ownerId) : null;
        if (!owner) return json(res, 200, { status: 'signin' });
        if (!owner.verifiedAt) return json(res, 200, { status: 'verify' });
        if (meeting.summaryEmailedAt && clock() - meeting.summaryEmailedAt < 10 * 60_000) {
          return json(res, 429, { error: 'The summary was just sent. Check your inbox.' });
        }
        const result = await emailSummary(meeting, owner, publicBase(req));
        return json(res, 200, { status: result.sent ? 'sent' : 'unavailable', to: maskEmail(owner.email) });
      }

      if (req.method === 'GET' && pathname === '/api/my/meetings') {
        const user = auth.userFromRequest(req);
        if (!user) return json(res, 401, { error: 'Not signed in.' });
        const mine = [...meetings.values()]
          .filter((m) => m.ownerId === user.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((m) => ({ code: m.code, title: m.title, status: m.status, createdAt: m.createdAt, joined: m.participants.size }));
        return json(res, 200, { email: user.email, meetings: mine });
      }

      const qrMatch = pathname.match(/^\/api\/qr\/([A-Za-z0-9]{6})\.svg$/);
      if (req.method === 'GET' && qrMatch) {
        const code = qrMatch[1].toUpperCase();
        if (!meetings.has(code)) return json(res, 404, { error: 'Meeting not found.' });
        const qr = qrcode(0, 'M');
        qr.addData(`${publicBase(req)}/j/${code}`);
        qr.make();
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
        return res.end(qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
      }

      const csvMatch = pathname.match(/^\/api\/meetings\/([A-Za-z0-9]{6})\/export\.csv$/);
      if (req.method === 'GET' && csvMatch) {
        const meeting = meetings.get(csvMatch[1].toUpperCase());
        if (!meeting) return json(res, 404, { error: 'Meeting not found.' });
        if (!canManage(req, meeting)) return json(res, 403, { error: 'Only the host can export results.' });
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="engage-${meeting.code}.csv"`,
          'Cache-Control': 'no-store',
          ...SECURITY_HEADERS,
        });
        return res.end(meetingCsv(meeting));
      }

      const deleteMatch = pathname.match(/^\/api\/meetings\/([A-Za-z0-9]{6})$/);
      if (req.method === 'DELETE' && deleteMatch) {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked.' });
        const meeting = meetings.get(deleteMatch[1].toUpperCase());
        if (!meeting) return json(res, 404, { error: 'Meeting not found.' });
        if (!canManage(req, meeting)) return json(res, 403, { error: 'Only the host can delete a meeting.' });
        destroyMeeting(meeting.code);
        return json(res, 200, { ok: true });
      }

      const linkMatch = pathname.match(/^\/api\/link\/([a-z]+)\/([\w./-]{3,80})$/);
      if (req.method === 'GET' && linkMatch) {
        const found = findLinked(linkMatch[1], linkMatch[2]);
        if (!found) return json(res, 404, { error: 'No Engage meeting is running here yet.' });
        return json(res, 200, { code: found.code, title: found.title });
      }

      const apiMatch = pathname.match(/^\/api\/meetings\/([A-Za-z0-9]{6})$/);
      if (req.method === 'GET' && apiMatch) {
        const meeting = meetings.get(apiMatch[1].toUpperCase());
        if (!meeting) return json(res, 404, { error: 'Meeting not found.' });
        return json(res, 200, { code: meeting.code, title: meeting.title, status: meeting.status });
      }

      if (req.method !== 'GET') {
        res.writeHead(405);
        return res.end();
      }

      if (pathname === '/') return await servePage(req, res, 'index.html');
      if (pathname === '/login') return await servePage(req, res, 'login.html');
      if (pathname === '/try') return await servePage(req, res, 'try.html');
      if (pathname === '/forgot') return await servePage(req, res, 'forgot.html');
      if (pathname === '/reset') return await servePage(req, res, 'reset.html');
      if (pathname === '/verify') return await servePage(req, res, 'verify.html');
      if (req.method === 'GET' && pathname === '/robots.txt') {
        const text = `User-agent: *\nAllow: /\nDisallow: /h/\nDisallow: /j/\nDisallow: /api/\nDisallow: /meet/\nSitemap: ${publicBase(req)}/sitemap.xml\n`;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...SECURITY_HEADERS });
        return res.end(text);
      }
      if (req.method === 'GET' && pathname === '/sitemap.xml') {
        const base = publicBase(req);
        const urls = ['/', '/try', '/privacy.html', '/terms.html', '/support.html'];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...SECURITY_HEADERS });
        return res.end(xml);
      }
      if (pathname === '/meet/panel') return await servePage(req, res, 'meet/panel.html', { embeddable: true });
      if (pathname === '/vendor/meet.addons.mjs') {
        return sendAsset(req, res, { 'Content-Type': MIME['.js'], 'Cache-Control': 'public, max-age=3600', ...SECURITY_HEADERS }, await readFile(MEET_SDK));
      }
      if (pathname === '/meetings') return await servePage(req, res, 'meetings.html');
      // Short address: /ABC234 goes to the join page when that meeting exists.
      const shortMatch = pathname.match(/^\/([A-Za-z0-9]{6})$/);
      if (shortMatch && meetings.has(shortMatch[1].toUpperCase())) {
        res.writeHead(302, { Location: `/j/${shortMatch[1].toUpperCase()}`, 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (/^\/h\/[A-Za-z0-9]{6}$/.test(pathname)) return await servePage(req, res, 'host.html', { embeddable: true });
      if (/^\/j\/[A-Za-z0-9]{6}$/.test(pathname)) return await servePage(req, res, 'join.html', { embeddable: true });
      return await serveStatic(req, res, pathname);
    } catch (error) {
      if (error instanceof AuthError) return json(res, error.status, { error: error.message });
      console.error(error);
      if (!res.headersSent) json(res, 400, { error: 'Bad request.' });
    }
  });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  // A meeting whose host and attendees have all been gone for a while is ended by the server, so
  // abandoned meetings do not stay live for the full 12 hours.
  const lastPresent = new Map();
  const ticker = setInterval(() => {
    const now = clock();
    const occupied = new Set();
    for (const info of sockets.values()) occupied.add(info.code);
    for (const [code, meeting] of meetings) {
      if (occupied.has(code) || !lastPresent.has(code)) lastPresent.set(code, now);
      if (meeting.status === 'live' && (now - meeting.createdAt > MEETING_TTL_MS || now - lastPresent.get(code) > idleEndMs())) {
        meeting.end();
        dirty.add(code);
      }
      if (meeting.status !== 'live') lastPresent.delete(code);
      if (meeting.status === 'ended' && meeting.ownerId && !meeting.summaryEmailedAt && !demos.has(code)) {
        const owner = store.getUser(meeting.ownerId);
        meeting.summaryEmailedAt = now; // claimed first so it can only go out once
        dirty.add(code);
        if (owner?.verifiedAt) emailSummary(meeting, owner, lastBase).catch(() => {});
      }
      const demoEnds = demos.get(code);
      if (demoEnds !== undefined) {
        if (meeting.status === 'live' && now >= demoEnds) {
          meeting.end();
          scheduleBroadcast(code);
        }
        if (now >= demoEnds + 5 * 60_000) {
          meetings.delete(code);
          demos.delete(code);
          continue;
        }
      }
      const keepFor = meeting.ownerId ? accountRetentionMs() : retentionMs();
      if (meeting.status === 'ended' && now - meeting.endedAt > keepFor) {
        meetings.delete(code);
        dirty.delete(code);
        store.deleteMeeting(code);
        continue;
      }
      if (meeting.tick(now)) scheduleBroadcast(code);
    }
  }, 1000);
  ticker.unref();
  const flusher = setInterval(() => {
    flush();
    store.purgeSessions(clock());
  }, FLUSH_MS);
  flusher.unref();

  const close = () =>
    new Promise((resolve) => {
      clearInterval(ticker);
      clearInterval(flusher);
      flush();
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => server.close(() => Promise.resolve(store.close()).then(resolve)));
    });

  return { server, meetings, close };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const dbUrl = process.env.ENGAGE_DATABASE_URL;
  const dbFile = process.env.ENGAGE_DB;
  const store = dbUrl ? await openPostgresStore(dbUrl) : dbFile ? await openSqliteStore(dbFile) : new MemoryStore();
  console.log(
    dbUrl ? 'Storing meetings in Postgres.' : dbFile ? `Storing meetings in ${dbFile}` : 'No database set: meetings live in memory only.',
  );
  const { server, close } = createApp({ store });
  server.listen(PORT, () => console.log(`Engage running on http://localhost:${PORT}`));
  // On deploys, close sockets so clients reconnect to the new instance.
  const shutdown = () => close().then(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
