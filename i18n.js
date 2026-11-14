/* OwnInbox languages: translates the app's own words (not your emails), and shows dates in your language. */
(function(){
var LANG="en";try{LANG=localStorage.getItem("lang")||"en"}catch(e){}
var CODES=(window.OI_LANGS||[]).map(function(x){return x[0]});
if(CODES.indexOf(LANG)<0)LANG="en";
var IX=CODES.indexOf(LANG)-1;   /* column in OI_T */
var LOC={sk:"sk-SK",cs:"cs-CZ",de:"de-DE",es:"es-ES",fr:"fr-FR"}[LANG];
window.OI_LANG=LANG;
document.documentElement.lang=LANG;
if(LANG==="en")return;

/* ---------- dates: formats with day or month names speak your language ---------- */
var DTF=Intl.DateTimeFormat;
function wordy(o){return o&&(o.weekday||o.month==="long"||o.month==="short"||o.month==="narrow"||o.era||o.dateStyle)}
function NDTF(loc,opt){var l=(loc==="en-GB"||loc==="en-US"||loc==null)&&wordy(opt)?LOC:loc;return new DTF(l,opt)}
NDTF.prototype=DTF.prototype;NDTF.supportedLocalesOf=DTF.supportedLocalesOf;
try{Intl.DateTimeFormat=NDTF}catch(e){}

/* ---------- words ---------- */
var T=window.OI_T||{};
function w(s){var r=T[s];return r&&r[IX]?r[IX]:null}
/* sentences with numbers or names in them: [pattern, [sk, cs, de, es, fr]] with $1, $2 for the parts */
var P=[
[/^(.+), (\d+) events?$/,["$1, $2 udalostí","$1, $2 událostí","$1, $2 Termine","$1, $2 eventos","$1, $2 événements"]],
[/^Time (.+)$/,["Čas $1","Čas $1","Zeit $1","Hora $1","Heure $1"]],
[/^Colour for (.+)$/,["Farba pre $1","Barva pro $1","Farbe für $1","Color para $1","Couleur pour $1"]],
[/^Received in (.+)$/,["Prijaté do $1","Přijato do $1","Empfangen in $1","Recibido en $1","Reçu dans $1"]],
[/^Sign out of (.+)$/,["Odhlásiť sa z $1","Odhlásit se z $1","Abmelden von $1","Cerrar sesión de $1","Se déconnecter de $1"]],
[/^From (.+@.+)$/,["Od $1","Od $1","Von $1","De $1","De $1"]],
[/^(.+), shown$/,["$1, zobrazené","$1, zobrazeno","$1, angezeigt","$1, visible","$1, affiché"]],
[/^(.+) \(read-only\)$/,["$1 (len na čítanie)","$1 (jen pro čtení)","$1 (schreibgeschützt)","$1 (solo lectura)","$1 (lecture seule)"]],
[/^Day (\d+)%, Week (\d+)%, Month (\d+)%, Year (\d+)%$/,["Deň $1 %, týždeň $2 %, mesiac $3 %, rok $4 %","Den $1 %, týden $2 %, měsíc $3 %, rok $4 %","Tag $1 %, Woche $2 %, Monat $3 %, Jahr $4 %","Día $1 %, semana $2 %, mes $3 %, año $4 %","Jour $1 %, semaine $2 %, mois $3 %, année $4 %"]],
[/^Starts with the (\d+) widgets on this tab$/,["Začína s $1 widgetmi na tejto karte","Začíná s $1 widgety na této kartě","Beginnt mit den $1 Widgets dieses Tabs","Empieza con los $1 widgets de esta pestaña","Commence avec les $1 widgets de cet onglet"]],
[/^(.+) done today$/,["$1 dnes splnené","$1 dnes splněno","$1 heute erledigt","$1 hecho hoy","$1 fait aujourd’hui"],1],
[/^\+(\d+) more$/,["+$1 ďalšie","+$1 další","+$1 weitere","+$1 más","+$1 de plus"]],
[/^Today · (.+)$/,["Dnes · $1","Dnes · $1","Heute · $1","Hoy · $1","Aujourd’hui · $1"]],
[/^Edited (.+) · (\d+) words?$/,["Upravené $1 · $2 slov","Upraveno $1 · $2 slov","Bearbeitet $1 · $2 Wörter","Editado $1 · $2 palabras","Modifié $1 · $2 mots"]],
[/^(.+) settings…$/,["Nastavenia: $1…","Nastavení: $1…","Einstellungen: $1…","Ajustes: $1…","Réglages : $1…"],1],
[/^(Morning|Afternoon|Evening|Night) · (.+) in (.+)$/,["$1 · $2 v $3","$1 · $2 v $3","$1 · $2 in $3","$1 · $2 en $3","$1 · $2 à $3"],1],
[/^(.+) · H (.+) L (.+)$/,["$1 · max $2 min $3","$1 · max $2 min $3","$1 · H $2 T $3","$1 · máx $2 mín $3","$1 · max $2 min $3"],1],
[/^Tomorrow, (.+)$/,["Zajtra, $1","Zítra, $1","Morgen, $1","Mañana, $1","Demain, $1"]],
[/^Today, (.+)$/,["Dnes, $1","Dnes, $1","Heute, $1","Hoy, $1","Aujourd’hui, $1"]],
[/^Tomorrow · (.+)$/,["Zajtra · $1","Zítra · $1","Morgen · $1","Mañana · $1","Demain · $1"]],
[/^events · busiest (.+)$/,["udalostí · najrušnejšie $1","událostí · nejrušnější $1","Termine · am vollsten $1","eventos · más ocupado $1","événements · plus chargé $1"]],
[/^in (\d+) d (\d+) h$/,["o $1 d $2 h","za $1 d $2 h","in $1 T. $2 Std.","en $1 d $2 h","dans $1 j $2 h"]],
[/^in (\d+) h (\d+) min$/,["o $1 h $2 min","za $1 h $2 min","in $1 Std. $2 Min.","en $1 h $2 min","dans $1 h $2 min"]],
[/^(\d+) events?$/,["$1 udalostí","$1 událostí","$1 Termine","$1 eventos","$1 événements"]],
[/^Day (\d+) of (\d+)$/,["Deň $1 z $2","Den $1 z $2","Tag $1 von $2","Día $1 de $2","Jour $1 sur $2"]],
[/^Tomorrow (\d+) min (shorter|longer)$/,["Zajtra o $1 min $2","Zítra o $1 min $2","Morgen $1 Min. $2","Mañana $1 min $2","Demain $1 min $2"]],
[/^(.+) widget\. Press Shift\+F10 for options$/,["Widget $1. Stlačte Shift+F10 pre možnosti","Widget $1. Stiskněte Shift+F10 pro možnosti","Widget $1. Shift+F10 für Optionen","Widget $1. Pulsa Mayús+F10 para opciones","Widget $1. Maj+F10 pour les options"],1],
[/^Remove (.+)$/,["Odstrániť: $1","Odstranit: $1","Entfernen: $1","Quitar: $1","Retirer : $1"],1],
[/^Edit (.+)$/,["Upraviť: $1","Upravit: $1","Bearbeiten: $1","Editar: $1","Modifier : $1"],0],
[/^Show (.+)$/,["Zobraziť: $1","Zobrazit: $1","Anzeigen: $1","Mostrar: $1","Afficher : $1"],1],
[/^(\d+) unread · updated (\S+), every 5 min$/,["$1 neprečítaných · aktualizované $2, každých 5 min","$1 nepřečtených · aktualizováno $2, každých 5 min","$1 ungelesen · aktualisiert $2, alle 5 Min.","$1 sin leer · actualizado $2, cada 5 min","$1 non lus · mis à jour $2, toutes les 5 min"]],
[/^(\d+) unread$/,["$1 neprečítaných","$1 nepřečtených","$1 ungelesen","$1 sin leer","$1 non lus"]],
[/^Inbox \((\d+)\)$/,["Doručené ($1)","Doručené ($1)","Posteingang ($1)","Recibidos ($1)","Réception ($1)"]],
[/^Important \((\d+)\)$/,["Dôležité ($1)","Důležité ($1)","Wichtig ($1)","Importantes ($1)","Important ($1)"]],
[/^Spam \((\d+)\)$/,["Spam ($1)","Spam ($1)","Spam ($1)","Spam ($1)","Spam ($1)"]],
[/^Synced · (.+)$/,["Synchronizované · $1","Synchronizováno · $1","Synchronisiert · $1","Sincronizado · $1","Synchronisé · $1"]],
[/^live · updated (.+)$/,["živé · aktualizované $1","živě · aktualizováno $1","live · aktualisiert $1","en vivo · actualizado $1","en direct · mis à jour $1"]],
[/^Updated (.+)$/,["Aktualizované $1","Aktualizováno $1","Aktualisiert $1","Actualizado $1","Mis à jour $1"]],
[/^of (\d+) in your inbox$/,["z $1 v doručenej pošte","z $1 v doručené poště","von $1 im Posteingang","de $1 en tu bandeja","sur $1 dans votre boîte"]],
[/^(\d+) emails?$/,["$1 e-mailov","$1 e-mailů","$1 E-Mails","$1 correos","$1 e-mails"]],
[/^under 1 email$/,["menej ako 1 e-mail","méně než 1 e-mail","unter 1 E-Mail","menos de 1 correo","moins d’1 e-mail"]],
[/^(\d+) days? left$/,["zostáva $1 d","zbývá $1 d","noch $1 T.","quedan $1 d","encore $1 j"]],
[/^(\d+) new$/,["$1 nových","$1 nových","$1 neu","$1 nuevos","$1 nouveaux"]],
[/^(\d+) days?$/,["$1 dní","$1 dní","$1 Tage","$1 días","$1 jours"]],
[/^Best: (\d+) days?$/,["Najlepšie: $1 dní","Nejlépe: $1 dní","Bestwert: $1 Tage","Mejor: $1 días","Record : $1 jours"]],
[/^(\d+) left to clear today$/,["Dnes zostáva vybaviť $1","Dnes zbývá vyřídit $1","Heute noch $1 zu erledigen","Quedan $1 por despejar hoy","Encore $1 à traiter aujourd’hui"]],
[/^(\d+) in your inbox\. Clear it to start a streak$/,["$1 v schránke. Vyprázdnite ju a začnite sériu","$1 ve schránce. Vyprázdněte ji a začněte sérii","$1 im Posteingang. Leere ihn für eine Serie","$1 en tu bandeja. Vacíala para empezar una racha","$1 dans votre boîte. Videz-la pour lancer une série"]],
[/^Feels like (.+)$/,["Pocitovo $1","Pocitově $1","Gefühlt $1","Sensación $1","Ressenti $1"]],
[/^Wind (.+)$/,["Vietor $1","Vítr $1","Wind $1","Viento $1","Vent $1"]],
[/^(\d+)% lit$/,["osvetlené z $1 %","osvětleno z $1 %","$1 % beleuchtet","$1 % iluminada","éclairée à $1 %"]],
[/^Full moon in (\d+) days · (.+)$/,["Spln o $1 dní · $2","Úplněk za $1 dní · $2","Vollmond in $1 Tagen · $2","Luna llena en $1 días · $2","Pleine lune dans $1 jours · $2"]],
[/^Full moon tonight · (.+)$/,["Spln dnes v noci · $1","Úplněk dnes v noci · $1","Vollmond heute Nacht · $1","Luna llena esta noche · $1","Pleine lune ce soir · $1"]],
[/^Full moon tomorrow · (.+)$/,["Spln zajtra · $1","Úplněk zítra · $1","Vollmond morgen · $1","Luna llena mañana · $1","Pleine lune demain · $1"]],
[/^New moon (.+)$/,["Nov $1","Nov $1","Neumond $1","Luna nueva $1","Nouvelle lune $1"]],
[/^Rain starts in (.+) min$/,["Dážď začne o $1 min","Déšť začne za $1 min","Regen in $1 Min.","Lluvia en $1 min","Pluie dans $1 min"]],
[/^Rain stops in (.+) min$/,["Dážď prestane o $1 min","Déšť skončí za $1 min","Regen hört in $1 Min. auf","La lluvia para en $1 min","La pluie cesse dans $1 min"]],
[/^Rain for the next 2 hours$/,["Dážď počas najbližších 2 hodín","Déšť během příštích 2 hodin","Regen in den nächsten 2 Stunden","Lluvia durante las próximas 2 horas","Pluie pendant les 2 prochaines heures"]],
[/^Rain · (.+)$/,["Dážď · $1","Déšť · $1","Regen · $1","Lluvia · $1","Pluie · $1"]],
[/^Sun · (.+)$/,["Slnko · $1","Slunce · $1","Sonne · $1","Sol · $1","Soleil · $1"]],
[/^in (\d+) min$/,["o $1 min","za $1 min","in $1 Min.","en $1 min","dans $1 min"]],
[/^(\d+) min ago · unread$/,["pred $1 min · neprečítané","před $1 min · nepřečtené","vor $1 Min. · ungelesen","hace $1 min · sin leer","il y a $1 min · non lu"]],
[/^(\d+) in the last hour · based on the last 2 weeks$/,["$1 za poslednú hodinu · podľa posledných 2 týždňov","$1 za poslední hodinu · podle posledních 2 týdnů","$1 in der letzten Stunde · basierend auf 2 Wochen","$1 en la última hora · según las últimas 2 semanas","$1 dans la dernière heure · sur les 2 dernières semaines"]],
[/^Nothing new in the last hour · based on the last 2 weeks$/,["Za poslednú hodinu nič nové · podľa posledných 2 týždňov","Za poslední hodinu nic nového · podle posledních 2 týdnů","Nichts Neues in der letzten Stunde · basierend auf 2 Wochen","Nada nuevo en la última hora · según las últimas 2 semanas","Rien de nouveau depuis une heure · sur les 2 dernières semaines"]],
[/^Focusing · just started$/,["Sústredenie · práve začalo","Soustředění · právě začalo","Fokus · gerade gestartet","Concentrado · recién empezado","Concentration · vient de commencer"]],
[/^Focusing · (\d+) min$/,["Sústredenie · $1 min","Soustředění · $1 min","Fokus · $1 Min.","Concentrado · $1 min","Concentration · $1 min"]],
[/^(\d+) h (\d+) min left$/,["zostáva $1 h $2 min","zbývá $1 h $2 min","noch $1 Std. $2 Min.","quedan $1 h $2 min","encore $1 h $2 min"]],
[/^(\d+) h (\d+) min of light$/,["$1 h $2 min svetla","$1 h $2 min světla","$1 Std. $2 Min. Licht","$1 h $2 min de luz","$1 h $2 min de jour"]]
];
/* mail weather headline, e.g. "Busy afternoon, quiet evening" */
var MW={busy:["rušné","rušné","voller","movida","chargé"],steady:["stále","stálé","gleichmäßiger","constante","régulier"],quiet:["pokojné","klidné","ruhiger","tranquila","calme"],
 morning:["ráno","ráno","Vormittag","mañana","matin"],afternoon:["popoludnie","odpoledne","Nachmittag","tarde","après-midi"],evening:["večer","večer","Abend","noche","soir"]};
function mailWx(s){var m=s.match(/^(Busy|Steady|Quiet) (morning|afternoon|evening)(?:, (busy|steady|quiet) (morning|afternoon|evening))?$/);if(!m)return null;
 function part(a,b){var x=MW[b][IX],y=MW[a.toLowerCase()][IX];return LANG==="de"?y+" "+x:LANG==="es"||LANG==="fr"?x+" "+y:y+" "+x}
 var r=part(m[1],m[2]);if(m[3])r+=", "+part(m[3],m[4]);return r.charAt(0).toUpperCase()+r.slice(1)}
var cache=new Map();
function tr(s){if(!s)return null;var k=s.trim();if(!k||!/[A-Za-z]/.test(k))return null;if(cache.has(k))return cache.get(k);
 var r=w(k);
 if(!r){r=mailWx(k)}
 if(!r)for(var i=0;i<P.length;i++){var m=k.match(P[i][0]);if(m){var tpl=P[i][1][IX];r=tpl.replace(/\$(\d)/g,function(_,n){var v=m[+n]||"";if(P[i][2]){var t2=w(v);if(t2)v=t2}return v});break}}
 if(cache.size>4000)cache.clear();cache.set(k,r||null);return r||null}
window.oiT=function(s){return tr(s)||s};

/* ---------- translate the page as it changes ---------- */
var SKIP="script,style,[contenteditable],.rd .rbody,.rd .body,.rbody,#mail>li>a .ms,#mail>li>a .sn,#mail>li>a .snip,#mail>li>a .who,code,pre,[data-noi18n]";
var ATTR=["placeholder","aria-label","title"];
function doText(n){var p=n.parentElement;if(!p||p.closest(SKIP)||p.closest("textarea,option"))return;var v=n.nodeValue,t=tr(v);if(t&&t!==v.trim()){var lead=v.match(/^\s*/)[0],tail=v.match(/\s*$/)[0];n.nodeValue=lead+t+tail}}
function doAttrs(e){for(var i=0;i<ATTR.length;i++){var v=e.getAttribute(ATTR[i]);if(v){var t=tr(v);if(t&&t!==v)e.setAttribute(ATTR[i],t)}}}
function walk(root){if(root.nodeType===3){doText(root);return}if(root.nodeType!==1)return;if(root.closest&&root.closest(SKIP))return;
 if(root.hasAttribute&&(root.hasAttribute("placeholder")||root.hasAttribute("aria-label")||root.hasAttribute("title")))doAttrs(root);
 var tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode:function(x){return x.nodeType===1&&x.matches(SKIP)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}}),x;
 while(x=tw.nextNode()){if(x.nodeType===3)doText(x);else if(x.hasAttribute("placeholder")||x.hasAttribute("aria-label")||x.hasAttribute("title"))doAttrs(x)}}
