import { describe, expect, it, vi } from 'vitest';
import { CommandController, CommandConversation, measureHand, trainingHint, type Command } from '../src/commands';
import { handPose } from './commandFixtures';

describe('synthetic command geometry', () => {
  it.each(['palm','fist','v'] as Command[])('recognizes %s on either hand and after rotation', command => {
    const hand = handPose(command);
    expect(measureHand(hand).command).toBe(command);
    expect(measureHand(hand.map(p => ({...p,x:1-p.x}))).command).toBe(command);
    expect(measureHand(hand.map(p => ({...p,x:p.y,y:1-p.x}))).command).toBe(command);
  });
  it('rejects transitional, incomplete, tiny, clipped and nonfinite hands', () => {
    expect(measureHand(handPose('neutral')).command).toBeNull();
    for (const hand of [handPose('palm').slice(0,20),handPose('palm').map(p => ({...p,x:p.x*.01,y:p.y*.01})),handPose('palm').map(p => ({...p,x:p.x-1})),handPose('palm').map(p => ({...p,z:NaN}))]) expect(measureHand(hand).command).toBeNull();
    const almost = handPose('palm'); almost[8] = {...almost[7],y:.52};
    expect(measureHand(almost).command).toBeNull();
    expect(trainingHint(almost,'palm')).toContain('указательный');
  });
  it('gives target-specific finger, position and V spread corrections', () => {
    expect(trainingHint(handPose('fist'),'palm')).toContain('Разогни');
    expect(trainingHint(handPose('palm'),'fist')).toContain('Согни');
    expect(trainingHint(handPose('fist',false),'palm')).toContain('Перемести');
    const v=handPose('v'); for (const b of [5,9]) for (let i=1;i<4;i++) v[b+i].x=v[b].x;
    expect(measureHand(v).command).toBeNull(); expect(trainingHint(v,'v')).toContain('Разведи');
  });
});
function driver() {
  const c = new CommandController(); let now=0;
  function hold(pose: Command | 'neutral' | null, duration: number, outside=false) {
    const results = [];
    for (let i=0;i<duration;i+=100) { results.push(c.tick(pose ? [handPose(pose,!outside)] : [],now)); now+=100; }
    return results;
  }
  return {c,hold,get now(){return now;}};
}
describe('intentional control state', () => {
  it('requires entry plus uninterrupted hold, fires once and rearms only after neutral', () => {
    const d=driver();
    expect(d.hold('palm',600).some(r=>r.fired)).toBe(false);
    expect(d.hold('palm',2500).filter(r=>r.fired)).toHaveLength(1);
    expect(d.hold('fist',2000).some(r=>r.fired)).toBe(false);
    d.hold('neutral',600);
    expect(d.hold('fist',1200).filter(r=>r.fired)).toHaveLength(1);
  });
  it('rejects short transitions, resets on tracking gap and ignores poses outside', () => {
    const d=driver(); d.hold('palm',800);
    for(let i=0;i<4;i++) { expect(d.hold('palm',400).some(r=>r.fired)).toBe(false); d.hold('neutral',100); }
    expect(d.c.tick([handPose('palm')],d.now+1000).fired).toBeNull();
    expect(d.hold('palm',2000,true).some(r=>r.fired)).toBe(false);
  });
  it('pauses immediately on area entry, resumes after leaving, rejects two control hands', () => {
    const d=driver(); expect(d.hold('fist',100)[0].paused).toBe(true);
    d.hold('fist',700); expect(d.hold(null,600).at(-1)?.paused).toBe(false);
    for(let t=0;t<3000;t+=100) expect(d.c.tick([handPose('palm'),handPose('palm')],t+2000).fired).toBeNull();
  });
  it('training only holds the selected target and does not lock on another command', () => {
    const c = new CommandController();
    for(let t=0;t<3000;t+=100) expect(c.tick([handPose('fist')],t,1,'palm').fired).toBeNull();
    const fired=[];
    for(let t=3000;t<4500;t+=100) {const r=c.tick([handPose('palm')],t,1,'palm');if(r.fired)fired.push(r.fired);}
    expect(fired).toEqual(['palm']);
  });
});
describe('draft and safe actions', () => {
  it('starts communication without a button; retains stable draft until send/cancel', () => {
    const c=new CommandConversation(),send=vi.fn(()=>true),end=vi.fn();
    c.act('palm',0,send,end); expect(c.communicating).toBe(true); expect(send).not.toHaveBeenCalled();
    c.offer('day'); c.offer(null); c.offer('night'); expect(c.draft).toBe('day');
    c.act('palm',1,()=>false,end); expect(c.draft).toBe('day');
    c.act('palm',2,send,end); c.act('palm',3,send,end); expect(send).toHaveBeenCalledExactlyOnceWith('day');
    c.offer('night'); c.act('fist',4,send,end); expect(c.draft).toBeNull();
  });
  it('V never ends alone; neutral and a second hold confirms or cancels, with timeout', () => {
    const c=new CommandConversation(),d=driver(),end=vi.fn(),send=vi.fn(()=>true);
    const hold=(pose: Command | 'neutral',ms:number) => d.hold(pose,ms).forEach(r => {if(r.fired)c.act(r.fired,d.now,send,end);});
    hold('v',3000); expect(c.confirmUntil).not.toBeNull(); expect(end).not.toHaveBeenCalled();
    hold('palm',2000); expect(end).not.toHaveBeenCalled();
    hold('neutral',600); hold('fist',1200); expect(c.confirmUntil).toBeNull(); expect(end).not.toHaveBeenCalled();
    hold('neutral',600); hold('v',1200); hold('neutral',600); hold('palm',1200); expect(end).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
    c.act('v',0,send,end); c.expire(12000); expect(c.confirmUntil).toBeNull();
  });
});
