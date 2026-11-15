'use strict';
 
const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
 
/* ------------------------------------------------------------------ utils */
 
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 3200);
}
 
async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({ ok: false, error: 'Некорректный ответ сервера' }));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
 
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
 
function poster(raw) {
  return raw ? esc(raw) : '';
}
 
function loading() {
  view.innerHTML = '<div class="center"><div class="spinner"></div></div>';
}
 
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { name: parts[0] || 'catalog', parts, query };
}
 
/* ------------------------------------------------------------------- cards */
 
function cardHtml(item) {
  const sub = item.meta || (item.years || []).join(', ');
  return `
    <a class="card" href="#/anime/${esc(item.slug)}">
      <div class="thumb">
        ${item.poster ? `<img loading="lazy" src="${poster(item.poster)}" alt="${esc(item.title)}">` : ''}
        ${sub ? `<span class="badge">${esc(sub.split('<br>')[0])}</span>` : ''}
      </div>
      <div class="body">
        <div class="title">${esc(item.title)}</div>
        ${item.altTitle ? `<div class="sub">${esc(item.altTitle)}</div>` : ''}
      </div>
    </a>`;
}
 
function gridHtml(items) {
  if (!items.length) return '<p class="muted">Ничего не найдено.</p>';
  return `<div class="grid">${items.map(cardHtml).join('')}</div>`;
}
 
/* ---------------------------------------------------------------- catalog */
 
async function renderCatalog(query) {
  loading();
  const genre = query.genre || '';
  const year = query.year || '';
  const page = Math.max(1, parseInt(query.page || '1', 10));
 
  let data;
  try {
    const qs = new URLSearchParams({ page: String(page) });
    if (genre) qs.set('genre', genre);
    if (year) qs.set('year', year);
    data = await api('/api/catalog?' + qs.toString());
  } catch (e) {
    view.innerHTML = `<h1>Каталог</h1><p class="muted">Ошибка: ${esc(e.message)}</p>`;
    return;
  }
 
  const pager = [];
  if (page > 1) pager.push(`<a class="chip" href="#/catalog?${new URLSearchParams({ ...(genre && { genre }), ...(year && { year }), page: String(page - 1) })}">← Назад</a>`);
  if (data.hasMore) pager.push(`<a class="chip" href="#/catalog?${new URLSearchParams({ ...(genre && { genre }), ...(year && { year }), page: String(page + 1) })}">Ещё →</a>`);
 
  view.innerHTML = `
    <h1>Каталог аниме</h1>
    ${gridHtml(data.items)}
    <div class="chips" style="justify-content:center;margin-top:26px">${pager.join('')}</div>`;
}
 
/* ----------------------------------------------------------------- search */
 
async function renderSearch(query) {
  const q = (query.q || '').trim();
  if (!q) { location.hash = '#/catalog'; return; }
  loading();
  try {
    const data = await api('/api/search?q=' + encodeURIComponent(q));
    view.innerHTML = `
      <h1>Поиск: ${esc(q)}</h1>
      <p class="muted">Найдено: ${data.total ?? data.items.length}</p>
      ${gridHtml(data.items)}`;
  } catch (e) {
    view.innerHTML = `<h1>Поиск</h1><p class="muted">Ошибка: ${esc(e.message)}</p>`;
  }
}
 
/* ------------------------------------------------------------------ anime */
 
const ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 2.5v15l13-7.5z" fill="#e8365d"/></svg>';
const ICON_PLAY_SM = '<svg width="10" height="10" viewBox="0 0 20 20"><path d="M3 1v18l16-9z" fill="#fff"/></svg>';
 
