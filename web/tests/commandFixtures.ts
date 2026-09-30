// Synthetic landmarks for geometry/state tests, not recordings or accuracy evidence.
import type { Point } from '../src/core';
import type { Command } from '../src/commands';
export function handPose(command: Command | 'neutral', inside = true): Point[] {
  const p: Point[] = Array.from({length:21}, () => ({x:.25,y:.65,z:0}));
  p[0] = {x:.25,y:.75,z:0};
  for (let finger = 0; finger < 4; finger++) {
    const b = 5+finger*4, x = .18+finger*.045;
    const extended = command === 'palm' || command === 'v' && finger < 2 || command === 'neutral' && finger === 0;
    const dx = command === 'v' ? (finger === 0 ? -.04 : finger === 1 ? .04 : 0) : 0;
    p[b] = {x,y:.58,z:0}; p[b+1] = {x:x+dx*.4,y:.49,z:0};
    p[b+2] = extended ? {x:x+dx*.7,y:.42,z:0} : {x,y:.55,z:.02};
    p[b+3] = extended ? {x:x+dx,y:.35,z:0} : {x,y:.63,z:.01};
  }
  if (command === 'palm') {
    p[1]={x:.20,y:.67,z:0};p[2]={x:.15,y:.62,z:0};p[3]={x:.10,y:.57,z:0};p[4]={x:.05,y:.52,z:0};
  } else {
    p[1]={x:.20,y:.67,z:0};p[2]={x:.16,y:.63,z:0};p[3]={x:.17,y:.59,z:0};p[4]={x:.21,y:.58,z:0};
  }
  return p.map(p => ({...p,x:p.x+(inside ? 0 : .5),y:p.y-.25}));
}
