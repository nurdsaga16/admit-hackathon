import { test, expect, chromium } from '@playwright/test';

test('module integration: local synthetic class renders assigned draft, diagnostic and history', async ({baseURL}) => {
  const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try {
    const page=await browser.newPage();await page.goto(baseURL+'/tests/local.html');
    await page.evaluate(async()=>{
      // Synthetic input only in this test. Class IDs stay in the real stabilization pipeline.
      const url=(name:string)=>performance.getEntriesByType('resource').map(e=>e.name).findLast(u=>u.includes('/src/'+name+'.ts'))!;
      const {Tracker}=await import(url('camera')), {GestureModel}=await import(url('model'));
      Tracker.prototype.detect=()=>({hand_0:Array.from({length:5},()=>({x:.5,y:.5,z:0})),hand_1:[],pose:Array.from({length:6},()=>({x:.5,y:.5,z:0,visibility:1}))});
      GestureModel.prototype.predict=async function(){return this.meta.labels.map(id=>id==='afternoon'?.99:.001);};
    });
    await page.getByRole('button',{name:'Включить камеру',exact:true}).click();
    await expect(page.locator('.phrase')).toHaveText('How are you?',{timeout:20000});
    await expect(page.locator('.rank').first()).toContainText('How are you? — класс afternoon');
    await expect(page.locator('.vocabulary')).toContainText('Hello — класс person');
    await page.getByRole('button',{name:'Подтвердить слово',exact:true}).click();
    await expect(page.locator('.history li span')).toHaveText('How are you?');
    await page.waitForTimeout(1200);
    await expect(page.locator('.history li')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'Подтвердить слово',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Остановить',exact:true}).click();
  } finally {await browser.close();}
});

test('module integration: synthetic command landmarks drive real call without gesture buttons', async ({baseURL}) => {
  const browser = await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const a = await browser.newPage(), b = await browser.newPage();
  try {
    await a.goto(baseURL!);
    // Test-only substitutions. The production app has no fixture inputs or debug globals.
    await a.evaluate(async () => {
      const moduleUrl = (name: string) => performance.getEntriesByType('resource').map(e=>e.name).findLast(url=>url.includes('/src/'+name+'.ts'))!;
      const {Tracker} = await import(moduleUrl('camera'));
      const {GestureModel} = await import(moduleUrl('model'));
      const {handPose} = await import('/tests/commandFixtures.ts');
      const w = window as any; w.__pose = null; w.__predictions = 0;
      Tracker.prototype.detect = function(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
        canvas.width=video.videoWidth; canvas.height=video.videoHeight;
        const pose = w.__pose;
        w.__detected = (w.__detected ?? 0)+1; this.fullHands = pose ? [handPose(pose === 'word' ? 'neutral' : pose, pose !== 'word').map(p => ({...p,x:p.x/(video.videoWidth/video.videoHeight)}))] : [];
        w.__hand = this.fullHands; return {hand_0:this.fullHands[0]?.filter((_:unknown,i:number) => [4,8,12,16,20].includes(i)) ?? [],hand_1:[],pose:Array.from({length:6},()=>({x:.5,y:.5,z:0,visibility:1}))};
      };
      GestureModel.prototype.predict = async function() { w.__predictions++; return this.meta.labels.map(word => word === 'day' ? (w.__score ?? .99) : .001); };
    });
    await a.getByRole('button',{name:'Начать звонок',exact:true}).first().click(); await a.locator('.entry-submit').click();
    await expect(a.getByText('Ждём собеседника',{exact:true})).toBeVisible();

    await b.goto(await a.getByLabel('Ссылка комнаты').inputValue());

    await b.getByRole('button',{name:'Присоединиться к звонку',exact:true}).click();
    await expect(a.getByRole('status').filter({hasText:'Соединение установлено'})).toBeVisible();
    const pose = async (value: string | null) => { await a.evaluate(value => { (window as any).__pose=value; },value); };
    await pose('palm');
    await expect(a.getByRole('button',{name:'Выключить жесты',exact:true})).toBeVisible({timeout:30000});
    const hud=a.getByRole('region',{name:'Состояние распознавания фраз'});
    await pose(null);
    await expect(hud.locator('.recognition-hint')).toContainText('Руки не видны');
    await expect(hud).toHaveCount(1);
    await a.evaluate(()=>{(window as any).__score=.76;});
    await pose('word');
    await expect(hud.locator('.recognition-progress')).toHaveAttribute('data-kind','frames');
    await a.getByRole('button',{name:'Диагностика',exact:true}).click();
    await expect(a.getByRole('dialog')).toContainText('/ 35 кадров');
    await expect(a.getByRole('dialog')).toContainText('76.0%',{timeout:15000});
    await expect(a.getByRole('dialog')).toContainText('Оценка ниже порога');
    await expect(hud.locator('.saved-draft')).toHaveCount(0);
    await a.evaluate(()=>{(window as any).__score=.99;});
    await expect(a.getByRole('dialog').locator('.stability-count')).toHaveText('Совпало окон: 1 / 3');
    await expect(a.locator('.draft')).toHaveText('Thank you',{timeout:15000});
    await a.keyboard.press('Escape');
    await a.getByRole('button',{name:'Выключить камеру',exact:true}).click();
    await expect(a.locator('.draft')).toHaveText('Thank you');
    await a.getByRole('button',{name:'Включить камеру',exact:true}).click();
    await expect(a.locator('.draft')).toHaveText('Thank you');
    await a.setViewportSize({width:390,height:844});
    await expect(hud.locator('.saved-draft')).toContainText('Thank you');
    const boxes=[await hud.boundingBox(),await a.locator('.self-viewport').boundingBox(),await a.locator('.subtitles').count()?await a.locator('.subtitles').boundingBox():null];
    const [h,self,sub]=boxes;

    const overlaps=(a:any,b:any)=>a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
    expect(overlaps(h,self)).toBe(false);if(sub)expect(overlaps(h,sub)).toBe(false);
    expect(await a.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await a.screenshot({path:'test-results/feedback-mobile.png',fullPage:true});
    await a.setViewportSize({width:1280,height:720});
    await pose('neutral');
    await expect(hud.locator('.recognition-hint')).toContainText('Слова приостановлены');
    await expect(hud.locator('.recognition-progress')).toHaveAttribute('data-kind','command');
    await expect(hud).toHaveCount(1);
    const count = await a.evaluate(() => (window as any).__predictions);
    await a.waitForTimeout(1000);
    expect(await a.evaluate(() => (window as any).__predictions)).toBe(count);
    await expect(a.locator('.draft')).toHaveText('Thank you');
    await pose('palm');
    await expect(b.locator('.conversation li')).toHaveCount(1);
    for (const page of [a,b]) await expect(page.locator('.conversation li p')).toHaveText('Thank you');
    await expect(a.locator('.conversation li')).toContainText('Доставлено');
    await expect(b.locator('.subtitles p')).toHaveText('Thank you');
    await a.waitForTimeout(1300); await expect(b.locator('.conversation li')).toHaveCount(1);
    await pose(null); await a.waitForTimeout(1100); await pose('word');
    await a.waitForTimeout(700); expect(await a.evaluate(() => (window as any).__predictions)).toBe(count);
    await expect(a.locator('.draft')).toHaveText('Thank you',{timeout:15000});
    await pose('fist'); await expect(a.locator('.draft')).toHaveCount(0);
    await expect(b.locator('.conversation li')).toHaveCount(1);
    await pose('neutral'); await a.waitForTimeout(700); await pose('v');
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toBeVisible();
    await pose('palm'); await a.waitForTimeout(1400);
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toBeVisible();
    await pose('neutral'); await a.waitForTimeout(700); await pose('fist');
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toHaveCount(0);
    await pose('neutral'); await a.waitForTimeout(700); await pose('v');
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toBeVisible();
    await pose('neutral'); await a.waitForTimeout(700); await pose('palm');
    for (const page of [a,b]) await expect(page.getByRole('heading',{name:'История разговора'})).toBeVisible();
  } catch(error) { console.log('COMMAND_DIAGNOSTIC',await a.evaluate(async()=>({text:document.body.innerText,hand:(window as any).__hand,detected:(window as any).__detected,measure:(await import('/src/commands.ts')).measureHand((window as any).__hand?.[0] ?? [],4/3)}))); throw error; } finally { await browser.close(); }
});