async function renderAnime(slug) {
  loading();
  try {
    const data = await api('/api/anime?slug=' + encodeURIComponent(slug));
    view.className = 'view full';
    window.scrollTo(0, 0);
 
    const genreList = (data.genres || []).filter(g => g.slug !== 'order-by');
    const genreLinks = genreList.slice(0, 10)
      .map(g => `<a href="#/catalog?genre=${esc(g.slug)}">${esc(g.label)}</a>`).join(', ');
    const genreShort = genreList.slice(0, 3).map(g => esc(g.label)).join('/');
    const eps = data.episodes || [];
    const dubs = data.translations || [];
    const bg = data.poster ? `style="background-image:url('${poster(data.poster)}')"` : '';
    const watchHref = eps.length ? `#/watch/${esc(slug)}/1` : '';
    const desc = data.description || 'Описание пока отсутствует.';
 
    view.innerHTML = `
      <section class="hero">
        <div class="bg" ${bg}></div>
        <div class="poster-center" ${bg}></div>
        ${watchHref ? `<a class="play-btn" href="${watchHref}" aria-label="Смотреть">${ICON_PLAY}</a>` : ''}
        <div class="hero-bar">
          <div class="wrap">
            <h1>${esc(data.title)}${data.year ? ` (${data.year})` : ''}</h1>
            <div class="hero-actions">
              <span class="hbtn solid">${eps.length} серий</span>
              <span class="hbtn"><span class="heart">♥</span> Смотреть позже</span>
              <span class="hbtn">☺ Поделиться</span>
            </div>
          </div>
        </div>
      </section>
 
      <div class="wrap">
        <div class="info">
          <div class="side">
            ${data.poster ? `<img src="${poster(data.poster)}" alt="${esc(data.title)}">` : ''}
            <div>
              ${watchHref ? `<a class="btn dark block" href="${watchHref}">▶&nbsp; Смотреть</a>` : ''}
              <a class="btn dark block" href="#/catalog${genreList[0] ? '?genre=' + esc(genreList[0].slug) : ''}">+&nbsp; Похожие</a>
              <a class="btn dark block" href="#/search?q=${encodeURIComponent(data.title)}">⋯&nbsp; Искать ещё</a>
            </div>
          </div>
 
          <div class="main">
            <h2>${esc(data.title)} ${data.year ? `<span class="tag accent">${data.year}</span>` : ''}</h2>
            <div class="tagline">${esc(desc.slice(0, 90))}${desc.length > 90 ? '…' : ''}</div>
            <div class="metaline">
              <span>${eps.length} серий</span><span class="sep"></span>
              <span>${dubs.length} озвучек</span>
              ${genreShort ? `<span class="sep"></span><span>${genreShort}</span>` : ''}
              ${data.year ? `<span class="sep"></span><span>${data.year}</span>` : ''}
            </div>
 
            <div class="cols">
              <div>
                <h3>Детали</h3>
                <dl class="dl">
                  <dt>Жанры:</dt><dd>${genreLinks || '—'}</dd>
                  <dt>Год:</dt><dd>${data.year || '—'}</dd>
                  <dt>Серий:</dt><dd>${eps.length}</dd>
                  <dt>Озвучек:</dt><dd>${dubs.length}</dd>
                </dl>
              </div>
              <div>
                <h3>Озвучка</h3>
                <ul class="voices">
                  ${dubs.slice(0, 5).map(t => `<li><span class="av"></span>${esc(t.label)}</li>`).join('') || '<li class="muted">Нет данных</li>'}
                </ul>
              </div>
            </div>
          </div>
 
          <div class="gallery">
            <h3>Смотреть</h3>
            <a class="big" ${bg} ${watchHref ? `href="${watchHref}"` : ''}><span>${ICON_PLAY_SM} Начать просмотр</span></a>
            <div class="row">
              <div ${bg}></div><div ${bg}></div>
            </div>
            <a class="btn dark block" ${watchHref ? `href="${watchHref}"` : ''}>♪&nbsp; Серии (${eps.length})</a>
          </div>
        </div>
 
        <div class="story">
          <h3>Сюжет</h3>
          <p>${esc(desc)}</p>
        </div>
 
        <div class="eps-block">
          <h2>Серии (${eps.length})</h2>
          ${eps.length
            ? `<div class="episodes">${eps.map(ep => `<a class="ep" href="#/watch/${esc(slug)}/${ep.number}">${esc(ep.title)}</a>`).join('')}</div>`
            : '<p class="muted">Серии не найдены.</p>'}
        </div>
 
        <div class="similar" id="similar"></div>
      </div>`;
 
    loadSimilar(slug, genreList[0]);
  } catch (e) {
    view.innerHTML = `<h1>Аниме</h1><p class="muted">Ошибка: ${esc(e.message)}</p>`;
  }
}
 
