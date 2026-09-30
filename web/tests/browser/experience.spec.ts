import {test,expect,chromium} from '@playwright/test';

test('guided voice reply, invitation and in-call panels preserve the session',async({baseURL})=>{
 const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const a=await browser.newPage(),b=await browser.newPage();a.setDefaultTimeout(10000);b.setDefaultTimeout(10000);
 try {
  for(const p of [a,b])await p.addInitScript(()=>{
   (window as any).__streams=[];
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async c=>{const s=await original(c);(window as any).__streams.push(s);return s;};
   class TestSpeech {onstart?:()=>void;onend?:()=>void;onresult?:(e:any)=>void;constructor(){(window as any).__speech=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){}}
   (window as any).SpeechRecognition=TestSpeech;
  });
  await a.goto(baseURL!);
  for(const [width,height] of [[1366,768],[1440,900],[390,844]]){await a.setViewportSize({width,height});await a.screenshot({path:`../.impeccable/review/home-${width}.png`,fullPage:true});}
  await a.getByRole('button',{name:'Начать звонок',exact:true}).first().click(); await a.locator('.entry-submit').click();
  await expect(a.getByText('Ждём собеседника',{exact:true})).toBeVisible();
  for(const [width,height] of [[1366,768],[1440,900],[390,844]]){await a.setViewportSize({width,height});await a.screenshot({path:`../.impeccable/review/waiting-${width}.png`,fullPage:true});}

  const link=await a.getByLabel('Ссылка комнаты').inputValue();

  await b.goto(link);await expect(b.getByLabel('Ссылка или код комнаты')).toHaveCount(0);
  await b.getByRole('dialog').getByRole('button',{name:/Голосом/}).click();await b.getByRole('button',{name:'Присоединиться к звонку'}).click();
  await expect(b.getByRole('status').filter({hasText:'Соединение установлено'})).toBeVisible();
  expect(await b.evaluate(()=>(window as any).__streams.length)).toBe(1);
  await b.getByRole('button',{name:'Начать говорить с субтитрами'}).click();
  await expect(b.getByRole('status').filter({hasText:'Слушаю английскую речь'})).toBeVisible();
  expect(await b.evaluate(()=>(window as any).__streams.length)).toBe(2);
  await expect(b.getByLabel('Видео собеседника',{exact:true})).toHaveJSProperty('muted',true);
  await b.evaluate(()=>{for(let i=0;i<2;i++)(window as any).__speech.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'Hello from voice'}}]});});
  await expect(a.locator('.subtitles p')).toHaveText('Hello from voice');await expect(a.locator('.conversation li')).toHaveCount(1);
  await b.getByRole('button',{name:'Остановить субтитры'}).first().click();await expect(b.getByLabel('Видео собеседника',{exact:true})).toHaveJSProperty('muted',false);
  const ids=()=>a.evaluate(()=>({streams:(window as any).__streams.length,track:(document.querySelector('video[aria-label="Твоё видео"]') as HTMLVideoElement).srcObject instanceof MediaStream ? ((document.querySelector('video[aria-label="Твоё видео"]') as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].id:null}));
  const before=await ids();
  for(const label of ['Помощь']){
   await a.getByRole('button',{name:label,exact:true}).click();await expect(a.getByRole('dialog')).toBeVisible();
   if(label==='Помощь'){await expect(a.getByRole('heading',{name:'Примеры движений'})).toBeVisible();await a.screenshot({path:'../.impeccable/review/help-mobile.png',fullPage:true});}
   await a.keyboard.press('Escape');await expect(a.getByRole('dialog')).not.toBeVisible();expect(await ids()).toEqual(before);
   await expect(a.getByRole('button',{name:label,exact:true})).toBeFocused();
  }
  await a.getByRole('button',{name:'Помощь',exact:true}).click();await a.getByRole('button',{name:'Открыть техническую диагностику'}).click();await expect(a.getByRole('dialog',{name:'Диагностика'})).toBeVisible();await a.keyboard.press('Escape');expect(await ids()).toEqual(before);
  await a.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  expect(await a.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await a.getByRole('button',{name:'Завершить звонок'}).click();for(const p of [a,b]){await expect(p.getByRole('heading',{name:'История разговора'})).toBeVisible();expect(await p.evaluate(()=>(window as any).__streams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);}
 }catch(e){console.log('EXPERIENCE_STATE',await a.locator('body').innerText(),await b.locator('body').innerText());throw e;}finally{await browser.close();}
});
