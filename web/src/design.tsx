import {useEffect,useState} from 'react';
export function Icon({name}:{name:string}) {return <span aria-hidden="true" className="icon">{name}</span>;}
export function BrandLogo({large=false}:{large?:boolean}) {return <div className={`brand-logo${large?' large':''}`}><img src={`${import.meta.env.BASE_URL}assets/signbridge-logo.png`} alt="SignBridge"/></div>;}
export function useViewport(){const [size,setSize]=useState({width:innerWidth,height:innerHeight});useEffect(()=>{const resize=()=>setSize({width:innerWidth,height:innerHeight});addEventListener('resize',resize);return()=>removeEventListener('resize',resize);},[]);return {...size,mobile:size.width<760,wide:size.width>=1040};}
