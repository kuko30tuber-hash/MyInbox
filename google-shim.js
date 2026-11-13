/* Connects the app straight to Google's Gmail and Calendar APIs.
   It gives the page the same "window.claude" interface it used inside Claude,
   so the rest of the app works unchanged. Set your client ID in config.js. */
(function () {
  "use strict";
  var CFG = window.APP_CONFIG || {};
  var CLIENT_ID = (CFG.googleClientId || "").trim();
  var SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar"
  ].join(" ");
  var GM = "https://gmail.googleapis.com/gmail/v1/users/me/";
  var CA = "https://www.googleapis.com/calendar/v3/";

  /* ---------- accounts and sign-in ----------
     Several Google accounts can be signed in at once.
     localStorage "gaccts": the account emails, first one also gives the calendar.
     localStorage "gtoks": { email: { t: token, exp: time } }, short-lived access tokens.
     When the site has its sign-in helper (netlify/functions/gauth.js), Google's
     long-lived refresh tokens stay in an HttpOnly cookie there and new access
     tokens are fetched quietly, so you stay signed in on this device. */
  var ACC_KEY = "gaccts", TOKS_KEY = "gtoks", OLD_KEY = "gtok";
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ssGet(k, d) { try { var v = JSON.parse(sessionStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function accounts() { var a = lsGet(ACC_KEY, []); return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && x; }) : []; }
  function setAccounts(a) { lsSet(ACC_KEY, a); }
  function toks() { var t = lsGet(TOKS_KEY, null); if (!t) { t = ssGet(TOKS_KEY, {}); if (t && Object.keys(t).length) lsSet(TOKS_KEY, t); } return t && typeof t === "object" ? t : {}; }
  function readTok(email) { var t = toks()[email]; return t && t.exp > Date.now() + 30000 ? t : null; }
  function saveTok(email, t) { var all = toks(); all[email] = t; lsSet(TOKS_KEY, all); }
  function clearTok(email) { var all = toks(); delete all[email]; lsSet(TOKS_KEY, all); }
  function primary() { return accounts()[0] || ""; }
  function live() { return accounts().filter(function (e) { return !!readTok(e); }); }

  /* ---------- staying signed in (server helper) ---------- */
  var SRV = "/.netlify/functions/gauth", srvOn = false, srvHas = {}, inflight = {};
  function srvCall(op, body) {
    body = body || {}; body.client_id = CLIENT_ID;
    return fetch(SRV + "?op=" + op, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-OwnInbox": "1" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { j._s = r.status; return j; }, function () { return { _s: r.status }; }); });
  }
  var srvReady = (location.protocol === "https:" && CLIENT_ID ? srvCall("list") : Promise.resolve({ _s: 0 }))
    .then(function (j) {
      srvOn = j._s === 200 && !!j.ok;
      if (!srvOn) return;
      var a = accounts();
      (j.emails || []).forEach(function (e) { srvHas[e] = 1; if (a.indexOf(e) < 0) a.push(e); });
      setAccounts(a);
      if (a.length) { try { localStorage.setItem("gsigned", "1"); } catch (e) {} }
    }, function () { srvOn = false; });
  function kept(email) { return srvOn && !!srvHas[email]; }
  /* a usable token for this account, renewing it quietly when it can */
  function ensureTok(email, force) {
    var t = !force && readTok(email);
    if (t) return Promise.resolve(t);
    if (!kept(email)) return Promise.resolve(null);
    if (inflight[email]) return inflight[email];
    inflight[email] = srvCall("refresh", { email: email }).then(function (j) {
      delete inflight[email];
      if (j && j.access_token) { var tok = { t: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 }; saveTok(email, tok); return tok; }
      if (j && j._s === 401) delete srvHas[email];
      return null;
    }, function () { delete inflight[email]; return null; });
    return inflight[email];
  }
  function fresh() { return Promise.all(accounts().map(function (e) { return ensureTok(e); })); }
  /* renew a few minutes before Google's hour runs out, and when you come back to the tab */
  function topUp() { if (!srvOn) return; accounts().forEach(function (e) { var t = toks()[e]; if (kept(e) && (!t || t.exp - Date.now() < 5 * 60e3)) ensureTok(e, true); }); }
  setInterval(topUp, 60e3);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) topUp(); });

  function profile(token) {
    return fetch(GM + "profile", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { return String(j.emailAddress || "").toLowerCase(); }, function () { return ""; });
  }
  function remember(email, tok) {
    saveTok(email, tok);
    var a = accounts(); if (a.indexOf(email) < 0) { a.push(email); setAccounts(a); }
    try { localStorage.setItem("gsigned", "1"); } catch (e) {}
  }

  /* Older versions kept a single token in "gtok": move it over once */
  var ready = (function () {
    var old = null; try { old = JSON.parse(sessionStorage.getItem(OLD_KEY) || "null"); } catch (e) {}
    try { sessionStorage.removeItem(OLD_KEY); } catch (e) {}
    if (!old || !(old.exp > Date.now() + 30000)) return srvReady;
    return Promise.all([srvReady, profile(old.t).then(function (email) { if (email) remember(email, old); })]);
  })();

  function gisReady() {
    return new Promise(function (res, rej) {
      var n = 0;
      (function wait() {
        if (window.google && google.accounts && google.accounts.oauth2) return res();
        if (++n > 100) return rej(new Error("Google sign-in did not load"));
        setTimeout(wait, 100);
      })();
    });
  }
  /* signIn()            sign in again (first account whose session ended)
     signIn(email)       sign in again as that account
     signIn({add:true})  pick another Google account and add it */
  function signIn(opt) {
    if (!CLIENT_ID || CLIENT_ID.indexOf("PASTE") === 0) {
      alert("Add your Google client ID to config.js first. The README explains how to get one.");
      return Promise.reject(new Error("no client id"));
    }
    var add = opt && typeof opt === "object" && opt.add;
    var hint = typeof opt === "string" ? opt : "";
    if (!add && !hint) hint = accounts().filter(function (e) { return !readTok(e); })[0] || "";
    var prompt = add ? "select_account" : (hint || localStorage.getItem("gsigned")) ? "" : "consent";
    if (srvOn) return gisReady().then(function () { return codeSignIn(add, hint, false); });
    return gisReady().then(function () {
      return new Promise(function (res, rej) {
        var cfg = {
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: function (r) {
            if (!(r && r.access_token)) return rej(r);
            var tok = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
            profile(r.access_token).then(function (email) {
              if (!email) return rej(new Error("Couldn’t read which account this is"));
              remember(email, tok);
              res(email);
            });
          },
          error_callback: function (e) { rej(e); }
        };
        if (hint) cfg.hint = hint;
        google.accounts.oauth2.initTokenClient(cfg).requestAccessToken({ prompt: prompt, hint: hint || undefined });
      });
    });
  }
  /* sign in once and stay signed in: Google gives a code, the site's helper
     swaps it for a refresh token it keeps, and hands back an access token */
  function codeSignIn(add, hint, retried) {
    return new Promise(function (res, rej) {
      var cfg = {
        client_id: CLIENT_ID, scope: SCOPES, ux_mode: "popup", select_account: !!add,
        callback: function (r) {
          if (!(r && r.code)) return rej(r);
          srvCall("exchange", { code: r.code }).then(function (j) {
            if (!j || !j.access_token || !j.email) return rej(new Error(j && j.error || "Sign-in failed"));
            var tok = { t: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
            remember(j.email, tok);
            if (j.need_consent && !retried) {
              /* Google already had an older permission without "stay signed in": reset it once and ask again */
              try { google.accounts.oauth2.revoke(j.access_token, function () { codeSignIn(false, j.email, true).then(res, rej); }); } catch (x) { res(j.email); }
              return;
            }
            if (!j.need_consent) srvHas[j.email] = 1;
            res(j.email);
          }, rej);
        },
        error_callback: function (e) { rej(e); }
      };
      if (hint) cfg.login_hint = hint;
      google.accounts.oauth2.initCodeClient(cfg).requestCode();
    });
  }
  /* signOut(email) removes one account; signOut() removes all */
  function signOut(email) {
    var list = email ? [email] : accounts(), all = toks();
    list.forEach(function (e) {
      var t = all[e];
      if (t && window.google && google.accounts && google.accounts.oauth2) { try { google.accounts.oauth2.revoke(t.t, function () {}); } catch (x) {} }
      clearTok(e);
    });
    if (srvOn) { list.forEach(function (e) { delete srvHas[e]; }); srvCall("signout", email ? { email: email } : {}).catch(function () {}); }
    var rest = accounts().filter(function (e) { return list.indexOf(e) < 0; });
    setAccounts(rest);
    if (!rest.length) { try { localStorage.removeItem("gsigned"); } catch (e) {} }
    return Promise.resolve();
  }
  window.gAuth = {
    signIn: signIn,
    addAccount: function () { return signIn({ add: true }); },
    signOut: signOut,
    signedIn: function () { return live().length > 0 || accounts().some(kept); },
    accounts: function () { return accounts().map(function (e) { return { email: e, on: !!readTok(e) || kept(e) }; }); },
    staysSignedIn: function () { return srvOn; },
    /* ask Google for one more permission (for example settings sync) for an account */
    grant: function (scope, email) {
      return gisReady().then(function () {
        return new Promise(function (res, rej) {
          google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID, scope: SCOPES + " " + scope, hint: email || primary(), include_granted_scopes: true,
            callback: function (r) {
              if (!(r && r.access_token)) return rej(r);
              if (r.scope && r.scope.indexOf(scope) < 0) return rej(err("not_granted"));
              saveTok(email || primary(), { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
              res(true);
            },
            error_callback: function (e) { rej(e); }
          }).requestAccessToken({ prompt: "", hint: email || primary() });
        });
      });
    },
    /* a signed request to any Google API for one account */
    api: function (url, opt, email) { return api(url, opt, email); },
    primary: primary,
    ready: ready
  };

  /* ---------- quiet renewal without the helper ----------
     Google's one-hour pass can be renewed without typing anything while you are
     still signed in to Google in this browser. Browsers only allow the small
     Google window when you click or press a key, so the renewal waits for your
     next click in the app (from 10 minutes before the hour ends). */
  var QQ = { failed: {}, busy: false, armed: false, missed: false }, T0 = Date.now();
  function needsQuiet(e) { var t = toks()[e]; return !kept(e) && !QQ.failed[e] && (!t || t.exp - Date.now() < 10 * 60e3); }
  function canQuiet(e) { return !!CLIENT_ID && !kept(e) && !QQ.failed[e] && accounts().indexOf(e) > -1; }
  function silent(email) {
    return gisReady().then(function () {
      return new Promise(function (res) {
        var done = false, fin = function (v) { if (!done) { done = true; res(v); } };
        setTimeout(function () { fin(false); }, 20000);
        try {
          google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID, scope: SCOPES, hint: email,
            callback: function (r) {
              if (!(r && r.access_token)) return fin(false);
              var tok = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
              profile(r.access_token).then(function (who) { if (who === email) { saveTok(email, tok); fin(true); } else fin(false); });
            },
            error_callback: function () { fin(false); }
          }).requestAccessToken({ prompt: "none", hint: email });
        } catch (x) { fin(false); }
      });
    }, function () { return false; });
  }
  function onAct(ev) {
    if (QQ.busy || !ev.isTrusted || (ev.target && ev.target.closest && ev.target.closest("#gsignin,.gexp"))) return;
    var e = accounts().filter(needsQuiet)[0];
    if (!e) { disarm(); return; }
    QQ.busy = true;
    silent(e).then(function (ok) {
      QQ.busy = false;
      if (ok) {
        delete expired[e]; dropPrompt(e);
        if (!accounts().some(needsQuiet)) {
          disarm();
          /* the app tried to load while the pass was out: load it again now */
          if (QQ.missed) { QQ.missed = false; var a = document.activeElement; if (!(a && /INPUT|TEXTAREA/.test(a.tagName) && a.value)) location.reload(); else setTimeout(function () { location.reload(); }, 60000); }
        }
      } else { QQ.failed[e] = 1; showExpired(e); }
    });
  }
  function arm() { if (QQ.armed) return; QQ.armed = true; window.addEventListener("pointerdown", onAct, true); window.addEventListener("keydown", onAct, true); }
  function disarm() { QQ.armed = false; window.removeEventListener("pointerdown", onAct, true); window.removeEventListener("keydown", onAct, true); }
  function watchQuiet() { ready.then(function () { if (accounts().some(needsQuiet)) arm(); }); }
  setInterval(watchQuiet, 60e3); watchQuiet();

  /* Small floating prompt, one line per account whose 1-hour Google session ran out */
  var promptEl = null, expired = {};
  function dropPrompt(email) {
    if (!promptEl) return;
    var keys = Object.keys(expired);
    if (!keys.length) { promptEl.remove(); promptEl = null; return; }
    var r = promptEl.querySelector('[data-e="' + email.replace(/[<>&"]/g, "") + '"]'); if (r) r.closest(".gexr").remove();
  }
  function showExpired(email) {
    if (!email || accounts().indexOf(email) < 0 || expired[email] || kept(email)) return;
    if (canQuiet(email)) { QQ.missed = QQ.missed || Date.now() - T0 < 30000; arm(); return; }
    expired[email] = 1;
    if (!promptEl) {
      promptEl = document.createElement("div");
      promptEl.className = "gexp";
      document.body.appendChild(promptEl);
    }
    var keys = Object.keys(expired), many = accounts().length > 1;
    promptEl.innerHTML = keys.map(function (e) {
      return '<div class="gexr"><span>' + (many ? "Session ended for " + e.replace(/[<>&"]/g, "") : "Your Google session ended.") + '</span><button type="button" class="btn pri" data-e="' + e.replace(/[<>&"]/g, "") + '">Sign in again</button></div>';
    }).join("");
    promptEl.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { signIn(b.dataset.e).then(function () { location.reload(); }); };
    });
  }

  /* ---------- HTTP ---------- */
  function err(code, detail) { var e = new Error(code); e.code = code; e.detail = detail; return e; }
  function api(url, opt, email) {
    return ready.then(function () {
      email = email || primary();
      return email ? ensureTok(email) : null;
    }).then(function (t) { return call(t, false); });
    function call(t, again) {
      if (!t) { showExpired(email); return Promise.reject(err("needs_signin")); }
      opt = opt || {};
      var h = { Authorization: "Bearer " + t.t };
      if (opt.body) h["Content-Type"] = "application/json";
      return fetch(url, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined })
        .then(function (r) {
          if (r.status === 401) { clearTok(email); if (!again && kept(email)) return ensureTok(email, true).then(function (t2) { return call(t2, true); }); showExpired(email); throw err("needs_signin"); }
          if (r.status === 204) return {};
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) {
              var msg = j && j.error && j.error.message;
              console.error("Google API error", r.status, msg || j);
              if (r.status === 403 && /insufficient|scope/i.test(msg || "")) throw err("not_in_manifest", msg);
              if (r.status === 429 || r.status >= 500) throw err("upstream_error", msg);
              throw err("tool_error", msg);
            }
            return j;
          });
        }, function (e) { throw err("server_unavailable", String(e)); });
    }
  }
  /* thread ids carry their account: "me@gmail.com~18c3f..." */
  function split(id) {
    id = String(id || ""); var k = id.indexOf("~");
    return k > 0 && accounts().indexOf(id.slice(0, k)) > -1 ? { email: id.slice(0, k), id: id.slice(k + 1) } : { email: primary(), id: id };
  }
  function qs(o) {
    return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ""; })
      .map(function (k) { return [].concat(o[k]).map(function (v) { return encodeURIComponent(k) + "=" + encodeURIComponent(v); }).join("&"); }).join("&");
  }
  function pool(items, n, fn) {
    var out = new Array(items.length), i = 0;
    function next() { var k = i++; if (k >= items.length) return Promise.resolve(); return fn(items[k]).then(function (v) { out[k] = v; }, function () { out[k] = null; }).then(next); }
    var w = []; for (var j = 0; j < Math.min(n, items.length); j++) w.push(next());
    return Promise.all(w).then(function () { return out; });
  }

  /* ---------- Gmail helpers ---------- */
  function hdr(msg, name) {
    var hs = (msg.payload && msg.payload.headers) || [];
    for (var i = 0; i < hs.length; i++) if (hs[i].name.toLowerCase() === name.toLowerCase()) return hs[i].value;
    return "";
  }
  function b64urlBytes(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    var bin = atob(s), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  function decodePart(part) {
    var cs = "utf-8", ct = "";
    (part.headers || []).forEach(function (h) { if (h.name.toLowerCase() === "content-type") ct = h.value; });
    var m = /charset="?([^";]+)"?/i.exec(ct); if (m) cs = m[1];
    var bytes = b64urlBytes(part.body && part.body.data);
    try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder("utf-8").decode(bytes); }
  }
  function findPart(p, type) {
    if (!p) return null;
    if (p.mimeType === type && p.body && p.body.data) return p;
    var ps = p.parts || [];
    for (var i = 0; i < ps.length; i++) { var f = findPart(ps[i], type); if (f) return f; }
    return null;
  }
  function htmlToText(html) {
    var d = new DOMParser().parseFromString(html, "text/html");
    d.querySelectorAll("style,script,head,title").forEach(function (x) { x.remove(); });
    d.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href") || "", t = (a.textContent || "").trim();
      if (/^https?:/i.test(href) && t && t !== href) a.textContent = t + " " + href;
    });
    d.querySelectorAll("br").forEach(function (x) { x.replaceWith("\n"); });
    d.querySelectorAll("p,div,tr,li,h1,h2,h3,h4,h5,h6,table,section,article").forEach(function (x) { x.append("\n"); });
    return (d.body ? d.body.textContent : "").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function bodyText(msg) {
    var p = findPart(msg.payload, "text/plain");
    if (p) return decodePart(p);
    var h = findPart(msg.payload, "text/html");
    if (h) return htmlToText(decodePart(h));
    return msg.snippet || "";
  }
  /* files attached to a message: name, type, size and the id to fetch them with */
  function attachmentsOf(msg) {
    var out = [];
    (function walk(p) {
      if (!p) return;
      if (p.filename && p.body && (p.body.attachmentId || p.body.data)) {
        var disp = ""; (p.headers || []).forEach(function (h) { if (h.name.toLowerCase() === "content-disposition") disp = h.value; });
        var inline = /^inline/i.test(disp) && /^image\//.test(p.mimeType || "");
        out.push({ filename: p.filename, mimeType: p.mimeType || "application/octet-stream", size: p.body.size || 0, attachmentId: p.body.attachmentId || "", data: p.body.attachmentId ? "" : (p.body.data || ""), messageId: msg.id, inline: inline });
      }
      (p.parts || []).forEach(walk);
    })(msg.payload);
    return out;
  }
  function splitAddrs(s) { return (String(s || "").match(/(?:"[^"]*"|[^,])+/g) || []).map(function (x) { return x.trim(); }).filter(Boolean); }
  function b64(str) { var b = new TextEncoder().encode(str), s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function b64url(str) { return b64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function decodeEntities(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }

  /* ---------- Calendar helpers ---------- */
  var TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
  function rfc(local) { var d = new Date(local); return isNaN(d) ? local : d.toISOString(); }
  function evTimes(i) {
    if (i.allDay) return {
      start: { date: String(i.startTime).slice(0, 10), dateTime: null, timeZone: null },
      end: { date: String(i.endTime).slice(0, 10), dateTime: null, timeZone: null }
    };
    return {
      start: { dateTime: i.startTime, timeZone: TZ, date: null },
      end: { dateTime: i.endTime, timeZone: TZ, date: null }
    };
  }

  function searchOne(email, i) {
    return api(GM + "threads?" + qs({ q: i.query, maxResults: i.pageSize || 25 }), null, email).then(function (r) {
      var ids = (r.threads || []).map(function (t) { return t.id; });
      return pool(ids, 6, function (id) {
        return api(GM + "threads/" + id + "?" + qs({ format: "metadata", metadataHeaders: ["From", "Subject", "List-Unsubscribe"] }), null, email);
      }).then(function (ts) {
        return ts.filter(Boolean).map(function (t) {
          var ms = t.messages || [], first = ms[0] || {}, last = ms[ms.length - 1] || {}, labels = {};
          ms.forEach(function (m) { (m.labelIds || []).forEach(function (l) { labels[l] = 1; }); });
          return {
            id: email + "~" + t.id,
            account: email,
            viewUrl: "https://mail.google.com/mail/?authuser=" + encodeURIComponent(email) + "#all/" + t.id,
            messages: [{
              sender: hdr(last, "From"),
              subject: hdr(first, "Subject"),
              date: new Date(Number(last.internalDate) || Date.now()).toISOString(),
              labelIds: Object.keys(labels),
              snippet: decodeEntities(last.snippet || ""),
              listUnsub: ms.some(function (x) { return !!hdr(x, "List-Unsubscribe"); })
            }]
          };
        });
      });
    });
  }

  /* ---------- the tools the app calls ---------- */
  var TOOLS = {
    "Gmail/search_threads": function (i) {
      return ready.then(fresh).then(function () {
        var all = accounts();
        if (!all.length) return Promise.reject(err("needs_signin"));
        all.forEach(function (e) { if (!readTok(e)) showExpired(e); });
        var on = live();
        if (!on.length) return Promise.reject(err("needs_signin"));
        var firstErr = null;
        return Promise.all(on.map(function (email) {
          return searchOne(email, i).catch(function (e) { firstErr = firstErr || e; return null; });
        })).then(function (parts) {
          var ok = parts.filter(Boolean);
          if (!ok.length) throw firstErr || err("tool_error");
          var threads = [].concat.apply([], ok);
          threads.sort(function (a, b) { return new Date(b.messages[0].date) - new Date(a.messages[0].date); });
          return { threads: threads, accounts: on };
        });
      });
    },
    "Gmail/get_thread": function (i) {
      var x = split(i.threadId);
      return api(GM + "threads/" + encodeURIComponent(x.id) + "?format=full", null, x.email).then(function (t) {
        return {
          messages: (t.messages || []).map(function (m) {
            return {
              sender: hdr(m, "From"),
              subject: hdr(m, "Subject"),
              date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
              toRecipients: splitAddrs(hdr(m, "To")).concat(splitAddrs(hdr(m, "Cc"))),
              plaintextBody: bodyText(m),
              snippet: decodeEntities(m.snippet || ""),
              id: m.id,
              messageIdHeader: hdr(m, "Message-ID") || hdr(m, "Message-Id"),
              references: hdr(m, "References"),
              labelIds: m.labelIds || [],
              attachments: attachmentsOf(m)
            };
          })
        };
      });
    },
    "Gmail/send_message": function (i) {
      var lines = [
        "To: " + [].concat(i.to || []).join(", "),
      ].concat(i.inReplyTo ? ["In-Reply-To: " + i.inReplyTo, "References: " + ((i.references ? i.references + " " : "") + i.inReplyTo).trim()] : []).concat([
        "Subject: =?UTF-8?B?" + b64(i.subject || "") + "?=",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        (b64(i.body || "").match(/.{1,76}/g) || [""]).join("\r\n")
      ]);
      var from = String(i.from || "").toLowerCase(), th = i.threadId ? split(i.threadId) : null;
      if (th && accounts().indexOf(from) < 0) from = th.email;
      if (accounts().indexOf(from) < 0) from = primary();
      var body = { raw: b64url(lines.join("\r\n")) };
      if (th && th.email === from) body.threadId = th.id;
      return api(GM + "messages/send", { method: "POST", body: body }, from);
    },
    "Gmail/label_thread": function (i) {
      var x = split(i.threadId);
      return api(GM + "threads/" + encodeURIComponent(x.id) + "/modify", { method: "POST", body: { addLabelIds: i.labelIds || [] } }, x.email);
    },
    "Gmail/get_attachment": function (i) {
      var x = split(i.threadId);
      return api(GM + "messages/" + encodeURIComponent(i.messageId) + "/attachments/" + encodeURIComponent(i.attachmentId), null, x.email).then(function (r) { return { data: r.data || "", size: r.size || 0 }; });
    },
    "Gmail/trash_thread": function (i) { var x = split(i.threadId); return api(GM + "threads/" + encodeURIComponent(x.id) + "/trash", { method: "POST" }, x.email); },
    "Gmail/untrash_thread": function (i) { var x = split(i.threadId); return api(GM + "threads/" + encodeURIComponent(x.id) + "/untrash", { method: "POST" }, x.email); },
    "Gmail/unlabel_thread": function (i) {
      var x = split(i.threadId);
      return api(GM + "threads/" + encodeURIComponent(x.id) + "/modify", { method: "POST", body: { removeLabelIds: i.labelIds || [] } }, x.email);
    },
    /* calendars from every signed-in account; the first account's ids stay plain,
       others are "email~calendarId"; a calendar two accounts share is listed once */
    "Google Calendar/list_calendars": function () {
      return ready.then(fresh).then(function () {
        var on = live(), first = primary();
        if (!on.length) return api(CA + "users/me/calendarList"); /* triggers the sign-in prompt */
        on.sort(function (a, b) { return (b === first ? 1 : 0) - (a === first ? 1 : 0); });
        var firstErr = null;
        return Promise.all(on.map(function (email) {
          return api(CA + "users/me/calendarList?" + qs({ maxResults: 50 }), null, email).then(function (r) {
            var items = (r.items || []).filter(function (c) { return !c.hidden; });
            items.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
            return items.map(function (c) {
              return { id: email === first ? c.id : email + "~" + c.id, rawId: c.id, account: email, primary: !!c.primary,
                summary: c.summaryOverride || c.summary || c.id, accessRole: c.accessRole };
            });
          }, function (e) { firstErr = firstErr || e; return null; });
        })).then(function (parts) {
          var ok = parts.filter(Boolean);
          if (!ok.length) throw firstErr || err("tool_error");
          var seen = {}, out = [];
          [].concat.apply([], ok).forEach(function (c) { if (!seen[c.rawId]) { seen[c.rawId] = 1; out.push(c); } });
          return { calendars: out, accounts: on };
        });
      });
    },
    "Google Calendar/list_events": function (i) {
      var x = split(i.calendarId);
      return api(CA + "calendars/" + encodeURIComponent(x.id) + "/events?" + qs({
        timeMin: rfc(i.startTime), timeMax: rfc(i.endTime), singleEvents: "true",
        orderBy: "startTime", maxResults: i.pageSize || 100
      }), null, x.email).then(function (r) { return { summary: r.summary || "", accessRole: r.accessRole, events: r.items || [] }; });
    },
    "Google Calendar/create_event": function (i) {
      var b = evTimes(i), x = split(i.calendarId); b.summary = i.summary;
      return api(CA + "calendars/" + encodeURIComponent(x.id) + "/events", { method: "POST", body: b }, x.email);
    },
    "Google Calendar/update_event": function (i) {
      var b = evTimes(i), x = split(i.calendarId); if (i.summary != null) b.summary = i.summary;
      return api(CA + "calendars/" + encodeURIComponent(x.id) + "/events/" + encodeURIComponent(i.eventId), { method: "PATCH", body: b }, x.email);
    }
  };

  function callTool(server, tool, input) {
    var f = TOOLS[server + "/" + tool];
    if (!f) return Promise.reject(err("tool_error", "Unknown tool " + tool));
    return f(input || {}).then(function (payload) { return { payload: payload }; });
  }

  /* watchTool: run now, then every refetchInterval while the tab is visible */
  var watches = [];
  function watchTool(server, tool, input, handler, opts) {
    var w = { server: server, tool: tool, last: 0, stopped: false };
    w.run = function () {
      w.last = Date.now();
      callTool(server, tool, input).then(function (r) {
        if (!w.stopped) handler({ type: "data", result: { payload: r.payload, cache: { storedAt: Date.now() } } });
      }, function (e) {
        if (!w.stopped) handler({ type: "error", error: { code: e.code || "tool_error", message: e.detail || e.message } });
      });
    };
    var every = (opts && opts.refetchInterval) || 0;
    if (every) w.timer = setInterval(function () { if (!document.hidden) w.run(); }, every);
    w.every = every;
    watches.push(w);
    w.run();
    return function () { w.stopped = true; clearInterval(w.timer); };
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    watches.forEach(function (w) { if (!w.stopped && w.every && Date.now() - w.last > w.every) w.run(); });
  });
  function invalidate(server, tool) {
    watches.forEach(function (w) { if (!w.stopped && w.server === server && (!tool || w.tool === tool)) w.run(); });
    return Promise.resolve();
  }

  var MCP = { callTool: callTool, watchTool: watchTool, invalidate: invalidate };
  window.claude = {
    use: function (name) {
      if (name === "mcp") return Promise.resolve(MCP);
      return Promise.resolve(null); /* summaries and cloud notes are not available on Netlify */
    }
  };
})();
