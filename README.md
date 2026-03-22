# osu! friends graph

Визуализация графа друзей osu!: локально и в режиме **«Весь мир»** с накоплением данных в **SQLite** (отдельный процесс `server/worldApi.ts`). OAuth osu! — scopes `identify`, `friends.read`, `public`.

**Стек:** Vite + TypeScript, D3 force, `better-sqlite3`, dev-сервер API на `tsx`.

---

## Требования

- **Node.js** 20+ (рекомендуется LTS).
- Приложение osu! OAuth: [osu.ppy.sh/home/account/edit#new-oauth-application](https://osu.ppy.sh/home/account/edit#new-oauth-application).

---

## Локальный запуск

1. Клонируй репозиторий и зайди в каталог проекта.
2. Скопируй пример переменных окружения и заполни значения:
   ```bash
   cp .env.example .env
   ```
   В osu! укажи **Callback URL** такой же, как `VITE_OSU_REDIRECT_URI` (для dev обычно `http://localhost:5173/`).
3. Установи зависимости и запусти dev (Vite + API «мира»):
   ```bash
   npm install
   npm run dev
   ```
4. Открой в браузере адрес, который покажет Vite (порт **5173**, если свободен).

**Скрипты:**

| Команда | Назначение |
|--------|------------|
| `npm run dev` | Vite + `worldApi` (SQLite в `data/world.sqlite` по умолчанию) |
| `npm run dev:api` | только API |
| `npm run build` | production-сборка фронта в `dist/` |
| `npm run start:api` | API без watch (для systemd на сервере) |

---

## Переменные окружения

Полный список и комментарии — в **`.env.example`**. Обязательны как минимум:

- `VITE_OSU_CLIENT_ID`, `VITE_OSU_REDIRECT_URI`
- `OSU_CLIENT_SECRET` (серверный обмен code → token)

Опционально: `WORLD_DATABASE_PATH`, `WORLD_API_PORT`, `VITE_WORLD_API_BASE` (если API «мира» на другом origin).

---

## Что не коммитить в Git

В репозиторий **не должны** попадать секреты и сгенерированные артефакты. Это уже отражено в **`.gitignore`**:

| Паттерн | Зачем |
|--------|--------|
| `.env`, `.env.local` | Секреты и локальные URL |
| `node_modules/` | Зависимости — ставятся через `npm install` |
| `dist/` | Сборка — собирается на CI или перед деплоем |
| `data/*.sqlite`, `data/*.sqlite-*` | Локальная/серверная БД SQLite |
| `.vite`, `.DS_Store` | Кэш и мусор ОС |

**Правило:** в Git только **`.env.example`** (без реальных значений). Секреты — только в личном `.env` и в настройках сервера (файл `.env` на VPS, переменные в панели хостинга и т.д., но не в репозитории).

---

## Production / VPS (кратко)

- Собери фронт: `npm run build` → каталог **`dist/`**.
- API: `npm run start:api` под **systemd** (пример: `deploy/world-api.service`).
- Nginx: пример — `deploy/nginx-osu-friends.conf` (прокси `/api/osu-v2`, `/api/world`).
- **Базу SQLite** лучше хранить **вне** каталога деплоя, например `WORLD_DATABASE_PATH=/var/lib/osu-friends/world.sqlite`, чтобы `git pull` и копирование файлов не затирали БД.

Подробные команды под свой сервер держи у себя (IP, пользователь, пути) — в репозитории достаточно примеров в `deploy/`.

---

## Репозиторий на GitHub

### Новый проект с этого каталога

```bash
cd /path/to/osu-friendsProject
git init
git add .
git status   # убедись, что нет .env и data/*.sqlite
git commit -m "Initial commit"
```

На GitHub: **New repository** (без README, если уже есть локальный коммит). Затем:

```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/ИМЯ-РЕПО.git
git branch -M main
git push -u origin main
```

### Участие (fork и pull request)

1. Сделай **Fork** репозитория в свой аккаунт.
2. Клонируй **свой** fork, создай ветку: `git checkout -b feature/кратко-что-делаешь`.
3. Вноси изменения, коммиты с понятными сообщениями.
4. **Push** ветки в fork и открой **Pull Request** в основной репозиторий с описанием изменений.

---

## Как лучше обновлять сервер после изменений в Git

Оба варианта нормальны; главное — **не перезаписывать** продакшен-БД и **`.env` на сервере**.

| Подход | Когда удобно |
|--------|----------------|
| **`git pull` на VPS** | На сервере один раз клонировал репозиторий, `.env` лежит только там, `data/*.sqlite` в `.gitignore` — pull не трогает БД. После pull: `npm ci`, `npm run build`, `systemctl restart world-api`. |
| **Сборка на Mac + `rsync`** | Не хочешь ставить Node на сервер или деплои только артефактами: заливать **`dist/`** и при необходимости код без `data/`. |

Не используй **`rsync --delete`** на весь каталог приложения без исключений для БД; для фронта безопаснее `--delete` только для `dist/`.

---

## Траблшутинг: порт 5173 занят

Если Vite не на 5173, а в `.env` callback на 5173 — OAuth разъедется.

1. Освободи порт: `lsof -i :5173` (macOS) или останови старый `npm run dev`.
2. В проекте включён `strictPort: true` — при занятом порте Vite упадёт с ошибкой, а не молча переключится.
3. `VITE_OSU_REDIRECT_URI` должен совпадать с URL в браузере.

---

## GET `/api/world/graph` → 404

В **production** маршрут `/api/world` должен проксироваться на процесс `worldApi` (см. `deploy/nginx-osu-friends.conf`). В **dev** тот же путь обрабатывается через прокси Vite. Если открыт не тот сервер или старый билд без API — будет 404.
