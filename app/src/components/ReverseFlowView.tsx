import React, { useEffect, useMemo, useState } from 'react';
import { ALL_ARTICLES } from '../constants/initialData';
import type { Article, OperatorName } from '../types/pvz';
import { usePvz } from '../context/PvzContext';
import baseData from '../data/baseData.json';

type Stage='intake'|'inspection'|'repair'|'packaging';
type Status='awaiting'|'repair'|'direct'|'written_off';
type Event={stage:Stage;date:string;operator:OperatorName};
type Unit={id:string;article:Article;receivedDate:string;status:Status;defects:string[];events:Event[];closedDate?:string|null;countedInStock?:boolean};
const defects:Record<Article,string[]>={
  'АК-10':['Аккумулятор'],'АК-15':['Аккумулятор'],
  'Г-3500':['Кейс','Зарядное устройство','Аккумулятор 1','Аккумулятор 2','Гайковёрт','Иное'],
  'Г-1800':['Кейс','Зарядное устройство','Аккумулятор 1','Аккумулятор 2','Гайковёрт','Иное'],
  'Г-800':['Кейс','Зарядное устройство','Аккумулятор 1','Аккумулятор 2','Гайковёрт','Иное'],
  'Ми-К':['Корпус','Иное'],'Ми-П':['Корпус','Иное'],
};
const staff:Record<Stage,[number,number,number,number]>={intake:[1,2,3,2],inspection:[5,8,13,15],repair:[15,15,18,20],packaging:[9,11,13,15]};
const seller:Record<Stage,[number,number,number,number]>={intake:[5,5,10,5],inspection:[20,20,35,45],repair:[60,45,45,55],packaging:[35,30,35,45]};
const weight=(a:Article)=>a==='Г-3500'?2:(a==='Г-1800'||a==='Г-800')?1:0;
const rub=(n:number)=>n.toLocaleString('ru-RU')+' ₽';

