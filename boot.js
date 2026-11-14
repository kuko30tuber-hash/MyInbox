try{var t=localStorage.getItem("wth");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);var a=localStorage.getItem("wacc");if(/^#[0-9a-f]{6}$/i.test(a||"")){var r=document.documentElement.style;r.setProperty("--accent",a);r.setProperty("--dot",a);r.setProperty("--today",a)}}catch(e){}
try{var th=localStorage.getItem("wth");if(localStorage.getItem("oled")==="1"&&(th==="dark"||(th!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)))document.documentElement.classList.add("oled");if(sessionStorage.getItem("oi-launched"))document.documentElement.classList.add("nosplash");else sessionStorage.setItem("oi-launched","1")}catch(e){}
/* fonts load without holding up the first paint */
(function(){var l=document.getElementById("gfont");if(!l)return;function on(){l.media="all"}if(l.sheet)on();else{l.addEventListener("load",on);setTimeout(on,3000)}})();
/* languages: the word lists only load when you've picked a language other than English */
(function(){var l="en";try{l=localStorage.getItem("lang")||"en"}catch(e){}if(l!=="en")document.write('<script src="i18n-data.js"><\/script><script src="i18n.js"><\/script>')})();
