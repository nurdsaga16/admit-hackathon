import { getPhrase, phraseExplanation } from './phraseMapping';
import { useEffect, useRef, useState } from 'react';
import './examples.css';

type RecordedPoint = [string, number, number, number, number, number];
type RecordInfo = {id:number;label:string;file:string;duration:number|null;frames:number;blocks:number;invalidBlocks:number;handIds:number[]};
type Catalog = {source:string;sha256:string;labels:string[];records:RecordInfo[]};
type Recording = {record:RecordInfo;frames:{index:number;blocks:(RecordedPoint[]|null)[]}[]};
const handEdges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const poseEdges = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[12,14],[14,16],[15,17],[15,19],[15,21],[16,18],[16,20],[16,22]];
export default function DatasetExamples({embedded=false}: {embedded?:boolean}) {
  const [catalog,setCatalog] = useState<Catalog|null>(null), [recording,setRecording] = useState<Recording|null>(null);
  const [label,setLabel] = useState(''), [recordId,setRecordId] = useState(0), [frame,setFrame] = useState(0), [block,setBlock] = useState(0);
  const [playing,setPlaying] = useState(false), [mirror,setMirror] = useState(false), [fps,setFps] = useState(15);
  const [error,setError] = useState(''), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}dataset-examples/index.json`,{signal:abort.signal}).then(async r => {if(!r.ok) throw Error(); return r.json();}).then((data:Catalog) => {
      setCatalog(data);setLabel(data.labels[0]);setRecordId(data.records[0]?.id ?? 0);
    }).catch(e => {if(e.name !== 'AbortError')setError('Локальные примеры не подготовлены. Выполни экспорт датасета по инструкции в README.');});
    return () => abort.abort();
  },[]);
  useEffect(() => {
    if(!recordId)return;
    const abort = new AbortController(); setPlaying(false);setRecording(null);setFrame(0);setBlock(0);setError('');
    fetch(`${import.meta.env.BASE_URL}dataset-examples/${recordId}.json`,{signal:abort.signal}).then(async r => {if(!r.ok)throw Error();return r.json();}).then(setRecording)
      .catch(e => {if(e.name !== 'AbortError')setError('Не удалось прочитать запись. Повтори экспорт и обнови страницу.');});
    return () => abort.abort();
  },[recordId]);
  useEffect(() => {
    if(!playing || !recording?.frames.length)return;
    // Samples per second is a viewing setting, not an asserted source frame rate.
    const timer = window.setInterval(() => setFrame(i => (i+1)%recording.frames.length),1000/fps);
    return () => clearInterval(timer);
  },[playing,recording,fps]);
  useEffect(() => {
    const ctx=canvas.current?.getContext('2d');if(!ctx)return;
    const size=640;ctx.fillStyle='#102b35';ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='#29444e';ctx.lineWidth=1;
    for(let n=0;n<=size;n+=64){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,size);ctx.moveTo(0,n);ctx.lineTo(size,n);ctx.stroke();}
    const points=recording?.frames[frame]?.blocks[block];
    if(!points)return;
    const groups=new Map<string,RecordedPoint[]>();
    for(const p of points){const key=`${p[0]}:${p[1]}`;groups.set(key,[...(groups.get(key)??[]),p]);}
    for(const group of groups.values()){
      const kind=group[0][0],hand=group[0][1],color=kind==='pose'?'#ffc76a':hand===0?'#71efd0':hand===1?'#a9b6ff':'#ff96c5';
      const xy=(p:RecordedPoint) => [(mirror?1-p[3]:p[3])*size,p[4]*size];
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
      for(const [a,b] of kind==='hand'?handEdges:poseEdges){const p=group.find(p=>p[2]===a),q=group.find(p=>p[2]===b);if(!p||!q)continue;const [x,y]=xy(p),[u,v]=xy(q);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(u,v);ctx.stroke();}
      for(const p of group){const [x,y]=xy(p);ctx.beginPath();ctx.arc(x,y,kind==='hand'?3:4,0,2*Math.PI);ctx.fill();}
    }
  },[recording,frame,block,mirror]);
  const current=recording?.frames[frame], points=current?.blocks[block];
  if(embedded) return <section className="embedded-examples">
    <h2>Примеры движений</h2><p>Записанные точки датасета, не проверенная инструкция жестового языка.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!catalog && !error && <p role="status">Загрузка примеров…</p>}
    {catalog && <><label>Выбери фразу<select aria-label="Фраза для примера" value={label} onChange={e=>{setLabel(e.target.value);setRecordId(catalog.records.find(r=>r.label===e.target.value)?.id??0);}}>{catalog.labels.map(l=><option key={l} value={l}>{getPhrase(l)} — класс {l}</option>)}</select></label><p>Покажи это движение, чтобы отправить фразу «{getPhrase(label)}».</p>
    <canvas ref={canvas} width={640} height={640} aria-label="Записанные точки датасета"/>
    {!recording && !error && <p role="status">Загрузка координат…</p>}
    {recording && <><div className="example-buttons"><button onClick={()=>setPlaying(v=>!v)}>{playing?'Пауза':'Воспроизвести'}</button><button onClick={()=>{setPlaying(false);setFrame(0);}}>В начало</button></div><label>Кадр записи<input aria-label="Кадр записи" type="range" min={0} max={Math.max(0,recording.frames.length-1)} value={frame} onChange={e=>{setPlaying(false);setFrame(+e.target.value);}}/></label>{!points && <p>В этом кадре нет однозначного набора точек. Выбери другую запись или блок.</p>}</>}
    <details><summary>Ориентация, запись и ограничения</summary><p>Зеркальность исходной съёмки, язык жестов и FPS не подтверждены. X направлен вправо, Y вниз. Пропорции кадра не восстановлены. Скорость просмотра условная: {fps} записанных кадров/с.</p><label><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/>Отразить отображение по горизонтали</label><p>{mirror?'Отражение включено: X = 1 − X базы.':'Без дополнительного отражения: X как в базе.'}</p><label>Запись<select aria-label="Запись" value={recordId} onChange={e=>setRecordId(+e.target.value)}>{catalog.records.filter(r=>r.label===label).map(r=><option key={r.id} value={r.id}>#{r.id} · {r.file}</option>)}</select></label>{recording && <label>Блок наблюдений<select value={block} onChange={e=>setBlock(+e.target.value)}>{Array.from({length:recording.record.blocks},(_,i)=><option value={i} key={i}>Блок {i+1}</option>)}</select></label>}<p>Исходные видео недоступны. Пропущенные точки не дорисовываются. Жёлтый — тело; зелёный — hand 0; сиреневый — hand 1. Эти номера не определяют анатомическую сторону.</p><a href={catalog.source} target="_blank" rel="noreferrer">Источник данных</a></details></>}
  </section>;
  return <main className={`examples-page${embedded ? ' embedded' : ''}`} >{!embedded && <header><a className="brand" href="./">SignBridge</a><a href="./">Начать звонок</a></header>}
    <section className="intro"><p className="eyebrow">ЗАПИСАННЫЕ ДАННЫЕ</p><h1>Примеры движений</h1><p>Визуализация landmarks датасета. Это не полноценная инструкция по жестовому языку и не результат распознавания камеры.</p></section>
    <section className="card"><p>{phraseExplanation}</p><p><strong>Ограничения записи:</strong> исходные видео недоступны по путям в базе. Язык жестов, зеркальность камеры, FPS и пропорции кадра не подтверждены. Сохранены 21 точка кисти и точки тела 0–22; ног и подробной мимики нет.</p><p>Повторные проходы разделены по порядку строк и окончанию набора точек тела. Номер блока не доказывает, что это оригинал или зеркальная версия. Не смешиваем блоки и не дорисовываем отсутствующие точки.</p></section>
    {error && <p role="alert" className="error">{error}</p>}
    {!catalog && !error && <p role="status">Загрузка списка записей…</p>}
    {catalog && <div className="examples-grid"><section className="card">
      <label>Слово<select aria-label="Слово" value={label} onChange={e=>{setLabel(e.target.value);setRecordId(catalog.records.find(r=>r.label===e.target.value)?.id??0);}}>{catalog.labels.map(l=><option key={l} value={l}>{getPhrase(l)} — класс {l}</option>)}</select></label>
      <label>Запись<select aria-label="Запись" value={recordId} onChange={e=>setRecordId(+e.target.value)}>{catalog.records.filter(r=>r.label===label).map(r=><option key={r.id} value={r.id}>#{r.id} · {r.file}</option>)}</select></label>
      {recording && <><label>Блок наблюдений<select aria-label="Блок наблюдений" value={block} onChange={e=>setBlock(+e.target.value)}>{Array.from({length:recording.record.blocks},(_,i)=><option key={i} value={i}>Блок {i+1} по порядку id</option>)}</select></label>
      <p>Запись #{recording.record.id}: {recording.record.frames} кадров с точками. Длительность в базе: {recording.record.duration?.toFixed(2)??'не указана'} с. Это не подтверждает скорость воспроизведения.</p>
      <p>Идентификаторы кистей: {recording.record.handIds.join(', ')}. Они не определяют анатомическую левую/правую руку. Неоднозначных/неполных блоков: {recording.record.invalidBlocks}.</p></>}
      <label className="mirror-choice"><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/>Отразить отображение по горизонтали</label>
      <p>{mirror?'Отражение включено: экранный X = 1 − X базы.':'Без дополнительного отражения: X как в базе.'} Зеркальность исходной съёмки неизвестна.</p>
      <label>Скорость просмотра: {fps} записанных кадров/с<input aria-label="Скорость просмотра" type="range" min={2} max={30} value={fps} onChange={e=>setFps(+e.target.value)}/></label>
      <p>Скорость условная. Кадры проигрываются по порядку без интерполяции; пропущенные исходные кадры не восстанавливаются.</p>
      <a href={catalog.source} target="_blank" rel="noreferrer">Источник: датасет Kaggle</a>
    </section><section className="card">
      <h2>{getPhrase(label)} — класс {label} · запись #{recordId}</h2><p>Покажи это движение, чтобы отправить фразу «{getPhrase(label)}».</p><p>Нормированные XY: X → вправо, Y ↓ вниз, начало — слева сверху. Пропорции изображения не восстановлены. Z сохранён в файлах, на плоскости не отображается.</p>
      <canvas ref={canvas} width={640} height={640} aria-label="Записанные точки датасета"/>
      {!recording && !error && <p role="status">Загрузка координат…</p>}
      {recording && <><div className="example-buttons"><button disabled={!recording.frames.length} onClick={()=>setPlaying(v=>!v)}>{playing?'Пауза':'Воспроизвести'}</button><button onClick={()=>{setPlaying(false);setFrame(0);}}>В начало</button></div>
      <label>Кадр записи<input aria-label="Кадр записи" type="range" min={0} max={Math.max(0,recording.frames.length-1)} value={frame} onChange={e=>{setPlaying(false);setFrame(+e.target.value);}}/></label>
      <p data-testid="frame-description">{frame+1}/{recording.frames.length} · исходный frame_index: {current?.index} · блок {block+1}</p>
      <p>{!points?'Для этого кадра блок отсутствует или неоднозначен. Точки не восстановлены.':`Записано точек: ${points.length}; кисти: ${new Set(points.filter(p=>p[0]==='hand').map(p=>p[1])).size}.`}</p></>}
      <p>Жёлтый — тело; зелёный — hand 0; сиреневый — hand 1; розовый — прочие идентификаторы.</p>
    </section></div>}
  </main>;
}
