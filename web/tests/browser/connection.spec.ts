import {test,expect,chromium} from '@playwright/test';

test('module integration: actual WebRTC with ICE before SDP, restart and safe diagnostics',async({baseURL})=>{
 const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const a=await browser.newPage(),b=await browser.newPage();
 try{
  await a.goto(baseURL+'/tests/parity.html');await b.goto(baseURL+'/tests/parity.html');
  const id=await a.evaluate(async()=>(await(await fetch('/api/rooms',{method:'POST'})).json()).roomId);
  for(const [page,name] of [[a,'A'],[b,'B']] as const)await page.evaluate(async({id,name})=>{
   const {CallSession}=await import('/src/callSession.ts');
   const call=new CallSession(id,name,{status:()=>{},local:()=>{},remote:()=>{},changed:()=>{},media:()=>{}});
   (window as any).__call=call;
   // Test-only signaling order perturbation. No fake SDP or ICE; all from Chromium.
   const send=(call as any).signal.bind(call);let pending:any=null,timer:any;
   (call as any).signal=(data:any)=>{
    if(data.description){pending=data;timer=setTimeout(()=>{if(pending){send(pending);pending=null;}},500);return;}
    if(data.candidate&&pending){send(data);send(pending);pending=null;clearTimeout(timer);return;}
    send(data);
   };
   await call.start();
  },{id,name});
  for(const p of [a,b])await expect.poll(()=>p.evaluate(()=>(window as any).__call.canSend),{timeout:30000}).toBe(true);
  const log=(p:typeof a)=>p.evaluate(()=>(window as any).__call.diagnostics.join('\n'));
  expect((await log(a))+(await log(b))).toContain('ICE ожидает SDP');
  for(const p of [a,b])await expect.poll(()=>log(p)).toContain('Выбранный путь:');
  await a.evaluate(async()=>{const c=(window as any).__call;await c.offer(true);});
  await expect.poll(()=>log(a)).toContain('SDP offer отправлен: ICE restart');
  await expect.poll(()=>log(b)).toContain('RemoteDescription установлен');
  await expect.poll(()=>a.evaluate(()=>(window as any).__call.pc.signalingState)).toBe('stable');
  await a.evaluate(()=>{const c=(window as any).__call;c.send('text','After ICE restart',true,'unique-restart');c.send('text','After ICE restart',true,'unique-restart');});
  await expect.poll(()=>b.evaluate(()=>(window as any).__call.conversation.entries.length)).toBe(1);
  await expect.poll(()=>a.evaluate(()=>(window as any).__call.conversation.entries[0]?.delivery)).toBe('delivered');
  expect((await log(a))+(await log(b))).not.toMatch(/candidate:|a=ice-|credential|192\.168\./);
  await a.evaluate(()=>(window as any).__call.end());
  await expect.poll(()=>b.evaluate(()=>(window as any).__call.status)).toBe('ended');
 }finally{await browser.close();}
});
