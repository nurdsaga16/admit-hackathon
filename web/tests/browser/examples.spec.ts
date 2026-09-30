import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('recorded dataset examples: all classes, selection, playback, gaps and reflection', async ({page}) => {
  test.skip(!existsSync(fileURLToPath(new URL('../../public/dataset-examples/index.json', import.meta.url))), 'Prepare the real dataset using scripts/export_dataset_examples.py');
  await page.goto('/?mode=examples');
  await expect(page.getByRole('heading',{name:'Примеры движений'})).toBeVisible();
  const catalog = await page.evaluate(async()=> (await fetch('/dataset-examples/index.json')).json());
  expect(catalog.records).toHaveLength(33);
  for(const label of catalog.labels){
    await page.getByLabel('Слово',{exact:true}).selectOption(label);
    await expect(page.getByRole('heading',{name:new RegExp('^'+label+' · запись')})).toBeVisible();
    await expect(page.getByLabel('Запись',{exact:true}).locator('option')).toHaveCount(3);
  }
  await page.getByLabel('Слово',{exact:true}).selectOption('afternoon');
  await expect(page.getByTestId('frame-description')).toContainText('frame_index: 2');
  await page.getByLabel('Блок наблюдений').selectOption('3');
  await expect(page.getByText('Для этого кадра блок отсутствует или неоднозначен. Точки не восстановлены.')).toBeVisible();
  await page.getByLabel('Блок наблюдений').selectOption('0');
  const before=await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());
  await page.getByLabel('Отразить отображение по горизонтали').check();
  await expect(page.getByText('Отражение включено:',{exact:false})).toBeVisible();
  await expect.poll(()=>page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL())).not.toBe(before);
  await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();
  await expect.poll(()=>page.getByLabel('Кадр записи',{exact:true}).inputValue()).not.toBe('0');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  await page.getByRole('button',{name:'В начало',exact:true}).click();
  await expect(page.getByLabel('Кадр записи',{exact:true})).toHaveValue('0');
  await page.getByLabel('Запись',{exact:true}).selectOption('2');
  await expect(page.getByRole('heading',{name:'afternoon · запись #2'})).toBeVisible();
  await page.getByLabel('Кадр записи',{exact:true}).press('ArrowRight');
  await expect(page.getByTestId('frame-description')).toContainText('2/59');
  await page.screenshot({path:'test-results/dataset-examples.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('missing local dataset gives preparation instructions without fake examples', async ({page}) => {
  await page.route('**/dataset-examples/index.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('/?mode=examples');
  await expect(page.getByRole('alert')).toContainText('Локальные примеры не подготовлены');
  await expect(page.locator('canvas')).toHaveCount(0);
});
