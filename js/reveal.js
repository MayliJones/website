// Scroll reveal (any project page). Mark an element data-reveal="type", or data-reveal-stagger="type" to animate
// its children one after another. Types: rise, streak, from-right, pop, wipe, divider (styles in css/style.css).
// Each animation replays: elements animate in whenever they scroll into view and reset once fully off screen.
// The hidden states only apply under html.js-reveal, a class the page's <head> adds when reduced motion is off,
// so without JS (or with reduced motion) everything simply shows.
// data-reveal-later: shown as-is on load (e.g. the hero, which the project card morphs into) and only animates
// once it has left the screen and comes back. data-reveal-once: plays the first time it appears, then stays.
// .stat-number[data-count]: counts up to its value as it appears.
(function initReveal(){
  const root=document.documentElement;
  if(!root.classList.contains('js-reveal')) return;
  if(!('IntersectionObserver' in window)){ root.classList.remove('js-reveal'); return; }

  const els=[...document.querySelectorAll('[data-reveal],[data-reveal-stagger]')];
  els.forEach(el=>{
    if(el.hasAttribute('data-reveal-stagger')) [...el.children].forEach((c,i)=>c.style.setProperty('--i',i));
  });

  // Count-up: keeps the prefix and suffix (e.g. "~", " N") and the number of decimal places
  const frames=new Map();
  function count(el,on){
    const final=el.dataset.final||(el.dataset.final=el.textContent);
    const m=final.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
    cancelAnimationFrame(frames.get(el));
    if(!m) return;
    const [,pre,num,post]=m;
    const target=parseFloat(num), dp=(num.split('.')[1]||'').length;
    if(!on){ el.textContent=pre+(0).toFixed(dp)+post; return; }
    const t0=performance.now(), dur=1400;
    const tick=now=>{
      const p=Math.min(1,(now-t0)/dur);
      el.textContent=pre+(target*(1-Math.pow(1-p,3))).toFixed(dp)+post;
      if(p<1) frames.set(el,requestAnimationFrame(tick));
    };
    frames.set(el,requestAnimationFrame(tick));
  }

  const show=el=>{
    if(el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    el.querySelectorAll('[data-count]').forEach(n=>count(n,true));
    // data-reveal-once: plays the first time only, then stays shown
    if(el.hasAttribute('data-reveal-once')){ enter.unobserve(el); leave.unobserve(el); }
  };
  const hide=el=>{
    if(!el.classList.contains('is-in')) return;
    el.classList.remove('is-in');
    if(el.hasAttribute('data-reveal-later')) el.classList.add('is-armed');
    el.querySelectorAll('[data-count]').forEach(n=>count(n,false));
  };

  // In once the top is a little way up the screen; reset only when completely off it, so nothing
  // visibly disappears at the edges
  const enter=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) show(e.target); }),{rootMargin:'0px 0px -10% 0px'});
  const leave=new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting) hide(e.target); }));
  els.forEach(el=>{ enter.observe(el); leave.observe(el); });
})();
