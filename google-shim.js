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
  var TOK_KEY = "gtok";

  /* ---------- sign-in ---------- */
  function readTok() {
    try { var t = JSON.parse(sessionStorage.getItem(TOK_KEY) || "null"); return t && t.exp > Date.now() + 30000 ? t : null; }
    catch (e) { return null; }
  }
  function saveTok(t) { try { sessionStorage.setItem(TOK_KEY, JSON.stringify(t)); } catch (e) {} }
  function clearTok() { try { sessionStorage.removeItem(TOK_KEY); } catch (e) {} }
  var hadToken = !!readTok();

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
  function signIn() {
    if (!CLIENT_ID || CLIENT_ID.indexOf("PASTE") === 0) {
      alert("Add your Google client ID to config.js first. The README explains how to get one.");
      return Promise.reject(new Error("no client id"));
    }
    return gisReady().then(function () {
      return new Promise(function (res, rej) {
        var client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: function (r) {
            if (r && r.access_token) {
              saveTok({ t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
              try { localStorage.setItem("gsigned", "1"); } catch (e) {}
              res();
            } else rej(r);
          },
          error_callback: function (e) { rej(e); }
        });
        client.requestAccessToken({ prompt: localStorage.getItem("gsigned") ? "" : "consent" });
      });
    });
  }
  function signOut() {
    var t = readTok();
    clearTok();
    try { localStorage.removeItem("gsigned"); } catch (e) {}
    if (t && window.google && google.accounts && google.accounts.oauth2) {
      return new Promise(function (r) { google.accounts.oauth2.revoke(t.t, r); });
    }
    return Promise.resolve();
  }
  window.gAuth = { signIn: signIn, signOut: signOut, signedIn: function () { return !!readTok(); } };

  /* Small floating prompt when the 1-hour Google session runs out */
  var promptEl = null;
  function showExpired() {
    if (promptEl || !hadToken) return;
    promptEl = document.createElement("div");
    promptEl.className = "gexp";
    promptEl.innerHTML = '<span>Your Google session ended.</span><button type="button" class="btn pri">Sign in again</button>';
    promptEl.querySelector("button").onclick = function () { signIn().then(function () { location.reload(); }); };
    document.body.appendChild(promptEl);
  }

  /* ---------- HTTP ---------- */
  function err(code, detail) { var e = new Error(code); e.code = code; e.detail = detail; return e; }
  function api(url, opt) {
    var t = readTok();
    if (!t) { showExpired(); return Promise.reject(err("needs_signin")); }
    opt = opt || {};
    var h = { Authorization: "Bearer " + t.t };
    if (opt.body) h["Content-Type"] = "application/json";
    return fetch(url, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        if (r.status === 401) { clearTok(); showExpired(); throw err("needs_signin"); }
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

  /* ---------- the tools the app calls ---------- */
  var TOOLS = {
    "Gmail/search_threads": function (i) {
      return api(GM + "threads?" + qs({ q: i.query, maxResults: i.pageSize || 25 })).then(function (r) {
        var ids = (r.threads || []).map(function (t) { return t.id; });
        return pool(ids, 6, function (id) {
          return api(GM + "threads/" + id + "?" + qs({ format: "metadata", metadataHeaders: ["From", "Subject", "List-Unsubscribe"] }));
        }).then(function (ts) {
          return {
            threads: ts.filter(Boolean).map(function (t) {
              var ms = t.messages || [], first = ms[0] || {}, last = ms[ms.length - 1] || {}, labels = {};
              ms.forEach(function (m) { (m.labelIds || []).forEach(function (l) { labels[l] = 1; }); });
              return {
                id: t.id,
                viewUrl: "https://mail.google.com/mail/#all/" + t.id,
                messages: [{
                  sender: hdr(last, "From"),
                  subject: hdr(first, "Subject"),
                  date: new Date(Number(last.internalDate) || Date.now()).toISOString(),
                  labelIds: Object.keys(labels),
                  snippet: decodeEntities(last.snippet || ""),
                  listUnsub: ms.some(function (x) { return !!hdr(x, "List-Unsubscribe"); })
                }]
              };
            })
          };
        });
      });
    },
    "Gmail/get_thread": function (i) {
      return api(GM + "threads/" + encodeURIComponent(i.threadId) + "?format=full").then(function (t) {
        return {
          messages: (t.messages || []).map(function (m) {
            return {
              sender: hdr(m, "From"),
              subject: hdr(m, "Subject"),
              date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
              toRecipients: splitAddrs(hdr(m, "To")).concat(splitAddrs(hdr(m, "Cc"))),
              plaintextBody: bodyText(m),
              snippet: decodeEntities(m.snippet || "")
            };
          })
        };
      });
    },
    "Gmail/send_message": function (i) {
      var lines = [
        "To: " + [].concat(i.to || []).join(", "),
        "Subject: =?UTF-8?B?" + b64(i.subject || "") + "?=",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        (b64(i.body || "").match(/.{1,76}/g) || [""]).join("\r\n")
      ];
      return api(GM + "messages/send", { method: "POST", body: { raw: b64url(lines.join("\r\n")) } });
    },
    "Gmail/trash_thread": function (i) { return api(GM + "threads/" + encodeURIComponent(i.threadId) + "/trash", { method: "POST" }); },
    "Gmail/untrash_thread": function (i) { return api(GM + "threads/" + encodeURIComponent(i.threadId) + "/untrash", { method: "POST" }); },
    "Gmail/unlabel_thread": function (i) {
      return api(GM + "threads/" + encodeURIComponent(i.threadId) + "/modify", { method: "POST", body: { removeLabelIds: i.labelIds || [] } });
    },
    "Google Calendar/list_calendars": function () {
      return api(CA + "users/me/calendarList?" + qs({ maxResults: 50 })).then(function (r) {
        var items = (r.items || []).filter(function (c) { return !c.hidden; });
        items.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
        return { calendars: items.map(function (c) { return { id: c.id, summary: c.summaryOverride || c.summary || c.id, accessRole: c.accessRole }; }) };
      });
    },
    "Google Calendar/list_events": function (i) {
      return api(CA + "calendars/" + encodeURIComponent(i.calendarId) + "/events?" + qs({
        timeMin: rfc(i.startTime), timeMax: rfc(i.endTime), singleEvents: "true",
        orderBy: "startTime", maxResults: i.pageSize || 100
      })).then(function (r) { return { summary: r.summary || "", accessRole: r.accessRole, events: r.items || [] }; });
    },
    "Google Calendar/create_event": function (i) {
      var b = evTimes(i); b.summary = i.summary;
      return api(CA + "calendars/" + encodeURIComponent(i.calendarId) + "/events", { method: "POST", body: b });
    },
    "Google Calendar/update_event": function (i) {
      var b = evTimes(i); if (i.summary != null) b.summary = i.summary;
      return api(CA + "calendars/" + encodeURIComponent(i.calendarId) + "/events/" + encodeURIComponent(i.eventId), { method: "PATCH", body: b });
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