var busy=false;
var mo=new MutationObserver(function(ms){if(busy)return;busy=true;try{for(var i=0;i<ms.length;i++){var m=ms[i];
 if(m.type==="characterData")doText(m.target);
 else if(m.type==="attributes"){if(m.target.nodeType===1&&!(m.target.closest&&m.target.closest(SKIP)))doAttrs(m.target)}
 else for(var j=0;j<m.addedNodes.length;j++)walk(m.addedNodes[j])}}finally{mo.takeRecords();busy=false}});
var CSSW=[[".ev.ed::after","Edit"],["#conn.allok .cchips::after","Mail and calendar synced"],["#v-mail #mail li.m3sw[data-dir=\"arch\"]::after","Archive"],["#v-mail #mail li.m3sw[data-dir=\"read\"]::after","Mark read"],["#v-mail #mail li.m3sw[data-dir=\"unread\"]::after","Mark unread"]];
function cssWords(){var css="";CSSW.forEach(function(x){var t=tr(x[1]);if(t)css+=x[0]+"{content:\""+t.replace(/"/g,"")+"\"!important}"});if(css){var st=document.createElement("style");st.textContent=css;document.head.appendChild(st)}}
function start(){cssWords();walk(document.body);mo.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTR});document.title=document.title}
if(document.body)start();else document.addEventListener("DOMContentLoaded",start);
})();
