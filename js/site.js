/* Carrying More Than Water: page behaviour.
   Deliberately ES5 (no arrow functions, no let/const, no modules) so it runs in old
   WebViews such as WeChat's built-in browser, and from file:// in the offline copy.
   Every feature degrades gracefully: without this file all text and figures stay visible. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var win = window;
  var HEADER = 56;
  var reduceMotion = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var raf = win.requestAnimationFrame || function (fn) { return win.setTimeout(function () { fn(Date.now()); }, 16); };
  var caf = win.cancelAnimationFrame || win.clearTimeout;
  var now = function () { return (win.performance && performance.now) ? performance.now() : Date.now(); };

  function all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function one(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function on(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts || false); }
  function viewH() { return win.innerHeight || root.clientHeight; }
  function scrollY() { return win.pageYOffset || root.scrollTop || 0; }
  function topOf(el) { return el.getBoundingClientRect().top + scrollY(); }
  function storage() { try { var s = win.localStorage; var k = '__t'; s.setItem(k, k); s.removeItem(k); return s; } catch (e) { return null; } }
  // getAttribute/setAttribute so this also works on SVG elements (their className is read-only).
  function cls(el) { return el.getAttribute('class') || ''; }
  function addClass(el, c) { if (el && (' ' + cls(el) + ' ').indexOf(' ' + c + ' ') < 0) el.setAttribute('class', (cls(el) + ' ' + c).replace(/^\s+/, '')); }
  function removeClass(el, c) { if (el) el.setAttribute('class', (' ' + cls(el) + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '')); }
  function hasPassive() { var ok = false; try { var o = Object.defineProperty({}, 'passive', { get: function () { ok = true; return true; } }); win.addEventListener('t', null, o); win.removeEventListener('t', null, o); } catch (e) {} return ok; }
  var passive = hasPassive() ? { passive: true } : false;

  /* ---------- Scroll-driven updates (one rAF-throttled listener for everything) ---------- */
  var scrollHandlers = [];
  var ticking = false;
  function onScrollFrame() { ticking = false; for (var i = 0; i < scrollHandlers.length; i++) scrollHandlers[i](); }
  function requestTick() { if (!ticking) { ticking = true; raf(onScrollFrame); } }
  var resizeHandlers = [];
  on(win, 'scroll', requestTick, passive);
  on(win, 'resize', function () { for (var i = 0; i < resizeHandlers.length; i++) resizeHandlers[i](); requestTick(); });
  on(win, 'load', requestTick);

  /* ---------- Citation numbers open the source in a small card ---------- */
  var citeOpenY = 0;
  function closestSel(el, test) { while (el && el.nodeType === 1) { if (test(el)) return el; el = el.parentNode; } return null; }
  on(doc, 'click', function (e) {
    var pop = doc.getElementById('cite-pop');
    if (!pop) return;
    var a = closestSel(e.target, function (el) { return el.tagName === 'A' && el.parentNode && /(^|\s)cite(\s|$)/.test(el.parentNode.getAttribute('class') || ''); });
    if (!a) {
      if (!pop.hidden && !closestSel(e.target, function (el) { return el === pop; })) pop.hidden = true;
      return;
    }
    var id = (a.getAttribute('href') || '').replace(/^#/, '');
    var data = doc.getElementById(id);
    if (!data) return;
    e.preventDefault();
    one('.cite-pop-n', pop).textContent = data.getAttribute('data-n') || '';
    var body = one('.cite-pop-body', pop);
    body.innerHTML = data.innerHTML;
    pop.hidden = false;
    citeOpenY = scrollY();
    var r = a.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left - 20, (win.innerWidth || root.clientWidth) - w - 8));
    var top = r.bottom + 8;
    if (top + h > viewH() - 8) top = Math.max(HEADER + 8, r.top - h - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    var x = one('.cite-pop-x', pop); if (x) x.focus();
  });
  on(doc, 'keydown', function (e) { var pop = doc.getElementById('cite-pop'); if (pop && e.keyCode === 27) pop.hidden = true; });
  on(doc, 'click', function (e) { if (e.target && /(^|\s)cite-pop-x(\s|$)/.test(e.target.getAttribute('class') || '')) doc.getElementById('cite-pop').hidden = true; });
  on(win, 'scroll', function () { var pop = doc.getElementById('cite-pop'); if (pop && !pop.hidden && Math.abs(scrollY() - citeOpenY) > 80) pop.hidden = true; }, passive);

  /* Everything below binds to the current page content. The artifact build swaps the
     content when the language changes and calls init() again (see scripts/make-artifact.mjs). */
  function init(startPos) {
  scrollHandlers.length = 0;
  resizeHandlers.length = 0;

  /* ---------- Reveal on scroll + count-up numbers ---------- */
  var reveals = all('.reveal');
  var counters = all('[data-count]');
  function inView(el, margin) { var r = el.getBoundingClientRect(); return r.top < viewH() - (margin || 0) && r.bottom > 0; }
  function formatNum(v, decimals) {
    var s = v.toFixed(decimals);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var finalText = el.getAttribute('data-final') || el.textContent;
    el.setAttribute('data-final', finalText);
    if (reduceMotion || isNaN(target)) { el.textContent = finalText; return; }
    var t0 = now(), dur = 1300;
    function step() {
      var p = Math.min(1, (now() - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? formatNum(target * eased, decimals) : finalText;
      if (p < 1) raf(step);
    }
    step();
  }
  function checkReveals() {
    for (var i = reveals.length - 1; i >= 0; i--) {
      if (inView(reveals[i], 40)) { addClass(reveals[i], 'in'); reveals.splice(i, 1); }
    }
    for (var j = counters.length - 1; j >= 0; j--) {
      if (inView(counters[j], 60)) { countUp(counters[j]); counters.splice(j, 1); }
    }
  }
  // Mark what is already on screen before enabling the hidden state, so nothing flickers.
  checkReveals();
  scrollHandlers.push(checkReveals);

  /* ---------- Progress bar + current chapter ---------- */
  var fill = doc.getElementById('progress-fill');
  var chapters = all('section.chapter');
  var navLinks = all('[data-nav]');
  function updateProgress() {
    var max = (doc.body.scrollHeight || root.scrollHeight) - viewH();
    var p = max > 0 ? Math.min(1, scrollY() / max) : 0;
    if (fill) fill.style.width = (p * 100).toFixed(2) + '%';
    var current = chapters.length ? chapters[0].id : '';
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].getBoundingClientRect().top <= viewH() * 0.4) current = chapters[i].id;
    }
    for (var j = 0; j < navLinks.length; j++) {
      var isCur = navLinks[j].getAttribute('data-nav') === current;
      if (isCur) navLinks[j].setAttribute('aria-current', 'true'); else navLinks[j].removeAttribute('aria-current');
    }
  }
  scrollHandlers.push(updateProgress);

  /* ---------- Scrollytelling: which step is in the middle of the screen ---------- */
  var scrollies = all('[data-scrolly]').map(function (box) {
    return { box: box, fig: one('.scrolly-figure', box), steps: all('.scrolly-step', box), current: -1, type: box.getAttribute('data-scrolly') };
  });
  var mapCtl = setupMap(one('.map-svg'));
  var altCtl = setupAlt(one('.alt-fig'));
  // Map / height switch: jump to the first map step or the first height step.
  all('[data-place-go]').forEach(function (b) {
    on(b, 'click', function () {
      var i = b.getAttribute('data-place-go'), el = doc.getElementById('map-step-' + i) || doc.getElementById('plateau-altitude');
      if (i !== '0') el = doc.getElementById('plateau-altitude');
      var card = one('.step-card', el) || el;
      win.scrollTo(0, Math.max(0, Math.round(card.getBoundingClientRect().top + (win.pageYOffset || doc.documentElement.scrollTop) - viewH() * 0.45)));
    });
  });
  // Karst scene on narrow screens: zoom into the part each step talks about, so the tags stay readable.
  var karstSvg = one('.karst-svg'), karstBox = [0, 0, 900, 560], karstAnim = null;
  var KARST_ZOOM = [[0, 90, 450, 280], [30, 180, 600, 373], [200, 174, 620, 386], [400, 130, 500, 311], [250, 150, 400, 249]];
  function karstZoom(i) {
    if (!karstSvg) return;
    var target = karstSvg.getBoundingClientRect().width < 600 ? KARST_ZOOM[i] || [0, 0, 900, 560] : [0, 0, 900, 560];
    var from = karstBox.slice(), t0 = now(), dur = reduceMotion ? 1 : 700;
    if (karstAnim) caf.call(win, karstAnim);
    (function tick() {
      var p = Math.min(1, (now() - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      for (var k = 0; k < 4; k++) karstBox[k] = from[k] + (target[k] - from[k]) * e;
      karstSvg.setAttribute('viewBox', karstBox.map(function (v) { return v.toFixed(1); }).join(' '));
      if (p < 1) karstAnim = raf(tick);
    })();
  }
  function updateScrollies() {
    for (var i = 0; i < scrollies.length; i++) {
      var s = scrollies[i], active = 0;
      // Desktop: the figure fills the screen, switch steps at 60% height.
      // Phones: the figure is a band at the top; switch halfway through the space below it.
      var fb = s.fig.getBoundingClientRect();
      var mid = fb.height < viewH() * 0.8 ? (Math.max(fb.bottom, 0) + viewH()) / 2 : viewH() * 0.6;
      for (var j = 0; j < s.steps.length; j++) {
        var card = one('.step-card', s.steps[j]) || s.steps[j];
        if (card.getBoundingClientRect().top < mid) active = j;
      }
      if (active !== s.current) {
        s.current = active;
        s.fig.setAttribute('data-step', String(active));
        if (s.type === 'map') {
          var nMap = parseInt(s.box.getAttribute('data-map-steps'), 10) || s.steps.length, isAlt = active >= nMap;
          if (mapCtl) { mapCtl.go(Math.min(active, nMap - 1)); mapUI.step(Math.min(active, nMap - 1)); }
          if (isAlt) addClass(s.fig, 'is-alt'); else removeClass(s.fig, 'is-alt');
          if (altCtl) altCtl.go(isAlt ? active - nMap : -1);
        }
        if (s.type === 'karst') karstZoom(active);
      }
    }
  }
  scrollHandlers.push(updateScrollies);
  // Season switch on the karst scene: jump to the first wet or dry step.
  all('[data-season-go]').forEach(function (b) {
    on(b, 'click', function () {
      var step = doc.getElementById('karst-step-' + b.getAttribute('data-season-go'));
      if (!step) return;
      var card = one('.step-card', step) || step;
      var y = card.getBoundingClientRect().top + (win.pageYOffset || doc.documentElement.scrollTop) - viewH() * 0.45;
      win.scrollTo(0, Math.max(0, Math.round(y)));
    });
  });

  var mapUI = setupMapUI(one('.map-card'));

  /* ---------- Map: chips, place cards, province names ---------- */
  function setupMapUI(card) {
    var noop = { step: function () {} };
    if (!card) return noop;
    var pop = one('.map-pop', card), tip = one('.map-tip', card);
    var chips = all('.map-chip', card);
    var suffix = tip ? tip.getAttribute('data-suffix') || '' : '';
    var tipTimer = null;
    function closePop() { if (pop) pop.hidden = true; }
    function pos(el, x, y) {
      var r = card.getBoundingClientRect();
      var w = el.offsetWidth || 260, h = el.offsetHeight || 120;
      var left = Math.max(8, Math.min(x - r.left + 14, r.width - w - 8));
      var top = Math.max(8, Math.min(y - r.top + 14, r.height - h - 8));
      el.style.left = left + 'px'; el.style.top = top + 'px';
    }
    function openPlace(id, x, y) {
      all('[data-place-card]', pop).forEach(function (c) { c.hidden = c.getAttribute('data-place-card') !== id; });
      pop.hidden = false;
      pos(pop, x, y);
    }
    all('[data-place]', card).forEach(function (el) {
      var id = el.getAttribute('data-place');
      on(el, 'click', function (e) { e.stopPropagation(); openPlace(id, e.clientX, e.clientY); });
      on(el, 'keydown', function (e) {
        if (e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          var r = el.getBoundingClientRect();
          openPlace(id, r.left + r.width / 2, r.top + r.height / 2);
          var x = one('.map-pop-x', pop); if (x) x.focus();
        }
      });
    });
    on(one('.map-pop-x', pop), 'click', closePop);
    on(pop, 'click', function (e) { e.stopPropagation(); });
    on(card, 'click', function () { closePop(); });
    on(doc, 'keydown', function (e) { if (e.keyCode === 27) closePop(); });
    function showTip(el, x, y) {
      if (!tip) return;
      var t = el.getElementsByTagName('title')[0];
      tip.textContent = (t ? t.textContent : '') + ' ' + suffix;
      tip.hidden = false;
      pos(tip, x, y - 40);
    }
    all('[data-prov]', card).forEach(function (el) {
      on(el, 'mousemove', function (e) { showTip(el, e.clientX, e.clientY); });
      on(el, 'mouseleave', function () { if (tip) tip.hidden = true; });
      on(el, 'click', function (e) {
        e.stopPropagation(); closePop();
        all('.is-hover', card).forEach(function (h) { removeClass(h, 'is-hover'); });
        addClass(el, 'is-hover');
        showTip(el, e.clientX, e.clientY);
        if (tipTimer) win.clearTimeout(tipTimer);
        tipTimer = win.setTimeout(function () { if (tip) tip.hidden = true; removeClass(el, 'is-hover'); }, 2500);
      });
    });
    chips.forEach(function (chip) {
      on(chip, 'click', function () {
        var i = parseInt(chip.getAttribute('data-goto'), 10);
        var target = doc.getElementById('map-step-' + i);
        if (mapCtl) mapCtl.go(i);
        if (target) {
          var card2 = one('.step-card', target) || target;
          var y = topOf(card2) - viewH() * 0.45;
          win.scrollTo(0, Math.max(0, y));
        }
      });
    });
    return {
      step: function (i) {
        closePop();
        chips.forEach(function (c, k) { c.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      }
    };
  }

  /* ---------- Map: animate the SVG viewBox between steps ---------- */
  function setupMap(svg) {
    if (!svg) return null;
    var steps;
    try { steps = JSON.parse(svg.getAttribute('data-steps')); } catch (e) { return null; }
    var cur = steps[0].slice();
    var anim = null;
    var scalers = all('.m-s', svg);
    // Scale label groups so 1 unit inside them = 1 screen pixel (preserveAspectRatio "meet").
    function apply(vb) {
      svg.setAttribute('viewBox', vb.join(' '));
      var w = svg.clientWidth || (svg.getBoundingClientRect && svg.getBoundingClientRect().width) || 600;
      var h = svg.clientHeight || (svg.getBoundingClientRect && svg.getBoundingClientRect().height) || 400;
      var k = Math.max(vb[2] / w, vb[3] / h).toFixed(4);
      for (var i = 0; i < scalers.length; i++) scalers[i].setAttribute('transform', 'scale(' + k + ')');
    }
    resizeHandlers.push(function () { apply(cur); });
    function go(i) {
      var target = steps[Math.min(i, steps.length - 1)];
      if (reduceMotion) { cur = target.slice(); apply(cur); return; }
      var from = cur.slice(), t0 = now(), dur = 1100, id = {};
      anim = id;
      function frame() {
        if (anim !== id) return;
        var p = Math.min(1, (now() - t0) / dur);
        var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        for (var k = 0; k < 4; k++) cur[k] = from[k] + (target[k] - from[k]) * e;
        apply(cur);
        if (p < 1) raf(frame);
      }
      frame();
    }
    apply(cur);
    return { go: go };
  }

  /* ---------- Village hotspots ---------- */
  all('[data-hotspot]').forEach(function (btn) {
    var panel = doc.getElementById(btn.getAttribute('aria-controls'));
    on(btn, 'click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (open) removeClass(panel, 'open'); else addClass(panel, 'open');
    });
    var title = panel && panel.parentNode ? one('h3', panel.parentNode) : null;
    if (title) { title.style.cursor = 'pointer'; on(title, 'click', function () { btn.click(); }); }
  });

  /* ---------- Tabs (task chain, stakeholder map) ---------- */
  all('[data-tabs]').forEach(function (box) {
    var tabs = all('[role="tab"]', box);
    function select(tab) {
      tabs.forEach(function (t) {
        var sel = t === tab;
        t.setAttribute('aria-selected', sel ? 'true' : 'false');
        t.setAttribute('tabindex', sel ? '0' : '-1');
        var p = doc.getElementById(t.getAttribute('aria-controls'));
        if (p) p.setAttribute('data-active', sel ? 'true' : 'false');
      });
    }
    tabs.forEach(function (t, i) {
      t.setAttribute('tabindex', t.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      on(t, 'click', function () { select(t); });
      on(t, 'keydown', function (e) {
        var k = e.keyCode, n = null;
        if (k === 39 || k === 40) n = tabs[(i + 1) % tabs.length];
        if (k === 37 || k === 38) n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (n) { e.preventDefault(); select(n); n.focus(); }
      });
    });
  });

  /* ---------- Carry the water (press and hold) ---------- */
  (function () {
    var btn = doc.getElementById('carry-btn');
    if (!btn) return;
    var reset = doc.getElementById('carry-reset');
    var fillBar = doc.getElementById('carry-fill');
    var bar = doc.getElementById('carry-progress');
    var water = doc.getElementById('can-water');
    var end = doc.getElementById('carry-end');
    var voiceCards = all('[data-voice]');
    var voiceTexts = all('[data-voice-text]');
    var voiceEmpty = doc.getElementById('vb-empty');
    var shown = -1, unlocked = -1;
    function showVoice(i) {
      shown = i;
      for (var k = 0; k < voiceCards.length; k++) voiceCards[k].setAttribute('aria-pressed', k === i ? 'true' : 'false');
      for (var j = 0; j < voiceTexts.length; j++) voiceTexts[j].hidden = j !== i;
      if (voiceEmpty) voiceEmpty.hidden = i >= 0;
      var bub = one('.voice-bubble');
      if (bub) { if (i >= 0 && voiceCards[i].getAttribute('data-gender') === 'm') addClass(bub, 'is-m'); else removeClass(bub, 'is-m'); }
    }
    voiceCards.forEach(function (c, i) { on(c, 'click', function () { if (!c.disabled) showVoice(i); }); });
    var FULL_MS = 7000;
    var progress = 0, holding = false, last = 0;

    function render() {
      fillBar.style.width = (progress * 100).toFixed(1) + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      water.setAttribute('y', String(160 - 132 * progress));
      var reach = -1;
      for (var i = 0; i < voiceCards.length; i++) {
        var ok = progress >= parseFloat(voiceCards[i].getAttribute('data-at'));
        voiceCards[i].disabled = !ok;
        if (ok) reach = i;
      }
      if (reach !== unlocked) { unlocked = reach; showVoice(reach); }
      if (progress >= 1) {
        btn.textContent = btn.getAttribute('data-done');
        addClass(btn, 'done'); removeClass(btn, 'active');
        addClass(end, 'show'); reset.hidden = false; holding = false;
      }
    }
    function loop() {
      if (!holding) return;
      var t = now();
      progress = Math.min(1, progress + (t - last) / FULL_MS);
      last = t;
      render();
      if (holding) raf(loop);
    }
    function start(e) {
      if (e && e.cancelable) e.preventDefault();
      if (progress >= 1 || holding) return;
      holding = true; last = now();
      addClass(btn, 'active');
      btn.textContent = btn.getAttribute('data-holding');
      loop();
    }
    function stop() {
      if (!holding) return;
      holding = false;
      removeClass(btn, 'active');
      if (progress < 1) btn.textContent = btn.getAttribute('data-hold');
    }
    if (win.PointerEvent) {
      on(btn, 'pointerdown', start);
      on(btn, 'pointerup', stop); on(btn, 'pointerleave', stop); on(btn, 'pointercancel', stop);
    } else {
      on(btn, 'touchstart', start); on(btn, 'touchend', stop); on(btn, 'touchcancel', stop);
      on(btn, 'mousedown', start); on(btn, 'mouseup', stop); on(btn, 'mouseleave', stop);
    }
    on(btn, 'contextmenu', function (e) { e.preventDefault(); });
    on(btn, 'keydown', function (e) { if (e.keyCode === 32 || e.keyCode === 13) { if (!e.repeat) start(e); else e.preventDefault(); } });
    on(btn, 'keyup', function (e) { if (e.keyCode === 32 || e.keyCode === 13) stop(); });
    on(btn, 'blur', stop);
    on(reset, 'click', function () {
      progress = 0; unlocked = -1; removeClass(btn, 'done'); removeClass(end, 'show');
      btn.textContent = btn.getAttribute('data-hold'); reset.hidden = true; render(); btn.focus();
    });
    render();
  })();



  /* ---------- How high is it? (inside the map scrolly) ----------
     Each altitude step walks the figure along the cross-section to the next point. */
  function setupAlt(fig) {
    if (!fig) return null;
    var path = one('#alt-path', fig), walker = one('#alt-walker', fig), rect = one('#alt-done-rect', fig), svg = one('.alt-svg', fig);
    var pts = all('[data-alt-pt]', fig);
    if (!path || !path.getTotalLength) return null;
    var L = path.getTotalLength();
    function lenAtX(x) {
      var lo = 0, hi = L;
      for (var k = 0; k < 30; k++) { var mid = (lo + hi) / 2; if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
      return lo;
    }
    var ptX = pts.map(function (g) { return parseFloat(g.getAttribute('data-x')); });
    var curX = 20, anim = null;
    function place() {
      var small = svg.getBoundingClientRect().width < 700;
      pts.forEach(function (g, i) {
        var p = path.getPointAtLength(lenAtX(ptX[i])), r = small ? 24 : 13;
        one('.alt-dot', g).setAttribute('cy', p.y.toFixed(1));
        one('.alt-dot', g).setAttribute('r', String(r));
        one('.alt-n', g).setAttribute('y', (p.y + (small ? 9 : 5)).toFixed(1));
        var pin = one('.alt-pin', g); pin.setAttribute('y1', (p.y - r).toFixed(1)); pin.setAttribute('y2', (p.y - r - 18).toFixed(1));
        var texts = g.querySelectorAll('.alt-lab text');
        texts[0].setAttribute('y', (p.y - r - 44).toFixed(1));
        texts[1].setAttribute('y', (p.y - r - 24).toFixed(1));
      });
    }
    function draw(x) {
      var len = lenAtX(x), p = path.getPointAtLength(len), q = path.getPointAtLength(Math.min(L, len + 6));
      var ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      walker.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + (ang * 0.3).toFixed(1) + ')');
      rect.setAttribute('width', String(Math.max(0, x + 20)));
      camera(x);
    }
    // When the card is narrower than the drawing, show the full height and pan sideways with the walker,
    // so labels stay readable. The altitude scale moves with the view.
    var scaleG = one('#alt-scale', fig);
    function camera(x) {
      var r = fig.getBoundingClientRect(), vw = 1200;
      if (r.width && r.height) vw = Math.min(1200, 560 * r.width / r.height);
      var vx = Math.max(0, Math.min(1200 - vw, x - vw * 0.45));
      svg.setAttribute('viewBox', vx.toFixed(1) + ' 0 ' + vw.toFixed(1) + ' 560');
      if (scaleG) scaleG.setAttribute('transform', 'translate(' + vx.toFixed(1) + ' 0)');
    }
    function go(i) {
      for (var k = 0; k < pts.length; k++) { if (k <= i) addClass(pts[k], 'reached'); else removeClass(pts[k], 'reached'); }
      var target = i < 0 ? 20 : ptX[i], from = curX, t0 = now(), dur = reduceMotion ? 1 : Math.min(1800, 400 + Math.abs(target - from) * 3);
      if (anim) caf.call(win, anim);
      addClass(walker, 'walking');
      (function tick() {
        var p = Math.min(1, (now() - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        curX = from + (target - from) * e; draw(curX);
        if (p < 1) anim = raf(tick); else removeClass(walker, 'walking');
      })();
    }
    pts.forEach(function (g, i) {
      function jump() {
        var el = doc.getElementById(i === 0 ? 'plateau-altitude' : 'alt-step-' + i);
        if (!el) return;
        var card = one('.step-card', el) || el;
        win.scrollTo(0, Math.max(0, Math.round(card.getBoundingClientRect().top + (win.pageYOffset || doc.documentElement.scrollTop) - viewH() * 0.45)));
      }
      on(g, 'click', jump);
      on(g, 'keydown', function (e) { if (e.keyCode === 13 || e.keyCode === 32) { e.preventDefault(); jump(); } });
    });
    place(); draw(curX);
    resizeHandlers.push(function () { place(); draw(curX); });
    return { go: go };
  }

  /* ---------- Chapter 5: two stories on one scale ---------- */
  all('[data-scale]').forEach(function (box) {
    var facts = all('.fact', box), beam = one('#scale-beam', box), panL = one('#pan-l', box), panR = one('#pan-r', box);
    var stackL = one('#stack-l', box), stackR = one('#stack-r', box), reset = one('#scale-reset', box);
    var NS = stackL.namespaceURI;   // the SVG namespace, taken from the element itself
    function setT(el, v) { el.style.transform = el.style.webkitTransform = v; }
    function block(stack, i, cx, color) {
      var r = doc.createElementNS(NS, 'rect');
      r.setAttribute('x', String(cx - 36)); r.setAttribute('y', String(150 - i * 13)); r.setAttribute('width', '72'); r.setAttribute('height', '11');
      r.setAttribute('rx', '3'); r.setAttribute('fill', color); r.setAttribute('class', 'pan-block');
      stack.appendChild(r);
    }
    function render() {
      var l = 0, r = 0;
      while (stackL.firstChild) stackL.removeChild(stackL.firstChild);
      while (stackR.firstChild) stackR.removeChild(stackR.firstChild);
      facts.forEach(function (f) {
        if (f.getAttribute('aria-pressed') !== 'true') return;
        if (f.getAttribute('data-side') === 'l') block(stackL, l++, 100, '#50575c'); else block(stackR, r++, 500, '#0f4f86');
      });
      var a = Math.max(-14, Math.min(14, (r - l) * 5));
      setT(beam, 'rotate(' + a + 'deg)'); setT(panL, 'rotate(' + (-a) + 'deg)'); setT(panR, 'rotate(' + (-a) + 'deg)');
      if (l > 0 && l === r) addClass(box, 'is-level'); else removeClass(box, 'is-level');
      reset.hidden = l + r === 0;
    }
    facts.forEach(function (f) { on(f, 'click', function () { f.setAttribute('aria-pressed', f.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); render(); }); });
    on(reset, 'click', function () { facts.forEach(function (f) { f.setAttribute('aria-pressed', 'false'); }); render(); });
    render();
  });

  /* ---------- Chapter 5: the four steps ---------- */
  all('[data-stairs]').forEach(function (box) {
    var steps = all('.stair', box), walker = one('#stair-walker', box);
    function go(i) {
      steps.forEach(function (s, k) {
        s.setAttribute('aria-pressed', k === i ? 'true' : 'false');
        if (k < i) addClass(s, 'is-done'); else removeClass(s, 'is-done');
      });
      var s = steps[i], bx = box.getBoundingClientRect(), sb = s.getBoundingClientRect();
      var x = sb.left - bx.left + sb.width / 2 - 23, y = -(sb.height);
      walker.style.transform = walker.style.webkitTransform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px)';
    }
    var cur = 0;
    steps.forEach(function (s, i) { on(s, 'click', function () { cur = i; go(i); }); });
    resizeHandlers.push(function () { go(cur); });
    go(0);
  });

  /* ---------- Chapter 4: the road to the reservoir ----------
     Desktop: the section is pinned and scrolling walks the figure along the road from stop to stop.
     Narrow screens: the road runs down the page beside the cards and the figure follows the reading position. */
  all('[data-road]').forEach(function (sec) {
    var road = one('.road', sec), band = one('.road-band', sec), fit = one('.road-fit', sec);
    var path = one('#road-path', sec), done = one('#road-done', sec), walker = one('#road-walker', sec);
    var fill = one('#road-fill', sec), detail = one('#road-detail', sec);
    var stops = all('[data-stop]', sec), cards = all('[data-card]', sec);
    if (!path || !path.getTotalLength) return;
    var L = path.getTotalLength(), VBW = 1600, VBH = 220;
    // Length along the path at each stop (the path runs left to right, so search on x).
    function lenAtX(x) {
      var lo = 0, hi = L;
      for (var k = 0; k < 30; k++) { var mid = (lo + hi) / 2; if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
      return lo;
    }
    var stopX = stops.map(function (s) { return parseFloat(s.style.left) * 16; });
    var stopLen = stopX.map(lenAtX);
    var startLen = Math.max(0, stopLen[0] - 160), endLen = stopLen[stopLen.length - 1];
    done.style.strokeDasharray = L + ' ' + L;
    var cur = -1, wide = false, walkTimer = null, lastPos = null;
    function isWide() { return win.innerWidth > 900; }
    function walking() {
      addClass(walker, 'walking');
      clearTimeout(walkTimer);
      walkTimer = setTimeout(function () { removeClass(walker, 'walking'); }, 220);
    }
    function setActive(i) {
      if (i === cur) return;
      cur = i;
      for (var k = 0; k < cards.length; k++) {
        if (k <= i) addClass(cards[k], 'reached'); else removeClass(cards[k], 'reached');
        if (k === i) addClass(cards[k], 'is-active'); else removeClass(cards[k], 'is-active');
        var b = one('.polaroid', cards[k]); if (b && b.tagName === 'BUTTON') b.setAttribute('aria-expanded', k === i ? 'true' : 'false');
      }
      for (var j = 0; j < stops.length; j++) { if (j <= i) addClass(stops[j], 'reached'); else removeClass(stops[j], 'reached'); }
      if (detail && wide) {
        var src = i >= 0 ? one('.pol-text', cards[i]) : null;
        detail.innerHTML = src ? '<div class="pol-text">' + src.innerHTML + '</div>' : '';
      }
    }
    function fitStage() {
      if (!fit) return;
      fit.style.transform = fit.style.webkitTransform = '';
      if (!wide) return;
      var avail = win.innerHeight - headerH(), need = fit.offsetHeight;
      var k = need > avail ? Math.max(0.6, avail / need) : 1;
      if (k < 1) fit.style.transform = fit.style.webkitTransform = 'scale(' + k.toFixed(3) + ')';
    }
    function headerH() { var h = doc.querySelector('.site-header'); return h ? h.offsetHeight : 56; }
    function progressWide() {
      var r = sec.getBoundingClientRect(), run = sec.offsetHeight - (win.innerHeight - headerH());
      if (run <= 0) return 0;
      return Math.max(0, Math.min(1, (headerH() - r.top) / run));
    }
    function updateWide() {
      var p = progressWide();
      var len = startLen + (endLen - startLen) * Math.min(1, p * 1.08);
      var pt = path.getPointAtLength(len);
      var w = band.offsetWidth, h = band.offsetHeight;
      var x = pt.x / VBW * w, y = band.offsetTop - h / 2 + pt.y / VBH * h;
      var ahead = path.getPointAtLength(Math.min(L, len + 8));
      var ang = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
      walker.style.transform = walker.style.webkitTransform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (ang * 0.35).toFixed(1) + 'deg)';
      done.style.strokeDashoffset = String(L - len);
      var i = -1; for (var k = 0; k < stopLen.length; k++) if (len >= stopLen[k] - 4) i = k;
      if (lastPos !== null && Math.abs(lastPos - len) > 0.5) walking();
      lastPos = len;
      setActive(i);
    }
    function updateNarrow() {
      var r = road.getBoundingClientRect(), H = road.offsetHeight;
      var y = Math.max(0, Math.min(H - 20, win.innerHeight * 0.55 - r.top));
      walker.style.transform = walker.style.webkitTransform = 'translate(40px,' + y.toFixed(1) + 'px)';
      if (fill) fill.style.height = y.toFixed(1) + 'px';
      var i = -1;
      for (var k = 0; k < cards.length; k++) if (cards[k].offsetTop + 20 <= y + 18) i = k;
      if (lastPos !== null && Math.abs(lastPos - y) > 0.5) walking();
      lastPos = y;
      setActive(i);
    }
    function layout() {
      wide = isWide();
      if (wide) addClass(sec, 'is-pinned'); else removeClass(sec, 'is-pinned');
      fitStage();
      cur = -2; lastPos = null;
      update();
    }
    function update() { if (wide) updateWide(); else updateNarrow(); }
    // Clicking a card on desktop scrolls to the point where the walker reaches it.
    function goTo(i) {
      if (!wide) { setActive(i); return; }
      var run = sec.offsetHeight - (win.innerHeight - headerH());
      var p = ((stopLen[i] - startLen) / (endLen - startLen)) / 1.08 + 0.004;
      var top = sec.getBoundingClientRect().top + (win.pageYOffset || doc.documentElement.scrollTop) - headerH();
      win.scrollTo(0, Math.round(top + p * run));
    }
    cards.forEach(function (c, i) {
      var b = one('button.polaroid', c);
      if (b) on(b, 'click', function () { goTo(i); });
    });
    // The numbered stops on the road work the same way as the cards.
    stops.forEach(function (st, i) { on(st, 'click', function () { goTo(i); }); });
    scrollHandlers.push(update);
    resizeHandlers.push(layout);
    layout();
  });

  /* ---------- Before / after slider ---------- */
  all('[data-ba]').forEach(function (box) {
    var range = one('.ba-range', box);
    var clip = one('.ba-before', box);
    function set() {
      var v = 100 - parseFloat(range.value);
      var c = 'inset(0 ' + v + '% 0 0)';
      clip.style.webkitClipPath = c; clip.style.clipPath = c;
    }
    on(range, 'input', set); on(range, 'change', set); set();
  });

  /* ---------- Vote (stored only in this browser) ---------- */
  (function () {
    var box = one('[data-vote]');
    if (!box) return;
    var KEY = 'meovac-success-vote';
    var store = storage();
    var clear = doc.getElementById('vote-clear');
    var btns = all('.vote-btn', box);
    function show(id) {
      btns.forEach(function (b) {
        var sel = b.getAttribute('data-vote-id') === id;
        b.setAttribute('aria-pressed', sel ? 'true' : 'false');
        var card = b.parentNode;
        if (sel) addClass(card, 'selected'); else removeClass(card, 'selected');
      });
      if (clear) clear.hidden = !id;
    }
    var saved = null;
    if (store) { try { saved = store.getItem(KEY); } catch (e) {} }
    show(saved);
    btns.forEach(function (b) {
      on(b, 'click', function () {
        var id = b.getAttribute('data-vote-id');
        if (store) { try { store.setItem(KEY, id); } catch (e) {} }
        show(id);
      });
    });
    on(clear, 'click', function () {
      if (store) { try { store.removeItem(KEY); } catch (e) {} }
      show(null);
    });
  })();

  /* ---------- Language switch that keeps the reading position ---------- */
  var anchors = all('[data-anchor][id]');
  function currentPosition() {
    var best = null;
    for (var i = 0; i < anchors.length; i++) {
      var r = anchors[i].getBoundingClientRect();
      if (r.top <= HEADER + 8 && r.height > 0) best = anchors[i];
    }
    if (!best) return null;
    var rect = best.getBoundingClientRect();
    var frac = Math.max(0, Math.min(1, (HEADER + 8 - rect.top) / Math.max(1, rect.height)));
    return best.id + ':' + frac.toFixed(4);
  }
  var sw = doc.getElementById('lang-switch');
  on(sw, 'click', function (e) {
    var pos = currentPosition();
    if (win.meovacSwitchLang) { e.preventDefault(); win.meovacSwitchLang(pos); return; }
    if (!pos) return;
    e.preventDefault();
    win.location.href = sw.getAttribute('href').split('#')[0] + '#pos=' + pos;
  });
  function restorePosition(str) {
    var m = str ? /^([\w-]+):([\d.]+)$/.exec(str) : /^#pos=([\w-]+):([\d.]+)$/.exec(win.location.hash || '');
    if (!m) return false;
    var el = doc.getElementById(m[1]);
    if (!el) return false;
    var y = topOf(el) + parseFloat(m[2]) * el.getBoundingClientRect().height - HEADER - 8;
    root.style.scrollBehavior = 'auto';
    win.scrollTo(0, Math.max(0, y));
    root.style.scrollBehavior = '';
    return true;
  }
  if (startPos) restorePosition(startPos);
  else if (restorePosition()) {
    // Fonts and layout may shift a little after load; settle once more, then tidy the URL.
    on(win, 'load', function () {
      restorePosition();
      try { if (win.history && history.replaceState) history.replaceState(null, '', win.location.pathname + win.location.search); } catch (e) {}
    });
  }

  /* ---------- Intro screen: hold Space (or press and hold) to carry the water home ---------- */
  (function () {
    var box = doc.getElementById('intro');
    if (!box) return;
    var seen = false; try { seen = win.sessionStorage.getItem('meovac-intro') === '1'; } catch (e) {}
    if (seen || startPos) { box.parentNode.removeChild(box); return; }
    if ('ontouchstart' in win || (win.navigator && navigator.maxTouchPoints > 0)) addClass(root, 'is-touch');
    root.style.overflow = 'hidden';
    var scene = doc.getElementById('intro-scene');
    var trail = doc.getElementById('intro-trail'), done = doc.getElementById('intro-trail-done');
    var walker = doc.getElementById('intro-walker'), flip = one('.in-flip', walker);
    var tank = one('.in-tank-water', box);
    var words = all('.iq', box);
    var L = trail.getTotalLength();
    done.style.strokeDasharray = L + ' ' + L;
    var DUR = reduceMotion ? 1000 : 3200;           // ms of holding to walk the whole trail
    var p = 0, v = 0, holding = false, last = 0, running = false, arrived = false, closed = false, facing = 1;
    var pushUntil = 0, PUSH = 800;   // each press keeps her walking a little longer, so tapping works as well as holding

    // Keep the important part of the scene (summit spring to house) in view at any screen shape.
    function fit() {
      var r = scene.getBoundingClientRect(); if (!r.width || !r.height) return;
      var A = r.width / r.height, bx = 960, by = 150, bw = 680, bh = 690, x, y, w, h;
      if (A > bw / bh) { h = bh; w = h * A; x = bx + bw / 2 - w / 2; y = by; }
      else { w = bw; h = w / A; x = bx; y = by + bh / 2 - h / 2; }
      scene.setAttribute('viewBox', [x, y, w, h].map(function (n) { return n.toFixed(1); }).join(' '));
    }
    function place() {
      var d = p * L, pt = trail.getPointAtLength(d);
      var ahead = trail.getPointAtLength(Math.min(L, d + 4)), behind = trail.getPointAtLength(Math.max(0, d - 4));
      var dx = ahead.x - behind.x, dy = ahead.y - behind.y;
      if (Math.abs(dx) > .6) facing = dx >= 0 ? 1 : -1;
      var ang = Math.atan2(dy, Math.abs(dx) || 1) * 180 / Math.PI;
      ang = Math.max(-14, Math.min(14, ang)) * facing;
      walker.setAttribute('transform', 'translate(' + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2) + ') rotate(' + ang.toFixed(2) + ') scale(.8)');
      flip.setAttribute('transform', 'scale(' + facing + ' 1)');
      done.style.strokeDashoffset = (L * (1 - p)).toFixed(1);
      var n = words.length;
      for (var i = 0; i < n; i++) { var on = p >= (i + 1) / n * 0.96; if (on !== /(^| )on( |$)/.test(words[i].className)) { if (on) addClass(words[i], 'on'); else removeClass(words[i], 'on'); } }
    }
    function arrive() {
      arrived = true; addClass(box, 'arrived'); removeClass(walker, 'walking');
      if (tank) { tank.setAttribute('y', '72'); tank.setAttribute('height', '34'); }
    }
    function close() {
      if (closed) return; closed = true;
      try { win.sessionStorage.setItem('meovac-intro', '1'); } catch (e) {}
      addClass(box, 'done'); root.style.overflow = '';
      win.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1000);
    }
    function frame() {
      var t = now(), dt = Math.min(50, t - last); last = t;
      var target = (holding || t < pushUntil) && !arrived ? 1 : 0;
      v += (target - v) * Math.min(1, dt / (reduceMotion ? 60 : 170));   // ease in and out
      p = Math.min(1, p + v * dt / DUR);
      place();
      if (v > 0.15 && !arrived) addClass(walker, 'walking'); else removeClass(walker, 'walking');
      if (p >= 1 && !arrived) arrive();
      if (v > 0.002 || holding || t < pushUntil) raf(frame); else running = false;
    }
    function loop() { if (!running) { running = true; last = now(); raf(frame); } }
    var armed = false;   // after arrival: the next press (or the release of a held key) opens the story
    function start(e) {
      if (closed) return; if (e && e.cancelable) e.preventDefault();
      if (arrived && !holding) { armed = true; return; }
      holding = true; pushUntil = now() + PUSH; loop();
    }
    function stop() {
      if (arrived && (holding || armed)) { holding = false; return close(); }
      if (!holding) return; holding = false; pushUntil = now() + PUSH; loop();
    }
    on(doc, 'keydown', function (e) { if (closed) return; if (e.keyCode === 32 || e.keyCode === 13) { e.preventDefault(); if (!e.repeat) start(); else if (!arrived) { holding = true; pushUntil = now() + PUSH; loop(); } } });
    on(doc, 'keyup', function (e) { if (e.keyCode === 32 || e.keyCode === 13) stop(); });
    function isSkip(e) { return e.target && e.target.id === 'intro-skip'; }
    if (win.PointerEvent) {
      on(box, 'pointerdown', function (e) { if (!isSkip(e)) start(e); });
      on(box, 'pointerup', stop); on(box, 'pointercancel', stop);
    } else {
      on(box, 'touchstart', function (e) { if (!isSkip(e)) start(e); }); on(box, 'touchend', stop);
      on(box, 'mousedown', function (e) { if (!isSkip(e)) start(e); }); on(box, 'mouseup', stop);
    }
    on(box, 'contextmenu', function (e) { e.preventDefault(); });
    on(doc.getElementById('intro-skip'), 'click', close);
    on(win, 'resize', fit);
    fit(); place();
    try { box.setAttribute('tabindex', '-1'); box.focus(); } catch (e) {}
  })();

  /* ---------- Go ---------- */
  addClass(root, 'js-ready');
  onScrollFrame();
  }

  win.__meovacInit = init;
  if (!win.MEOVAC_MANUAL) init();
})();
