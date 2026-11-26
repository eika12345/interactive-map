/*! Interactive map with filterable listings - dependency-free, MIT */
(function (root) {
  'use strict';
  var uid = 0;
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var round = function (n) { return Math.round(n * 10) / 10; };
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  function InteractiveMap(el, cfg) {
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.el) throw new Error('InteractiveMap: mount element not found');
    this.cfg = cfg;
    this.uid = ++uid;
    this.L = Object.assign({ filters: 'Filter by category', show: 'Show on map', read: 'Read more',
      empty: 'Nothing matches the filters.', loading: 'Loading...', error: 'Could not load the places.', close: 'Close', places: 'places', mapLabel: 'Interactive map', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Reset zoom', mapHelp: 'Use the arrow keys to pan and the plus and minus keys to zoom.' }, cfg.labels);
    this.cats = cfg.categories;
    this.items = [];
    this.msg = null;
    this.active = {};
    for (var k in this.cats) this.active[k] = true;
    this.edit = cfg.edit != null ? cfg.edit : /[?&]edit(&|=|$)/.test(location.search);
    this.off = [];
    /* optional shareable URL state: urlState: true, or { key: 'map' } to namespace several maps on one page */
    this.urlOn = !!cfg.urlState;
    this.ukey = (cfg.urlState && cfg.urlState.key) || 'im';
    this.urlLive = false;
    if (this.urlOn) {
      this.pending = this.readUrl();
      this.active = this.activeFrom(this.pending.cats);
    }
    this.build();
    this.load(cfg.items);
  }
  InteractiveMap.mount = function (el, cfg) { return new InteractiveMap(el, cfg); };

  var P = InteractiveMap.prototype;

  P.on = function (t, ev, fn, opt) {
    t.addEventListener(ev, fn, opt);
    this.off.push(function () { t.removeEventListener(ev, fn, opt); });
  };
  /* items may be an array, or a URL to a JSON file ([...] or {"items": [...]}) */
  P.load = function (src) {
    var self = this;
    if (typeof src !== 'string') {
      this.setItems(src || []);
      this.ready = Promise.resolve(this);
      return;
    }
    this.msg = this.L.loading;
    this.renderList();
    this.ready = fetch(src)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (err) {
        if (!self.dead) {
          self.msg = self.L.error;
          self.renderList();
          if (window.console) console.error('InteractiveMap: failed to load ' + src, err);
        }
        return null;
      })
      .then(function (data) {
        if (!data || self.dead) return self;
        self.msg = null;
        self.setItems(Array.isArray(data) ? data : data.items || []);
        return self;
      });
  };

  /* replace the data at runtime, e.g. map.setItems(newArray) */
  P.setItems = function (arr) {
    var uidv = this.uid;
    this.items = arr.map(function (it, i) {
      return Object.assign({}, it, { _id: 'im' + uidv + '-' + i, _i: i });
    });
    this.render();
    if (this.urlOn) {
      if (this.pending) { this.openItem(this.pending.item); this.pending = null; }
      this.urlLive = true;
      this.writeUrl();
    }
  };

  P.vis = function () { var a = this.active; return this.items.filter(function (i) { return a[i.category]; }); };
  P.cat = function (i) { return this.cats[i.category] || { label: i.category, color: '#888' }; };
  P.meta = function (i) {
    return (this.cfg.fields || []).map(function (f) {
      return i[f.key] != null ? (f.label ? f.label + ' ' : '') + i[f.key] + (f.suffix || '') : null;
    }).filter(Boolean).map(esc).join(' \u00b7 ');
  };

  P.build = function () {
    var self = this, m = this.cfg.map, t = this.cfg.theme || {};
    this.el.classList.add('im');
    var vars = { accent: '--im-accent', bg: '--im-bg', ink: '--im-ink', panel: '--im-panel', line: '--im-line', font: '--im-font' };
    for (var k in vars) if (t[k]) this.el.style.setProperty(vars[k], t[k]);
    this.el.innerHTML =
      '<div class="im-stats"></div>' +
      '<div class="im-bar"><div class="im-filters" role="group" aria-label="' + esc(this.L.filters) + '"></div>' +
      '<span class="im-count" aria-live="polite"></span></div>' +
      '<div class="im-grid">' +
        '<div class="im-map" role="region" aria-label="' + esc(this.L.mapLabel) + '"' +
          (this.cfg.zoom === false ? '' : ' tabindex="0" aria-describedby="im-help-' + this.uid + '"') + ' style="aspect-ratio:' + m.width + '/' + m.height + '">' +
          (this.cfg.zoom === false ? '' : '<span class="im-sr" id="im-help-' + this.uid + '">' + esc(this.L.mapHelp) + '</span>') +
          '<div class="im-clip"><div class="im-stage"><img class="im-img" alt="' + esc(m.alt || '') + '" src="' + esc(m.image) + '" draggable="false">' +
          '<div class="im-pins"></div></div></div>' +
          '<div class="im-pop" role="dialog" aria-modal="false" hidden></div>' +
          (this.cfg.zoom === false ? '' :
            '<div class="im-zoom" role="group">' +
            '<button type="button" data-zoom="in" aria-label="' + esc(this.L.zoomIn) + '">+</button>' +
            '<button type="button" data-zoom="out" aria-label="' + esc(this.L.zoomOut) + '">\u2212</button>' +
            '<button type="button" data-zoom="reset" aria-label="' + esc(this.L.zoomReset) + '">\u21ba</button></div>') +
          (this.edit ? '<div class="im-edit">Edit mode: click the map to get x / y</div>' : '') +
        '</div>' +
        '<ul class="im-list"></ul>' +
      '</div>';
    this.q = function (s) { return self.el.querySelector(s); };
    this.mapEl = this.q('.im-map'); this.stage = this.q('.im-stage'); this.pins = this.q('.im-pins'); this.pop = this.q('.im-pop');

    this.q('.im-filters').innerHTML = Object.keys(this.cats).map(function (k) {
      return '<label class="im-filter"><input type="checkbox" data-cat="' + esc(k) + '"' + (self.active[k] ? ' checked' : '') + '>' +
        '<span class="im-sw" style="--c:' + self.cats[k].color + '"></span>' + esc(self.cats[k].label) + '</label>';
    }).join('');

    this.on(this.el, 'change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-cat');
      if (!k) return;
      self.active[k] = e.target.checked;
      self.render();
    });
    this.on(this.el, 'click', function (e) { self.click(e); });
    this.on(document, 'pointerdown', function (e) {
      if (!self.pop.hidden && !self.pop.contains(e.target) && !e.target.closest('.im-pin')) self.closePop(false);
    });
    this.on(document, 'keydown', function (e) { if (e.key === 'Escape' && !self.pop.hidden) self.closePop(true); });
    this.on(window, 'resize', function () { self.resize(); });
    if (this.urlOn) this.on(window, 'hashchange', function () { if (self.urlLive) self.applyState(self.readUrl()); });
    this.initZoom();
    this.render();
  };

  P.render = function () {
    this.closePop(false);
    this.renderStats(); this.renderPins(); this.renderList();
    this.q('.im-count').textContent = this.vis().length + ' ' + this.L.places;
    this.writeUrl();
  };

  P.renderStats = function () {
    var v = this.vis(), box = this.q('.im-stats');
    var defs = this.cfg.stats || [];
    box.style.display = defs.length ? '' : 'none';
    box.innerHTML = defs.map(function (s) {
      var val, nums = v.map(function (i) { return Number(i[s.field]) || 0; });
      if (s.type === 'sum') val = round(nums.reduce(function (a, b) { return a + b; }, 0));
      else if (s.type === 'max') val = nums.length ? round(Math.max.apply(null, nums)) : 0;
      else val = v.length;
      return '<div class="im-stat"><b>' + esc(val) + esc(s.suffix || '') + '</b><span>' + esc(s.label) + '</span></div>';
    }).join('');
  };

  P.renderPins = function () {
    var self = this, W = this.cfg.map.width, H = this.cfg.map.height, g = {};
    this.vis().forEach(function (i) { (g[i.x + ',' + i.y] = g[i.x + ',' + i.y] || []).push(i); });
    this.groups = Object.keys(g).map(function (k) { return g[k]; });
    this.pins.innerHTML = '';
    this.pinEls = this.groups.map(function (grp, gi) {
      var f = grp[0], b = document.createElement('button');
      b.type = 'button'; b.className = 'im-pin'; b.setAttribute('data-g', gi);
      b.style.left = f.x / W * 100 + '%'; b.style.top = f.y / H * 100 + '%';
      b.style.setProperty('--c', self.cat(f).color);
      b.setAttribute('aria-label', grp.length > 1
        ? grp.length + ' places here: ' + grp.map(function (i) { return i.title; }).join(', ') : f.title);
      if (grp.length > 1) b.innerHTML = '<span>' + grp.length + '</span>';
      self.pins.appendChild(b);
      return b;
    });
  };

  P.renderList = function () {
    var self = this, v = this.vis();
    if (this.msg) {
      this.q('.im-list').innerHTML = '<li class="im-empty" role="status">' + esc(this.msg) + '</li>';
      return;
    }
    this.q('.im-list').innerHTML = v.length ? v.map(function (i) {
      var c = self.cat(i);
      return '<li class="im-card" id="' + i._id + '" style="--c:' + c.color + '">' +
        (i.image ? '<img src="' + esc(i.image) + '" alt="' + esc(i.imageAlt || '') + '" loading="lazy">' : '') +
        '<div class="im-body"><h3>' + esc(i.title) + '</h3>' +
        '<p class="im-meta">' + self.meta(i) + (self.meta(i) ? ' \u00b7 ' : '') + '<span class="im-cat">' + esc(c.label) + '</span></p>' +
        (i.description ? '<p>' + esc(i.description) + '</p>' : '') +
        '<button type="button" class="im-btn" data-show="' + i._id + '">' + esc(self.L.show) + '</button></div></li>';
    }).join('') : '<li class="im-empty">' + esc(this.L.empty) + '</li>';
  };

  P.click = function (e) {
    var t = e.target, pin = t.closest('.im-pin'), s, r, z = t.closest('[data-zoom]');
    if (z) return this.zoomBy(z.getAttribute('data-zoom'));
    if (pin) return this.openPop(+pin.getAttribute('data-g'));
    if (t.closest('.im-x')) return this.closePop(true);
    if ((r = t.closest('[data-read]'))) return this.jump(r.getAttribute('data-read'));
    if ((s = t.closest('[data-show]'))) return this.showOnMap(s.getAttribute('data-show'));
    if (this.edit && t.closest('.im-map') && !t.closest('.im-pop') && !t.closest('.im-zoom')) this.pick(e);
  };

  P.openPop = function (gi, quiet) {
    var self = this, grp = this.groups[gi];
    if (!grp) return;
    this.cur = gi;
    this.pop.innerHTML = '<button type="button" class="im-x" aria-label="' + esc(this.L.close) + '">\u00d7</button>' +
      grp.map(function (i) {
        return '<div class="im-pi" style="--c:' + self.cat(i).color + '"><strong>' + esc(i.title) + '</strong>' +
          '<span>' + self.meta(i) + '</span><span class="im-cat">' + esc(self.cat(i).label) + '</span>' +
          '<button type="button" class="im-btn" data-read="' + i._id + '">' + esc(self.L.read) + '</button></div>';
      }).join('');
    this.pop.hidden = false;
    this.placePop();
    if (this.cfg.onSelect) this.cfg.onSelect(grp);
    this.writeUrl();
    if (!quiet) this.pop.querySelector('.im-x').focus({ preventScroll: true });
  };

  P.placePop = function () {
    if (this.pop.hidden || this.cur == null) return;
    var pin = this.pinEls[this.cur];
    if (!pin) return;
    var m = this.mapEl.getBoundingClientRect(), r = pin.getBoundingClientRect();
    var w = this.pop.offsetWidth, h = this.pop.offsetHeight;
    var cx = r.left + r.width / 2 - m.left;
    var top = r.top - m.top - h - 8;
    if (top < 4) top = r.bottom - m.top + 8;
    this.pop.style.left = Math.max(4, Math.min(m.width - w - 4, cx - w / 2)) + 'px';
    this.pop.style.top = top + 'px';
  };

  P.closePop = function (refocus) {
    if (this.pop.hidden) return;
    this.pop.hidden = true;
    var pin = this.pinEls && this.pinEls[this.cur];
    this.cur = null;
    this.writeUrl();
    if (refocus && pin) pin.focus();
  };

  P.showOnMap = function (id) {
    var gi = -1;
    this.groups.forEach(function (g, i) { if (g.some(function (x) { return x._id === id; })) gi = i; });
    if (gi < 0) return;
    this.mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.reveal(gi);
    this.openPop(gi);
  };

  P.jump = function (id) {
    var c = document.getElementById(id);
    if (!c) return;
    this.closePop(false);
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    c.classList.remove('im-flash'); void c.offsetWidth; c.classList.add('im-flash');
  };

  P.pick = function (e) {
    var r = this.q('.im-img').getBoundingClientRect(), m = this.cfg.map;
    var x = Math.round((e.clientX - r.left) / r.width * m.width);
    var y = Math.round((e.clientY - r.top) / r.height * m.height);
    var out = '"x": ' + x + ', "y": ' + y;
    if (navigator.clipboard) navigator.clipboard.writeText(out).catch(function () {});
    this.q('.im-edit').textContent = out + '  (copied)';
  };


  /* ---- zoom & pan ----
     Transform model: stage is drawn as translate(tx,ty) scale(k) with origin 0 0, k in [1, max].
     Pins are counter-scaled in CSS (1/k) so they keep a constant size. */
  /* keep the scaled map covering the viewport: t must lie in [size - size*k, 0] */
  InteractiveMap.fit = function (t, k, size) { return clamp(t, size - size * k, 0); };
  /* new translate that keeps viewport point p fixed while the scale goes k -> nk */
  InteractiveMap.anchor = function (t, p, k, nk) { return p - (p - t) * nk / k; };

  P.count = function () { return Object.keys(this.ptrs).length; };

  P.initZoom = function () {
    var self = this, m = this.mapEl;
    this.k = 1; this.tx = 0; this.ty = 0;
    this.zmax = (this.cfg.zoom && this.cfg.zoom.max) || 4;
    this.vw = m.clientWidth; this.vh = m.clientHeight;
    this.ptrs = {}; this.dragged = false; this.sup = false;
    if (this.cfg.zoom === false) return;

    this.on(m, 'pointerdown', function (e) {
      if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.im-pop, .im-zoom')) return;
      self.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var n = self.count();
      if (n === 1) { self.sx = e.clientX; self.sy = e.clientY; self.dragged = false; }
      else if (n === 2) {
        self.dragged = true;   // a pinch is never a tap
        var ids = Object.keys(self.ptrs), a = self.ptrs[ids[0]], b = self.ptrs[ids[1]];
        self.pd = Math.hypot(a.x - b.x, a.y - b.y);
        self.pm = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        ids.forEach(function (id) { try { m.setPointerCapture(+id); } catch (_) {} });
      }
    });
    this.on(m, 'pointermove', function (e) {
      var p = self.ptrs[e.pointerId], n = self.count();
      if (!p) return;
      if (n === 1) {
        if (self.k <= 1) return;
        if (!self.dragged) {
          if (Math.abs(e.clientX - self.sx) + Math.abs(e.clientY - self.sy) < 6) return;
          self.dragged = true;   // capture only now, so plain taps still reach the pins
          try { m.setPointerCapture(e.pointerId); } catch (_) {}
        }
        var dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        self.tx += dx; self.ty += dy; self.apply();
      } else if (n === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var ids = Object.keys(self.ptrs), a = self.ptrs[ids[0]], b = self.ptrs[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var r = m.getBoundingClientRect();
        if (self.pd > 0) self.zoomAt(self.pm.x - r.left, self.pm.y - r.top, self.k * d / self.pd, mx - self.pm.x, my - self.pm.y);
        self.pd = d; self.pm = { x: mx, y: my };
      }
    });
    var up = function (e) {
      if (!self.ptrs[e.pointerId]) return;
      delete self.ptrs[e.pointerId];
      var n = self.count();
      if (n === 1) {
        var q = self.ptrs[Object.keys(self.ptrs)[0]];
        self.sx = q.x; self.sy = q.y;   // remaining finger continues as a pan, no jump
      } else if (n === 0) {
        if (self.dragged) { self.sup = true; setTimeout(function () { self.sup = false; }, 0); }
        self.dragged = false;
      }
    };
    this.on(document, 'pointerup', up);
    this.on(document, 'pointercancel', up);
    /* swallow the click that follows a drag/pinch so it doesn't open a popup */
    this.on(m, 'click', function (e) { if (self.sup) { e.stopPropagation(); e.preventDefault(); } }, true);
    /* ctrl/cmd + wheel (also trackpad pinch) zooms; plain wheel keeps scrolling the page */
    this.on(m, 'wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var r = m.getBoundingClientRect();
      /* one wheel notch is about the same step as the + button; small trackpad-pinch deltas stay small */
      var dy = clamp(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY, -60, 60);
      self.wx = e.clientX - r.left; self.wy = e.clientY - r.top;
      self.wt = clamp((self.wt != null ? self.wt : self.k) * Math.exp(-dy * 0.006), 1, self.zmax);
      self.wheelEase();
    }, { passive: false });
    this.on(m, 'dblclick', function (e) {
      if (e.target.closest('.im-pin, .im-pop, .im-zoom')) return;
      self.wt = null;
      var r = m.getBoundingClientRect();
      self.zoomAt(e.clientX - r.left, e.clientY - r.top, self.k >= self.zmax * 0.99 ? 1 : self.k * 2, 0, 0, true);
    });
    /* arrow keys / + / - / 0 when the map itself has focus (pins and buttons keep their own keys) */
    this.on(m, 'keydown', function (e) { if (e.target === m) self.key(e); });
    /* keyboard focus on an off-screen pin pans it into view */
    this.on(m, 'focusin', function (e) {
      var pin = e.target.closest && e.target.closest('.im-pin');
      if (pin) self.reveal(+pin.getAttribute('data-g'));
    });
    this.apply();
  };

  /* zoom to scale nk around viewport point (px, py), then shift by (dx, dy) */
  P.zoomAt = function (px, py, nk, dx, dy, animate) {
    nk = clamp(nk, 1, this.zmax);
    this.tx = InteractiveMap.anchor(this.tx, px, this.k, nk) + dx;
    this.ty = InteractiveMap.anchor(this.ty, py, this.k, nk) + dy;
    this.k = nk;
    this.apply(animate);
  };

  /* returns true if the key was handled. At 1x arrows are left alone so the page still scrolls. */
  P.key = function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    var k = e.key, s = e.shiftKey ? 0.5 : 0.2, dx = 0, dy = 0;
    if (k === 'ArrowLeft') dx = -1; else if (k === 'ArrowRight') dx = 1;
    else if (k === 'ArrowUp') dy = -1; else if (k === 'ArrowDown') dy = 1;
    if (dx || dy) {
      if (this.k <= 1) return false;
      this.tx -= dx * s * this.vw; this.ty -= dy * s * this.vh;   // view moves right = content moves left
      this.apply(true);
    } else if (k === '+' || k === '=') this.zoomBy('in');
    else if (k === '-' || k === '_') this.zoomBy('out');
    else if (k === '0') this.zoomBy('reset');
    else return false;
    e.preventDefault();
    return true;
  };

  P.zoomBy = function (dir) {
    this.wt = null;   // cancel any wheel zoom still easing
    var f = dir === 'in' ? 1.5 : dir === 'out' ? 1 / 1.5 : 0;
    this.zoomAt(this.vw / 2, this.vh / 2, f ? this.k * f : 1, 0, 0, true);
  };

  /* animate = true for one-off moves (buttons, keys, double-click). Drags, pinches and wheel stay instant. */
  var DUR = 300;
  P.apply = function (animate) {
    var F = InteractiveMap.fit;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearTimeout(this.animT);
    if (animate && !reduce) {
      this.stage.classList.add('im-anim');
      var st = this; this.animT = setTimeout(function () { st.stage.classList.remove('im-anim'); }, DUR + 50);
      this.track();
    } else this.stage.classList.remove('im-anim');
    this.tx = F(this.tx, this.k, this.vw);
    this.ty = F(this.ty, this.k, this.vh);
    this.stage.style.transform = 'translate(' + this.tx + 'px,' + this.ty + 'px) scale(' + this.k + ')';
    this.stage.style.setProperty('--k', this.k);
    this.mapEl.classList.toggle('im-zoomed', this.k > 1);
    var self = this;
    [].forEach.call(this.el.querySelectorAll('[data-zoom]'), function (b) {
      var d = b.getAttribute('data-zoom');
      b.setAttribute('aria-disabled', d === 'in' ? self.k >= self.zmax : self.k <= 1);
    });
    this.placePop();
  };

  /* Ctrl + wheel: ease the scale toward the target a little each frame, keeping the point under the cursor fixed */
  P.wheelEase = function () {
    var self = this;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.requestAnimationFrame) {
      this.zoomAt(this.wx, this.wy, this.wt, 0, 0); this.wt = null; return;
    }
    if (this.wraf) return;
    (function step() {
      self.wraf = 0;
      if (self.dead || self.wt == null) return;
      var ratio = self.wt / self.k;
      if (Math.abs(ratio - 1) < 0.002) { self.zoomAt(self.wx, self.wy, self.wt, 0, 0); self.wt = null; return; }
      self.zoomAt(self.wx, self.wy, self.k * Math.pow(ratio, 0.22), 0, 0);
      self.wraf = requestAnimationFrame(step);
    })();
  };

  /* while the stage animates, keep an open popup glued to its pin */
  P.track = function () {
    var self = this, end = Date.now() + DUR + 50;
    if (!window.requestAnimationFrame) return;
    cancelAnimationFrame(this.raf);
    (function f() {
      if (self.dead) return;
      self.placePop();
      if (Date.now() < end) self.raf = requestAnimationFrame(f);
    })();
  };

  P.resize = function () {
    var w = this.mapEl.clientWidth, h = this.mapEl.clientHeight;
    if (this.vw && this.vh) { this.tx *= w / this.vw; this.ty *= h / this.vh; }
    this.vw = w; this.vh = h;
    this.apply();
  };

  /* pan so pin group gi is on screen (only when zoomed in and it is outside the viewport) */
  P.reveal = function (gi) {
    var g = this.groups && this.groups[gi], pin = this.pinEls && this.pinEls[gi];
    if (!g || !pin || this.k <= 1) return;
    var r = pin.getBoundingClientRect(), m = this.mapEl.getBoundingClientRect(), pad = 16;
    if (r.left > m.left + pad && r.right < m.right - pad && r.top > m.top + pad && r.bottom < m.bottom - pad) return;
    this.tx = this.vw / 2 - g[0].x / this.cfg.map.width * this.vw * this.k;
    this.ty = this.vh / 2 - g[0].y / this.cfg.map.height * this.vh * this.k;
    this.apply();
  };


  /* ---- shareable URL state ----
     Hash params (namespaced by key): <key>.cats=easy,hard (only when some filter is off), <key>.item=<index in items> */
  P.readUrl = function () {
    var p = new URLSearchParams(location.hash.slice(1)), c = p.get(this.ukey + '.cats'), i = p.get(this.ukey + '.item');
    return { cats: c == null ? null : c.split(',').filter(Boolean), item: i == null || i === '' || isNaN(+i) ? null : +i };
  };
  P.activeFrom = function (list) {
    var a = {}, k, known = [];
    if (list) known = list.filter(function (x) { return x in this.cats; }, this);
    var all = !list || (list.length && !known.length);   // no param, or only unknown keys: show everything
    for (k in this.cats) a[k] = all || known.indexOf(k) >= 0;
    return a;
  };
  P.writeUrl = function () {
    if (!this.urlOn || !this.urlLive) return;
    var self = this, p = new URLSearchParams(location.hash.slice(1)), all = Object.keys(this.cats);
    var on = all.filter(function (k) { return self.active[k]; });
    if (on.length === all.length) p.delete(this.ukey + '.cats'); else p.set(this.ukey + '.cats', on.join(','));
    var g = this.cur != null && this.groups && this.groups[this.cur];
    if (g) p.set(this.ukey + '.item', g[0]._i); else p.delete(this.ukey + '.item');
    var h = p.toString().replace(/%2C/gi, ',');
    var url = location.pathname + location.search + (h ? '#' + h : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  };
  P.openItem = function (idx) {
    var it = idx != null && this.items[idx], gi = -1;
    if (!it) return;
    this.groups.forEach(function (g, i) { if (g.some(function (x) { return x._i === idx; })) gi = i; });
    if (gi < 0) return;
    this.reveal(gi);
    this.openPop(gi, true);   // quiet: don't steal focus on page load
  };
  /* apply state from the URL (initial load handled in setItems; this is for back/forward and pasted links) */
  P.applyState = function (s) {
    this.active = this.activeFrom(s.cats);
    var self = this;
    [].forEach.call(this.el.querySelectorAll('[data-cat]'), function (c) { c.checked = !!self.active[c.getAttribute('data-cat')]; });
    this.render();
    this.openItem(s.item);
  };

  P.destroy = function () {
    this.dead = true;
    clearTimeout(this.animT);
    if (window.cancelAnimationFrame) { cancelAnimationFrame(this.raf); cancelAnimationFrame(this.wraf); }
    this.off.forEach(function (f) { f(); });
    this.off = [];
    this.el.classList.remove('im');
    this.el.removeAttribute('style');
    this.el.innerHTML = '';
  };

  root.InteractiveMap = InteractiveMap;
})(window);
