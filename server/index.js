import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ActionError, Meeting, newCode } from './meeting.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const MEETING_TTL_MS = 12 * 60 * 60_000;
const ENDED_TTL_MS = 24 * 60 * 60_000;
const BROADCAST_DELAY_MS = 150;
const MAX_MESSAGES_PER_SECOND = 25;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export const createApp = ({ clock = Date.now } = {}) => {
  const meetings = new Map();
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
    quiet: (m, msg) => m.setQuiet(msg.on, msg.everyMin),
    floor: (m) => m.openTheFloor(),
    resetClock: (m) => m.resetClock(),
    removeParticipant: (m, msg) => m.removeParticipant(msg.pid),
    end: (m) => m.end(),
  };

  const attendeeActions = {
    react: (m, pid, msg) => m.react(pid, msg.kind),
    ask: (m, pid, msg) => m.ask(pid, msg.text, msg.anon),
    upvote: (m, pid, msg) => m.upvote(pid, msg.id),
    respond: (m, pid, msg) => m.respond(pid, msg.momentId, msg.value),
    bingo: (m, pid, msg) => m.markBingo(pid, msg.word),
    predict: (m, pid, msg) => m.predict(pid, msg.choice),
  };

  const handleHello = (ws, msg) => {
    const meeting = meetings.get(String(msg.code ?? '').toUpperCase());
    if (!meeting) return send(ws, { t: 'fatal', error: 'Meeting not found.' });

    if (msg.role === 'host') {
      if (msg.hostToken !== meeting.hostToken) {
        return send(ws, { t: 'fatal', error: 'This browser is not the host of this meeting.' });
      }
      sockets.set(ws, { code: meeting.code, role: 'host', pid: null, windowStart: 0, count: 0 });
      send(ws, { t: 'welcome', role: 'host' });
      return pushState(ws);
    }

    const participant = meeting.join({
      name: msg.name,
      anon: msg.anon,
      pid: msg.pid,
      token: msg.token,
    });
    sockets.set(ws, { code: meeting.code, role: 'attendee', pid: participant.id, windowStart: 0, count: 0 });
    send(ws, {
      t: 'welcome',
      role: 'attendee',
      pid: participant.id,
      token: participant.token,
      name: participant.name,
      anon: participant.anon,
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
        handler(meeting, msg);
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

  wss.on('connection', (ws) => {
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

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    res.end(JSON.stringify(body));
  };

  const allowCreate = (ip) => {
    const now = clock();
    const recent = (createLog.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
    if (recent.length >= 30) return false;
    createLog.set(ip, [...recent, now]);
    return true;
  };

  const servePage = async (res, file) => {
    const body = await readFile(join(PUBLIC_DIR, file));
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    res.end(body);
  };

  const serveStatic = async (res, pathname) => {
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC_DIR, safe);
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ...SECURITY_HEADERS,
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      if (req.method === 'GET' && pathname === '/healthz') return json(res, 200, { ok: true });

      if (req.method === 'POST' && pathname === '/api/meetings') {
        if (!allowCreate(req.socket.remoteAddress ?? 'unknown')) {
          return json(res, 429, { error: 'Too many meetings created. Try again later.' });
        }
        const body = await readJson(req);
        let code = newCode();
        while (meetings.has(code)) code = newCode();
        const meeting = new Meeting({ code, title: body.title, expected: body.expected, agenda: body.agenda, clock });
        meetings.set(code, meeting);
        return json(res, 201, { code, hostToken: meeting.hostToken });
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

      if (pathname === '/') return await servePage(res, 'index.html');
      if (/^\/h\/[A-Za-z0-9]{6}$/.test(pathname)) return await servePage(res, 'host.html');
      if (/^\/j\/[A-Za-z0-9]{6}$/.test(pathname)) return await servePage(res, 'join.html');
      return await serveStatic(res, pathname);
    } catch (error) {
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

  const ticker = setInterval(() => {
    const now = clock();
    for (const [code, meeting] of meetings) {
      if (meeting.status === 'live' && now - meeting.createdAt > MEETING_TTL_MS) meeting.end();
      if (meeting.status === 'ended' && now - meeting.endedAt > ENDED_TTL_MS) {
        meetings.delete(code);
        continue;
      }
      if (meeting.tick(now)) scheduleBroadcast(code);
    }
  }, 1000);
  ticker.unref();

  const close = () =>
    new Promise((resolve) => {
      clearInterval(ticker);
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => server.close(() => resolve()));
    });

  return { server, meetings, close };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server } = createApp();
  server.listen(PORT, () => console.log(`Engage running on http://localhost:${PORT}`));
}
