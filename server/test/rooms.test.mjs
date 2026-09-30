import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createHmac } from 'node:crypto';
import { createSignalingServer, iceConfig } from '../index.mjs';

async function setup(t) {
  const app = createSignalingServer({ STUN_URLS: '', ALLOWED_ORIGINS: 'http://allowed.test' });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => { for (const ws of app.wss.clients) ws.terminate(); app.server.close(); });
  const room = await (await fetch(base + '/api/rooms', { method: 'POST' })).json();
  async function join(roomId = room.roomId) {
    const ws = new WebSocket(base.replace('http', 'ws') + '/signal');
    const queue = []; const waiters = [];
    ws.on('message', bytes => { const msg = JSON.parse(bytes.toString()); const waiter = waiters.shift(); if (waiter) waiter(msg); else queue.push(msg); });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'join', roomId, name: 'Tester' }));
    return { ws, next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve)) };
  }
  return { ...app, base, room, join };
}
test('two participants relay SDP/ICE; third is rejected; leave deletes room', { timeout: 5000 }, async t => {
  const app = await setup(t); const a = await app.join(); assert.equal((await a.next()).type, 'joined');
  const b = await app.join(); assert.equal((await b.next()).type, 'joined');
  const ar = await a.next(), br = await b.next(); assert.equal(ar.initiator, true); assert.equal(br.initiator, false);
  assert.notEqual(ar.peer.id, br.peer.id);
  const c = await app.join(); assert.match((await c.next()).message, /занята/);
  const data = { description: { type: 'offer', sdp: 'synthetic SDP transport fixture' } };
  a.ws.send(JSON.stringify({ type: 'signal', data })); assert.deepEqual((await b.next()).data, data);
  const ice = { candidate: { candidate: 'synthetic candidate fixture' } };
  b.ws.send(JSON.stringify({ type: 'signal', data: ice })); assert.deepEqual((await a.next()).data, ice);
  a.ws.send(JSON.stringify({ type: 'leave' })); assert.equal((await b.next()).type, 'ended'); assert.equal(app.rooms.size, 0);
  const d = await app.join(); assert.match((await d.next()).message, /не найдена/);
});
test('unexpected disconnect ends peer and invalid origin cannot create rooms', { timeout: 5000 }, async t => {
  const app = await setup(t); const a = await app.join(); await a.next(); const b = await app.join(); await b.next(); await a.next(); await b.next();
  a.ws.terminate(); assert.equal((await b.next()).type, 'ended');
  assert.equal((await fetch(app.base + '/api/rooms', { method: 'POST', headers: { Origin: 'https://untrusted.test' } })).status, 403);
});
test('TURN REST credentials are temporary; shared secret never reaches client', () => {
  const config = iceConfig({ STUN_URLS: '', TURN_URLS: 'turn:relay.test:3478', TURN_SHARED_SECRET: 'test-only-secret', ICE_TRANSPORT_POLICY: 'relay' }, 'participant');
  assert.equal(config.iceTransportPolicy, 'relay');
  const turn = config.iceServers[0]; assert.ok(Number(turn.username.split(':')[0]) > Date.now() / 1000);
  assert.equal(turn.credential, createHmac('sha1', 'test-only-secret').update(turn.username).digest('base64'));
  assert.ok(!JSON.stringify(config).includes('test-only-secret'));
  assert.throws(() => iceConfig({ ICE_TRANSPORT_POLICY: 'relay' }, 'x'));
});

test('ICE defaults distinguish missing and explicitly empty STUN; relay needs real TURN',()=>{
 assert.deepEqual(iceConfig({},'x'),{iceServers:[{urls:['stun:stun.l.google.com:19302']}],iceTransportPolicy:'all'});
 assert.deepEqual(iceConfig({STUN_URLS:''},'x').iceServers,[]);
 assert.throws(()=>iceConfig({TURN_URLS:'turn:relay.test'},'x'),/TURN_SHARED_SECRET/);
 assert.throws(()=>iceConfig({ICE_TRANSPORT_POLICY:'relai'},'x'),/all or relay/);
 assert.throws(()=>iceConfig({TURN_URLS:'https://tunnel.example',TURN_SHARED_SECRET:'test-only'},'x'),/not an HTTPS tunnel/);
});
