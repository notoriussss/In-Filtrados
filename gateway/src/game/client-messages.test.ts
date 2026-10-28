import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, toGrpcAction } from './client-messages';

const parse = (msg: unknown) => parseClientMessage(JSON.stringify(msg));

test('join keeps matchId and a numeric lastTick', () => {
  assert.deepEqual(parse({ type: 'join', matchId: 'm1', lastTick: '7' }), {
    type: 'join',
    matchId: 'm1',
    lastTick: 7,
  });
  assert.equal(parse({ type: 'join', matchId: 3 }), null);
});

test('move only accepts -1, 0 and 1', () => {
  assert.deepEqual(parse({ type: 'move', dx: 1, dy: -1 }), {
    type: 'move',
    dx: 1,
    dy: -1,
  });
  assert.equal(parse({ type: 'move', dx: 2, dy: 0 }), null);
});

test('report needs a tank slot from 0 to 9', () => {
  assert.deepEqual(toGrpcAction(parse({ type: 'report', tankSlot: 3 })!), {
    report: { tankSlot: 3 },
  });
  assert.equal(parse({ type: 'report', tankSlot: 10 }), null);
  assert.equal(parse({ type: 'report', tankSlot: '3' }), null);
});

test('vote for a player or skip with null', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'vote', targetPlayerId: 'p2' })!),
    { vote: { targetPlayerId: 'p2' } },
  );
  assert.deepEqual(
    toGrpcAction(parse({ type: 'vote', targetPlayerId: null })!),
    { vote: { skip: true } },
  );
  assert.equal(parse({ type: 'vote' }), null);
  assert.equal(parse({ type: 'vote', targetPlayerId: '' }), null);
});

test('chat is trimmed and limited to 200 characters', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'chat', clientMsgId: 'c1', text: ' hola ' })!),
    { chat: { clientMsgId: 'c1', text: 'hola' } },
  );
  const longest = 'á'.repeat(200);
  assert.ok(parse({ type: 'chat', clientMsgId: 'c1', text: longest }));
  assert.equal(
    parse({ type: 'chat', clientMsgId: 'c1', text: longest + 'a' }),
    null,
  );
  assert.equal(parse({ type: 'chat', clientMsgId: 'c1', text: '   ' }), null);
  assert.equal(parse({ type: 'chat', text: 'hola' }), null);
});

test('interact on a station or a tank', () => {
  assert.deepEqual(
    toGrpcAction(
      parse({ type: 'interact', stationId: 'leak-1', completed: true })!,
    ),
    { interact: { stationId: 'leak-1', completed: true } },
  );
  assert.deepEqual(
    toGrpcAction(parse({ type: 'interact', tankSlot: 0 })!),
    { interact: { tankSlot: 0 } },
  );
});

test('unknown types and invalid JSON are rejected', () => {
  assert.equal(parse({ type: 'teleport' }), null);
  assert.equal(parseClientMessage('{ no es json'), null);
});

test('Mesa: callMeeting is a message with no payload', () => {
  assert.deepEqual(parse({ type: 'callMeeting' }), {
    type: 'callMeeting',
  });
  assert.deepEqual(
    toGrpcAction(parse({ type: 'callMeeting' })!),
    { callMeeting: {} },
  );
});

test('S3-05: sabotage only with a known kind', () => {
  assert.deepEqual(toGrpcAction(parse({ type: 'sabotage', kind: 'pipe' })!), {
    sabotage: { kind: 'pipe' },
  });
  assert.deepEqual(
    toGrpcAction(parse({ type: 'sabotage', kind: 'steam' })!),
    { sabotage: { kind: 'steam' } },
  );
  assert.equal(parse({ type: 'sabotage', kind: 'flood' }), null);
  assert.equal(parse({ type: 'sabotage' }), null);
});

test('S3-05: fix needs a point id', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'fix', pointId: 'pipe-west' })!),
    { fix: { pointId: 'pipe-west' } },
  );
  assert.equal(parse({ type: 'fix' }), null);
  assert.equal(parse({ type: 'fix', pointId: '' }), null);
  assert.equal(parse({ type: 'fix', pointId: 'x'.repeat(65) }), null);
});

