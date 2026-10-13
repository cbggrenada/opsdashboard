(function(){var b=document.getElementById('glassBtn'),p=document.getElementById('glassPop'),r=document.getElementById('glassRange'),o=document.getElementById('glassVal'),z=document.getElementById('glassReset');if(!b)return;
var root=document.documentElement;function set(v,save){v=Math.max(0,Math.min(100,Math.round(+v)));root.style.setProperty('--lg-t',v/100);r.value=v;o.textContent=v+'%';if(save){try{localStorage.setItem('cbg-glass-ops',v)}catch(e){}}}
var cur=parseFloat(getComputedStyle(root).getPropertyValue('--lg-t'));set(isNaN(cur)?20:cur*100,false);
function open(x){p.hidden=!x;b.setAttribute('aria-expanded',x?'true':'false');if(x)r.focus()}
b.addEventListener('click',function(e){e.stopPropagation();open(p.hidden)});
r.addEventListener('input',function(){set(r.value,true)});z.addEventListener('click',function(){set(20,true)});
p.addEventListener('click',function(e){e.stopPropagation()});document.addEventListener('click',function(){if(!p.hidden)open(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!p.hidden){open(false);b.focus()}})})();(function(){var b=document.getElementById('themeBtn');if(!b)return;
function cur(){var t=document.documentElement.getAttribute('data-theme');if(t)return t;return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
function lab(){b.setAttribute('aria-label',cur()==='dark'?'Switch to light mode':'Switch to dark mode');b.title=cur()==='dark'?'Light mode':'Dark mode'}
b.addEventListener('click',function(){var n=cur()==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem('cbg-theme',n)}catch(e){}lab()});lab()})();/* charts follow the light / dark switch */
new MutationObserver(()=>{try{render()}catch(e){}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* Profit Isle-style layout: section icons in the side rail, breadcrumb and page tabs in the black band */
(function(){
  const ICON={kpi:'<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/>',sc:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',brew:'<path d="M7 3h10l-1 18H8z"/><path d="M7.5 9h9"/>'};
  const hero=document.querySelector('.hero'),tabs=document.getElementById('tabs');
  if(hero&&tabs){const bar=document.getElementById('bar');hero.insertBefore(tabs,bar)}
  document.getElementById('railTog').onclick=()=>{document.body.classList.toggle('rail-open')};
  const base=render;
  window.render=render=function(){base();
    document.querySelectorAll('#secs button').forEach(b=>{if(b.querySelector('svg'))return;const s=SECTIONS.find(x=>x.id===b.dataset.sec);if(!s)return;
      b.title=s.name;b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[s.id]||ICON.kpi}</svg><span class="lbl">${esc(s.name)}</span>`});
    const e=document.getElementById('eyebrow');if(e&&CUR){const s=SECTIONS.find(x=>x.id===CUR.sec);
      e.innerHTML=`<a data-home="1">Start</a><span class="sep">›</span>${esc(s?s.name:'')}<span class="sep">›</span>${esc(CUR.title)}`}};
  document.addEventListener('click',ev=>{if(ev.target.closest('[data-home]')){const b=document.querySelector('#secs button');if(b)b.click()}});
})();
