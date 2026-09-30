import http from 'node:http';
import https from 'node:https';
import { readFileSync, createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const list = value => (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
export function iceConfig(env, id) {
  const iceServers = [];
  const stun = list(env.STUN_URLS ?? 'stun:stun.l.google.com:19302');
  const turn = list(env.TURN_URLS);
  if (stun.length) iceServers.push({ urls: stun });
  if (turn.length) {
    if (!env.TURN_SHARED_SECRET) throw new Error('TURN_URLS requires TURN_SHARED_SECRET');
    const ttl = Math.max(600, Math.min(86400, Number(env.TURN_TTL_SECONDS) || 3600));
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${id}`;
    iceServers.push({ urls: turn, username, credential: createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64') });
  }
  if (env.ICE_TRANSPORT_POLICY === 'relay' && !turn.length) throw new Error('relay policy requires TURN_URLS');
  return { iceServers, iceTransportPolicy: env.ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all' };
}

export function createSignalingServer(env = process.env) {
  iceConfig(env, 'validate');
  const rooms = new Map();
  const root = resolve(fileURLToPath(new URL('../web/dist/', import.meta.url)));
  const allowed = new Set(list(env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173'));
  const sameOrigin = req => !req.headers.origin || allowed.has(req.headers.origin) || req.headers.origin === `${env.TLS_CERT_FILE ? 'https' : 'http'}://${req.headers.host}`;
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const send = (ws, value) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
  function finish(room, reason) {
    if (!rooms.delete(room.id)) return;
    for (const member of room.members) { send(member.ws, { type: 'ended', reason }); member.ws.close(1000, 'Room ended'); }
  }
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
      if (url.pathname === '/api/health') return json(res, 200, { ok: true });
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        if (!sameOrigin(req)) return json(res, 403, { error: 'Origin not allowed' });
        if (rooms.size >= (Number(env.MAX_ROOMS) || 1000)) return json(res, 503, { error: 'Сервер занят. Попробуй позже.' });
        const id = randomBytes(16).toString('hex');
        rooms.set(id, { id, members: [], created: Date.now(), started: false });
        return json(res, 201, { roomId: id });
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const path = resolve(root, '.' + name);
      if (!path.startsWith(root + sep)) return json(res, 403, { error: 'Forbidden' });
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) return json(res, 404, { error: 'Фронтенд не собран. Выполни npm run build в web/.' });
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Content-Length': info.size });
      if (req.method === 'HEAD') res.end(); else createReadStream(path).pipe(res);
    } catch { if (!res.headersSent) json(res, 400, { error: 'Invalid request' }); else res.end(); }
  };
  const server = env.TLS_CERT_FILE ? https.createServer({ cert: readFileSync(env.TLS_CERT_FILE), key: readFileSync(env.TLS_KEY_FILE) }, handler) : http.createServer(handler);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  server.on('upgrade', (req, socket, head) => {
    if (!sameOrigin(req) || new URL(req.url, 'http://localhost').pathname !== '/signal') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let room, member, count = 0, epoch = Date.now();
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    const joinTimeout = setTimeout(() => ws.close(1008, 'Join timeout'), 10000);
    const reject = message => { send(ws, { type: 'error', message }); ws.close(1008, 'Request rejected'); };
    ws.on('message', bytes => {
      if (Date.now() - epoch > 1000) { count = 0; epoch = Date.now(); }
      if (++count > 100) return reject('Слишком много запросов.');
      let message;
      try { message = JSON.parse(bytes.toString()); } catch { return reject('Неверный формат запроса.'); }
      if (!message || typeof message !== 'object') return reject('Неверный запрос.');
      if (!member) {
        if (message.type !== 'join' || typeof message.roomId !== 'string' || !/^[a-f0-9]{32}$/.test(message.roomId)) return reject('Неверная ссылка комнаты.');
        const target = rooms.get(message.roomId);
        if (!target) return reject('Комната не найдена или звонок уже завершён. Создай новую комнату.');
        if (target.members.length >= 2 || target.started) return reject('Комната занята: в ней уже два участника.');
        room = target;
        const name = typeof message.name === 'string' ? message.name.trim().slice(0, 40) : '';
        member = { id: randomUUID(), name: name || `Участник ${room.members.length + 1}`, ws };
        clearTimeout(joinTimeout); room.members.push(member);
        send(ws, { type: 'joined', self: { id: member.id, name: member.name }, config: iceConfig(env, member.id) });
        if (room.members.length === 2) {
          room.started = true;
          for (const m of room.members) {
            const peer = room.members.find(p => p !== m);
            send(m.ws, { type: 'ready', peer: { id: peer.id, name: peer.name }, initiator: m === room.members[0] });
          }
        }
        return;
      }
      if (!rooms.has(room.id)) return;
      if (message.type === 'leave') return finish(room, 'Собеседник завершил звонок.');
      if (message.type !== 'signal' || !room.started) return reject('Неожиданный сигнал.');
      const data = message.data;
      const validDescription = data?.description && ['offer', 'answer'].includes(data.description.type) && typeof data.description.sdp === 'string' && data.description.sdp.length <= 60000;
      const validCandidate = data && Object.hasOwn(data, 'candidate') && (data.candidate === null || (typeof data.candidate?.candidate === 'string' && data.candidate.candidate.length < 4096));
      if (!validDescription && !validCandidate) return reject('Некорректный SDP/ICE.');
      const peer = room.members.find(p => p !== member);
      if (peer) send(peer.ws, { type: 'signal', data });
    });
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(joinTimeout); if (room && member) finish(room, 'Собеседник вышел или потерял соединение.'); });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
    for (const room of rooms.values()) if (!room.started && Date.now() - room.created > 30 * 60 * 1000) finish(room, 'Время ожидания истекло. Создай новую комнату.');
  }, 15000);
  heartbeat.unref();
  server.on('close', () => { clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); wss.close(); rooms.clear(); });
  return { server, rooms, wss };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createSignalingServer();
  server.listen(Number(process.env.PORT) || 3001, process.env.HOST || '127.0.0.1', () => {
    console.log(`SignBridge: ${process.env.TLS_CERT_FILE ? 'https' : 'http'}://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`);
  });
}
