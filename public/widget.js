/*
 * Embeddable personal-trainer chat widget.
 *
 * <script src="https://YOUR-COACH.vercel.app/widget.js"
 *         data-coach-name="Coach"
 *         data-color="#e4572e"
 *         data-greeting="Hey! Got a training question?"
 *         defer></script>
 *
 * Then, once your app has a Supabase client (the coach uses the user's existing login):
 *
 *   window.TrainerAgent.setTokenProvider(async () =>
 *     (await supabase.auth.getSession()).data.session?.access_token);
 *
 * Other calls:  window.TrainerAgent.open() / .close()
 *               window.TrainerAgent.clearMemory()   (erase the coach's notes + chat history for this user)
 *               window.TrainerAgent.signOut()       (call when the user logs out)
 */
(function () {
  if (window.TrainerAgent) return;
  var script = document.currentScript;
  var cfg = {
    server: (script && script.dataset.server) || (script ? new URL(script.src).origin : ""),
    token: script && script.dataset.userToken,
    name: (script && script.dataset.coachName) || "Coach",
    color: (script && script.dataset.color) || "#e4572e",
    greeting: (script && script.dataset.greeting) || "Hey! I'm your personal trainer. Ask me anything about technique, training, nutrition or recovery.",
  };
  var history = []; // shown messages; the server keeps the real memory
  var tokenProvider = null;
  var sends = 0; // bumps on every send, so a slow history load can't wipe a new message
  async function getToken() {
    if (tokenProvider) { try { return await tokenProvider(); } catch (e) { return null; } }
    return cfg.token || null;
  }

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;right:0;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.fab{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:' + cfg.color + ';color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}' +
    '.fab svg{width:28px;height:28px}' +
    '.panel{position:fixed;right:20px;bottom:92px;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:#fff;color:#1a1a1a;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}' +
    '.panel.open{display:flex}' +
    '.head{background:' + cfg.color + ';color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:600}' +
    '.head button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}' +
    '.log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6f6f7}' +
    '.msg{max-width:85%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.45;word-wrap:break-word}' +
    '.msg p{margin:0 0 6px}.msg p:last-child{margin:0}.msg ul,.msg ol{margin:4px 0 6px;padding-left:20px}' +
    '.bot{background:#fff;align-self:flex-start;border:1px solid #e6e6e8}' +
    '.bot a{color:' + cfg.color + '}' +
    '.media{margin:6px 0;width:100%}' +
    '.media iframe,.media video{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:#000}' +
    '.media .cap{display:block;font-size:12.5px;color:#555;margin-top:4px;text-decoration:none}' +
    '.btn-link{display:inline-block;padding:7px 12px;border-radius:8px;background:' + cfg.color + ';color:#fff !important;text-decoration:none;font-weight:600;font-size:13px}' +
    '.msg.has-media{width:85%}' +
    '.me{background:' + cfg.color + ';color:#fff;align-self:flex-end}' +
    '.err{background:#fdecea;color:#8a1c12;align-self:flex-start}' +
    '.typing{align-self:flex-start;color:#777;font-size:13px;padding:4px 6px}' +
    'form{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}' +
    'textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:10px;padding:9px 10px;font-size:14px;height:42px;max-height:120px;outline:none}' +
    'textarea:focus{border-color:' + cfg.color + '}' +
    '.send{border:0;border-radius:10px;padding:0 14px;background:' + cfg.color + ';color:#fff;font-weight:600;cursor:pointer}' +
    '.send:disabled{opacity:.5;cursor:default}' +
    '@media (max-width:540px){.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}}' +
    '</style>' +
    '<button class="fab" aria-label="Open personal trainer chat"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.57 14.86 22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/></svg></button>' +
    '<div class="panel" role="dialog" aria-label="Personal trainer chat">' +
    '<div class="head"><span></span><button class="close" aria-label="Close">&times;</button></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><textarea placeholder="Ask your trainer..." rows="1"></textarea><button class="send" type="submit">Send</button></form>' +
    '</div>';

  var $ = function (s) { return root.querySelector(s); };
  var panel = $(".panel"), log = $(".log"), input = $("textarea"), sendBtn = $(".send");
  $(".head span").textContent = cfg.name;

  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // Videos: a line that is just a link to YouTube or a .mp4/.webm file becomes a player.
  function youtubeId(u) {
    var m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function media(title, url) {
    var id = youtubeId(url), t = esc(title || "Exercise video"), u = esc(url);
    if (id) return '<div class="media"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?rel=0" title="' + t + '" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><a class="cap" href="' + u + '" target="_blank" rel="noopener">' + t + '</a></div>';
    if (/^https:\/\/[^\s]+\.(mp4|webm)(\?[^\s]*)?$/i.test(url)) return '<div class="media"><video src="' + u + '" controls playsinline preload="metadata"></video><span class="cap">' + t + '</span></div>';
    if (/^https:\/\/(www\.)?youtube\.com\/results\?/.test(url)) return '<p><a class="btn-link" href="' + u + '" target="_blank" rel="noopener">&#9654; ' + t + '</a></p>';
    return null;
  }
  // Minimal, safe markdown: **bold**, *italic*, [links](https://...), bullet/numbered lists, paragraphs.
  function md(text) {
    var out = [], list = null;
    String(text).split("\n").forEach(function (raw) {
      var only = raw.match(/^\s*(?:[-*•]\s+)?\[([^\]]+)\]\((https:\/\/[^)\s]+)\)\s*$/) || raw.match(/^\s*()(https:\/\/\S+)\s*$/);
      var player = only && media(only[1], only[2]);
      if (player) { if (list) { out.push("</" + list + ">"); list = null; } out.push(player); return; }
      var line = esc(raw);
      var inline = function (s) {
        return s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1<i>$2</i>");
      };
      var ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      var type = ul ? "ul" : ol ? "ol" : null;
      if (list && list !== type) { out.push("</" + list + ">"); list = null; }
      if (type) { if (!list) { out.push("<" + type + ">"); list = type; } out.push("<li>" + inline((ul || ol)[1]) + "</li>"); }
      else if (line.trim()) out.push("<p>" + inline(line.replace(/^#+\s*/, "")) + "</p>");
    });
    if (list) out.push("</" + list + ">");
    return out.join("");
  }
  function add(role, text) {
    var d = document.createElement("div");
    d.className = "msg " + role;
    if (role === "bot") { d.innerHTML = md(text); if (d.querySelector(".media")) d.classList.add("has-media"); } else d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function render() {
    log.innerHTML = "";
    add("bot", cfg.greeting);
    history.forEach(function (m) { add(m.role === "user" ? "me" : "bot", m.content); });
  }

  async function post(pathname, body) {
    var token = await getToken();
    return fetch(cfg.server + pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ userToken: token }, body || {})),
    });
  }
  async function loadHistory() {
    var startedAt = sends;
    if (!(await getToken())) return;
    try {
      var r = await post("/api/history");
      if (!r.ok) return;
      var data = await r.json();
      if (sends !== startedAt) return; // user already started chatting; keep what's on screen
      history = Array.isArray(data.messages) ? data.messages : [];
      render();
    } catch (e) {}
  }

  async function send(text) {
    if (!(await getToken())) { add("err", "Please sign in to chat with your coach."); return; }
    sends++;
    add("me", text);
    sendBtn.disabled = true;
    var typing = document.createElement("div");
    typing.className = "typing"; typing.textContent = cfg.name + " is typing...";
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    try {
      var r = await post("/api/chat", { message: text });
      var data = await r.json().catch(function () { return {}; });
      typing.remove();
      if (!r.ok) { add("err", data.error || "Something went wrong."); return; }
      history.push({ role: "user", content: text }, { role: "assistant", content: data.reply });
      add("bot", data.reply);
    } catch (e) {
      typing.remove();
      add("err", "Couldn't reach the trainer. Check your connection and try again.");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  $(".fab").addEventListener("click", function () { panel.classList.toggle("open"); if (panel.classList.contains("open")) input.focus(); });
  $(".close").addEventListener("click", function () { panel.classList.remove("open"); });
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = "";
    send(text);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); }
  });

  render();
  loadHistory();
  (document.body ? Promise.resolve() : new Promise(function (r) { document.addEventListener("DOMContentLoaded", r); }))
    .then(function () { document.body.appendChild(host); });

  window.TrainerAgent = {
    open: function () { panel.classList.add("open"); },
    close: function () { panel.classList.remove("open"); },
    setTokenProvider: function (fn) {
      tokenProvider = fn;
      history = []; render(); loadHistory();
    },
    setUser: function (token) { // a fixed token (e.g. for local testing)
      if (token === cfg.token && !tokenProvider) return;
      tokenProvider = null; cfg.token = token;
      history = []; render(); loadHistory();
    },
    signOut: function () {
      tokenProvider = null; cfg.token = null;
      history = []; render(); panel.classList.remove("open");
    },
    clearMemory: async function () {
      var r = await post("/api/memory", { action: "clear" });
      if (r.ok) { history = []; render(); }
      return r.ok;
    },
  };
})();
