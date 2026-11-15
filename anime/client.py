"""HTTP-клиент источника (аниме-каталог)."""

import requests

HOST = "yummyanime.tv"
BASE = "https://" + HOST
TIMEOUT = 30
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


class SourceError(Exception):
    """Ошибка при обращении к источнику."""


def new_session():
    """Новый сеанс с браузерными заголовками."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": UA,
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": BASE + "/",
    })
    return session


def get(session, path, **kwargs):
    url = path if path.startswith("http") else BASE + path
    try:
        resp = session.get(url, timeout=TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        raise SourceError(f"источник недоступен: {exc}") from exc
    if resp.status_code >= 400:
        raise SourceError(f"источник вернул HTTP {resp.status_code}")
    return resp


def text(session, path, **kwargs):
    return get(session, path, **kwargs).text
