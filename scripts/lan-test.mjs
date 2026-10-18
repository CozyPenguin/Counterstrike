import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachLAN } from '../server/lan.js';

const server = createServer();
const lan = attachLAN(server);
server.on('request', lan.request);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const clients = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
async function connect(name, room = {}, expected = 'spawn') {
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/lan`);
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  const client = { ws, messages, send: m => ws.send(JSON.stringify(m)), async wait(type, predicate = () => true) {
    const end = Date.now() + 5500;
    while (Date.now() < end) {
      const index = messages.findIndex(m => m.type === type && predicate(m));
      if (index !== -1) return messages.splice(index, 1)[0];
      await delay(10);
    }
    throw new Error(`Timed out waiting for ${type}`);
  } };
  clients.push(client);
  const welcome = await client.wait('welcome'); client.id = welcome.id;
  client.send({ type: 'join', name, ...room });
  client.spawn = await client.wait(expected);
  return client;
}
try {
  const list = async () => (await fetch(`http://127.0.0.1:${server.address().port}/api/rooms`)).json();
  assert.equal((await list()).rooms.length, 0);
  const a = await connect('<Alice>', { createRoom: 'Friends Room' });
  const roomId = a.spawn.roomId;
  const b = await connect('Bob', { roomId });
  assert.equal((await list()).rooms[0].players, 2);
  assert.equal((await list()).rooms[0].name, 'Friends Room');
  const c = await connect('Other', { createRoom: 'Separate Room' });
  await c.wait('state', m => m.players.length === 1);
  const missing = await connect('Missing', { roomId: 'not-a-room' }, 'error');
  assert.match(missing.spawn.message, /closed/);
  missing.ws.close();
  const state = await a.wait('state', m => m.players.length === 2);
  assert.equal(state.players.find(p => p.id === a.id).name, 'Alice');
  assert.notEqual(a.id, b.id);
  a.send({ type: 'move', pos: [999,0,0], yaw: 0 });
  assert.deepEqual((await a.wait('correct')).pos, a.spawn.pos);
  a.ws.send('invalid json'); a.send({type:'shot',dir:[null,0,1]});
  await delay(2100); // spawn protection expires
  const from = a.spawn.pos.map((v,i) => v + (i === 1 ? 1.87 : 0));
  const target = b.spawn.pos.map((v,i) => v + (i === 1 ? 1.7 : 0));
  const delta = target.map((v,i) => v - from[i]);
  const length = Math.hypot(...delta); const dir = delta.map(v => v / length);
  a.send({ type: 'shot', dir });
  await b.wait('shot', m => m.id === a.id);
  await a.wait('hit', m => m.killed);
  await delay(100);
  assert.ok(!c.messages.some(m => m.type === 'shot' || m.type === 'kill'), 'combat stays inside its room');
  const kill = await b.wait('kill'); assert.equal(kill.killer, 'Alice');
  const dead = await a.wait('state', m => m.players.some(p => p.id === b.id && p.hp === 0));
  assert.equal(dead.players.find(p => p.id === a.id).kills, 1);
  a.send({ type: 'reload' });
  a.messages.length = 0;
  a.send({ type: 'shot', dir });
  await delay(150);
  assert.ok(!a.messages.some(m => m.type === 'shot'), 'reload blocks shooting');
  const respawn = await b.wait('spawn'); assert.equal(respawn.hp, 100);
  b.ws.close();
  await a.wait('state', m => m.players.length === 1);
  const extras = [];
  for (let i = 0; i < 9; i++) extras.push(await connect(`Guest${i}`, { roomId }));
  const full = await connect('Overflow', { roomId }, 'error');
  assert.match(full.spawn.message, /full/);
  full.ws.close();
  assert.equal((await list()).rooms.find(r => r.id === roomId).players, 10);
  for (const client of [a, c, ...extras]) client.ws.close();
  await delay(150);
  assert.equal((await list()).rooms.length, 0, 'empty rooms removed');
  console.log('LAN integration passed: rooms, discovery API, isolation, capacity, cleanup, join, sanitization, state, validation, shots, kill, scores, reload, respawn, disconnect');
} finally {
  for (const c of clients) c.ws.terminate();
  lan.close(); await new Promise(resolve => server.close(resolve));
}