async function loadSimilar(slug, genre) {
  const box = document.getElementById('similar');
  if (!box || !genre) return;
  try {
    const data = await api('/api/catalog?genre=' + encodeURIComponent(genre.slug));
    const items = (data.items || []).filter(i => i.slug !== slug).slice(0, 5);
    if (!items.length || !document.getElementById('similar')) return;
    box.innerHTML = `
      <div class="similar-head">
        <h3><span class="ico"></span>Похожее аниме</h3>
        <span class="small">${esc(genre.label)}</span>
      </div>
      <div class="grid five">${items.map(cardHtml).join('')}</div>
      <a class="more-btn" href="#/catalog?genre=${esc(genre.slug)}">⊕&nbsp; Показать ещё</a>`;
  } catch (e) { /* похожие не критичны */ }
}
 
/* ------------------------------------------------------------------ watch */
 
let hlsInstance = null;
let playerCleanup = null;

function disposePlayer() {
  if (playerCleanup) {
    playerCleanup();
    playerCleanup = null;
  }
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}
 
async function renderWatch(slug, number, query) {
  loading();
  disposePlayer();
  const requestedHash = location.hash;
 
  let info;
  try {
    info = await api('/api/anime?slug=' + encodeURIComponent(slug));
    if (location.hash !== requestedHash) return;
  } catch (e) {
    view.innerHTML = `<h1>Просмотр</h1><p class="muted">Ошибка: ${esc(e.message)}</p>`;
    return;
  }
 
  // Источник видео — встроенный плеер каталога.
  let source = null, srcError = '';
  try {
    const qs = new URLSearchParams({ slug, n: String(number) });
    if (query && query.dub) qs.set('dub', query.dub);
    const w = await api('/api/watch?' + qs.toString());
    if (location.hash !== requestedHash) return;
    source = w.source;
  } catch (e) {
    if (location.hash !== requestedHash) return;
    srcError = e.message;
  }
 
  const nums = (info.episodes || []).map(e => e.number);
  const prev = nums.includes(number - 1) ? number - 1 : null;
  const next = nums.includes(number + 1) ? number + 1 : null;
  const sources = source ? (source.sources || []) : [];
  const translations = info.translations || [];
  const dubAvailable = (item) => Array.isArray(item.availableNumbers)
    ? item.availableNumbers.includes(number)
    : Number(item.episodes) >= number;
  const activeDub = source && Number.isInteger(Number(source.translationIndex))
    ? Number(source.translationIndex)
    : Math.max(0, parseInt(query && query.dub || '0', 10) || 0);
  const playerMarkup = sources.length ? `
        <div class="vp paused" id="videoPlayer" tabindex="0" role="region" aria-label="Видеоплеер">
          <video id="player" playsinline preload="metadata"
            aria-label="${esc(info.title)} — серия ${number}"
            ${info.poster ? `poster="${poster(info.poster)}"` : ''}></video>
          <button class="vp-hit" id="vpHit" type="button" aria-label="Воспроизвести или поставить на паузу"></button>
          <div class="vp-bigplay" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div class="vp-spin" aria-hidden="true"></div>
          <div class="vp-fx c" id="vpFeedback" aria-hidden="true"></div>
          <div class="vp-top">
            <span>${esc(info.title)}</span><em>Серия ${number}</em>
          </div>
          <div class="vp-ctrl">
            <div class="vp-prog" id="vpProgress" role="slider" tabindex="0"
              aria-label="Позиция видео" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div class="track">
                <span class="buf" id="vpBuffered"></span>
                <span class="cur" id="vpCurrent"></span>
              </div>
              <span class="knob"></span>
              <span class="tip" id="vpTip">0:00</span>
            </div>
            <div class="vp-row">
              <button class="vp-btn" id="vpPlay" type="button" aria-label="Воспроизвести" title="Воспроизвести (K)">
                <svg id="vpPlayIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <button class="vp-btn vp-skip" id="vpBack" type="button" aria-label="Назад на 10 секунд" title="Назад на 10 секунд (←)">
                <span aria-hidden="true">↶</span><small>10</small>
              </button>
              <button class="vp-btn vp-skip" id="vpForward" type="button" aria-label="Вперёд на 10 секунд" title="Вперёд на 10 секунд (→)">
                <span aria-hidden="true">↷</span><small>10</small>
              </button>
              <span class="vp-time" id="vpTime" aria-live="off">0:00 / --:--</span>
              <span class="grow"></span>
              <div class="vp-vol">
                <button class="vp-btn" id="vpMute" type="button" aria-label="Выключить звук" title="Звук (M)">
                  <svg id="vpVolumeIcon" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.32a3.5 3.5 0 0 0 2-3.16zm-2-8.45v2.06a7 7 0 0 1 0 12.78v2.06a9 9 0 0 0 0-16.9z"/>
                  </svg>
                </button>
                <input id="vpVolume" type="range" min="0" max="1" step="0.01" value="0.8" aria-label="Громкость">
              </div>
              <button class="vp-btn vp-settings-btn" id="vpSettings" type="button" aria-label="Настройки плеера" aria-expanded="false" title="Настройки">
                <svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.5 7.5 0 0 0 .05-1l2.03-1.58-2-3.46-2.43.98a7.4 7.4 0 0 0-1.73-1L14.7 4h-4l-.37 2.88a7.4 7.4 0 0 0-1.73 1l-2.43-.98-2 3.46L6.2 11.94a7.5 7.5 0 0 0 0 2l-2.03 1.58 2 3.46 2.43-.98a7.4 7.4 0 0 0 1.73 1L10.7 22h4l.37-2.88a7.4 7.4 0 0 0 1.73-1l2.43.98 2-3.46-2.03-1.58c.03-.37.03-.75-.06-1.12zM12.7 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
              </button>
              <button class="vp-btn" id="vpFullscreen" type="button" aria-label="На весь экран" title="На весь экран (F)">
                <svg id="vpFullscreenIcon" viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 4v-4h2v6h-6v-2h4z"/></svg>
              </button>
            </div>
          </div>
          <div class="vp-menu" id="vpMenu" role="menu" aria-label="Настройки воспроизведения" hidden>
            <div class="m-h">Качество</div>
            ${sources.map((item, i) => `<button type="button" role="menuitemradio" data-action="quality" data-index="${i}" class="${i === 0 ? 'on' : ''}" aria-checked="${i === 0}"><span>${esc(item.quality || item.res || 'Источник')}</span></button>`).join('')}
            ${translations.length > 1 ? `<div class="m-h">Озвучка</div>${translations.map((item, i) => {
              const available = dubAvailable(item);
              return `<button type="button" role="menuitemradio" data-action="dub" data-index="${i}" class="${i === activeDub ? 'on' : ''}" aria-checked="${i === activeDub}" ${available ? '' : 'disabled'}><span>${esc(item.label)}</span><small>${available ? `${Number(item.episodes) || 0} сер.` : 'нет этой серии'}</small></button>`;
            }).join('')}` : ''}
            <div class="m-h">Скорость</div>
            ${[0.75, 1, 1.25, 1.5, 2].map(rate => `<button type="button" role="menuitemradio" data-action="speed" data-rate="${rate}" class="${rate === 1 ? 'on' : ''}" aria-checked="${rate === 1}">${rate === 1 ? 'Обычная' : `${rate}×`}</button>`).join('')}
          </div>
          <div class="vp-next" id="vpNext" hidden>
            <span class="t">Серия завершена</span>
            <span class="c">${next ? 'Продолжим просмотр?' : 'Это последняя серия.'}</span>
            <div class="b">
              <button class="chip" id="vpReplay" type="button">Пересмотреть</button>
              ${next ? `<a class="chip" href="#/watch/${esc(slug)}/${next}">Следующая серия →</a>` : ''}
            </div>
          </div>
        </div>` : `
        <div class="vp vp-empty" role="status">
          <div>
            <b>Видео недоступно</b>
            <span>${esc(srcError || 'Для этой серии пока нет источника.')}</span>
            ${translations.length > 1 ? `<div class="vp-empty-dubs"><strong>Попробуй другую озвучку</strong>${translations.map((item, i) => dubAvailable(item) ? `<a class="chip ${i === activeDub ? 'active' : ''}" href="#/watch/${esc(slug)}/${number}?dub=${i}"><span>${esc(item.label)}</span><small>${Number(item.episodes) || 0} сер.</small></a>` : '').join('')}</div>` : ''}
          </div>
        </div>`;
 
  view.innerHTML = `
    <h1>${esc(info.title)}</h1>
    <div class="watch">
      <div class="watch-main">
        ${playerMarkup}
        <div class="player-bar">
          ${prev ? `<a class="chip" href="#/watch/${esc(slug)}/${prev}">← Серия ${prev}</a>` : ''}
          <a class="chip" href="#/anime/${esc(slug)}">Все серии</a>
          ${next ? `<a class="chip" href="#/watch/${esc(slug)}/${next}">Серия ${next} →</a>` : ''}
        </div>
      </div>
      <aside class="episode-panel" aria-label="Список серий">
        <div class="episode-head"><b>Серии</b><span>${nums.length}</span></div>
        <div class="ep-list">
          ${(info.episodes || []).map(ep => `<a class="ep ${ep.number === number ? 'active' : ''}" href="#/watch/${esc(slug)}/${ep.number}" ${ep.number === number ? 'aria-current="page"' : ''}>
            <span class="ep-number">${ep.number}</span><span class="ep-title">${esc(ep.title || `Серия ${ep.number}`)}</span>
            ${ep.number === number ? '<span class="ep-now">Смотрим</span>' : ''}
          </a>`).join('')}
        </div>
      </aside>
    </div>`;

  if (!sources.length) return;

  const shell = document.getElementById('videoPlayer');
  const player = document.getElementById('player');
  const progress = document.getElementById('vpProgress');
  const current = document.getElementById('vpCurrent');
  const buffered = document.getElementById('vpBuffered');
  const tip = document.getElementById('vpTip');
  const timeLabel = document.getElementById('vpTime');
  const menu = document.getElementById('vpMenu');
  const settingsButton = document.getElementById('vpSettings');
  const nextPanel = document.getElementById('vpNext');
  const volumeSlider = document.getElementById('vpVolume');
  let activeQuality = 0;
  let hideTimer = null;
  let feedbackTimer = null;
  let dragging = false;
  let lastVolume = 0.8;

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return '--:--';
    const total = Math.floor(value);
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function setMenuSelection(action, value) {
    menu.querySelectorAll(`[data-action="${action}"]`).forEach((button) => {
      const selected = action === 'speed'
        ? Number(button.dataset.rate) === value
        : Number(button.dataset.index) === value;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  }

  function syncVolume() {
    const volume = player.muted ? 0 : player.volume;
    volumeSlider.value = String(volume);
    volumeSlider.style.setProperty('--p', `${volume * 100}%`);
    const icon = document.getElementById('vpVolumeIcon');
    const muteButton = document.getElementById('vpMute');
    muteButton.setAttribute('aria-label', volume === 0 ? 'Включить звук' : 'Выключить звук');
    icon.innerHTML = volume === 0
      ? '<path d="M3 9v6h4l5 4V5L7 9H3zm13.59 3 2.7 2.71-1.41 1.41L15.17 13.4l-2.71 2.71-1.41-1.41 2.7-2.71-2.7-2.71 1.41-1.41 2.71 2.7 2.71-2.7 1.41 1.41L16.59 12z"/>'
      : '<path d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.32a3.5 3.5 0 0 0 2-3.16zm-2-8.45v2.06a7 7 0 0 1 0 12.78v2.06a9 9 0 0 0 0-16.9z"/>';
  }

  function updatePlayState() {
    const paused = player.paused || player.ended;
    shell.classList.toggle('paused', paused);
    const button = document.getElementById('vpPlay');
    const icon = document.getElementById('vpPlayIcon');
    button.setAttribute('aria-label', paused ? 'Воспроизвести' : 'Пауза');
    button.title = paused ? 'Воспроизвести (K)' : 'Пауза (K)';
    icon.innerHTML = paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
    if (paused) {
      clearTimeout(hideTimer);
      shell.classList.remove('idle');
    }
  }

  function updateProgress() {
    const duration = player.duration;
    const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const ratio = Number.isFinite(duration) && duration > 0 ? Math.min(1, currentTime / duration) : 0;
    current.style.width = `${ratio * 100}%`;
    progress.querySelector('.knob').style.left = `${ratio * 100}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;

    let bufferedEnd = 0;
    try {
      if (player.buffered.length) bufferedEnd = player.buffered.end(player.buffered.length - 1);
    } catch (e) { /* буфер может обновляться во время чтения */ }
    buffered.style.width = `${Number.isFinite(duration) && duration > 0 ? Math.min(100, bufferedEnd / duration * 100) : 0}%`;
  }

  function showFeedback(text) {
    const feedback = document.getElementById('vpFeedback');
    feedback.textContent = text;
    feedback.classList.remove('show');
    void feedback.offsetWidth;
    feedback.classList.add('show');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => feedback.classList.remove('show'), 700);
  }

  function seekToPointer(event) {
    if (!Number.isFinite(player.duration) || player.duration <= 0) return;
    const rect = progress.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    player.currentTime = ratio * player.duration;
    updateProgress();
  }

  function seekBy(seconds) {
    if (!Number.isFinite(player.duration)) return;
    player.currentTime = Math.min(player.duration, Math.max(0, player.currentTime + seconds));
    showFeedback(`${seconds > 0 ? '+' : ''}${seconds} сек.`);
    updateProgress();
  }

  function scheduleHide() {
    shell.classList.remove('idle');
    clearTimeout(hideTimer);
    if (!player.paused && !('ontouchstart' in window)) {
      hideTimer = setTimeout(() => shell.classList.add('idle'), 2600);
    }
  }

  function togglePlay() {
    if (player.paused || player.ended) {
      if (player.ended) player.currentTime = 0;
      nextPanel.hidden = true;
      player.play().catch(() => toast('Нажми ▶, чтобы начать воспроизведение'));
    } else {
      player.pause();
    }
  }

  function setQuality(index, resume = true) {
    const selected = sources[index];
    if (!selected) return;
    const resumeAt = resume && Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const wasPlaying = resume && !player.paused;
    activeQuality = index;
    setMenuSelection('quality', activeQuality);
    shell.classList.add('loading');
    player.pause();
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    const restorePlayback = () => {
      if (resumeAt > 0 && Number.isFinite(player.duration)) {
        player.currentTime = Math.min(resumeAt, Math.max(0, player.duration - 0.25));
      }
      if (wasPlaying || !resume) player.play().catch(() => {});
    };
    player.addEventListener('loadedmetadata', restorePlayback, { once: true });

    if (window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({ capLevelToPlayerSize: true });
      hlsInstance.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          shell.classList.remove('loading');
          toast('Не удалось загрузить видео');
        }
      });
      hlsInstance.loadSource(selected.url);
      hlsInstance.attachMedia(player);
    } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = selected.url;
      player.load();
    } else {
      shell.classList.remove('loading');
      toast('Этот браузер не поддерживает HLS');
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement === shell) {
      document.exitFullscreen().catch(() => {});
    } else if (shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {});
    } else if (player.webkitEnterFullscreen) {
      player.webkitEnterFullscreen();
    }
  }

  document.getElementById('vpPlay').addEventListener('click', togglePlay);
  document.getElementById('vpHit').addEventListener('click', () => {
    shell.focus({ preventScroll: true });
    togglePlay();
  });
  document.getElementById('vpBack').addEventListener('click', () => seekBy(-10));
  document.getElementById('vpForward').addEventListener('click', () => seekBy(10));
  document.getElementById('vpMute').addEventListener('click', () => {
    if (player.muted || player.volume === 0) {
      player.muted = false;
      player.volume = lastVolume || 0.8;
    } else {
      lastVolume = player.volume;
      player.muted = true;
    }
    syncVolume();
  });
  volumeSlider.addEventListener('input', () => {
    player.muted = false;
    player.volume = Number(volumeSlider.value);
    if (player.volume > 0) lastVolume = player.volume;
    syncVolume();
  });
  document.getElementById('vpFullscreen').addEventListener('click', toggleFullscreen);
  settingsButton.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    settingsButton.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('button')?.focus();
  });
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'quality') setQuality(Number(button.dataset.index));
    if (action === 'speed') {
      player.playbackRate = Number(button.dataset.rate);
      setMenuSelection('speed', player.playbackRate);
    }
    if (action === 'dub') {
      const selected = Number(button.dataset.index);
      if (selected !== activeDub) {
        location.hash = `#/watch/${encodeURIComponent(slug)}/${number}?dub=${selected}`;
        return;
      }
    }
    menu.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.focus();
  });
  progress.addEventListener('pointerdown', (event) => {
    dragging = true;
    progress.classList.add('drag');
    progress.setPointerCapture(event.pointerId);
    seekToPointer(event);
  });
  progress.addEventListener('pointermove', (event) => {
    const rect = progress.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    tip.style.left = `${ratio * 100}%`;
    tip.textContent = formatTime(ratio * (Number.isFinite(player.duration) ? player.duration : 0));
    if (dragging) seekToPointer(event);
  });
  progress.addEventListener('pointerup', () => {
    dragging = false;
    progress.classList.remove('drag');
  });
  progress.addEventListener('pointercancel', () => {
    dragging = false;
    progress.classList.remove('drag');
  });
  progress.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(event.key === 'ArrowLeft' ? -5 : 5);
    }
  });

  document.getElementById('vpReplay').addEventListener('click', () => {
    player.currentTime = 0;
    nextPanel.hidden = true;
    player.play().catch(() => {});
  });
  player.addEventListener('play', () => {
    nextPanel.hidden = true;
    updatePlayState();
    scheduleHide();
  });
  player.addEventListener('pause', updatePlayState);
  player.addEventListener('waiting', () => shell.classList.add('loading'));
  player.addEventListener('playing', () => shell.classList.remove('loading'));
  player.addEventListener('canplay', () => shell.classList.remove('loading'));
  player.addEventListener('loadedmetadata', updateProgress);
  player.addEventListener('timeupdate', updateProgress);
  player.addEventListener('progress', updateProgress);
  player.addEventListener('durationchange', updateProgress);
  player.addEventListener('volumechange', syncVolume);
  player.addEventListener('ended', () => {
    updatePlayState();
    nextPanel.hidden = false;
    shell.classList.remove('idle');
  });
  shell.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch') scheduleHide();
  });
  shell.addEventListener('pointerleave', () => {
    if (!player.paused && !menu.hidden) {
      menu.hidden = true;
      settingsButton.setAttribute('aria-expanded', 'false');
    }
    if (!player.paused && !('ontouchstart' in window)) shell.classList.add('idle');
  });
  shell.addEventListener('dblclick', (event) => {
    if (!event.target.closest('button, input, .vp-menu, .vp-prog')) toggleFullscreen();
  });
  shell.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.key === ' ' || event.key === 'Enter') && event.target.closest('button, a')) return;
    if (event.target.closest('.vp-menu') && event.key.startsWith('Arrow')) return;
    if (event.target === progress && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(-10);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(10);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      player.volume = Math.min(1, Math.max(0, player.volume + (event.key === 'ArrowUp' ? 0.05 : -0.05)));
      player.muted = player.volume === 0;
      syncVolume();
    } else if (event.key.toLowerCase() === 'm') {
      document.getElementById('vpMute').click();
    } else if (event.key.toLowerCase() === 'f') {
      toggleFullscreen();
    } else if (event.key === 'Escape') {
      menu.hidden = true;
      settingsButton.setAttribute('aria-expanded', 'false');
    }
  });

  let savedVolume = 0.8;
  try { savedVolume = Number(localStorage.getItem('anime-player-volume')); } catch (e) { /* хранилище может быть недоступно */ }
  if (Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1) lastVolume = savedVolume;
  player.volume = lastVolume;
  syncVolume();
  updatePlayState();
  setQuality(0, false);

  const volumeSaver = () => {
    if (!player.muted && player.volume > 0) {
      lastVolume = player.volume;
      try { localStorage.setItem('anime-player-volume', String(lastVolume)); } catch (e) { /* хранилище может быть недоступно */ }
    }
  };
  player.addEventListener('volumechange', volumeSaver);
  const outsideMenuHandler = (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !settingsButton.contains(event.target)) {
      menu.hidden = true;
      settingsButton.setAttribute('aria-expanded', 'false');
    }
  };
  const fullscreenHandler = () => {
    const fullscreen = document.fullscreenElement === shell;
    shell.classList.toggle('fs', fullscreen);
    const button = document.getElementById('vpFullscreen');
    button.setAttribute('aria-label', fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран');
    button.title = fullscreen ? 'Выйти из полноэкранного режима (F)' : 'На весь экран (F)';
  };
  document.addEventListener('pointerdown', outsideMenuHandler);
  document.addEventListener('fullscreenchange', fullscreenHandler);
  playerCleanup = () => {
    clearTimeout(hideTimer);
    clearTimeout(feedbackTimer);
    document.removeEventListener('fullscreenchange', fullscreenHandler);
    document.removeEventListener('pointerdown', outsideMenuHandler);
  };
}
 
document.getElementById('searchForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
});
 
/* ------------------------------------------------------------------ router */
 
function route() {
  view.className = 'view';
  const { name, parts, query } = parseHash();
  if (name === 'anime' && parts[1]) return renderAnime(parts[1]);
  if (name === 'watch' && parts[1]) return renderWatch(parts[1], parseInt(parts[2] || '1', 10), query);
  disposePlayer();
  if (name === 'search') return renderSearch(query);
  return renderCatalog(query);
}
 
window.addEventListener('hashchange', route);
route();
 
