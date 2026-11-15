"""Разделы каталога источника: жанры, годы и адреса страниц."""

GENRES = [
    ("action", "Экшен"),
    ("adventure", "Приключения"),
    ("comedy", "Комедия"),
    ("demons", "Демоны"),
    ("drama", "Драма"),
    ("ecchi", "Этти"),
    ("fantasy", "Фэнтези"),
    ("game", "Игры"),
    ("harem", "Гарем"),
    ("historical", "Историческое"),
    ("horror", "Ужасы"),
    ("magic", "Магия"),
    ("martial-arts", "Боевые искусства"),
    ("military", "Военное"),
    ("music", "Музыка"),
    ("mystery", "Детектив"),
    ("psychological", "Психологическое"),
    ("romance", "Романтика"),
    ("samurai", "Самураи"),
    ("sci-fi", "Фантастика"),
    ("sport", "Спорт"),
    ("supernatural", "Сверхъестественное"),
    ("thriller", "Триллер"),
    ("vampire", "Вампиры"),
]

FIRST_YEAR = 1990
LAST_YEAR = 2026


def options():
    """Списки для панели фильтров."""
    return {
        "genres": [{"slug": s, "label": l} for s, l in GENRES],
        "years": [{"slug": str(y), "label": str(y)}
                  for y in range(LAST_YEAR, FIRST_YEAR - 1, -1)],
    }


def path(page=1, genre=None, year=None):
    """Адрес страницы каталога: /catalog/[жанр]/[год]/[page/N/]."""
    parts = ["catalog"]
    if genre:
        parts.append(str(genre))
    if year:
        parts.append(str(year))
    if page and int(page) > 1:
        parts += ["page", str(int(page))]
    return "/" + "/".join(parts) + "/"
