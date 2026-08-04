export interface Point {
  id:string;
  name:string;
  lat:number;
  lng:number;
  category:'metro'|'brt'|'university'|'school'|'home'|'cafe'|'restaurant'|'shop'|'hospital'|'park'|'gym'|'library'|'other';
  createdAt:string;
  note?:string;
}

export const CATEGORIES = [
  'metro','brt','university','school','home','cafe','restaurant','shop','hospital','park','gym','library','other'
] as const;

export const ICON:Record<string,string> = {
  metro:'🚇',brt:'🚌',university:'🎓',school:'🏫',home:'🏠',cafe:'☕',
  restaurant:'🍽️',shop:'🛍️',hospital:'🏥',park:'🌳',gym:'💪',library:'📚',other:'📍'
};

export const LABEL:Record<string,string> = {
  metro:'مترو',brt:'بی‌آر‌تی',university:'دانشگاه',school:'مدرسه',home:'خانه',
  cafe:'کافه',restaurant:'رستوران',shop:'فروشگاه',hospital:'بیمارستان',
  park:'پارک',gym:'باشگاه',library:'کتابخانه',other:'سایر'
};

export const POI_DATABASE:Point[] = [
  // --- Universities ---
  {id:'poi-uni-tehran',name:'دانشگاه تهران',lat:35.7029,lng:51.3955,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-sharif',name:'دانشگاه صنعتی شریف',lat:35.7007,lng:51.3515,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-amirkabir',name:'دانشگاه صنعتی امیرکبیر',lat:35.7168,lng:51.4094,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-elm-sanat',name:'دانشگاه علم و صنعت',lat:35.7300,lng:51.4694,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-beheshti',name:'دانشگاه شهید بهشتی',lat:35.7832,lng:51.4104,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-allameh',name:'دانشگاه علامه طباطبایی',lat:35.7919,lng:51.3613,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-iran-elm',name:'دانشگاه ایران‌علم',lat:35.6753,lng:51.4359,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-farhangian-mofatteh',name:'دانشگاه فرهنگیان شهید مفتح',lat:35.5570,lng:51.4233,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-azad-tehran',name:'دانشگاه آزاد تهران مرکز',lat:35.6933,lng:51.3984,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-azad-science',name:'دانشگاه آزاد علوم و تحقیقات',lat:35.7329,lng:51.3227,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-payam-noor',name:'دانشگاه پیام نور تهران',lat:35.7021,lng:51.3782,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-uni-kharazmi',name:'دانشگاه خوارزمی',lat:35.7827,lng:51.3687,category:'university',createdAt:'2024-01-01T00:00:00Z'},
  // --- Hospitals ---
  {id:'poi-hosp-shariati',name:'بیمارستان شریعتی',lat:35.7642,lng:51.3989,category:'hospital',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-hosp-imam',name:'بیمارستان امام خمینی',lat:35.6861,lng:51.3877,category:'hospital',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-hosp-milad',name:'بیمارستان میلاد',lat:35.7522,lng:51.3689,category:'hospital',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-hosp-sina',name:'بیمارستان سینا',lat:35.6881,lng:51.4128,category:'hospital',createdAt:'2024-01-01T00:00:00Z'},
  // --- Parks ---
  {id:'poi-park-laleh',name:'پارک لاله',lat:35.7104,lng:51.3810,category:'park',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-park-shahr',name:'پارک شهر',lat:35.6928,lng:51.4116,category:'park',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-park-mellat',name:'پارک ملت',lat:35.7765,lng:51.4054,category:'park',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-park-niavaran',name:'پارک نیاوران',lat:35.8168,lng:51.4727,category:'park',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-park-jamshidiyeh',name:'پارک جمشیدیه',lat:35.7971,lng:51.4550,category:'park',createdAt:'2024-01-01T00:00:00Z'},
  // --- Libraries ---
  {id:'poi-lib-melli',name:'کتابخانه ملی ایران',lat:35.7527,lng:51.4104,category:'library',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-lib-markazi',name:'کتابخانه مرکزی دانشگاه تهران',lat:35.7023,lng:51.3938,category:'library',createdAt:'2024-01-01T00:00:00Z'},
  // --- Cafes ---
  {id:'poi-cafe-naderi',name:'کافه نادری',lat:35.6938,lng:51.4125,category:'cafe',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-cafe-ghazal',name:'کافه غزل',lat:35.7146,lng:51.4101,category:'cafe',createdAt:'2024-01-01T00:00:00Z'},
  // --- Gyms ---
  {id:'poi-gym-enghelab',name:'مجموعه ورزشی انقلاب',lat:35.7160,lng:51.3765,category:'gym',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-gym-azadi',name:'مجموعه ورزشی آزادی',lat:35.7077,lng:51.2825,category:'gym',createdAt:'2024-01-01T00:00:00Z'},
  // --- Key landmarks ---
  {id:'poi-azadi-tower',name:'برج آزادی',lat:35.6996,lng:51.2856,category:'other',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-milad-tower',name:'برج میلاد',lat:35.7459,lng:51.3966,category:'other',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-bazar-tehran',name:'بازار بزرگ تهران',lat:35.6749,lng:51.4166,category:'shop',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-tajrish-bazar',name:'بازار تجریش',lat:35.8080,lng:51.4315,category:'shop',createdAt:'2024-01-01T00:00:00Z'},
  {id:'poi-iran-mall',name:'ایران مال',lat:35.7363,lng:51.2215,category:'shop',createdAt:'2024-01-01T00:00:00Z'},
];

export function genId():string{
  return Date.now().toString(36)+Math.random().toString(36).substr(2,7);
}

export function getPoints():Point[]{
  if(typeof window==='undefined') return [];
  try{
    const r=localStorage.getItem('ty-points-v2');
    return r ? JSON.parse(r) : [];
  }catch{return [];}
}

export function savePoint(p:Point):void{
  const pts=getPoints();
  pts.push(p);
  localStorage.setItem('ty-points-v2',JSON.stringify(pts));
}

export function removePoint(id:string):void{
  const pts=getPoints().filter(p=>p.id!==id);
  localStorage.setItem('ty-points-v2',JSON.stringify(pts));
}
