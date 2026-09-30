import {test,expect,chromium} from '@playwright/test';

test('module integration: call layout with distinct synthetic test participants and feedback states',async({baseURL})=>{
  const browser=await chromium.launch();const a=await browser.newPage(),b=await browser.newPage();
  try{
    for(const [page,name,color] of [[a,'ALICE / LOCAL','#a44524'],[b,'BOB / REMOTE','#1768a6']] as const){
      await page.addInitScript(({name,color})=>{
        // Explicit synthetic video fixture, delivered to the other browser by real WebRTC.
        (window as any).__cameraCalls=0;
        navigator.mediaDevices.getUserMedia=async()=>{
          (window as any).__cameraCalls++;
          const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d')!;
          const draw=()=>{ctx.fillStyle=color;ctx.fillRect(0,0,640,480);ctx.fillStyle='#ffe3bb';ctx.beginPath();ctx.arc(320,200,90,0,Math.PI*2);ctx.fill();ctx.fillStyle='#173740';ctx.fillRect(280,175,15,15);ctx.fillRect(345,175,15,15);ctx.fillRect(290,235,60,8);ctx.fillStyle='white';ctx.font='32px sans-serif';ctx.textAlign='center';ctx.fillText(name,320,370);ctx.font='18px sans-serif';ctx.fillText('TEST VIDEO · '+Date.now(),320,420);};
          draw();setInterval(draw,100);return c.captureStream(15);
        };
      },{name,color});
    }
    await a.route('**/src/useGesture.ts*',async route=>{
      const response=await route.fetch();let body=await response.text();
      body=body.replace('export function useGesture(', 'function actualUseGesture(');
      body+='\nexport function useGesture(...args){const value=actualUseGesture(...args);return window.__feedbackFixture ? {...value,communicating:true,draft:window.__feedbackFixture.draft ? "time" : null}:value}';
      await route.fulfill({response,body});
    });
    await a.route('**/src/feedbackState.ts*',async route=>{
      const response=await route.fetch();let body=await response.text();
      body=body.replace('export function recognitionFeedback(', 'function actualRecognitionFeedback(');
      body+='\nexport function recognitionFeedback(input){return window.__feedbackFixture ?? actualRecognitionFeedback(input)}';
      await route.fulfill({response,body});
    });
    await a.goto(baseURL!);await a.getByLabel('Твоё имя').fill('Alice');await a.getByRole('button',{name:'Начать звонок',exact:true}).last().click();
    await expect(a.getByText('Ждём собеседника',{exact:true})).toBeVisible();
    await a.getByRole('button',{name:'Пригласить',exact:true}).click();
    await b.goto(await a.getByLabel('Ссылка комнаты').inputValue());
    await a.getByRole('button',{name:'Закрыть',exact:true}).click();await b.getByLabel('Твоё имя').fill('Bob');await b.getByRole('button',{name:'Присоединиться к звонку',exact:true}).click();
    await expect(a.getByRole('status').filter({hasText:'Соединение установлено'})).toBeVisible();
    await expect.poll(()=>a.getByLabel('Видео собеседника',{exact:true}).evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBeGreaterThan(0);
    // WebRTC may adapt remote resolution; capture source and recognition input stay 640x480.
    expect(await a.getByLabel('Твоё видео',{exact:true}).evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBe(640);
    const identity=()=>a.evaluate(()=>({calls:(window as any).__cameraCalls,ids:[...document.querySelectorAll('video')].map(v=>(v.srcObject as MediaStream)?.getVideoTracks()[0]?.id)}));
    const before=await identity();
    const panel=a.getByRole('region',{name:'Состояние распознавания фраз'});
    const states={
      draft:{mode:'words',title:'Проверь и отправь',hint:'Отправь фразу или нажми «Повторить». Перед повтором убери руки из кадра на секунду.',draft:'One moment, please',prediction:{phrase:'Nice to meet you',score:.87},stability:'Совпало окон: 3 / 3',progress:{kind:'frames',value:35,max:35,label:'35 / 35 кадров'}},
      noHands:{mode:'words',title:'Покажи руку',hint:'Руки не видны. Покажи хотя бы одну руку целиком.',draft:null,prediction:null,stability:'Совпало окон: 0 / 3',progress:{kind:'frames',value:0,max:35,label:'0 / 35 кадров'}},
      uncertain:{mode:'words',title:'Попробуй ещё раз',hint:'Не удалось различить движение. Убери руки на секунду и повтори.',draft:null,prediction:{phrase:'Hello',score:.76},stability:'Совпало окон: 0 / 3',progress:{kind:'frames',value:35,max:35,label:'35 / 35 кадров'}},
      error:{mode:'error',title:'Ошибка распознавания',hint:'Кадры не поступают. Проверь камеру и вернись во вкладку.',draft:null,prediction:null,stability:null,progress:null},
      commands:{mode:'commands',title:'Вход в управление',hint:'Удерживай ладонь ещё 0,4 с. Слова приостановлены из-за области команд.',draft:null,prediction:null,stability:null,progress:{kind:'command',value:.5,max:1,label:'Вход в область команд'}},
    };
    for(const [width,height] of [[1366,768],[1440,900],[390,844]]){
      await a.setViewportSize({width,height});await a.evaluate(()=>scrollTo(0,0));
      for(const [name,state] of Object.entries(states)){
        await a.evaluate(state=>{(window as any).__feedbackFixture=state;},state);
        await expect(panel).toHaveAttribute('data-mode',state.mode);
        await a.screenshot({path:`../.impeccable/review/layout-${width}-${name}.png`});
        const own=await a.locator('.self-viewport').boundingBox(),remote=await a.locator('.remote-viewport').boundingBox(),feedback=await panel.boundingBox();
        expect(own!.width).toBeLessThanOrEqual(width===390?130:220);
        if(width>390)expect(own!.width).toBeLessThanOrEqual(remote!.width*.25+1);
        if(width===390)expect(feedback!.y).toBeGreaterThanOrEqual(remote!.y+remote!.height);
        else expect(feedback!.x).toBeGreaterThanOrEqual(remote!.x+remote!.width);
        expect(feedback!.y+feedback!.height).toBeLessThanOrEqual(height);
        const controls=await a.locator('.call-controls').boundingBox();expect(controls!.y+controls!.height).toBeLessThanOrEqual(height);
        expect(await a.getByLabel('Видео собеседника',{exact:true}).evaluate(v=>getComputedStyle(v).objectFit)).toBe('contain');
        expect(await a.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await a.screenshot({path:`../.impeccable/review/layout-${width}-${name}.png`});
      }
      await a.getByRole('button',{name:'Увеличить превью',exact:true}).click();
      expect(await identity()).toEqual(before);
      const alignment=await a.locator('.self-viewport').evaluate(el=>{
        const v=el.querySelector('video')!,c=el.querySelector('canvas')!;
        const vr=v.getBoundingClientRect(),cr=c.getBoundingClientRect();
        return {same:vr.x===cr.x&&vr.y===cr.y&&vr.width===cr.width&&vr.height===cr.height,video:getComputedStyle(v).transform,canvas:getComputedStyle(c).transform};
      });
      const expanded=await a.locator('.self-viewport').boundingBox(),stage=await a.locator('.remote-viewport').boundingBox();
      expect(expanded!.y+expanded!.height).toBeLessThanOrEqual(stage!.y+stage!.height);
      await a.screenshot({path:`../.impeccable/review/layout-${width}-expanded.png`});
      expect(alignment.same).toBe(true);expect(alignment.video).toBe(alignment.canvas);
      await a.getByRole('button',{name:'Уменьшить превью',exact:true}).click();expect(await identity()).toEqual(before);
    }
    await b.getByRole('button',{name:'Написать сообщение',exact:true}).click();
    await b.getByLabel('Написать или исправить сообщение').fill('This is a longer caption from Bob. Please give me one moment while I explain the next part of our conversation. '.repeat(3));
    await b.getByRole('button',{name:'Отправить текст',exact:true}).click();
    await b.getByRole('button',{name:'Закрыть',exact:true}).click();
    await expect(a.locator('.subtitles p')).toContainText('This is a longer caption from Bob.');
    for(const [width,height] of [[1366,768],[1440,900],[390,844]]){
      await a.setViewportSize({width,height});await a.evaluate(state=>{(window as any).__feedbackFixture=state;scrollTo(0,0);},states.draft);
      await expect(panel).toHaveAttribute('data-mode','words');
      await a.screenshot({path:`../.impeccable/review/layout-${width}-long-caption.png`});
      const sub=await a.locator('.subtitles').boundingBox(),remote=await a.locator('.remote-viewport').boundingBox();
      expect(sub!.y).toBeGreaterThanOrEqual(remote!.y+remote!.height);
      expect((await panel.boundingBox())!.y+(await panel.boundingBox())!.height).toBeLessThanOrEqual(height);
      const controls=await a.locator('.call-controls').boundingBox();expect(controls!.y+controls!.height).toBeLessThanOrEqual(height);
    }
    // Blue is the remote Bob stream, orange is Alice's own preview.
    const pixels=await a.evaluate(()=>[...document.querySelectorAll('video')].map(v=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d')!;ctx.drawImage(v,0,0);return [...ctx.getImageData(10,10,1,1).data];}));
    expect(pixels[0][2]).toBeGreaterThan(pixels[0][0]);expect(pixels[1][0]).toBeGreaterThan(pixels[1][2]);
  }finally{await browser.close();}
});
