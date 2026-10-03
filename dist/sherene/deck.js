(function(){
  var ok=/(^|\.)nationalmedicaidplanning\.com$/.test(location.hostname);
  function id(store,key){try{var v=store.getItem(key);if(!v||!/^[a-z0-9]{4,16}$/.test(v)){v=Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,6);store.setItem(key,v);}return v;}catch(e){return 'anon00';}}
  var last=null;
  window.__deckTrack=function(p){
    if(!ok||p===last)return; last=p;
    var body=JSON.stringify({p:p,s:id(sessionStorage,'sherene_s'),v:id(localStorage,'sherene_v')});
    try{if(!(navigator.sendBeacon&&navigator.sendBeacon('/sherene/hit',body))){fetch('/sherene/hit',{method:'POST',body:body,keepalive:true,credentials:'same-origin'}).catch(function(){});}}catch(e){}
  };
})();

(function(){
  if (!Object.prototype.hasOwnProperty.call(HTMLTemplateElement.prototype, 'shadowRootMode')) {
    document.querySelectorAll('template[shadowrootmode]').forEach(function(t){
      var host=t.parentNode; var root=host.attachShadow({mode:'open'}); root.appendChild(t.content.cloneNode(true)); t.remove();
    });
  }
})();
(function(){
  var slides=Array.prototype.slice.call(document.querySelectorAll('section.slide'));
  var ids=slides.map(function(el){return el.id;});
  var links=Array.prototype.slice.call(document.querySelectorAll('nav.deck a[href^="#"], .tabs a[href^="#"]'));
  var labels={};
  slides.forEach(function(el){var h=el.querySelector('h2,h1');labels[el.id]=h?h.textContent.trim():el.id;});
  document.body.classList.add('deck');
  function indexOf(hash){var i=ids.indexOf((hash||'').replace('#',''));return i<0?0:i;}
  function show(i,push){try{window.__deckTrack&&window.__deckTrack(ids[i]);}catch(e){}
    i=Math.max(0,Math.min(ids.length-1,i));
    slides.forEach(function(el,k){el.classList.toggle('active',k===i);});
    links.forEach(function(a){a.classList.toggle('active',a.getAttribute('href')==='#'+ids[i]);});
    var c=(i+1)+' / '+ids.length;
    document.getElementById('count').textContent=c;
    document.getElementById('where').textContent='Page '+c+' · '+labels[ids[i]];
    ['prev','prev2'].forEach(function(id){document.getElementById(id).disabled=(i===0);});
    ['next','next2'].forEach(function(id){document.getElementById(id).disabled=(i===ids.length-1);});
    if(push&&('#'+ids[i])!==location.hash){history.pushState(null,'','#'+ids[i]);}
    window.scrollTo(0,0); requestAnimationFrame(function(){window.scrollTo(0,0);});
  }
  function current(){return ids.indexOf((slides.filter(function(el){return el.classList.contains('active');})[0]||slides[0]).id);}
  ['prev','prev2'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){this.blur();show(current()-1,true);});});
  ['next','next2'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){this.blur();show(current()+1,true);});});
  links.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();show(indexOf(a.getAttribute('href')),true);});});
  window.addEventListener('popstate',function(){show(indexOf(location.hash),false);});
  document.addEventListener('keydown',function(e){
    if(e.target&&/input|textarea|select/i.test(e.target.tagName))return;
    if(e.target&&/button/i.test(e.target.tagName)&&(e.key===' '||e.key==='Enter'))return;
    if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key==='PageDown'||e.key==='j'||e.key==='J'||e.key===' '){e.preventDefault();show(current()+1,true);}
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp'||e.key==='k'||e.key==='K'){e.preventDefault();show(current()-1,true);}
    else if(e.key==='Home'){e.preventDefault();show(0,true);}
    else if(e.key==='End'){e.preventDefault();show(ids.length-1,true);}
  });
  show(indexOf(location.hash),false);
})();

