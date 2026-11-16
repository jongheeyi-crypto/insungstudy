/* ===== 인성이 구조대 · 미션 & 발자국 스티커판 =====
   서버 없이 localStorage 에만 저장합니다. */
(function () {
  "use strict";

  var KEY = "insungstudy.v1";
  var BOARD_SIZE = 30;
  var SVGNS = "http://www.w3.org/2000/svg";
  var DEFAULT_REWARD = "다이소 가서 원하는 거 고르기";

  var DEFAULT_MISSIONS = [
    { id: "m_math1", emoji: "🔢", name: "원리셈" },
    { id: "m_math2", emoji: "➕", name: "소마셈" },
    { id: "m_shape", emoji: "🔺", name: "소마도형" },
    { id: "m_english", emoji: "✏️", name: "잉글라이더 숙제" },
    { id: "m_books", emoji: "📚", name: "원서 3권", steps: ["1", "2", "3"] }
  ];

  var PAW_COLORS = ["#EE3E38", "#1F6FEB", "#FFC93C", "#2FBF71", "#FF8A3D", "#9B5DE5", "#00B8C4"];
  var MILESTONES = { 5: "⭐", 10: "🎁", 15: "⭐", 20: "🎁", 25: "⭐", 30: "🎁" };
  var CONFETTI_COLORS = ["#EE3E38", "#1F6FEB", "#FFC93C", "#2FBF71", "#FF8A3D", "#9B5DE5", "#FF7A8A"];

  var state = null;
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

  function byId(id) { return document.getElementById(id); }

  function freshState() {
    return {
      version: 1,
      reward: DEFAULT_REWARD,
      missions: DEFAULT_MISSIONS.map(function (m) {
        var copy = { id: m.id, emoji: m.emoji, name: m.name };
        if (m.steps) copy.steps = m.steps.slice();
        return copy;
      }),
      checks: {},
      board: [],
      boardsDone: 0,
      history: [],
      lastVisit: null
    };
  }

  function normalizeState(raw) {
    var base = freshState();
    if (!raw || typeof raw !== "object") return base;
    var s = base;

    if (typeof raw.reward === "string" && raw.reward.trim()) {
      s.reward = raw.reward.trim().slice(0, 40);
    }
    if (Array.isArray(raw.missions) && raw.missions.length) {
      s.missions = raw.missions
        .filter(function (m) { return m && typeof m.name === "string" && m.name.trim(); })
        .slice(0, 12)
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

  function doneCount() {
    return state.missions.filter(isMissionDone).length;
  }

  function toggleMission(mission) {
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

  function nextColor() {
    return PAW_COLORS[state.board.length % PAW_COLORS.length];
  }

  function randomRot() {
    return Math.round((Math.random() * 34 - 17) * 10) / 10;
  }

  function giveSticker() {
    if (state.board.length >= BOARD_SIZE) { openCelebrate(); return; }
    if (hasTodaySticker()) { toast("오늘은 이미 받았어요! 내일 또 출동하자!"); return; }
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
  function renderMissions() {
    var list = byId("missionList");
    if (!list) return;
    var total = state.missions.length;
    var done = 0;

    list.textContent = "";

    if (!total) {
      var empty = document.createElement("p");
      empty.className = "mission-tip";
      empty.textContent = "엄마 설정에서 미션을 추가해 주세요.";
      list.appendChild(empty);
    }

    state.missions.forEach(function (m) {
      var isDone = isMissionDone(m);
      if (isDone) done += 1;

      var card = document.createElement("div");
      card.className = "mission" + (isDone ? " done" : "");
      card.setAttribute("role", "checkbox");
      card.setAttribute("aria-checked", isDone ? "true" : "false");
      card.setAttribute("tabindex", "0");
      card.setAttribute("data-mid", m.id);
      card.setAttribute("aria-label", m.name + (isDone ? ", 완료" : ", 아직"));

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
          var on = isStepDone(m, s);
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "step" + (on ? " on" : "");
          chip.setAttribute("data-mid", m.id);
          chip.setAttribute("data-step", s);
          chip.setAttribute("aria-pressed", on ? "true" : "false");
          chip.setAttribute("aria-label", m.name + " " + s + "권");
          chip.textContent = s;
          steps.appendChild(chip);
        });
        body.appendChild(steps);
      }

      var tick = document.createElement("span");
      tick.className = "tick";
      tick.setAttribute("aria-hidden", "true");
      tick.textContent = isDone ? "✓" : "";

      card.appendChild(emoji);
      card.appendChild(body);
      card.appendChild(tick);
      list.appendChild(card);
    });

    var progress = byId("missionProgress");
    if (progress) progress.textContent = done + " / " + total;

    return { done: done, total: total };
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

  function renderStickerArea(counts) {
    var btn = byId("stickerBtn");
    var hint = byId("stickerHint");
    if (!btn || !hint) return;

    var total = counts.total;
    var done = counts.done;
    var full = state.board.length >= BOARD_SIZE;
    var stamped = hasTodaySticker();
    var allDone = total > 0 && done === total;

    btn.classList.remove("ready", "filled");
    hint.classList.remove("done");

    if (full) {
      btn.disabled = false;
      btn.classList.add("filled");
      btn.textContent = "🎁 30개 대성공! 상품 확인하기";
      hint.textContent = "스티커판이 가득 찼어요! 상품 받으러 출동! 🎁";
      return;
    }

    btn.textContent = "🐾 발자국 스티커 받기!";

    if (stamped) {
      btn.disabled = true;
      hint.textContent = "오늘 발자국 스티커 완료! 내일 또 출동하자!";
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
    hint.textContent = total === 0
      ? "엄마 설정에서 오늘 미션을 정해 주세요!"
      : "미션 " + left + "개만 더 하면 발자국 스티커!";
  }

  function render() {
    var counts = renderMissions();
    renderBoard();
    renderGoal();
    renderStickerArea(counts);
  }

  /* ---------- 엄마 설정 ---------- */
  function renderEditor() {
    var box = byId("missionEditor");
    if (!box) return;
    box.textContent = "";

    state.missions.forEach(function (m, idx) {
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

    if (!state.missions.length) {
      var p = document.createElement("p");
      p.className = "field-help";
      p.textContent = "미션이 하나도 없어요. 아래 칸에서 추가하거나 기본 5개로 복원하세요.";
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

  function addMissionFromInput() {
    var input = byId("newMissionName");
    var name = input ? input.value.trim() : "";
    if (!name) { toast("미션 이름을 적어 주세요."); if (input) input.focus(); return; }
    if (state.missions.length >= 12) { toast("미션은 12개까지만 넣을 수 있어요."); return; }
    state.missions.push({
      id: "m_" + Date.now().toString(36) + Math.floor(Math.random() * 100),
      emoji: "⭐",
      name: name.slice(0, 20)
    });
    if (input) input.value = "";
    save();
    renderEditor();
    render();
    toast("'" + name.slice(0, 20) + "' 미션을 추가했어요.");
  }

  function resetMissions() {
    state.missions = freshState().missions;
    save();
    renderEditor();
    render();
    toast("기본 미션 5개로 되돌렸어요.");
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
        var chip = ev.target.closest ? ev.target.closest(".step") : null;
        if (chip) {
          ev.stopPropagation();
          var mid = chip.getAttribute("data-mid");
          var step = chip.getAttribute("data-step");
          var mission = state.missions.filter(function (m) { return m.id === mid; })[0];
          if (mission) toggleStep(mission, step);
          return;
        }
        var card = ev.target.closest ? ev.target.closest(".mission") : null;
        if (!card) return;
        var id = card.getAttribute("data-mid");
        var target = state.missions.filter(function (m) { return m.id === id; })[0];
        if (target) toggleMission(target);
      });

      list.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var card = ev.target.closest ? ev.target.closest(".mission") : null;
        if (!card || ev.target !== card) return;
        ev.preventDefault();
        var id = card.getAttribute("data-mid");
        var target = state.missions.filter(function (m) { return m.id === id; })[0];
        if (target) toggleMission(target);
      });
    }

    var stickerBtn = byId("stickerBtn");
    if (stickerBtn) {
      stickerBtn.addEventListener("click", function () {
        if (state.board.length >= BOARD_SIZE) { openCelebrate(); return; }
        if (!stickerBtn.disabled) giveSticker();
      });
    }

    var momBtn = byId("momBtn");
    if (momBtn) momBtn.addEventListener("click", openSettings);

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
        if (isNaN(idx) || !field || !state.missions[idx]) return;
        if (field === "name") {
          state.missions[idx].name = el.value.slice(0, 20) || "미션";
          saveSoon();
          render();
        } else if (field === "emoji") {
          state.missions[idx].emoji = el.value.slice(0, 4) || "⭐";
          saveSoon();
          render();
        }
      });
      editor.addEventListener("click", function (ev) {
        var btn = ev.target.closest ? ev.target.closest("[data-action='delete']") : null;
        if (!btn) return;
        var idx = parseInt(btn.getAttribute("data-idx"), 10);
        if (isNaN(idx) || !state.missions[idx]) return;
        var removed = state.missions.splice(idx, 1)[0];
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
      var celebrate = byId("celebrateWrap");
      var settings = byId("settingsWrap");
      if (celebrate && !celebrate.hidden) closeCelebrate();
      else if (settings && !settings.hidden) closeSettings();
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    load();
    var today = todayKey();
    var changed = state.lastVisit && state.lastVisit !== today;
    state.lastVisit = today;
    save();
    render();
    renderEditor();
    bindEvents();
    if (changed) {
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
    todayKey: todayKey
  };
})();
