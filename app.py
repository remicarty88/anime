"""Flask-обёртка над источником аниме: каталог, поиск и тайтлы.

Единственный источник данных и видео — сайт каталога.
"""

import os
import re
import urllib.parse

from flask import Flask, abort, jsonify, render_template, request

from anime import catalog, client, parser, video
from anime.client import SourceError

app = Flask(__name__)


def _slug():
    slug = (request.args.get("slug") or "").strip().strip("/")
    if not re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug):
        abort(400, "invalid slug")
    return slug


@app.errorhandler(SourceError)
def _handle(exc):
    return jsonify({"ok": False, "error": str(exc)}), 502


@app.route("/")
def index():
    return render_template("index.html")


# ------------------------------------------------------------------- каталог


@app.get("/api/filters")
def filters():
    return jsonify({"ok": True, **catalog.options()})


@app.get("/api/catalog")
def catalog_view():
    page = max(1, request.args.get("page", 1, type=int))
    genre = (request.args.get("genre") or "").strip() or None
    year = (request.args.get("year") or "").strip() or None
    if year and not year.isdigit():
        year = None
    if genre and not re.fullmatch(r"[a-z0-9\-]+", genre):
        genre = None

    session = client.new_session()
    html = client.text(session, catalog.path(page, genre, year))
    items = parser.parse_cards(html)
    return jsonify({"ok": True, "page": page, "items": items,
                    "hasMore": parser.has_next_page(html, page)})


@app.get("/api/search")
def search():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"ok": True, "items": [], "total": 0, "page": 1, "hasMore": False})

    session = client.new_session()
    html = client.text(session, "/index.php?" + urllib.parse.urlencode(
        {"do": "search", "subaction": "search", "story": query}))
    items = parser.parse_cards(html)
    return jsonify({"ok": True, "items": items, "total": len(items),
                    "page": 1, "hasMore": False})


# --------------------------------------------------------------- тайтл/видео


@app.get("/api/anime")
def anime():
    slug = _slug()
    session = client.new_session()
    meta = parser.parse_anime(client.text(session, f"/{slug}.html"), slug)
    try:
        meta["episodes"] = video.episodes(slug, session)
        meta["translations"] = video.translations(slug, session)
    except SourceError:
        meta["episodes"] = []
        meta["translations"] = []
    return jsonify({"ok": True, **meta})


@app.get("/api/watch")
def watch():
    slug = _slug()
    number = request.args.get("n", type=int)
    if number is None or number < 1:
        abort(400, "n is required")

    source = video.resolve(slug, number, translation=request.args.get("dub"))
    return jsonify({"ok": True, "title": source.get("title", ""), "source": source})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