test('leave goes to match as the creator leaving on purpose', () => {
  assert.deepEqual(toGrpcAction(parse({ type: 'leave' })!), { leave: {} });
});

test('pickColor needs a short color', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'pickColor', color: '#4363d8' })!),
    { pickColor: { color: '#4363d8' } },
  );
  assert.equal(parse({ type: 'pickColor' }), null);
  assert.equal(parse({ type: 'pickColor', color: '' }), null);
  assert.equal(parse({ type: 'pickColor', color: 7 }), null);
  assert.equal(
    parse({ type: 'pickColor', color: 'x'.repeat(17) }),
    null,
  );
});

test('setTaskCount needs an integer; match checks the range', () => {
  for (const n of [4, 6, 8]) {
    assert.deepEqual(
      toGrpcAction(parse({ type: 'setTaskCount', tasksPerPlayer: n })!),
      { setTaskCount: { tasksPerPlayer: n } },
    );
  }
  assert.equal(parse({ type: 'setTaskCount' }), null);
  assert.equal(parse({ type: 'setTaskCount', tasksPerPlayer: 5.5 }), null);
  assert.equal(parse({ type: 'setTaskCount', tasksPerPlayer: '6' }), null);
  assert.equal(parse({ type: 'setTaskCount', tasksPerPlayer: null }), null);
});

test('setImpostorCount needs an integer; match checks the range', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'setImpostorCount', impostors: 2 })!),
    { setImpostorCount: { impostors: 2 } },
  );
  assert.equal(parse({ type: 'setImpostorCount' }), null);
  assert.equal(parse({ type: 'setImpostorCount', impostors: 1.5 }), null);
  assert.equal(parse({ type: 'setImpostorCount', impostors: '2' }), null);
});

test('setMatchDuration needs an integer; match checks the range', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'setMatchDuration', minutes: 10 })!),
    { setMatchDuration: { minutes: 10 } },
  );
  assert.equal(parse({ type: 'setMatchDuration' }), null);
  assert.equal(parse({ type: 'setMatchDuration', minutes: 7.5 }), null);
  assert.equal(parse({ type: 'setMatchDuration', minutes: null }), null);
});

test('pickAccessory needs a short accessory string', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'pickAccessory', accessory: 'straw-hat' })!),
    { pickAccessory: { accessory: 'straw-hat' } },
  );
  assert.equal(parse({ type: 'pickAccessory' }), null);
  assert.equal(parse({ type: 'pickAccessory', accessory: '' }), null);
  assert.equal(parse({ type: 'pickAccessory', accessory: 123 }), null);
  assert.equal(
    parse({ type: 'pickAccessory', accessory: 'x'.repeat(33) }),
    null,
  );
});

test('pickSkin needs a short skin string', () => {
  assert.deepEqual(
    toGrpcAction(parse({ type: 'pickSkin', skin: 'gota' })!),
    { pickSkin: { skin: 'gota' } },
  );
  assert.equal(parse({ type: 'pickSkin' }), null);
  assert.equal(parse({ type: 'pickSkin', skin: '' }), null);
  assert.equal(parse({ type: 'pickSkin', skin: 'x'.repeat(17) }), null);
});

test('refreshShop is accepted but never sent to match as is', () => {
  const msg = parse({ type: 'refreshShop' });
  assert.deepEqual(msg, { type: 'refreshShop' });
  assert.equal(toGrpcAction(msg!), null);
});

test('the browser cannot forge what it owns', () => {
  assert.equal(parse({ type: 'setOwned', items: ['gota-e6194b'] }), null);
  assert.deepEqual(parse({ type: 'refreshShop', items: ['cap'] }), {
    type: 'refreshShop',
  });
});

test('ping is accepted but never goes to match', () => {
  assert.deepEqual(parse({ type: 'ping' }), { type: 'ping' });
  assert.equal(toGrpcAction({ type: 'ping' }), null);
});
