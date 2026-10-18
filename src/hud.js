import { WEAPONS, BUY_LIST } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(sound) {
    this.sound = sound;
    this.el = {
      hud: $('hud'),
      scoreCT: $('score-ct'),
      scoreT: $('score-t'),
      timer: $('round-timer'),
      roundInfo: $('round-info'),
      health: $('health'),
      armor: $('armor'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
      weaponName: $('weapon-name'),
      money: $('money'),
      announce: $('announce'),
      killfeed: $('killfeed'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      damageFlash: $('damage-flash'),
      damageArrows: $('damage-arrows'),
      buyMenu: $('buy-menu'),
      buyTimer: $('buy-timer'),
      buyPistols: $('buy-pistols'),
      buyPrimary: $('buy-primary'),
      buyGear: $('buy-gear'),
      mainMenu: $('main-menu'),
      pauseMenu: $('pause-menu'),
      scoreboard: $('scoreboard'),
      scoreboardBody: $('scoreboard-body'),
      matchEnd: $('match-end'),
      matchResult: $('match-result'),
      matchStats: $('match-stats'),
      spectator: $('spectator-note'),
      scope: $('scope'),
      deployBtn: $('deploy-btn'),
    };

    this.el.deployBtn.addEventListener('click', () => {
      if (this.onCloseBuy) this.onCloseBuy();
    });

    this.hitTimer = 0;
    this.announceTimer = 0;
    this.dmgTimer = 0;
    this.onBuy = null;
    this.onCloseBuy = null;
    this.onPickMap = null;
    this.onOpenSettings = null;
    this.onCloseSettings = null;
    this.onSettingChange = null;
    this.onResetSettings = null;
    this._buildBuyMenu();
  }

  showHUD(show) {
    this.el.hud.classList.toggle('hidden', !show);
  }

  setScore(ct, t) {
    this.el.scoreCT.textContent = ct;
    this.el.scoreT.textContent = t;
  }

  setRound(round, maxRounds) {
    this.el.roundInfo.innerHTML = `ROUND ${round} &nbsp;·&nbsp; MR${maxRounds}`;
  }

  setTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.el.timer.textContent = `${m}:${ss}`;
    this.el.timer.classList.toggle('low', s <= 20);
  }

  setHealth(hp, armor) {
    this.el.health.textContent = Math.max(0, Math.ceil(hp));
    this.el.armor.textContent = Math.max(0, Math.ceil(armor));
    this.el.health.style.color = hp <= 30 ? '#ff6b5e' : '#e8e4d8';
    this.el.armor.style.color = armor <= 0 ? '#777' : '#9fc6ff';
  }

  setAmmo(mag, reserve, weaponName, infinite = false) {
    this.el.weaponName.textContent = weaponName.toUpperCase();
    this.el.ammoMag.textContent = infinite ? '∞' : mag;
    this.el.ammoReserve.textContent = infinite ? '∞' : reserve;
    this.el.ammoMag.style.color = (!infinite && mag === 0) ? '#ff6b5e' : '#e8e4d8';
  }

  setMoney(money) {
    this.el.money.textContent = `$${money}`;
  }

  setCrosshair(gapPx, zoomed) {
    this.el.crosshair.style.setProperty('--gap', `${gapPx}px`);
    this.el.crosshair.classList.toggle('zoomed', zoomed);
    this.el.crosshair.style.opacity = zoomed ? 0 : 1;
    this.el.scope.classList.toggle('hidden', !zoomed);
  }

  showHitmarker(kill = false) {
    this.hitTimer = 0.22;
    this.el.hitmarker.classList.add('show');
    this.el.hitmarker.classList.toggle('kill', kill);
  }

  showDamage(fromDirAngle) {
    // fromDirAngle: angle (radians) in camera-space around the player, 0 = in front
    this.dmgTimer = 0.6;
    this.el.damageFlash.classList.add('show');
    const arrow = document.createElement('div');
    arrow.className = 'dmg-arrow';
    const dist = 120;
    const x = Math.sin(fromDirAngle) * dist;
    const y = -Math.cos(fromDirAngle) * dist;
    arrow.style.transform = `translate(${x - 14}px, ${y - 13}px) rotate(${fromDirAngle * 180 / Math.PI}deg)`;
    this.el.damageArrows.appendChild(arrow);
    setTimeout(() => arrow.remove(), 700);
  }

  announce(text, cls = 'neutral', duration = 2.6) {
    this.el.announce.textContent = text;
    this.el.announce.className = `show ${cls}`;
    this.announceTimer = duration;
  }

  addKillFeed(killer, victim, weaponName, headshot, killerCT, victimCT) {
    const row = document.createElement('div');
    row.className = 'kf-row';
    const kCls = killerCT ? 'ct-name' : 't-name';
    const vCls = victimCT ? 'ct-name' : 't-name';
    row.innerHTML = `
      <span class="${kCls}">${killer}</span>
      <span class="weapon">[${weaponName}]${headshot ? ' <span class="hs">HS</span>' : ''}</span>
      <span class="${vCls}">${victim}</span>
    `;
    this.el.killfeed.appendChild(row);
    while (this.el.killfeed.children.length > 6) {
      this.el.killfeed.firstChild.remove();
    }
    setTimeout(() => row.remove(), 7000);
  }

  // ---------------- Buy menu ----------------

  _buildBuyMenu() {
    const makeItem = (entry, catEl) => {
      const def = entry.id in WEAPONS ? WEAPONS[entry.id] : null;
      const name = def ? def.name : entry.name;
      const price = def ? def.price : entry.price;
      const sub = def
        ? `${def.damage} dmg · ${def.rpm} rpm${def.auto ? ' · auto' : ''}`
        : entry.sub || '';
      const div = document.createElement('div');
      div.className = 'buy-item';
      div.dataset.id = entry.id;
      div.innerHTML = `
        <div>
          <div class="name"><span class="key">${entry.key}</span>${name}</div>
          <span class="sub">${sub}</span>
        </div>
        <div class="meta"><span class="price">$${price}</span></div>
      `;
      div.addEventListener('click', () => this.onBuy && this.onBuy(entry.id));
      catEl.appendChild(div);
      return { div, entry, price, id: entry.id };
    };

    this.buyItems = [];
    for (const entry of BUY_LIST) {
      const catEl = entry.cat === 'pistol' ? this.el.buyPistols
        : entry.cat === 'primary' ? this.el.buyPrimary
          : this.el.buyGear;
      this.buyItems.push(makeItem(entry, catEl));
    }
  }

  refreshBuyMenu(money, owned = {}) {
    for (const item of this.buyItems) {
      const afford = money >= item.price;
      item.div.classList.toggle('disabled', !afford);
      item.div.classList.toggle('owned', !!owned[item.id]);
    }
    const t = Math.max(0, Math.ceil(this.buyTimeLeft || 0));
    this.el.buyTimer.textContent = t > 0
      ? `BUY TIME: ${t}   ·   $${money}`
      : `LATE BUY WINDOW   ·   $${money}`;
  }

  showBuyMenu(show, buyTime = 0) {
    this.buyTimeLeft = buyTime;
    this.el.buyMenu.classList.toggle('hidden', !show);
    if (!show) return;
    // clear focus so game keys work
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // ---------------- Scoreboard ----------------

  showScoreboard(show, rows) {
    this.el.scoreboard.classList.toggle('hidden', !show);
    if (!show || !rows) return;
    this.el.scoreboardBody.innerHTML = rows.map((r) => `
      <tr class="${r.me ? 'me' : ''}">
        <td>${r.name}</td>
        <td class="${r.ct ? 'team-ct' : 'team-t'}">${r.ct ? 'CT' : 'T'}</td>
        <td>${r.kills}</td>
        <td>${r.deaths}</td>
        <td>${r.score}</td>
      </tr>
    `).join('');
  }

  showSpectator(show) {
    this.el.spectator.classList.toggle('hidden', !show);
  }

  showMatchEnd(show, text, statsHtml) {
    this.el.matchEnd.classList.toggle('hidden', !show);
    if (show) {
      this.el.matchResult.textContent = text;
      if (statsHtml) this.el.matchStats.innerHTML = statsHtml;
    }
  }

  // ============== Map picker ==============

  setMapList(maps, selectedId) {
    this._maps = maps;
    this._selectedMap = selectedId;
    const list = document.getElementById('map-list');
    if (!list) return;
    list.innerHTML = '';
    for (const m of maps) {
      const card = document.createElement('div');
      card.className = 'map-card' + (m.id === selectedId ? ' selected' : '');
      card.dataset.id = m.id;
      card.innerHTML = `
        <div class="name">${m.name.toUpperCase()}</div>
        <div class="id">${m.id}</div>
      `;
      card.addEventListener('click', () => this._selectMap(m.id));
      list.appendChild(card);
    }
    const desc = document.getElementById('map-desc');
    const sel = maps.find((m) => m.id === selectedId) || maps[0];
    if (desc && sel) desc.textContent = sel.description;
  }

  _selectMap(id) {
    this._selectedMap = id;
    const cards = document.querySelectorAll('.map-card');
    for (const c of cards) c.classList.toggle('selected', c.dataset.id === id);
    const sel = this._maps.find((m) => m.id === id);
    const desc = document.getElementById('map-desc');
    if (desc && sel) desc.textContent = sel.description;
    if (this.onPickMap) this.onPickMap(id);
  }

  // ============== Settings ==============

  /**
   * Wire settings panel inputs. Idempotent — re-binding the same panel just
   * re-syncs display values, which is what we want after a Reset.
   */
  bindSettings({ initial, onChange, onClose, onReset }) {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    // Stash callbacks so reset can call them later without re-binding.
    if (!this._settingsBound) {
      this._settingsBound = true;
      const back = document.getElementById('settings-back');
      const reset = document.getElementById('settings-reset');
      const fov = document.getElementById('fov-slider');
      const fovVal = document.getElementById('fov-val');
      const vol = document.getElementById('vol-slider');
      const volVal = document.getElementById('vol-val');
      const sens = document.getElementById('sens-slider');
      const sensVal = document.getElementById('sens-val');

      const paintSeg = (rootId, value, allowed) => {
        const root = document.getElementById(rootId);
        if (!root) return;
        for (const b of root.querySelectorAll('button')) {
          b.classList.toggle('on', allowed.includes(b.dataset.val) && b.dataset.val === value);
        }
      };

      this._paintSettings = (init) => {
        paintSeg('quality-seg', init.quality, ['low', 'medium', 'high']);
        paintSeg('shadow-seg', init.shadowQuality, ['auto', 'low', 'med', 'high']);
        fov.value = init.fov;
        fovVal.textContent = init.fov;
        vol.value = Math.round(init.volume * 100);
        volVal.textContent = `${Math.round(init.volume * 100)}%`;
        sens.value = init.mouseSensitivity.toFixed(1);
        sensVal.textContent = init.mouseSensitivity.toFixed(1);
      };

      for (const b of document.querySelectorAll('#quality-seg button')) {
        b.addEventListener('click', () => {
          this._settingsCb.onChange({ quality: b.dataset.val });
        });
      }
      for (const b of document.querySelectorAll('#shadow-seg button')) {
        b.addEventListener('click', () => {
          this._settingsCb.onChange({ shadowQuality: b.dataset.val });
        });
      }
      fov.addEventListener('input', () => {
        const v = +fov.value;
        fovVal.textContent = v;
        this._settingsCb.onChange({ fov: v });
      });
      vol.addEventListener('input', () => {
        const v = +vol.value / 100;
        volVal.textContent = `${vol.value}%`;
        this._settingsCb.onChange({ volume: v });
      });
      sens.addEventListener('input', () => {
        const v = +sens.value;
        sensVal.textContent = v.toFixed(1);
        this._settingsCb.onChange({ mouseSensitivity: v });
      });
      back.addEventListener('click', () => this._settingsCb.onClose());
      reset.addEventListener('click', () => this._settingsCb.onReset());
    }

    this._settingsCb = { onChange, onClose, onReset };
    this._paintSettings(initial);
  }

  showSettings(show) {
    const panel = document.getElementById('settings-panel');
    if (panel) panel.classList.toggle('hidden', !show);
  }

  update(dt) {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('show', 'kill');
    }
    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.el.announce.classList.remove('show');
    }
    if (this.dmgTimer > 0) {
      this.dmgTimer -= dt;
      if (this.dmgTimer <= 0) this.el.damageFlash.classList.remove('show');
    }
  }
}
