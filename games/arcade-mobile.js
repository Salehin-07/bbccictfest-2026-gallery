/* BBCC Arcade — shared mobile controls
 * Adds: fullscreen toggle, rotate-to-landscape prompt, on-screen touch D-pad +
 * action buttons (dispatch real keyboard events) and a virtual mouse for DOS games.
 * Loaded by every game page. Touch / coarse-pointer only.
 */
(function () {
  'use strict';

  var touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
              ('ontouchstart' in window && !window.matchMedia('(pointer: fine)').matches);

  var file = (location.pathname.split('/').pop() || '').toLowerCase();

  var DOS = {
    dpad: true, look: true, rotate: false, fs: true,
    buttons: [
      { label: 'FIRE', key: 'Control', code: 'ControlLeft', keyCode: 17, title: 'Fire', hold: true },
      { label: 'DOOR', key: ' ', code: 'Space', keyCode: 32, title: 'Space — open door / use', hold: true },
      { label: '↵', key: 'Enter', code: 'Enter', keyCode: 13, title: 'Enter / open door', hold: true }
    ]
  };

  var CONFIG = {
    'snake.html':      { dpad: false, rotate: false, fs: true, buttons: [{ label: 'II', key: ' ', code: 'Space', keyCode: 32, title: 'Pause' }] },
    'tetris.html':     { dpad: true, rotate: false, fs: true, buttons: [{ label: '▼', key: ' ', code: 'Space', keyCode: 32, title: 'Hard Drop' }] },
    '2048.html':       { dpad: false, rotate: false, fs: true, buttons: [{ label: 'R', key: 'r', code: 'KeyR', keyCode: 82, title: 'Restart' }] },
    'flappy.html':     { dpad: false, rotate: false, fs: true, buttons: [{ label: 'FLAP', key: ' ', code: 'Space', keyCode: 32, big: true, title: 'Flap' }] },
    'breakout.html':   { dpad: false, rotate: false, fs: true, buttons: [{ label: '▶', key: ' ', code: 'Space', keyCode: 32, title: 'Launch' }] },
    'pong.html':       { dpad: false, rotate: false, fs: true, buttons: [] },
    'memory.html':     { dpad: false, rotate: false, fs: true, buttons: [] },
    'minesweeper.html':{ dpad: false, rotate: false, fs: true, buttons: [] },
    'pokemon.html':    { dpad: false, rotate: false, fs: true, emu: true, buttons: [] },
    'doom.html': DOS, 'wolf3d.html': DOS, 'doom2.html': DOS, 'heretic.html': DOS, 'quake.html': DOS, 'keen.html': DOS
  };

  var cfg = CONFIG[file] || { dpad: true, rotate: true, fs: true, buttons: [] };
  var fsBtnEl = null;
  if (touch) document.body.classList.add('am-touch');
  if (cfg.dos && touch) document.body.classList.add('am-dos');

  var KEYCODE = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32, Control: 17, Enter: 13, Shift: 16, r: 82, x: 88, z: 90 };

  function fireKey(type, key, code, keyCode) {
    var kc = keyCode != null ? keyCode : KEYCODE[key];
    var ev = new KeyboardEvent(type, { key: key, code: code, bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return kc || 0; } }); } catch (e) {}
    try { Object.defineProperty(ev, 'which', { get: function () { return kc || 0; } }); } catch (e) {}
    document.dispatchEvent(ev);
  }

  /* ---------- Fullscreen toggle ---------- */
  function fsTarget() {
    return document.querySelector('.emu-wrap') ||
           document.querySelector('.dosbox-wrap') ||
           document.querySelector('.board-wrap') ||
           document.querySelector('main');
  }
  function toggleFs() {
    var el = fsTarget();
    if (!el) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        var p = req.call(el);
        if (p && p.then) p.catch(function () {});
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
      }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }
  function onFsChange() {
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    var root = document.getElementById('am-root');
    if (fsBtnEl) fsBtnEl.classList.toggle('am-fs-left', !!fsEl);
    if (fsEl) {
      fsEl.classList.add('am-fs-active');
      if (root.parentNode !== fsEl) fsEl.appendChild(root);
    } else {
      var prev = document.querySelector('.am-fs-active');
      if (prev) prev.classList.remove('am-fs-active');
      if (root.parentNode !== document.body) document.body.appendChild(root);
    }
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  /* ---------- Build UI ---------- */
  var root = document.createElement('div');
  root.id = 'am-root';

  // Rotate prompt
  if (cfg.rotate) {
    var rot = document.createElement('div');
    rot.id = 'am-rotate';
    rot.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/><path d="M5 9 3 7l2-2M19 15l2 2-2 2"/></svg>' +
      '<h2>Turn your phone sideways</h2>' +
      '<p>This game plays best in landscape, like a native handheld.</p>' +
      '<button id="am-rotate-dismiss" type="button">Play in portrait anyway</button>';
    root.appendChild(rot);
    rot.querySelector('#am-rotate-dismiss').addEventListener('click', function () {
      document.body.classList.remove('am-needs-rotate');
    });
  }

  // Fullscreen button
  if (cfg.fs) {
    var fs = document.createElement('button');
    fs.id = 'am-fsbtn';
    fs.type = 'button';
    fs.setAttribute('aria-label', 'Toggle fullscreen');
    fs.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    fs.addEventListener('click', toggleFs);
    fsBtnEl = fs;
    root.appendChild(fs);
  }

  // Virtual look surface (DOS)
  if (cfg.look && touch) {
    var look = document.createElement('div');
    look.id = 'am-look';
    root.appendChild(look);
    var lx = 0, ly = 0, looking = false;
    function canvasEl() { return document.getElementById('dosbox') || document.querySelector('.dosbox-wrap canvas'); }
    function moveMouse(cx, cy) {
      var c = canvasEl(); if (!c) return;
      c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy, movementX: cx - lx, movementY: cy - ly }));
    }
    function downMouse() {
      var c = canvasEl(); if (!c) return;
      c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: lx, clientY: ly }));
    }
    function upMouse() {
      var c = canvasEl(); if (!c) return;
      c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: lx, clientY: ly }));
    }
    look.addEventListener('touchstart', function (e) {
      e.preventDefault(); looking = true;
      lx = e.touches[0].clientX; ly = e.touches[0].clientY; downMouse();
    }, { passive: false });
    look.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!looking) return;
      var cx = e.touches[0].clientX, cy = e.touches[0].clientY;
      moveMouse(cx, cy); lx = cx; ly = cy;
    }, { passive: false });
    look.addEventListener('touchend', function (e) {
      e.preventDefault(); looking = false; upMouse();
    }, { passive: false });
  }

  // Touch pad (dpad + action buttons)
  var pad = document.createElement('div');
  pad.id = 'am-pad';
  root.appendChild(pad);

  if (cfg.dpad && touch) {
    var dpad = document.createElement('div');
    dpad.id = 'am-dpad';
    var dirs = [
      ['am-dir-up', 'ArrowUp', 'M12 19V5M5 12l7-7 7 7'],
      ['am-dir-left', 'ArrowLeft', 'M19 12H5M12 5l-7 7 7 7'],
      ['am-dir-right', 'ArrowRight', 'M5 12h14M12 5l7 7-7 7'],
      ['am-dir-down', 'ArrowDown', 'M12 5v14M5 12l7 7 7-7']
    ];
    dirs.forEach(function (d) {
      var b = document.createElement('button');
      b.id = d[0]; b.type = 'button'; b.setAttribute('aria-label', d[1]);
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="' + d[2] + '"/></svg>';
      bindRepeat(b, function () { fireKey('keydown', d[1], d[1], KEYCODE[d[1]]); },
                    function () { fireKey('keyup', d[1], d[1], KEYCODE[d[1]]); });
      dpad.appendChild(b);
    });
    var clusterL = document.createElement('div');
    clusterL.className = 'am-cluster';
    clusterL.appendChild(dpad);
    pad.appendChild(clusterL);
  }

  if (touch && cfg.buttons && cfg.buttons.length) {
    var actions = document.createElement('div');
    actions.id = 'am-actions';
    actions.className = 'am-cluster';
    cfg.buttons.forEach(function (btn) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = btn.label;
      if (btn.title) b.title = btn.title;
      if (btn.big) b.className = 'am-big';
      if (btn.hold) {
        bindHold(b, function () { fireKey('keydown', btn.key, btn.code, btn.keyCode); },
                    function () { fireKey('keyup', btn.key, btn.code, btn.keyCode); });
      } else {
        bindTap(b, function () { fireKey('keydown', btn.key, btn.code, btn.keyCode); fireKey('keyup', btn.key, btn.code, btn.keyCode); });
      }
      actions.appendChild(b);
    });
    pad.appendChild(actions);
  }

  document.body.appendChild(root);

  /* ---------- Gesture helpers ---------- */
  function bindTap(el, fn) {
    el.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
  }
  function bindHold(el, down, up) {
    el.addEventListener('touchstart', function (e) { e.preventDefault(); down(); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); up(); }, { passive: false });
    el.addEventListener('touchcancel', function (e) { e.preventDefault(); up(); }, { passive: false });
  }
  function bindRepeat(el, down, up) {
    var timer = null;
    function start(e) {
      e.preventDefault();
      down();
      clearInterval(timer);
      timer = setInterval(down, 110);
    }
    function stop(e) {
      e.preventDefault();
      clearInterval(timer); timer = null;
      up();
    }
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', stop, { passive: false });
    el.addEventListener('touchcancel', stop, { passive: false });
  }

  /* ---------- Rotate detection ---------- */
  function checkRotate() {
    if (!cfg.rotate) return;
    var portrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle('am-needs-rotate', portrait);
  }
  checkRotate();
  window.addEventListener('resize', checkRotate);
  window.addEventListener('orientationchange', function () { setTimeout(checkRotate, 200); });
})();
