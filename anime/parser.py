"""HTML-парсеры вёрстки источника (DLE)."""

import html as html_mod
import re

from .client import BASE

POSTER_BIG = ("173x260", "346x520")


def _rx(pattern, text, group=1, default=""):
    if not text:
        return default
    m = re.search(pattern, text, re.S | re.I)
    if not m:
        return default
    try:
        return m.group(group)
    except IndexError:
        return default


def _text(raw):
    if not raw:
        return ""
    plain = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", html_mod.unescape(plain)).strip()


def _poster(raw):
    """Относительный путь -> абсолютный, мелкий размер -> крупный."""
    if not raw:
        return ""
    if raw.startswith("//"):
        raw = "https:" + raw
    elif raw.startswith("/"):
        raw = BASE + raw
    return raw.replace("/173x260/", "/346x520/")


# --------------------------------------------------------------------- cards


def parse_cards(page_html):
    """Карточки каталога и поиска (class="movie-item")."""
    items = []
    for block in page_html.split('class="movie-item"')[1:]:
        m = re.search(r'class="movie-item__link"\s+href="/(\d+)-([a-z0-9\-]+)\.html"',
                      block, re.I)
        if not m:
            continue

        title = _text(_rx(r'class="movie-item__title"[^>]*>(.*?)</div>', block))
        title = re.sub(r"\s*\(\d{4}\)\s*$", "", title).strip()

        year = _rx(r"<span>\((\d{4})\)</span>", block)
        label = _text(_rx(r'class="movie-item__label[^"]*">([^<]*)</div>', block))
        poster = _poster(_rx(r'<img[^>]+src="([^"]+)"', block))

        items.append({
            "id": m.group(1),
            "slug": f"{m.group(1)}-{m.group(2)}",
            "title": title or m.group(2),
            "altTitle": "",
            "url": f"/{m.group(1)}-{m.group(2)}.html",
            "poster": poster,
            "meta": label or year,
            "genres": [],
            "types": [],
            "years": [year] if year else [],
        })
    return items


def has_next_page(page_html, page):
    """Есть ли ссылка на следующую страницу пагинации."""
    return bool(re.search(r'href="[^"]*page/%d/"' % (int(page) + 1), page_html))


def parse_total(page_html):
    for pattern in (r'Всего[^0-9]{0,20}(\d+)', r'найдено[^0-9]{0,20}(\d+)'):
        m = re.search(pattern, page_html, re.I)
        if m:
            return int(m.group(1))
    return None


# ---------------------------------------------------------------- anime page


def parse_anime(page_html, slug):
    """Метаданные страницы тайтла (без серий — они берутся из плеера)."""
    title = _rx(r"<h1[^>]*>(.*?)</h1>", page_html)
    title = _text(title)
    if not title:
        title = re.sub(r"\s+смотреть.*$", "", _rx(r"og:title\" content=\"([^\"]*)\"", page_html), flags=re.I).strip()
    title = re.sub(r"\s+смотреть.*$", "", title, flags=re.I).strip()

    description = _text(_rx(r'itemprop="description"[^>]*>(.*?)</div>', page_html))
    poster = _rx(r'og:image" content="([^"]+)"', page_html)

    genres = [
        {"slug": s, "label": _text(lbl)}
        for s, lbl in re.findall(
            r'itemprop="genre"><a href="/([a-z0-9\-]+)/"[^>]*>([^<]+)</a>', page_html)
    ]

    year = _rx(r"Год выхода:</span>\s*<a href=\"/catalog/(\d{4})/\"", page_html)

    return {
        "slug": slug,
        "title": title or slug,
        "description": description,
        "poster": _poster(poster),
        "genres": genres,
        "year": int(year) if year else None,
    }
