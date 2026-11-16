/* ===== 인성이 구조대 · 미션 & 발자국 스티커판 =====
   서버 없이 localStorage 에만 저장합니다.
   v2: 요일별 자동 스케줄(state.schedule) 도입
   v3: 수·금·토 기본 스케줄 개정(웅진 유아독해·유아어휘 추가) + v1/v2 자동 업그레이드 */
(function () {
  "use strict";

  var KEY = "insungstudy.v1";
  var RESET_KEY = "insungstudy.resets";
  var BOARD_SIZE = 30;
  var SVGNS = "http://www.w3.org/2000/svg";
  var DEFAULT_REWARD = "다이소 가서 원하는 거 고르기";
  var FULL_RESET_LABEL = "🔄 전체 초기화 (0부터 다시)";
  var MAX_MISSIONS = 12;

  /* ---------- 요일 ---------- */
  var DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; /* 월 → 일 */

  var MISSION_DEFS = {
    math1: { id: "m_math1", emoji: "🔢", name: "원리셈" },
    math2: { id: "m_math2", emoji: "➕", name: "소마셈" },
    shape: { id: "m_shape", emoji: "🔺", name: "소마도형" },
    english: { id: "m_english", emoji: "✏️", name: "잉글라이더 숙제" },
    books: { id: "m_books", emoji: "📚", name: "원서 3권", steps: ["1", "2", "3"] },
    somaHw1: { id: "m_somahw1", emoji: "📝", name: "소마숙제 1/2" },
    somaHw2: { id: "m_somahw2", emoji: "📝", name: "소마숙제 2/2" },
    jangwon: { id: "m_jangwon", emoji: "📖", name: "장원숙제" },
    woongjinRead: { id: "m_wj_read", emoji: "📘", name: "웅진 유아독해" },
    woongjinVocab: { id: "m_wj_vocab", emoji: "🔤", name: "웅진 유아어휘" }
  };

  /* Date.getDay() 기준: 1=월 … 6=토, 0=일 */
  var DEFAULT_SCHEDULE = {
    "1": [MISSION_DEFS.math1, MISSION_DEFS.math2, MISSION_DEFS.shape, MISSION_DEFS.english, MISSION_DEFS.books],
    "2": [MISSION_DEFS.somaHw1, MISSION_DEFS.english, MISSION_DEFS.books],
    "3": [MISSION_DEFS.somaHw2, MISSION_DEFS.math1, MISSION_DEFS.english, MISSION_DEFS.books,
          MISSION_DEFS.woongjinRead, MISSION_DEFS.woongjinVocab],
    "4": [MISSION_DEFS.math1, MISSION_DEFS.math2, MISSION_DEFS.shape, MISSION_DEFS.english, MISSION_DEFS.books],
    "5": [MISSION_DEFS.math1, MISSION_DEFS.math2, MISSION_DEFS.shape, MISSION_DEFS.english, MISSION_DEFS.books],
    "6": [MISSION_DEFS.jangwon, MISSION_DEFS.math1, MISSION_DEFS.math2, MISSION_DEFS.shape,
          MISSION_DEFS.woongjinRead, MISSION_DEFS.woongjinVocab],
    "0": []
  };

  var PAW_COLORS = ["#EE3E38", "#1F6FEB", "#FFC93C", "#2FBF71", "#FF8A3D", "#9B5DE5", "#00B8C4"];
  var MILESTONES = { 5: "⭐", 10: "🎁", 15: "⭐", 20: "🎁", 25: "⭐", 30: "🎁" };
  var CONFETTI_COLORS = ["#EE3E38", "#1F6FEB", "#FFC93C", "#2FBF71", "#FF8A3D", "#9B5DE5", "#FF7A8A"];

  var state = null;
  var viewDay = null;   /* 메인 화면에서 보고 있는 요일 (기본 = 오늘) */
  var editDay = null;   /* 엄마 설정에서 고치고 있는 요일 */
  var animateIndex = -1;
  var saveTimer = null;
  var toastTimer = null;

  /* ---------- 작은 도구들 ---------- */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function todayLabel() {
    var d = new Date();
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function todayDay() { return new Date().getDay(); }

  function dayName(day) { return DAY_NAMES[day] + "요일"; }

  function byId(id) { return document.getElementById(id); }

  function cloneMission(m) {
    var copy = { id: m.id, emoji: m.emoji, name: m.name };
    if (m.steps) copy.steps = m.steps.slice();
    return copy;
  }

  function defaultSchedule() {
    var out = {};
    DAY_ORDER.forEach(function (d) {
      var k = String(d);
      out[k] = DEFAULT_SCHEDULE[k].map(cloneMission);
    });
    return out;
  }

  function freshState() {
    return {
      version: 3,
      reward: DEFAULT_REWARD,
      schedule: defaultSchedule(),
      checks: {},
      board: [],
      boardsDone: 0,
      history: [],
      lastVisit: null
    };
  }

  function normalizeMissions(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (m) { return m && typeof m.name === "string" && m.name.trim(); })
      .slice(0, MAX_MISSIONS)
      .map(function (m, i) {
        var item = {
          id: String(m.id || "m_" + i),
          emoji: (typeof m.emoji === "string" && m.emoji.trim()) ? m.emoji.trim().slice(0, 4) : "⭐",
          name: m.name.trim().slice(0, 20)
        };
        if (Array.isArray(m.steps) && m.steps.length) {
          item.steps = m.steps.slice(0, 5).map(String);
        }
        return item;
      });
  }

  /* v1(요일 스케줄 없음)·v2(예전 기본 요일표) → v3 마이그레이션:
     board·boardsDone·reward·history·checks·lastVisit 은 그대로 살리고
     schedule 은 새 DEFAULT_SCHEDULE 로 채웁니다.
     v3 부터는 저장된 schedule 을 그대로 읽습니다(엄마 설정에서 고친 내용 유지). */
  function normalizeState(raw) {
    var s = freshState();
    if (!raw || typeof raw !== "object") return s;

    var rawVersion = Number(raw.version);
    if (!isFinite(rawVersion)) rawVersion = 1; /* version 없는 예전 데이터 = v1 */

    if (typeof raw.reward === "string" && raw.reward.trim()) {
      s.reward = raw.reward.trim().slice(0, 40);
    }

    if (rawVersion >= 3 && raw.schedule && typeof raw.schedule === "object" && !Array.isArray(raw.schedule)) {
      DAY_ORDER.forEach(function (d) {
        var k = String(d);
        if (Object.prototype.hasOwnProperty.call(raw.schedule, k)) {
          s.schedule[k] = normalizeMissions(raw.schedule[k]);
        }
      });
    }
    /* v1·v2 는 저장된 요일표를 버리고 freshState 의 새 기본 요일표를 그대로 씁니다. */

    if (raw.checks && typeof raw.checks === "object") {
      var checks = {};
      Object.keys(raw.checks).forEach(function (day) {
        var dayChecks = raw.checks[day];
        if (!dayChecks || typeof dayChecks !== "object") return;
        var clean = {};
        Object.keys(dayChecks).forEach(function (k) {
          if (dayChecks[k]) clean[String(k)] = true;
        });
        if (Object.keys(clean).length) checks[String(day)] = clean;
      });
      s.checks = checks;
    }
    if (Array.isArray(raw.board)) {
      s.board = raw.board
        .filter(function (e) { return e && typeof e === "object"; })
        .slice(0, BOARD_SIZE)
        .map(function (e, i) {
          var item = {
            key: String(e.key || ""),
            label: String(e.label || ""),
            color: typeof e.color === "string" && e.color ? e.color : PAW_COLORS[i % PAW_COLORS.length],
            rot: Number(e.rot) || 0
          };
          if (e.manual) item.manual = true;
          return item;
        });
    }
    s.boardsDone = Number.isFinite(raw.boardsDone) ? Math.max(0, Math.floor(raw.boardsDone)) : 0;
    s.history = Array.isArray(raw.history) ? raw.history.slice(-60) : [];
    if (typeof raw.lastVisit === "string") s.lastVisit = raw.lastVisit;
    return s;
  }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (err) { raw = null; }
    if (raw) {
      try { state = normalizeState(JSON.parse(raw)); }
      catch (err) { state = freshState(); }
    } else {
      state = freshState();
    }
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* 저장 불가 환경 무시 */ }
  }

  function saveSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 220);
  }

  function toast(message) {
    var el = byId("toast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.hidden = true; }, 2400);
  }

  /* ---------- 요일별 미션 목록 ---------- */
  function missionsOf(day) {
    var k = String(day);
    if (!Array.isArray(state.schedule[k])) state.schedule[k] = [];
    return state.schedule[k];
  }

  function viewMissions() { return missionsOf(viewDay); }
  function todayMissions() { return missionsOf(todayDay()); }
  function isPreview() { return viewDay !== todayDay(); }

  function findMission(list, id) {
    return list.filter(function (m) { return m.id === id; })[0];
  }

  /* ---------- 미션 체크 상태 ---------- */
  function dayChecks() {
    var day = todayKey();
    if (!state.checks[day]) state.checks[day] = {};
    return state.checks[day];
  }

  function isStepDone(mission, step) {
    var c = state.checks[todayKey()] || {};
    return !!c[mission.id + "#" + step];
  }

  function isMissionDone(mission) {
    var c = state.checks[todayKey()] || {};
    if (mission.steps && mission.steps.length) {
      return mission.steps.every(function (s) { return !!c[mission.id + "#" + s]; });
    }
    return !!c[mission.id];
  }

  function countDone(list) {
    return list.filter(isMissionDone).length;
  }

  function toggleMission(mission) {
    if (isPreview()) return; /* 미리보기는 읽기 전용 */
    var c = dayChecks();
    if (mission.steps && mission.steps.length) {
      var all = isMissionDone(mission);
      mission.steps.forEach(function (s) {
        if (all) delete c[mission.id + "#" + s];
        else c[mission.id + "#" + s] = true;
      });
    } else {
      if (c[mission.id]) delete c[mission.id];
      else c[mission.id] = true;
    }
    save();
    render();
  }

  function toggleStep(mission, step) {
    if (isPreview()) return;
    var c = dayChecks();
    var k = mission.id + "#" + step;
    if (c[k]) delete c[k];
    else c[k] = true;
    save();
    render();
  }

  /* ---------- 스티커 ---------- */
  function hasTodaySticker() {
    var key = todayKey();
    return state.board.some(function (e) { return e.key === key && !e.manual; });
  }

  /* ---------- 초기화 (스티커판·미션 체크·기록만 0으로) ---------- */
  function clearProgress() {
    state.board = [];
    state.checks = {};
    state.boardsDone = 0;
    state.history = [];
    animateIndex = -1;
    save();
  }

  /* 일회성 초기화 토큰 기억 (한 번 쓴 링크는 다시 지우지 않도록) */
  function appliedResets() {
    try {
      var raw = window.localStorage.getItem(RESET_KEY);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.filter(function (t) { return typeof t === "string" && t; });
    } catch (err) { return []; }
  }

  function rememberReset(token) {
    var list = appliedResets();
    if (list.indexOf(token) !== -1) return;
    list.push(token);
    try { window.localStorage.setItem(RESET_KEY, JSON.stringify(list.slice(-40))); } catch (err) { /* 무시 */ }
  }

  function stripResetParam() {
    try {
      if (typeof window.URL !== "function" || typeof window.URLSearchParams !== "function") return;
      var url = new window.URL(window.location.href);
      if (!url.searchParams.has("reset")) return;
      url.searchParams.delete("reset");
      var q = url.searchParams.toString();
      window.history.replaceState({}, document.title, url.pathname + (q ? "?" + q : "") + url.hash);
    } catch (err) { /* 주소 정리 실패는 무시 */ }
  }

  /* ?reset=토큰 → 아직 실행한 적 없는 토큰일 때만 초기화. 결과: "done" | "already" | null */
  function readResetToken() {
    var token = null;
    try {
      if (typeof window.URLSearchParams !== "function") return null;
      var params = new window.URLSearchParams(window.location.search);
      token = params.get("reset");
    } catch (err) { return null; }
    if (!token) return null;
    token = String(token).trim().slice(0, 60);
    if (!token) { stripResetParam(); return null; }

    var seen = appliedResets().indexOf(token) !== -1;
    if (!seen) {
      clearProgress();
      rememberReset(token);
    }
    stripResetParam();
    return seen ? "already" : "done";
  }

  function nextColor() {
    return PAW_COLORS[state.board.length % PAW_COLORS.length];
  }

  function randomRot() {
    return Math.round((Math.random() * 34 - 17) * 10) / 10;
  }

  function giveSticker() {
    if (isPreview()) return;
    if (state.board.length >= BOARD_SIZE) { openCelebrate(); return; }
    if (hasTodaySticker()) { toast("오늘 도장 완료! 하루에 1번만 찍을 수 있어요 🐾"); return; }
    if (!todayMissions().length) { toast("오늘은 쉬는 날이에요! 도장 대신 푹 쉬어요 🐾"); return; }
    if (countDone(todayMissions()) !== todayMissions().length) {
      toast("오늘 미션을 다 하면 도장을 찍을 수 있어요! 🐾");
      return;
    }
    var color = nextColor();
    state.board.push({ key: todayKey(), label: todayLabel(), color: color, rot: randomRot() });
    animateIndex = state.board.length - 1;
    save();
    render();
    showStamp(color);
    if (state.board.length >= BOARD_SIZE) {
      window.setTimeout(openCelebrate, 780);
    }
  }

  function addStickerManually() {
    if (state.board.length >= BOARD_SIZE) { toast("스티커판이 가득 찼어요! 상품을 받고 새 판을 시작해요."); return; }
    var color = nextColor();
    state.board.push({ key: todayKey(), label: todayLabel(), color: color, rot: randomRot(), manual: true });
    animateIndex = state.board.length - 1;
    save();
    render();
    renderEditor();
    toast("스티커 1개를 보충했어요 (지금 " + state.board.length + "/30)");
    if (state.board.length >= BOARD_SIZE) window.setTimeout(openCelebrate, 300);
  }

  function removeStickerManually() {
    if (!state.board.length) { toast("지울 스티커가 없어요."); return; }
    var last = state.board[state.board.length - 1];
    state.board.pop();
    save();
    render();
    renderEditor();
    toast("마지막 스티커(" + (last.label || "?") + ")를 지웠어요 (지금 " + state.board.length + "/30)");
  }

  function claimBoard() {
    state.history.push({ date: todayLabel(), reward: state.reward, count: state.board.length });
    state.boardsDone += 1;
    state.board = [];
    animateIndex = -1;
    save();
    render();
    renderEditor();
    closeCelebrate();
    confetti(70);
    toast("🏆 " + state.boardsDone + "번째 판 완성! 새 스티커판을 시작해요!");
  }

  /* ---------- 효과 ---------- */
  function confetti(count) {
    var layer = byId("confetti");
    if (!layer) return;
    var n = count || 70;
    for (var i = 0; i < n; i++) {
      var p = document.createElement("span");
      p.className = "confetti-piece";
      p.style.left = (Math.random() * 100).toFixed(2) + "vw";
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      p.style.width = (7 + Math.random() * 7).toFixed(0) + "px";
      p.style.height = (10 + Math.random() * 10).toFixed(0) + "px";
      p.style.setProperty("--dx", (Math.random() * 180 - 90).toFixed(0) + "px");
      p.style.setProperty("--spin", (Math.random() * 900 - 450).toFixed(0) + "deg");
      p.style.animationDuration = (1.9 + Math.random() * 1.5).toFixed(2) + "s";
      p.style.animationDelay = (Math.random() * 0.55).toFixed(2) + "s";
      layer.appendChild(p);
      (function (piece) {
        window.setTimeout(function () { if (piece.parentNode) piece.parentNode.removeChild(piece); }, 4200);
      })(p);
    }
  }

  function showStamp(color) {
    var layer = byId("stampLayer");
    if (!layer) return;
    layer.textContent = "";
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "stamp-paw");
    svg.style.color = color;
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", "#pawShape");
    svg.appendChild(use);
    layer.appendChild(svg);

    var word = document.createElement("span");
    word.className = "stamp-word";
    word.textContent = "쾅!";
    layer.appendChild(word);

    window.setTimeout(function () { layer.textContent = ""; }, 900);
  }

  /* ---------- 렌더링 ---------- */
  function buildRestCard(preview) {
    var card = document.createElement("div");
    card.className = "rest-card";

    var emoji = document.createElement("span");
    emoji.className = "rest-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = "🛋️";

    var title = document.createElement("p");
    title.className = "rest-title";
    title.textContent = preview ? "이날은 미션 쉬는 날!" : "오늘은 미션 쉬는 날!";

    var sub = document.createElement("p");
    sub.className = "rest-sub";
    sub.textContent = preview ? "푹 쉬고 다음 날 또 출동해요 🐾" : "푹 쉬고 내일 또 출동해요 🐾";

    card.appendChild(emoji);
    card.appendChild(title);
    card.appendChild(sub);
    return card;
  }

  function renderMissions() {
    var list = byId("missionList");
    if (!list) return;
    var missions = viewMissions();
    var preview = isPreview();
    var total = missions.length;
    var done = 0;

    list.textContent = "";
    if (preview) list.classList.add("preview");
    else list.classList.remove("preview");

    if (!total) {
      list.appendChild(buildRestCard(preview));
    }

    missions.forEach(function (m) {
      var isDone = !preview && isMissionDone(m);
      if (isDone) done += 1;

      var card = document.createElement("div");
      card.className = "mission" + (isDone ? " done" : "") + (preview ? " preview" : "");
      card.setAttribute("role", "checkbox");
      card.setAttribute("aria-checked", isDone ? "true" : "false");
      if (preview) card.setAttribute("aria-disabled", "true");
      card.setAttribute("tabindex", preview ? "-1" : "0");
      card.setAttribute("data-mid", m.id);
      card.setAttribute("aria-label", m.name + (preview ? ", 미리보기" : (isDone ? ", 완료" : ", 아직")));

      var emoji = document.createElement("span");
      emoji.className = "mission-emoji";
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = m.emoji || "⭐";

      var body = document.createElement("span");
      body.className = "mission-body";
      var name = document.createElement("span");
      name.className = "mission-name";
      name.textContent = m.name;
      body.appendChild(name);

      if (m.steps && m.steps.length) {
        var steps = document.createElement("span");
        steps.className = "steps";
        m.steps.forEach(function (s) {
          var on = !preview && isStepDone(m, s);
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "step" + (on ? " on" : "");
          chip.setAttribute("data-mid", m.id);
          chip.setAttribute("data-step", s);
          chip.setAttribute("aria-pressed", on ? "true" : "false");
          chip.setAttribute("aria-label", m.name + " " + s + "권");
          if (preview) {
            chip.setAttribute("tabindex", "-1");
            chip.setAttribute("aria-disabled", "true");
          }
          chip.textContent = s;
          steps.appendChild(chip);
        });
        body.appendChild(steps);
      }

      var tick = document.createElement("span");
      tick.className = "tick";
      tick.setAttribute("aria-hidden", "true");
      if (isDone) {
        tick.textContent = "✓";
      } else if (!preview && m.steps && m.steps.length) {
        var doneSteps = m.steps.filter(function (s) { return isStepDone(m, s); }).length;
        if (doneSteps > 0) {
          tick.textContent = doneSteps + "/" + m.steps.length;
          tick.className = "tick partial";
        }
      }

      card.appendChild(emoji);
      card.appendChild(body);
      card.appendChild(tick);
      list.appendChild(card);
    });

    var progress = byId("missionProgress");
    if (progress) progress.textContent = total ? (done + " / " + total) : "쉬는 날";
  }

  function renderMissionHead() {
    var main = byId("missionTitleMain");
    var tag = byId("missionDayTag");
    if (main) main.textContent = isPreview() ? (dayName(viewDay) + " 미션") : "오늘의 미션";
    if (tag) {
      tag.textContent = isPreview() ? "" : " · " + dayName(viewDay);
      tag.hidden = isPreview();
    }

    var note = byId("previewNote");
    if (note) {
      note.hidden = !isPreview();
      if (isPreview()) {
        note.textContent = "👀 " + dayName(viewDay) + " 미션 미리보기 (체크는 오늘만 가능해요)";
      }
    }

    var tip = byId("missionTip");
    if (tip) tip.hidden = isPreview() || !viewMissions().length;
  }

  function buildDayTabs(container, selectedDay, onPick) {
    if (!container) return;
    var today = todayDay();
    container.textContent = "";
    DAY_ORDER.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "day-tab" + (d === selectedDay ? " on" : "") + (d === today ? " today" : "");
      b.setAttribute("data-day", String(d));
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", d === selectedDay ? "true" : "false");
      b.setAttribute("aria-label", dayName(d) + (d === today ? " (오늘)" : ""));

      var label = document.createElement("span");
      label.className = "dt-label";
      label.textContent = DAY_NAMES[d];
      b.appendChild(label);

      if (d === today) {
        var dot = document.createElement("span");
        dot.className = "dt-dot";
        dot.setAttribute("aria-hidden", "true");
        b.appendChild(dot);
      }

      b.addEventListener("click", function () { onPick(d); });
      container.appendChild(b);
    });
  }

  function renderDayTabs() {
    buildDayTabs(byId("dayTabs"), viewDay, function (d) {
      if (viewDay === d) return;
      viewDay = d;
      render();
    });
  }

  function renderBoard() {
    var board = byId("board");
    if (!board) return;
    var frag = document.createDocumentFragment();

    for (var i = 0; i < BOARD_SIZE; i++) {
      var n = i + 1;
      var entry = state.board[i];
      var li = document.createElement("li");
      li.className = "cell";
      li.setAttribute("data-i", String(n));
      if (MILESTONES[n]) li.classList.add("milestone");
      if (n === BOARD_SIZE) li.classList.add("grand");

      if (entry) {
        li.classList.add("filled");
        li.style.color = entry.color || PAW_COLORS[i % PAW_COLORS.length];
        li.style.setProperty("--rot", (Number(entry.rot) || 0) + "deg");

        var paw = document.createElementNS(SVGNS, "svg");
        paw.setAttribute("viewBox", "0 0 100 100");
        paw.setAttribute("class", "paw");
        paw.setAttribute("aria-hidden", "true");
        var use = document.createElementNS(SVGNS, "use");
        use.setAttribute("href", "#pawShape");
        paw.appendChild(use);
        li.appendChild(paw);

        if (entry.label) {
          var date = document.createElement("span");
          date.className = "cell-date";
          date.textContent = entry.label;
          li.appendChild(date);
        }
        if (i === animateIndex) li.classList.add("pop");
      } else {
        var no = document.createElement("span");
        no.className = "cell-no";
        no.textContent = String(n);
        li.appendChild(no);
      }

      if (MILESTONES[n]) {
        var ms = document.createElement("span");
        ms.className = "cell-ms";
        ms.setAttribute("aria-hidden", "true");
        ms.textContent = MILESTONES[n];
        li.appendChild(ms);
      }

      li.setAttribute("aria-label", entry
        ? n + "번째 칸, " + (entry.label || "") + " 발자국 스티커"
        : n + "번째 칸, 비어 있음" + (n === BOARD_SIZE ? ", 상품 칸" : ""));
      frag.appendChild(li);
    }

    board.textContent = "";
    board.appendChild(frag);
    animateIndex = -1;
  }

  function renderGoal() {
    var n = state.board.length;
    var pct = Math.round((n / BOARD_SIZE) * 100);
    var fill = byId("goalFill");
    if (fill) fill.style.width = pct + "%";

    var count = byId("goalCount");
    if (count) count.textContent = n + " / " + BOARD_SIZE;

    var boardProgress = byId("boardProgress");
    if (boardProgress) boardProgress.textContent = n + " / " + BOARD_SIZE;

    var reward = byId("rewardText");
    if (reward) reward.textContent = state.reward;

    var note = byId("boardRewardNote");
    if (note) note.textContent = state.reward;

    var modalReward = byId("modalReward");
    if (modalReward) modalReward.textContent = state.reward;

    var trophy = byId("trophyBadge");
    if (trophy) trophy.textContent = "🏆 달성한 판 " + state.boardsDone + "개";

    var rewardInput = byId("rewardInput");
    if (rewardInput && document.activeElement !== rewardInput) rewardInput.value = state.reward;
  }

  /* 스티커 버튼은 항상 '오늘' 요일 기준으로 동작합니다 (미리보기와 무관). */
  function renderStickerArea() {
    var btn = byId("stickerBtn");
    var hint = byId("stickerHint");
    if (!btn || !hint) return;

    var missions = todayMissions();
    var total = missions.length;
    var done = countDone(missions);
    var full = state.board.length >= BOARD_SIZE;
    var stamped = hasTodaySticker();
    var allDone = total > 0 && done === total;

    btn.classList.remove("ready", "filled", "locked", "rest");
    btn.removeAttribute("aria-disabled");
    hint.classList.remove("done");

    if (full) {
      btn.disabled = false;
      btn.classList.add("filled");
      btn.textContent = "🎁 30개 대성공! 상품 확인하기";
      hint.textContent = "스티커판이 가득 찼어요! 상품 받으러 출동! 🎁";
      return;
    }

    if (!total) {
      btn.disabled = true;
      btn.classList.add("rest");
      btn.textContent = "🛋️ 오늘은 쉬는 날이에요!";
      hint.textContent = "쉬는 날엔 도장 대신 푹 쉬어요 🐾";
      hint.classList.add("done");
      return;
    }

    btn.textContent = "🐾 발자국 스티커 받기!";

    if (stamped) {
      btn.disabled = false;
      btn.classList.add("locked");
      btn.setAttribute("aria-disabled", "true");
      btn.textContent = "🐾 오늘 도장 완료!";
      hint.textContent = "오늘 발자국 스티커 완료! 하루에 1번만 찍을 수 있어요 🐾";
      hint.classList.add("done");
      return;
    }

    if (allDone) {
      btn.disabled = false;
      btn.classList.add("ready");
      hint.textContent = "준비 완료! 버튼을 눌러 발자국을 찍어요! 🐾";
      return;
    }

    btn.disabled = true;
    var left = total - done;
    hint.textContent = "미션 " + left + "개만 더 하면 발자국 스티커!";
  }

  function render() {
    renderDayTabs();
    renderMissionHead();
    renderMissions();
    renderBoard();
    renderGoal();
    renderStickerArea();
  }

  /* ---------- 엄마 설정 ---------- */
  function renderEditor() {
    var box = byId("missionEditor");
    if (!box) return;
    box.textContent = "";

    buildDayTabs(byId("editDayTabs"), editDay, function (d) {
      if (editDay === d) return;
      editDay = d;
      renderEditor();
    });

    var note = byId("editDayNote");
    if (note) note.textContent = dayName(editDay) + " 미션을 고치고 있어요";

    var missions = missionsOf(editDay);

    missions.forEach(function (m, idx) {
      var row = document.createElement("div");
      row.className = "edit-row";

      var em = document.createElement("input");
      em.type = "text";
      em.className = "edit-emoji";
      em.value = m.emoji || "⭐";
      em.maxLength = 4;
      em.setAttribute("data-idx", String(idx));
      em.setAttribute("data-field", "emoji");
      em.setAttribute("aria-label", "미션 이모지");

      var name = document.createElement("input");
      name.type = "text";
      name.className = "edit-name";
      name.value = m.name;
      name.maxLength = 20;
      name.setAttribute("data-idx", String(idx));
      name.setAttribute("data-field", "name");
      name.setAttribute("aria-label", "미션 이름");

      var del = document.createElement("button");
      del.type = "button";
      del.className = "del-btn";
      del.textContent = "🗑";
      del.setAttribute("data-idx", String(idx));
      del.setAttribute("data-action", "delete");
      del.setAttribute("aria-label", m.name + " 미션 삭제");

      row.appendChild(em);
      row.appendChild(name);
      row.appendChild(del);
      box.appendChild(row);
    });

    if (!missions.length) {
      var p = document.createElement("p");
      p.className = "field-help";
      p.textContent = dayName(editDay) + "은(는) 미션이 없는 쉬는 날이에요. 아래 칸에서 추가하거나 기본 요일표로 복원하세요.";
      box.appendChild(p);
    }

    var plus = byId("plusStickerBtn");
    if (plus) plus.disabled = state.board.length >= BOARD_SIZE;
    var minus = byId("minusStickerBtn");
    if (minus) minus.disabled = state.board.length === 0;
  }

  function openSettings() {
    renderEditor();
    var rewardInput = byId("rewardInput");
    if (rewardInput) rewardInput.value = state.reward;
    byId("settingsWrap").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSettings() {
    byId("settingsWrap").hidden = true;
    document.body.style.overflow = "";
    disarmFullReset();
  }

  function openCelebrate() {
    if (state.board.length < BOARD_SIZE) return;
    var modalReward = byId("modalReward");
    if (modalReward) modalReward.textContent = state.reward;
    byId("celebrateWrap").hidden = false;
    document.body.style.overflow = "hidden";
    confetti(110);
  }

  function closeCelebrate() {
    byId("celebrateWrap").hidden = true;
    document.body.style.overflow = "";
  }

  /* ---------- 어른 확인 (아이 방지) ---------- */
  var gateState = { answer: null, onPass: null, wrong: 0, timer: null };

  function newGateQuestion() {
    var a, b;
    do {
      a = 3 + Math.floor(Math.random() * 7);
      b = 3 + Math.floor(Math.random() * 7);
    } while (a + b < 10);
    gateState.answer = a + b;
    var q = byId("gateQuestion");
    if (q) q.textContent = a + " + " + b + " =";
  }

  function openGate(onPass) {
    gateState.onPass = typeof onPass === "function" ? onPass : null;
    gateState.wrong = 0;
    newGateQuestion();
    var input = byId("gateAnswer");
    if (input) input.value = "";
    var msg = byId("gateMsg");
    if (msg) msg.textContent = "";
    var wrap = byId("gateWrap");
    if (wrap) wrap.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(function () {
      try { if (input) input.focus(); } catch (err) { /* 무시 */ }
    }, 80);
  }

  function closeGate() {
    var wrap = byId("gateWrap");
    if (wrap) wrap.hidden = true;
    gateState.answer = null;
    gateState.onPass = null;
    document.body.style.overflow = "";
  }

  function shakeGate() {
    var modal = byId("gateModal");
    if (!modal) return;
    modal.classList.remove("shake");
    void modal.offsetWidth;
    modal.classList.add("shake");
    window.clearTimeout(gateState.timer);
    gateState.timer = window.setTimeout(function () { modal.classList.remove("shake"); }, 460);
  }

  function submitGate() {
    var input = byId("gateAnswer");
    var msg = byId("gateMsg");
    var raw = input ? String(input.value).replace(/[^0-9]/g, "") : "";
    if (!raw) {
      if (msg) msg.textContent = "답을 적어 주세요.";
      if (input) input.focus();
      return;
    }
    if (parseInt(raw, 10) === gateState.answer) {
      var cb = gateState.onPass;
      closeGate();
      if (cb) cb();
      return;
    }
    gateState.wrong += 1;
    if (gateState.wrong >= 3) {
      if (msg) msg.textContent = "정답이 아니에요. 새 문제로 다시 해 볼까요?";
      gateState.wrong = 0;
      newGateQuestion();
    } else if (msg) {
      msg.textContent = "정답이 아니에요. 다시 계산해 볼까요?";
    }
    if (input) { input.value = ""; input.focus(); }
    shakeGate();
  }

  /* ---------- 전체 초기화 (두 번 눌러 확인) ---------- */
  var fullResetArmed = false;
  var fullResetTimer = null;

  function disarmFullReset() {
    fullResetArmed = false;
    var btn = byId("fullResetBtn");
    if (!btn) return;
    btn.classList.remove("armed");
    btn.textContent = FULL_RESET_LABEL;
  }

  function onFullResetClick() {
    var btn = byId("fullResetBtn");
    if (!btn) return;
    if (!fullResetArmed) {
      fullResetArmed = true;
      btn.classList.add("armed");
      btn.textContent = "한 번 더 누르면 0개로 초기화돼요";
      toast("한 번 더 누르면 스티커판이 0개로 초기화돼요");
      window.clearTimeout(fullResetTimer);
      fullResetTimer = window.setTimeout(disarmFullReset, 6000);
      return;
    }
    window.clearTimeout(fullResetTimer);
    disarmFullReset();
    clearProgress();
    render();
    renderEditor();
    toast("🔄 스티커판을 0부터 다시 시작해요! (0 / 30)");
  }

  function addMissionFromInput() {
    var input = byId("newMissionName");
    var name = input ? input.value.trim() : "";
    var missions = missionsOf(editDay);
    if (!name) { toast("미션 이름을 적어 주세요."); if (input) input.focus(); return; }
    if (missions.length >= MAX_MISSIONS) { toast("미션은 요일마다 " + MAX_MISSIONS + "개까지만 넣을 수 있어요."); return; }
    missions.push({
      id: "m_" + Date.now().toString(36) + Math.floor(Math.random() * 100),
      emoji: "⭐",
      name: name.slice(0, 20)
    });
    if (input) input.value = "";
    save();
    renderEditor();
    render();
    toast(dayName(editDay) + "에 '" + name.slice(0, 20) + "' 미션을 추가했어요.");
  }

  function resetMissions() {
    state.schedule = defaultSchedule();
    save();
    renderEditor();
    render();
    toast("기본 요일표로 되돌렸어요 (월~일 7일 전체)");
  }

  function resetTodayChecks() {
    var day = todayKey();
    state.checks[day] = {};
    save();
    render();
    toast("오늘 미션 체크를 모두 지웠어요.");
  }

  function exportJson() {
    var box = byId("backupBox");
    if (!box) return "";
    var text = JSON.stringify(state, null, 2);
    box.value = text;
    return text;
  }

  function copyBackup() {
    var text = exportJson();
    var box = byId("backupBox");
    function done() { toast("백업 내용을 복사했어요. 메모장에 붙여넣어 두세요."); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (box) { box.focus(); box.select(); }
        toast("복사가 안 되면 내용을 길게 눌러 직접 복사해 주세요.");
      });
    } else {
      if (box) { box.focus(); box.select(); }
      try { document.execCommand("copy"); done(); }
      catch (err) { toast("내용을 길게 눌러 직접 복사해 주세요."); }
    }
  }

  function importJson() {
    var box = byId("backupBox");
    var raw = box ? box.value.trim() : "";
    if (!raw) { toast("붙여넣은 내용이 없어요. 백업 내용을 먼저 붙여넣어 주세요."); return; }
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (err) { toast("백업 내용을 읽지 못했어요. 복사한 내용을 그대로 붙여넣어 주세요."); return; }

    state = normalizeState(parsed);
    save();
    render();
    renderEditor();
    var rewardInput = byId("rewardInput");
    if (rewardInput) rewardInput.value = state.reward;
    toast("백업을 가져왔어요! 스티커 " + state.board.length + "/30, 달성한 판 " + state.boardsDone + "개");
  }

  /* ---------- 이벤트 연결 ---------- */
  function bindEvents() {
    var list = byId("missionList");
    if (list) {
      list.addEventListener("click", function (ev) {
        if (isPreview()) return; /* 미리보기는 읽기 전용 */
        var chip = ev.target.closest ? ev.target.closest(".step") : null;
        if (chip) {
          ev.stopPropagation();
          var mid = chip.getAttribute("data-mid");
          var step = chip.getAttribute("data-step");
          var mission = findMission(viewMissions(), mid);
          if (mission) toggleStep(mission, step);
          return;
        }
        var card = ev.target.closest ? ev.target.closest(".mission") : null;
        if (!card) return;
        var id = card.getAttribute("data-mid");
        var target = findMission(viewMissions(), id);
        if (target) toggleMission(target);
      });

      list.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        if (isPreview()) return;
        var card = ev.target.closest ? ev.target.closest(".mission") : null;
        if (!card || ev.target !== card) return;
        ev.preventDefault();
        var id = card.getAttribute("data-mid");
        var target = findMission(viewMissions(), id);
        if (target) toggleMission(target);
      });
    }

    var stickerBtn = byId("stickerBtn");
    if (stickerBtn) {
      stickerBtn.addEventListener("click", function () {
        if (state.board.length >= BOARD_SIZE) { openCelebrate(); return; }
        if (hasTodaySticker()) {
          toast("오늘 도장 완료! 하루에 1번만 찍을 수 있어요 🐾");
          return;
        }
        if (stickerBtn.disabled) return;
        giveSticker();
      });
    }

    var momBtn = byId("momBtn");
    if (momBtn) momBtn.addEventListener("click", function () { openGate(openSettings); });

    var gateOk = byId("gateOkBtn");
    if (gateOk) gateOk.addEventListener("click", submitGate);

    var gateCancel = byId("gateCancelBtn");
    if (gateCancel) gateCancel.addEventListener("click", closeGate);

    var gateAnswer = byId("gateAnswer");
    if (gateAnswer) {
      gateAnswer.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); submitGate(); }
      });
    }

    var gateWrap = byId("gateWrap");
    if (gateWrap) {
      gateWrap.addEventListener("click", function (ev) {
        if (ev.target === gateWrap) closeGate();
      });
    }

    var fullResetBtn = byId("fullResetBtn");
    if (fullResetBtn) fullResetBtn.addEventListener("click", onFullResetClick);

    Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (el) {
      el.addEventListener("click", function () {
        if (el.closest(".sheet-wrap")) closeSettings();
        else if (el.closest(".modal-wrap")) closeCelebrate();
      });
    });

    var claimBtn = byId("claimBtn");
    if (claimBtn) claimBtn.addEventListener("click", claimBoard);

    var rewardInput = byId("rewardInput");
    if (rewardInput) {
      rewardInput.addEventListener("input", function () {
        var v = rewardInput.value.trim();
        state.reward = v || DEFAULT_REWARD;
        saveSoon();
        renderGoal();
      });
      rewardInput.addEventListener("blur", function () {
        if (!rewardInput.value.trim()) {
          rewardInput.value = DEFAULT_REWARD;
          state.reward = DEFAULT_REWARD;
          saveSoon();
          renderGoal();
        }
      });
    }

    var editor = byId("missionEditor");
    if (editor) {
      editor.addEventListener("input", function (ev) {
        var el = ev.target;
        var idx = parseInt(el.getAttribute("data-idx"), 10);
        var field = el.getAttribute("data-field");
        var missions = missionsOf(editDay);
        if (isNaN(idx) || !field || !missions[idx]) return;
        if (field === "name") {
          missions[idx].name = el.value.slice(0, 20) || "미션";
          saveSoon();
          render();
        } else if (field === "emoji") {
          missions[idx].emoji = el.value.slice(0, 4) || "⭐";
          saveSoon();
          render();
        }
      });
      editor.addEventListener("click", function (ev) {
        var btn = ev.target.closest ? ev.target.closest("[data-action='delete']") : null;
        if (!btn) return;
        var idx = parseInt(btn.getAttribute("data-idx"), 10);
        var missions = missionsOf(editDay);
        if (isNaN(idx) || !missions[idx]) return;
        var removed = missions.splice(idx, 1)[0];
        save();
        renderEditor();
        render();
        toast("'" + removed.name + "' 미션을 지웠어요.");
      });
    }

    var addBtn = byId("addMissionBtn");
    if (addBtn) addBtn.addEventListener("click", addMissionFromInput);

    var newName = byId("newMissionName");
    if (newName) {
      newName.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); addMissionFromInput(); }
      });
    }

    var resetMissionsBtn = byId("resetMissionsBtn");
    if (resetMissionsBtn) resetMissionsBtn.addEventListener("click", resetMissions);

    var resetTodayBtn = byId("resetTodayBtn");
    if (resetTodayBtn) resetTodayBtn.addEventListener("click", resetTodayChecks);

    var plusBtn = byId("plusStickerBtn");
    if (plusBtn) plusBtn.addEventListener("click", addStickerManually);

    var minusBtn = byId("minusStickerBtn");
    if (minusBtn) minusBtn.addEventListener("click", removeStickerManually);

    var exportBtn = byId("exportBtn");
    if (exportBtn) exportBtn.addEventListener("click", function () {
      exportJson();
      toast("백업 내용을 내보냈어요. 복사해서 보관하세요.");
    });

    var copyBtn = byId("copyBtn");
    if (copyBtn) copyBtn.addEventListener("click", copyBackup);

    var importBtn = byId("importBtn");
    if (importBtn) importBtn.addEventListener("click", importJson);

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var gate = byId("gateWrap");
      var celebrate = byId("celebrateWrap");
      var settings = byId("settingsWrap");
      if (gate && !gate.hidden) closeGate();
      else if (celebrate && !celebrate.hidden) closeCelebrate();
      else if (settings && !settings.hidden) closeSettings();
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    load();
    viewDay = todayDay();
    editDay = todayDay();
    var resetResult = readResetToken();
    var today = todayKey();
    var changed = state.lastVisit && state.lastVisit !== today;
    state.lastVisit = today;
    save();
    render();
    renderEditor();
    bindEvents();
    if (resetResult === "done") {
      window.setTimeout(function () { toast("🔄 스티커판과 오늘 미션을 깔끔히 초기화했어요!"); }, 450);
    } else if (resetResult === "already") {
      window.setTimeout(function () { toast("이미 초기화한 링크예요. 지금 스티커판은 그대로 둘게요."); }, 450);
    } else if (changed) {
      window.setTimeout(function () { toast("새로운 하루! 오늘도 출동 준비 완료! 🚨"); }, 400);
    }
    if (state.board.length >= BOARD_SIZE) {
      window.setTimeout(openCelebrate, 600);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 테스트·백업 확인용 (읽기 전용) */
  window.__insung = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    todayKey: todayKey,
    todayDay: todayDay,
    viewDay: function () { return viewDay; },
    hasTodaySticker: hasTodaySticker,
    appliedResets: appliedResets,
    defaultSchedule: function () { return defaultSchedule(); }
  };
})();
