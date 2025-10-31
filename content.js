 (() => {
       // --- UI state ---
       let hud, listEl;
       let items = [];        // [{id, title, favIconUrl}]
       let index = 1;         // selection index; allow 0 (current tab)
       let visible = false;
       let hudTimer = null;
       let HUD_DELAY = 150; // ms
       chrome.storage.sync.get({ hudDelay: 150 }, (data) => {
           HUD_DELAY = data.hudDelay;
       });

       // Track modifier keys to detect Option hold and release
       const down = new Set();

       function isTypingTarget(el) {
         if (!el) return false;
         const tag = el.tagName;
         const editable = el.isContentEditable;
         return editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
       }

       function ensureHud() {
         if (hud) return;
         hud = document.createElement('div');
         hud.id = 'safari-mru-hud';
         listEl = document.createElement('ul');
         hud.appendChild(listEl);
         document.documentElement.appendChild(hud);
       }

       function render() {
         ensureHud();
         listEl.innerHTML = '';
         items.forEach((t, i) => {
           const li = document.createElement('li');
           if (i === index) li.classList.add('selected');
           const img = document.createElement('img');
           img.className = 'favicon';
           img.src = t.favIconUrl || '';
           img.referrerPolicy = 'no-referrer'; // prevents CORS/referrer blocking
           img.loading = 'lazy';
           img.onerror = () => {
             img.style.opacity = '0.3';
             img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="gray"/></svg>';
           };
           const span = document.createElement('span');
           span.className = 'title';
           span.textContent = t.title || 'Untitled';
           li.appendChild(img);
           li.appendChild(span);
           listEl.appendChild(li);
         });
       }

       function show() {
         ensureHud();
         hud.style.display = 'block';
         visible = true;
       }

       function hide() {
         if (!hud) return;
         hud.style.display = 'none';
         visible = false;
       }

       async function requestItems() {
         return new Promise((resolve) => {
           chrome.runtime.sendMessage({ type: 'mru-request-active' }, (resp) => {
             resolve(resp?.items || []);
           });
         });
       }

       function clampIndex(n) {
         if (!items.length) return 0;
         const max = Math.max(0, items.length - 1);
         return Math.max(0, Math.min(max, n));
       }

       function isOptionHeld() {
         return down.has('AltLeft') || down.has('AltRight');
       }

       // --- Keyboard handling ---
        function moveSelection(delta) {
          index = clampIndex(index + delta);
          if (visible) render();
        }

        async function finalize() {
          // Tell background to activate selection (0 = cancel/no-op)
          chrome.runtime.sendMessage({ type: 'mru-finalize', index });
          hide(); // safe even if already hidden
        }

       window.addEventListener('keydown', async (e) => {
         // Track Alt modifier only
         if (e.key === 'Alt') {
           down.add(e.code);
           return;
         }

         // Ignore if typing in inputs
         if (isTypingTarget(e.target)) return;

         // Handle Option+Tab and Option+Shift+Tab
         if (e.key.toLowerCase() === 'tab' && isOptionHeld()) {
           e.preventDefault();
           e.stopPropagation();

           // Only handle the first keydown (ignore auto-repeat)
           if (e.repeat) return;

           if (!visible) {
             // First Option+Tab or Option+Shift+Tab: fetch items, set index=0, schedule delayed HUD, then move once.
             items = await requestItems();
             if (items.length < 1) return;
             index = 0; // start at current tab
             // schedule HUD appear if Option still held after delay
             if (hudTimer) clearTimeout(hudTimer);
             hudTimer = setTimeout(() => {
               if (isOptionHeld() && !visible) {
                 render();
                 show();
               }
               hudTimer = null;
             }, HUD_DELAY);
             moveSelection(e.shiftKey ? -1 : +1);
           } else {
             // HUD already visible: move selection immediately
             moveSelection(e.shiftKey ? -1 : +1);
           }
         }
       }, true);

       window.addEventListener('keyup', (e) => {
         if (e.key === 'Alt') {
           down.delete(e.code);
           if (!isOptionHeld()) {
             if (hudTimer) { clearTimeout(hudTimer); hudTimer = null; }
             finalize();
           }
         }
       }, true);

       // In case the page steals focus or we navigate, ensure state resets
       window.addEventListener('blur', () => {
         down.clear();
         if (hudTimer) { clearTimeout(hudTimer); hudTimer = null; }
         hide();
       });
     })();
