export interface Point { id:string; name:string; lat:number; lng:number; category:'metro'|'university'|'home'|'cafe'|'shop'|'other'; createdAt:string; note?:string; }
export function genId(){return Date.now().toString(36)+Math.random().toString(36).substr(2,5)}
export function getPoints():Point[]{if(typeof window==='undefined')return[];try{const r=localStorage.getItem('ty-points');return r?JSON.parse(r):[]}catch{return[]}}
export function savePoint(p:Point){const pts=getPoints();pts.push(p);localStorage.setItem('ty-points',JSON.stringify(pts))}
export function removePoint(id:string){const pts=getPoints().filter(p=>p.id!==id);localStorage.setItem('ty-points',JSON.stringify(pts))}
