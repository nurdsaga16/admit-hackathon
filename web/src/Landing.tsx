import {useState} from 'react';
import {BrandLogo,useViewport} from './design';
import './landing.css';
const FAQ = [
 ["Нужно ли устанавливать приложение?","Нет. SignBridge работает в браузере на компьютере и телефоне."],
 ["Как пригласить человека?","Создайте звонок и отправьте ссылку комнаты любым удобным способом. Собеседник откроет её и укажет имя."],
 ["Сколько участников может быть в звонке?","Два: вы и ваш собеседник."],
 ["На каком языке голосовые субтитры?","На английском. Готовые фразы по движениям тоже на английском, интерфейс — на русском."],
 ["Это полноценный переводчик жестового языка?","Нет. Прототип использует 11 заданных движений, за каждым закреплена готовая фраза."],
 ["Как обрабатываются данные?","Движения распознаются в браузере. Сервис распознавания речи может получать звук. История разговора не сохраняется на сервере."]
];
export default function Landing({openCreate,openJoin}:{openCreate:()=>void;openJoin:()=>void}) {
 const {mobile,wide}=useViewport();const [faq,setFaq]=useState(0);
 const faqs=FAQ.map(([q,a],i)=>({q,a,open:faq===i,exp:faq===i,icon:faq===i?'remove':'add',toggle:()=>setFaq(faq===i?-1:i)}));
 const goHow=()=>document.getElementById('how')?.scrollIntoView({behavior:'smooth'}),goFeatures=()=>document.getElementById('features')?.scrollIntoView({behavior:'smooth'}),goFaq=()=>document.getElementById('faq')?.scrollIntoView({behavior:'smooth'});
 return <div className="reference-landing"><div >
<header className="landing-0">
<div className="landing-1">
<BrandLogo large />
{wide && <>
<nav aria-label="Разделы" className="landing-2">
<button onClick={goHow} className="landing-3">Как работает</button>
<button onClick={goFeatures} className="landing-5">Возможности</button>
<button onClick={goFaq} className="landing-7">Вопросы</button>
</nav>
</>}
<div className="landing-9">
{!mobile && <>
<button onClick={openJoin} className="landing-10">Присоединиться</button>
</>}
<button onClick={openCreate} className="landing-12">Начать звонок</button>
</div>
</div>
</header>
<section className="landing-14">
<div >
<p className="landing-15">Видеозвонок на двоих в браузере</p>
<h1 className="landing-16">Общайтесь голосом и жестами</h1>
<p className="landing-17">Видеозвонок с готовыми фразами по движениям и субтитрами английской речи. Без установки приложения.</p>
<div className="landing-18">
<button onClick={openCreate} className="landing-19"><span aria-hidden="true" className="landing-21">videocam</span>Начать звонок</button>
<button onClick={openJoin} className="landing-22"><span aria-hidden="true" className="landing-24">link</span>Присоединиться</button>
</div>
<p className="landing-25">Камера запрашивается только после создания или подключения к звонку.</p>
</div>
<div aria-label="Пример интерфейса звонка" className="landing-26">
<div className="landing-27">Пример интерфейса · не настоящий звонок</div>
<div className="landing-28">
<div className="landing-29">А</div>
<div className="landing-30">Анна</div>
<div className="landing-31">
<div className="landing-32">М</div>
<div className="landing-33">Максим · Вы</div>
</div>
<div className="landing-34">
<div className="landing-35">Анна · Речь</div>
<div className="landing-36">How are you?</div>
</div>
</div>
<div className="landing-37">
<div className="landing-38">Чат</div>
<div className="landing-39">
<div className="landing-40">Вы · Жест</div>
<div className="landing-41">Hello</div>
<div className="landing-42">Доставлено</div>
</div>
<div className="landing-43">
<div className="landing-44">Анна · Речь</div>
<div className="landing-45">How are you?</div>
</div>
<div className="landing-46">
<div className="landing-47">Твоя фраза · готова</div>
<div className="landing-48">I'm fine</div>
</div>
</div>
</div>
</section>
<section id="how" className="landing-49">
<div className="landing-50">
<h2 className="landing-51">Как это работает</h2>
<ol className="landing-52">
<li className="landing-53"><div className="landing-54">Шаг 1</div><p className="landing-55">Создайте звонок и отправьте ссылку</p><p className="landing-56">Собеседник откроет её в браузере. Регистрация не нужна.</p></li>
<li className="landing-57"><div className="landing-58">Шаг 2</div><p className="landing-59">Показывайте движения или говорите</p><p className="landing-60">Движение превращается в готовую фразу, а речь — в английские субтитры.</p></li>
<li className="landing-61"><div className="landing-62">Шаг 3</div><p className="landing-63">Читайте фразы и субтитры во время разговора</p><p className="landing-64">Всё сказанное остаётся в чате рядом с видео.</p></li>
</ol>
</div>
</section>
<section id="features" className="landing-65">
<div className="landing-66">
<h2 className="landing-67">Два способа сказать, один способ понять</h2>
<p className="landing-68">Отвечайте движением, голосом или текстом и меняйте способ в любой момент. Собеседник читает всё в одном месте.</p>
<div className="landing-69">
<div className="landing-70">
<div className="landing-71"><span aria-hidden="true" className="landing-72">back_hand</span>Движение<span aria-hidden="true" className="landing-73">arrow_forward</span>готовая фраза</div>
<div className="landing-74">
<div className="landing-75">Фраза готова</div>
<div className="landing-76">Hello</div>
</div>
<p className="landing-77">11 заданных движений, у каждого — своя английская фраза. Вы подтверждаете отправку.</p>
</div>
<div className="landing-78">
<div className="landing-79"><span aria-hidden="true" className="landing-80">mic</span>Голос<span aria-hidden="true" className="landing-81">arrow_forward</span>субтитры</div>
<div className="landing-82">
<div className="landing-83"><div className="landing-84">Анна · Речь</div><div className="landing-85">How are you?</div></div>
</div>
<p className="landing-86">Английская речь появляется субтитрами поверх видео говорящего.</p>
</div>
<div className="landing-87">
<div className="landing-88"><span aria-hidden="true" className="landing-89">keyboard</span>Текст<span aria-hidden="true" className="landing-90">arrow_forward</span>сообщение</div>
<div className="landing-91">
<div className="landing-92"><div className="landing-93">Анна · Текст · 14:02</div><div className="landing-94">See you on Thursday</div></div>
</div>
<p className="landing-95">Чат открыт на протяжении всего звонка — для уточнений, имён и адресов.</p>
</div>
</div>
<div className="landing-96">
<div >
<h2 className="landing-97">Подсказки во время общения</h2>
<p className="landing-98">Если движение видно не полностью, SignBridge подскажет, что поправить. Фраза не уходит сама: вы видите результат и решаете — отправить её или повторить.</p>
<ul className="landing-99">
<li className="landing-100"><span aria-hidden="true" className="landing-101">check</span>Подсказка появляется прямо под видео</li>
<li className="landing-102"><span aria-hidden="true" className="landing-103">check</span>Предположение и готовая фраза выглядят по-разному</li>
<li className="landing-104"><span aria-hidden="true" className="landing-105">check</span>Отменить можно кнопкой или жестом «кулак»</li>
</ul>
</div>
<div className="landing-106">
<div className="landing-107">
<div className="landing-108"><span aria-hidden="true" className="landing-109">pan_tool</span>Подсказка</div>
<div className="landing-110">Поместите кисть целиком в кадр</div>
</div>
<div className="landing-111">
<div className="landing-112">
<div className="landing-113"><span aria-hidden="true" className="landing-114">check_circle</span>Фраза готова</div>
<div className="landing-115">Hello</div>
</div>
<div className="landing-116">
<span className="landing-117">Отправить</span>
<span className="landing-118">Повторить</span>
</div>
</div>
</div>
</div>
</div>
</section>
<section id="example">
<div className="landing-119">
<h2 className="landing-120">Пример разговора</h2>
<div className="landing-121">
<div className="landing-122"><div className="landing-123"><b className="landing-124">Максим</b> · движение</div><div className="landing-125">Hello</div></div>
<div className="landing-126"><div className="landing-127"><b className="landing-128">Анна</b> · голос</div><div className="landing-129">How are you?</div></div>
<div className="landing-130"><div className="landing-131"><b className="landing-132">Максим</b> · движение</div><div className="landing-133">I'm fine</div></div>
</div>
<p className="landing-134">Движения в SignBridge — условные: они назначены фразам в приложении и не являются жестами жестового языка для этих слов.</p>
</div>
</section>
<section id="faq" className="landing-135">
<div className="landing-136">
<h2 className="landing-137">Вопросы</h2>
<div className="landing-138">
{faqs.map((f,i)=><div key={i}>
<div className="landing-139">
<button onClick={f.toggle} aria-expanded={f.exp} className="landing-140">
<span className="landing-141">{f.q}</span>
<span aria-hidden="true" className="landing-142">{f.icon}</span>
</button>
{f.open && <><p className="landing-143">{f.a}</p></>}
</div>
</div>)}
</div>
</div>
</section>
<section >
<div className="landing-144">
<div >
<h2 className="landing-145">Начните разговор</h2>
<p className="landing-146">Создайте звонок и отправьте ссылку — собеседнику ничего не нужно устанавливать.</p>
</div>
<button onClick={openCreate} className="landing-147"><span aria-hidden="true" className="landing-149">videocam</span>Начать звонок</button>
</div>
<div className="landing-150">
<BrandLogo />
<span >Движения распознаются в браузере.</span>
</div>
</section>
</div></div>;
}
