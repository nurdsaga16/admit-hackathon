import { expect, it } from 'vitest';
import { getPhrase, phraseMapping } from '../src/phraseMapping';
import { Stability, defaults } from '../src/core';
import { CommandConversation } from '../src/commands';

it('assigns exactly the requested eleven phrases and preserves unknown IDs', () => {
  const expected = {person:'Hello',afternoon:'How are you?',age:"I'm fine",boy:"What's your name?",country:'Nice to meet you',day:'Thank you',monday:"You're welcome",name:'Please repeat',night:'Goodbye',people:'I need help',time:'One moment, please'};
  expect(phraseMapping).toEqual(expected);
  for(const [id,phrase] of Object.entries(expected)) expect(getPhrase(id)).toBe(phrase);
  for(const id of ['unknown','constructor','toString','__proto__','Day','']) expect(getPhrase(id)).toBe(id);
});

it('stabilizes and suppresses repeats with original IDs, mapping only the sent message', () => {
  const gate = new Stability(), conversation = new CommandConversation(), sent:string[]=[];
  conversation.communicating=true;
  for(let i=0;i<defaults.stableWindows;i++) conversation.offer(gate.update([.99,.01],['afternoon','age'],defaults));
  expect(gate.candidate).toBe('afternoon');expect(conversation.draft).toBe('afternoon');
  const raw = conversation.draft!;
  conversation.act('palm',0,id=>{sent.push(getPhrase(id));return true;},()=>{});
  expect(gate.confirm(raw,defaults)).toBe(true);expect(gate.confirmed).toBe('afternoon');
  expect(gate.update([.99,.01],['afternoon','age'],defaults)).toBeNull();
  conversation.act('palm',1,id=>{sent.push(getPhrase(id));return true;},()=>{});
  expect(sent).toEqual(['How are you?']);
});
