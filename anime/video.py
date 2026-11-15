"""Встроенный плеер источника: список серий и прямые HLS-ссылки.

Сайт по AJAX отдаёт embed-плеер (ani6.top). На его странице лежит
матрица озвучек со ссылками на Kodik по каждой серии, а POST /2/api/agp/links
возвращает готовые m3u8 для нужной серии и озвучки. Авторизация не требуется.
"""

import json
import re
import threading
import time
import urllib.parse
from decimal import Decimal, InvalidOperation

import requests

from . import client
from .client import SourceError

CACHE_TTL = 300
_CACHE = {}
_LOCK = threading.Lock()


# ------------------------------------------------------------------ разбор JS


def _js_object(html, marker="var o="):
    """Достаёт JS-объект после marker как JSON (с балансировкой скобок)."""
    i = html.find(marker)
    if i < 0:
        raise SourceError("не удалось прочитать данные плеера")
    start = html.index("{", i)
    depth, in_str, esc, quote = 0, False, False, ""
    for j in range(start, len(html)):
        ch = html[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                in_str = False
            continue
        if ch in "\"'":
            in_str, quote = True, ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(html[start:j + 1])
    raise SourceError("повреждённые данные плеера")


def _load_players(session, slug):
    """Данные embed-плеера; результат кэшируется по slug."""
    now = time.time()
    with _LOCK:
        hit = _CACHE.get(slug)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]

    page = client.text(session, f"/{slug}.html")
    m = re.search(r'data-player-anime-id="(\d+)"', page)
    if not m:
        raise SourceError("на странице нет плеера источника")
    anime_id = int(m.group(1))

    resp = session.get(
        client.BASE + f"/engine/ajax/controller.php?mod=player&id={anime_id}&slot=0",
        headers={"X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{client.BASE}/{slug}.html"},
        timeout=client.TIMEOUT,
    )
    try:
        player = resp.json().get("data") or {}
    except ValueError as exc:
        raise SourceError("плеер источника не ответил") from exc
    src = player.get("src")
    if not src:
        raise SourceError("у этого тайтла нет плеера")

    embed = client.text(session, src, headers={"Referer": client.BASE + "/"})
    info = {"animeId": anime_id, "embed": src, "data": _js_object(embed)}

    with _LOCK:
        _CACHE[slug] = (now, info)
    return info


def _matrix(info):
    matrix = info["data"].get("matrix") or []
    if not matrix:
        raise SourceError("у этого тайтла нет озвучек")
    return matrix


def _track_index(matrix, translation):
    if translation in (None, ""):
        return 0
    if str(translation).isdigit():
        index = int(translation)
        return index if 0 <= index < len(matrix) else 0
    key = _norm(translation)
    for i, track in enumerate(matrix):
        if _norm(track.get("n")) == key:
            return i
    return 0


def _norm(text):
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _episode_title(entry, single_season):
    season, number = entry[0], entry[1]
    if single_season:
        return f"{number} серия"
    return f"{season} сезон · {number} серия"


def _episode_key(entry):
    if not isinstance(entry, (list, tuple)) or len(entry) < 3:
        return None
    return _episode_component(entry[0]), _episode_component(entry[1])


def _episode_component(value):
    try:
        return "n", str(Decimal(str(value)).normalize())
    except (InvalidOperation, TypeError, ValueError):
        return "s", str(value).strip().casefold()


def _sort_part(value):
    try:
        return 0, Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return 1, str(value).casefold()


def _all_entries(matrix):
    """Уникальные серии из всех озвучек в порядке сезонов и номеров."""
    entries = {}
    for track in matrix:
        for entry in track.get("e") or []:
            key = _episode_key(entry)
            if key is not None:
                entries.setdefault(key, entry)
    return sorted(entries.values(), key=lambda e: (_sort_part(e[0]), _sort_part(e[1])))


# ------------------------------------------------------------------- публичное


def episodes(slug, session=None):
    """Список уникальных серий из всех озвучек по порядку."""
    session = session or client.new_session()
    info = _load_players(session, slug)
    entries = _all_entries(_matrix(info))
    single = len({e[0] for e in entries if len(e) >= 2}) <= 1
    return [
        {"number": i + 1, "title": _episode_title(e, single),
         "url": f"/{slug}.html?ep={i + 1}"}
        for i, e in enumerate(entries)
    ]


def translations(slug, session=None):
    session = session or client.new_session()
    matrix = _matrix(_load_players(session, slug))
    all_entries = _all_entries(matrix)
    result = []
    for track in matrix:
        keys = {_episode_key(entry) for entry in track.get("e") or []}
        available = [
            i + 1 for i, entry in enumerate(all_entries)
            if _episode_key(entry) in keys
        ]
        result.append({
            "name": track.get("n"),
            "label": track.get("l") or track.get("n"),
            "type": track.get("t"),
            "episodes": len(available),
            "availableNumbers": available,
        })
    return result


def resolve(slug, number, translation=None, session=None):
    """Прямые HLS-ссылки для серии `number` (нумерация с 1)."""
    if not number or number < 1:
        raise SourceError("неверный номер серии")

    session = session or client.new_session()
    info = _load_players(session, slug)
    matrix = _matrix(info)
    all_entries = _all_entries(matrix)
    if number > len(all_entries):
        raise SourceError(f"всего доступно серий: {len(all_entries)}")
    requested = all_entries[number - 1]
    requested_key = _episode_key(requested)

    index = _track_index(matrix, translation)
    track = matrix[index]
    entry = next(
        (candidate for candidate in track.get("e") or []
         if _episode_key(candidate) == requested_key),
        None,
    )
    if entry is None:
        label = track.get("l") or track.get("n") or "выбранной озвучке"
        raise SourceError(f"серия {number} недоступна в озвучке «{label}»")

    links = _agp_links(session, info["embed"], info["data"], entry[2])
    sources = []
    for link in links:
        res = int(link.get("q") or 0)
        sources.append({
            "quality": f"{res}p" if res else "auto",
            "res": res,
            "url": link.get("src"),
            "hls": (link.get("type") or "").startswith("application/x-mpegURL"),
        })
    sources.sort(key=lambda s: -s["res"])

    single = len({e[0] for e in all_entries if len(e) >= 2}) <= 1
    return {
        "animeId": info["animeId"],
        "translation": track.get("l") or track.get("n") or "",
        "translationIndex": index,
        "number": number,
        "title": _episode_title(entry, single),
        "totalEpisodes": len(all_entries),
        "sources": sources,
    }


# ---------------------------------------------------------------------- API


def _agp_links(session, embed_url, data, link):
    """Просит плеер отдать прямые ссылки для конкретной серии."""
    sig = data.get("sig") or {}
    body = {"id": data.get("animeId", ""), "link": link}
    if sig:
        body.update({"x": sig.get("x", ""), "s": sig.get("s", ""), "u": sig.get("u", "")})

    parts = urllib.parse.urlsplit(embed_url)
    endpoint = f"{parts.scheme}://{parts.netloc}/2/api/agp/links"
    try:
        resp = session.post(endpoint, data=body, headers={
            "Referer": embed_url,
            "Origin": f"{parts.scheme}://{parts.netloc}",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        }, timeout=client.TIMEOUT)
        payload = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise SourceError(f"плеер не отдал ссылки: {exc}") from exc

    if payload.get("error"):
        raise SourceError(f"плеер отклонил запрос: {payload['error']}")
    links = payload.get("links") or []
    if not links:
        raise SourceError("серия сейчас недоступна в этом плеере")
    return links