export const ReverseFlowView:React.FC=()=>{
  const {schedule,addArrival,arrivals,reverseFlowUnits,saveReverseUnits}=usePvz();
  // §4.2 — the cards live in SQLite. The seeded historical set (25 units /
  // 72 events) is already in reverse_units, so nothing is merged in here.
  const units:Unit[]=useMemo(
    ()=>reverseFlowUnits.map(u=>({...u,events:u.events.map(e=>({...e,stage:e.stage as Stage,operator:e.operator as OperatorName}))})),
    [reverseFlowUnits],
  );
  const [article,setArticle]=useState<Article>('АК-10');
  const [date,setDate]=useState(new Date().toLocaleDateString('sv-SE'));
  const [selected,setSelected]=useState<Record<string,string[]>>({});
  // A return registered in «Поступления» already contributes +1 to the direct
  // balance. Historical embedded returns remain completed for compatibility.
  // New manual returns must still open cards in reverse-flow processing, but
  // transferring those cards later must not add the same unit to stock again.
  useEffect(()=>{
   const returns=arrivals.filter(item=>item.type==='return').sort((a,b)=>a.date.localeCompare(b.date));
   if(!returns.length)return;
   const embeddedIds=new Set((baseData.arrivals||[]).filter(item=>item.type==='return').map(item=>item.id));
   const next=[...units];
   const represented=new Map<string,number>();
   next.filter(unit=>unit.status==='direct').forEach(unit=>{const key=`${unit.receivedDate}|${unit.article}`;represented.set(key,(represented.get(key)||0)+1)});

   returns.forEach(item=>{
    const op=(schedule[item.date]||'Пузанов Д.В.') as OperatorName;
    if(!embeddedIds.has(item.id)){
     for(let i=0;i<item.quantity;i++){
      const id=`linked-return-${item.id}-${i+1}`;
      if(next.some(unit=>unit.id===id))continue;
      next.push({id,article:item.article,receivedDate:item.date,status:'awaiting',defects:[],events:[{stage:'intake',date:item.date,operator:op}]});
     }
     return;
    }

    const key=`${item.date}|${item.article}`;
    const covered=represented.get(key)||0;
    for(let i=covered;i<item.quantity;i++){
     const id=`linked-return-${item.id}-${i+1}`;
     if(next.some(unit=>unit.id===id))continue;
     next.push({id,article:item.article,receivedDate:item.date,status:'direct',defects:[],closedDate:item.date,events:[{stage:'intake',date:item.date,operator:op},{stage:'inspection',date:item.date,operator:op},{stage:'packaging',date:item.date,operator:op}]});
    }
    represented.set(key,Math.max(covered,item.quantity));
   });
   if(next.length!==units.length)void saveReverseUnits(next);
  },[arrivals,units,schedule,saveReverseUnits]);
  const save=(next:Unit[])=>void saveReverseUnits(next);
  const operator=(d:string)=>(schedule[d]||'Пузанов Д.В.') as OperatorName;
  // §8 — a card that came from a «Поступления» return already moved the balance,
  // so only genuinely manual cards get the compensating +1 arrival.
  const countsTowardsStock=(u:Unit)=>u.countedInStock===true||!u.id.startsWith('linked-return-');
  const receive=()=>{const u:Unit={id:`ret-${Date.now()}`,article,receivedDate:date,status:'awaiting',defects:[],events:[{stage:'intake',date,operator:operator(date)}]};save([...units,u])};
  const update=(id:string,fn:(u:Unit)=>Unit)=>save(units.map(u=>u.id===id?fn(u):u));
  const toDirect=(u:Unit,afterRepair=false)=>{const now=new Date().toLocaleDateString('sv-SE');update(u.id,x=>({...x,status:'direct',closedDate:now,events:[...x.events,...(!afterRepair?[{stage:'inspection' as Stage,date:now,operator:operator(now)}]:[]),{stage:'packaging',date:now,operator:operator(now)}]}));if(countsTowardsStock(u))addArrival({date:now,article:u.article,quantity:1,type:'arrival',note:`[ОБРАТНЫЙ ПОТОК] Перевод ${u.id} в прямой поток`});};
  const inspectDamage=(u:Unit)=>{const now=new Date().toLocaleDateString('sv-SE'),d=selected[u.id]||[];if(!d.length)return;update(u.id,x=>({...x,status:'repair',defects:d,events:[...x.events,{stage:'inspection',date:now,operator:operator(now)}]}))};
  const repaired=(u:Unit)=>{const now=new Date().toLocaleDateString('sv-SE');update(u.id,x=>({...x,status:'direct',closedDate:now,events:[...x.events,{stage:'repair',date:now,operator:operator(now)},{stage:'packaging',date:now,operator:operator(now)}]}));if(countsTowardsStock(u))addArrival({date:now,article:u.article,quantity:1,type:'arrival',note:`[ОБРАТНЫЙ ПОТОК] Восстановлен ${u.id}`});};
  const writeOff=(u:Unit)=>{const now=new Date().toLocaleDateString('sv-SE');update(u.id,x=>({...x,status:'written_off',closedDate:now,events:[...x.events,{stage:'repair',date:now,operator:operator(now)}]}))};
 const totals=useMemo(()=>{const byOp:Record<string,number>={};let sellerTotal=0;units.forEach(u=>u.events.forEach(e=>{const i=weight(u.article);byOp[e.operator]=(byOp[e.operator]||0)+staff[e.stage][i];sellerTotal+=seller[e.stage][i]}));return{byOp,sellerTotal}},[units]);
 return <div className="flex-1 overflow-auto bg-[#F7F4EF] p-6 space-y-5">
  <div className="bg-white border rounded-xl p-4"><h2 className="font-bold text-lg text-[#5A081E]">Приём единицы в обратный поток</h2><div className="flex gap-3 mt-3"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded-lg px-3"/><select value={article} onChange={e=>setArticle(e.target.value as Article)} className="border rounded-lg px-3">{ALL_ARTICLES.map(a=><option key={a}>{a}</option>)}</select><button onClick={receive} className="bg-[#5A081E] text-white rounded-lg px-5 py-2">Принять 1 шт.</button></div></div>
  <div className="grid grid-cols-3 gap-3">{Object.entries(totals.byOp).map(([op,v])=><div className="bg-white border rounded-xl p-4" key={op}><div className="text-sm text-neutral-500">Начислено сотруднику</div><b>{op}: {rub(v)}</b></div>)}<div className="bg-[#FFF7DF] border border-[#BD995A] rounded-xl p-4"><div className="text-sm text-neutral-600">Начислено селлеру</div><b>{rub(totals.sellerTotal)}</b></div></div>
  <div className="space-y-3">{units.slice().reverse().map(u=><div key={u.id} className="bg-white border rounded-xl p-4"><div className="flex justify-between"><div><b>{u.article}</b> · 1 шт. · {u.receivedDate}<div className="text-xs text-neutral-500">{u.id}</div></div><b className="text-[#5A081E]">{{awaiting:'Ожидает осмотра',repair:'Ремонт',direct:'Переведён в прямой поток',written_off:'Списан'}[u.status]}</b></div>
   {u.defects.length>0&&<div className="mt-2 text-sm text-red-700">Повреждения: {u.defects.join(', ')}</div>}
   {u.status==='awaiting'&&<div className="mt-3"><div className="flex flex-wrap gap-2">{defects[u.article].map(d=><label key={d} className="border rounded px-2 py-1 text-sm"><input type="checkbox" className="mr-1" checked={(selected[u.id]||[]).includes(d)} onChange={e=>setSelected(s=>({...s,[u.id]:e.target.checked?[...(s[u.id]||[]),d]:(s[u.id]||[]).filter(x=>x!==d)}))}/>{d}</label>)}</div><div className="flex gap-2 mt-3"><button onClick={()=>toDirect(u)} className="bg-green-700 text-white px-3 py-2 rounded">Повреждений нет → прямой поток</button><button
       onClick={()=>inspectDamage(u)}
       disabled={!(selected[u.id]||[]).length}
       title={!(selected[u.id]||[]).length?'Сначала отметьте повреждение':''}
       className="bg-amber-600 disabled:bg-neutral-300 disabled:text-neutral-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded"
      >{(selected[u.id]||[]).length?'Зафиксировать → ремонт':'Сначала отметьте повреждение'}</button></div></div>}
   {u.status==='repair'&&<div className="flex gap-2 mt-3"><button onClick={()=>repaired(u)} className="bg-green-700 text-white px-3 py-2 rounded">Восстановлен → прямой поток</button><button onClick={()=>writeOff(u)} className="bg-red-700 text-white px-3 py-2 rounded">Списать</button></div>}
  </div>)}</div>
  <div className="bg-white border rounded-xl p-4"><h3 className="font-bold">Отчёт по списаниям</h3><table className="w-full mt-2 text-sm"><thead><tr className="text-left border-b"><th>Дата</th><th>Артикул</th><th>Повреждения</th><th>ID</th></tr></thead><tbody>{units.filter(u=>u.status==='written_off').map(u=><tr className="border-b" key={u.id}><td>{u.closedDate}</td><td>{u.article}</td><td>{u.defects.join(', ')}</td><td>{u.id}</td></tr>)}</tbody></table></div>
 </div>
};
