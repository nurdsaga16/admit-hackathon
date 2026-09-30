import { it, expect } from 'vitest';
import { Conversation, parseCaption } from '../src/conversation';
import { SpeechResults } from '../src/speech';
const peer = { id: 'peer', name: 'Peer' };
it('interim text is replaced and a final packet is committed exactly once', () => {
  const log = new Conversation();
  const packet = { type: 'caption' as const, kind: 'speech' as const, id: 'run:0', text: 'How', final: false };
  log.receive(packet, peer, false); log.receive({ ...packet, text: 'How are you' }, peer, false);
  expect(log.entries).toHaveLength(0); expect(log.interim.get('peer')?.text).toBe('How are you');
  log.receive({ ...packet, text: 'How are you?', final: true }, peer, false);
  log.receive({ ...packet, text: 'How are you?', final: true }, peer, false);
  log.receive(packet, peer, false);
  expect(log.entries).toHaveLength(1); expect(log.interim.size).toBe(0);
});
it('marks acknowledgement and unconfirmed delivery on end', () => {
  const log = new Conversation();
  for (const id of ['a', 'b']) log.receive({ type: 'caption', kind: 'gesture', id, text: 'day', final: true }, peer, true);
  log.acknowledge('a'); log.end();
  expect(log.entries.map(e => e.delivery)).toEqual(['delivered', 'unconfirmed']);
});
it('speech results deduplicate indices, while intentional repeated phrases remain distinct', () => {
  const results = new SpeechResults('run');
  const interim = { resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'Good' } }] };
  expect(results.consume(interim)).toHaveLength(1); expect(results.consume(interim)).toHaveLength(0);
  const final = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Good day' } }] };
  expect(results.consume(final)[0]).toEqual({ id: 'run:0', text: 'Good day', final: true });
  expect(results.consume(final)).toHaveLength(0);
  expect(results.consume({ resultIndex: 1, results: [...final.results, final.results[0]] })[0].id).toBe('run:1');
});
it('rejects invalid or oversized packets', () => {
  expect(parseCaption({ type: 'caption', id: 'x', kind: 'speech', text: 'x'.repeat(2001), final: true })).toBeNull();
  expect(parseCaption(null)).toBeNull(); expect(parseCaption({ type: 'script' })).toBeNull();
});
