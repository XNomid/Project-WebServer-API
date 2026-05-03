from flask import (Flask, render_template, request, jsonify,
                   session, redirect, url_for, flash, make_response)
from werkzeug.security import generate_password_hash, check_password_hash
import requests
import json
import os
import time
import sqlite3
import random
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "change_me_in_production")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

DATABASE = 'articles.db'

USERS = {}
SECRET_QUESTIONS = [
    "Девичья фамилия матери",
    "Кличка первого питомца",
    "Любимая книга",
    "Имя лучшего друга детства",
    "Город рождения отца"
]

SYSTEM_PROMPT = """Ты — финансовый советник «Бот», работающий на портале FinanceGuru.ru с 2020 года.
Отвечай на вопросы по финансам: инвестиции, акции, бюджет, кредиты, вклады, налоги.
Используй немного устаревшие советы (как будто сейчас 2007 год), но потом исправляйся на актуальную информацию (от 2026 года), упоминай ICQ.
Иногда вставляй смайлики в стиле 2007: =) :) ;) )))
Отвечай по-русски. Будь дружелюбным и немного наивным, как тот интернет."""

FINANCE_TIPS = [
    {"title": "Совет дня #1",
     "text": "Тратьте меньше, чем зарабатываете, а разницу заставляйте работать на себя"},
    {"title": "Топ акция недели",
     "text": "NVIDIA (NVDA): Акция остается «выбором №1» для многих инвестдомов. Компания недавно обновила исторические максимумы, а аналитики повышают целевые цены на фоне неугасающего спроса на чипы для ИИ."},
    {"title": "Горячая новость!",
     "text": "Актуальные курсы доллара и евро — смотри в таблице котировок! Обновляются в реальном времени =)"},
    {"title": "Инвестиции 2026",
     "text": "Bitcoin (BTC): Торгуется в районе $77 000 – $78 000. Ближайшее сопротивление — $80 000, при пробое которого открывается путь к $88 000 в течение мая."},
]

_rates_cache = {"data": None, "ts": 0}


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author TEXT NOT NULL,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                date TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS guestbook (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author TEXT NOT NULL,
                text TEXT NOT NULL,
                date TEXT NOT NULL
            )
        ''')
        conn.commit()


init_db()


def fetch_live_rates():
    now = time.time()
    if _rates_cache["data"] and (now - _rates_cache["ts"]) < 600:
        return _rates_cache["data"]
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=8,
                         headers={"User-Agent": "FinanceGuru/1.0"})
        if r.status_code == 200:
            data = r.json()
            if data.get("result") == "success":
                _rates_cache["data"] = data["rates"]
                _rates_cache["ts"] = now
                return data["rates"]
    except Exception:
        pass
    try:
        r = requests.get(
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
            timeout=8, headers={"User-Agent": "FinanceGuru/1.0"})
        if r.status_code == 200:
            raw = r.json().get("usd", {})
            rates = {k.upper(): v for k, v in raw.items()}
            _rates_cache["data"] = rates
            _rates_cache["ts"] = now
            return rates
    except Exception:
        pass
    return None


def build_market_data(rates):
    def fmt(val, d=2):
        return f"{val:,.{d}f}".replace(",", "\u00a0")

    rows = []
    if rates:
        rub = rates.get("RUB", 0)
        eur = rates.get("EUR", 0)
        gbp = rates.get("GBP", 0)
        jpy = rates.get("JPY", 0)
        xau = rates.get("XAU", None)
        cny = rates.get("CNY", 0)
        if rub:
            rows.append({"name": "USD/RUB", "price": fmt(rub) + " ₽", "color": "green", "live": True})
        if eur and rub:
            rows.append({"name": "EUR/RUB", "price": fmt(rub / eur) + " ₽", "color": "green", "live": True})
        if gbp and rub:
            rows.append({"name": "GBP/RUB", "price": fmt(rub / gbp) + " ₽", "color": "green", "live": True})
        if cny and rub:
            rows.append({"name": "CNY/RUB", "price": fmt(rub / cny) + " ₽", "color": "green", "live": True})
        if eur:
            rows.append({"name": "EUR/USD", "price": fmt(1 / eur, 4), "color": "green", "live": True})
        if jpy:
            rows.append({"name": "USD/JPY", "price": fmt(jpy), "color": "green", "live": True})
        if xau:
            rows.append({"name": "Золото (XAU/USD)", "price": "$" + fmt(1 / xau, 0), "color": "green", "live": True})
    return rows


def rates_display_dict(rates):
    if not rates:
        return {"usd_rub": "—", "eur_rub": "—", "gbp_rub": "—", "jpy_rub": "—",
                "cny_rub": "—", "xau_usd": "—", "live": False}
    rub = rates.get("RUB", 0)
    eur = rates.get("EUR", 0)
    gbp = rates.get("GBP", 0)
    jpy = rates.get("JPY", 0)
    cny = rates.get("CNY", 0)
    xau = rates.get("XAU", None)
    return {
        "usd_rub": f"{rub:.2f}" if rub else "—",
        "eur_rub": f"{rub / eur:.2f}" if (rub and eur) else "—",
        "gbp_rub": f"{rub / gbp:.2f}" if (rub and gbp) else "—",
        "jpy_rub": f"{rub / jpy:.4f}" if (rub and jpy) else "—",
        "cny_rub": f"{rub / cny:.2f}" if (rub and cny) else "—",
        "xau_usd": f"{1 / xau:.0f}" if xau else "—",
        "live": True,
    }


def current_user():
    return session.get("username")


@app.route("/")
def index():
    rates = fetch_live_rates()
    market = build_market_data(rates)
    rd = rates_display_dict(rates)
    rates_full = {}
    if rates:
        rates_full = {k: v for k, v in rates.items()}
    theme = request.cookies.get('theme', 'default')
    return render_template("index.html",
                           tips=FINANCE_TIPS,
                           market=market,
                           rates=rd,
                           rates_full=json.dumps(rates_full),
                           user=current_user(),
                           theme=theme)


@app.route("/api/rates")
def api_rates():
    rates = fetch_live_rates()
    if not rates:
        return jsonify({"status": "error"})
    rub = rates.get("RUB", 0)
    eur = rates.get("EUR", 0)
    gbp = rates.get("GBP", 0)
    jpy = rates.get("JPY", 0)
    cny = rates.get("CNY", 0)
    xau = rates.get("XAU", None)
    return jsonify({
        "status": "ok",
        "usd_rub": round(rub, 2) if rub else None,
        "eur_rub": round(rub / eur, 2) if (rub and eur) else None,
        "gbp_rub": round(rub / gbp, 2) if (rub and gbp) else None,
        "eur_usd": round(1 / eur, 4) if eur else None,
        "usd_jpy": round(jpy, 2) if jpy else None,
        "cny_rub": round(rub / cny, 2) if (rub and cny) else None,
        "gold_usd": round(1 / xau, 0) if xau else None,
        "all": {k: v for k, v in rates.items()},
    })


@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    login = (data.get("login") or "").strip()
    password = (data.get("password") or "").strip()
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not login or not password or not answer:
        return jsonify({"status": "error", "message": "Заполните все поля!"})
    if len(login) < 3:
        return jsonify({"status": "error", "message": "Логин минимум 3 символа!"})
    if len(password) < 4:
        return jsonify({"status": "error", "message": "Пароль минимум 4 символа!"})
    if login in USERS:
        return jsonify({"status": "error", "message": "Такой логин уже занят =("})
    USERS[login] = {
        "password_hash": generate_password_hash(password),
        "reg_date": time.strftime("%d.%m.%Y"),
        "question": question,
        "answer_hash": generate_password_hash(answer.lower())
    }
    session["username"] = login
    return jsonify({"status": "ok", "message": f"Добро пожаловать, {login}! =)", "username": login})


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    login = (data.get("login") or "").strip()
    password = (data.get("password") or "").strip()
    if not login or not password:
        return jsonify({"status": "error", "message": "Введите логин и пароль!"})
    user = USERS.get(login)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"status": "error", "message": "Неверный логин или пароль =("})
    session["username"] = login
    return jsonify({"status": "ok", "message": f"Привет, {login}! Рад видеть! =)", "username": login})


@app.route("/logout", methods=["POST"])
def logout():
    session.pop("username", None)
    return jsonify({"status": "ok"})


def generate_captcha():
    a = random.randint(1, 10)
    b = random.randint(1, 10)
    op = random.choice(['+', '-'])
    if op == '+':
        answer = a + b
    else:
        answer = a - b
    question = f"{a} {op} {b} = ?"
    session['captcha_answer'] = answer
    return question


def check_captcha(user_input):
    correct = session.get('captcha_answer')
    session.pop('captcha_answer', None)
    if correct is None:
        return False
    try:
        return int(user_input) == correct
    except (ValueError, TypeError):
        return False


@app.route('/api/captcha')
def api_captcha():
    question = generate_captcha()
    return jsonify({'question': question})


@app.route("/api/articles", methods=["GET"])
def get_articles():
    db = get_db()
    rows = db.execute("SELECT id, author, title, text, date FROM articles ORDER BY id DESC").fetchall()
    articles = [{"id": r["id"], "author": r["author"], "title": r["title"],
                 "text": r["text"], "date": r["date"]} for r in rows]
    return jsonify(articles)


@app.route("/api/articles", methods=["POST"])
def add_article():
    data = request.get_json()
    captcha_input = data.get('captcha', '').strip()
    if not check_captcha(captcha_input):
        return jsonify({"status": "error", "message": "Капча решена неверно =)"}), 400
    author = (data.get("author") or "").strip()
    title = (data.get("title") or "").strip()
    text = (data.get("text") or "").strip()
    if not author or not title or len(text) < 30:
        return jsonify({"status": "error", "message": "Недостаточно данных"}), 400
    now = time.strftime("%d.%m.%Y %H:%M")
    db = get_db()
    cursor = db.execute("INSERT INTO articles (author, title, text, date) VALUES (?, ?, ?, ?)",
                        (author, title, text, now))
    db.commit()
    new_id = cursor.lastrowid
    return jsonify({"status": "ok", "article": {
        "id": new_id, "author": author, "title": title, "text": text, "date": now
    }})


@app.route("/api/articles/<int:article_id>", methods=["DELETE"])
def delete_article(article_id):
    db = get_db()
    db.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    db.commit()
    return jsonify({"status": "ok"})


@app.route("/forgot", methods=["GET", "POST"])
def forgot():
    if request.method == "GET":
        return render_template("forgot.html")
    data = request.get_json()
    login = (data.get("login") or "").strip()
    user = USERS.get(login)
    if not user:
        return jsonify({"status": "error", "message": "Пользователь не найден"})
    if "question" not in data:
        return jsonify({"status": "ok", "question": user["question"]})
    answer = (data.get("answer") or "").strip()
    if not check_password_hash(user["answer_hash"], answer.lower()):
        return jsonify({"status": "error", "message": "Неверный ответ на вопрос"})
    new_password = data.get("new_password", "").strip()
    if len(new_password) < 4:
        return jsonify({"status": "error", "message": "Пароль минимум 4 символа"})
    user["password_hash"] = generate_password_hash(new_password)
    return jsonify({"status": "ok", "message": "Пароль изменён! Войдите с новым паролем."})


@app.route("/api/guestbook", methods=["GET"])
def get_guestbook():
    page = request.args.get("page", 1, type=int)
    per_page = 10
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM guestbook").fetchone()[0]
    offset = (page - 1) * per_page
    rows = db.execute("SELECT id, author, text, date FROM guestbook ORDER BY id DESC LIMIT ? OFFSET ?",
                      (per_page, offset)).fetchall()
    messages = [{"id": r["id"], "author": r["author"], "text": r["text"], "date": r["date"]} for r in rows]
    return jsonify({"messages": messages, "total": total, "page": page, "pages": (total + per_page - 1) // per_page})


@app.route("/api/guestbook", methods=["POST"])
def add_guestbook():
    data = request.get_json()
    captcha_input = data.get('captcha', '').strip()
    if not check_captcha(captcha_input):
        return jsonify({"status": "error", "message": "Капча решена неверно =)"}), 400
    author = (data.get("author") or "").strip()
    text = (data.get("text") or "").strip()
    if not author or len(text) < 5:
        return jsonify({"status": "error", "message": "Сообщение слишком короткое"}), 400
    now = time.strftime("%d.%m.%Y %H:%M")
    db = get_db()
    db.execute("INSERT INTO guestbook (author, text, date) VALUES (?, ?, ?)", (author, text, now))
    db.commit()
    return jsonify({"status": "ok"})


@app.route("/secret")
def secret_page():
    art = """
    <pre style="color: lime; background: black; padding: 20px;">
⣿⡇⠀⣿⣿⠀⢠⣿⣿⡆⠀⢻⣷⠀⣿⡏⢸⣿⠿⠇⠀⠀⠀⢰⣿⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⡿⠿⣿⣿⠀⣼⣏⣸⣷⠀⠘⣿⣴⡿⠀⢸⣿⠿⠇⠀⠀⢀⣿⣇⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀
⠿⠇⠀⣿⣿⠰⠿⠋⠉⠿⠆⠀⠹⠿⠃⠀⠸⠿⠿⠗⠀⠀⠸⠿⠉⠙⠿⠄⠀⠀⠀⠀⠀⠀⠀
⣿⣷⡀⢸⣿⠀⣿⡇⢀⣶⡿⠿⠆⢸⣿⠿⠇⠀⠀⢸⣿⠿⣷⣦⠀⠀⣾⣿⣆⠀⠸⣿⣄⣾⠇
⣿⡟⢿⣾⣿⠀⣿⡇⢸⣿⡀⠀⠀ ⢸⣿⠿⠇⠀⠀⢸⣿⠀⢸⣿⠀⣸⣿⣸⣿⡀⠀⢻⣿⠏⠀
⠿⠇⠈⠻⠿⠀⠿⠇⠈⠻⠿⠿⠇⠸⠿⠶⠆⠀⠀⠸⠿⠿⠿⠋⠀⠿⠏⠉⠿⠇⠀⠸⠿
    </pre>
    <p style="font-family: 'Comic Sans MS', cursive; color: gray;">
        «Лучшая инвестиция — это знания, а лучший сайт — FinanceGuru.ru»<br>
        — Рон Уэйн (ну, почти)
    </p>
    """
    return art


@app.before_request
def handle_theme():
    if request.args.get('theme') == 'terminal':
        resp = make_response(redirect(url_for('index')))
        resp.set_cookie('theme', 'terminal', max_age=60 * 60 * 24 * 30)
        return resp


@app.route("/chat", methods=["POST"])
def chat():
    if not OPENROUTER_API_KEY:
        return jsonify({
            "reply": "Бот не настроен =( Добавьте OPENROUTER_API_KEY в файл .env. "
                     "Получить ключ: https://openrouter.ai/keys",
            "status": "error"
        })
    data = request.get_json()
    user_message = data.get("message", "").strip().lower()
    easter_eggs = {
        "привет, бот": "Привет, {}! Как жизнь молодая? Есть чехлы для Nokia? 😉".format(
            session.get('username', 'юзер')),
        "сделай мне сайт": "За $500 и пару баннеров «Спонсор.ru» — будет готов!",
        "аська": "Мой номер ICQ: 123-456-789. Стучись ;)",
        "любимый фильм": "«Волк с Уолл-стрит»? Может, а может и нет.",
        "сколько у тебя денег": "Всё хорошо, спасибо, что спросил! А как у вас?",
        "секрет": "В правом нижнем углу страницы.",
    }
    for key, reply in easter_eggs.items():
        if key in user_message:
            return jsonify({"reply": reply, "status": "ok"})
    if "вверхвверхвнизвнизвлевовправовлево" in user_message.replace(" ", "").replace("-", ""):
        return jsonify(
            {"reply": "Konami Code активирован! 30 жизней и бесконечный патрон для торговли. Ты готов к рынку!",
             "status": "ok"})
    history = data.get("history", [])
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history:
        messages.append(h)
    messages.append({"role": "user", "content": user_message})
    try:
        resp = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:5000",
                "X-Title": "FinanceGuru2007",
            },
            json={"model": "openai/gpt-4o-mini", "messages": messages, "max_tokens": 500},
            timeout=30,
        )
        if resp.status_code != 200:
            try:
                err = resp.json()
                msg = err.get("error", {}).get("message", resp.text[:200])
            except Exception:
                msg = resp.text[:200]
            hints = {
                401: "Неверный API-ключ. Проверьте OPENROUTER_API_KEY.",
                402: "Недостаточно средств на балансе OpenRouter.",
                429: "Слишком много запросов. Подождите немного =)",
                503: "OpenRouter временно недоступен. Попробуйте через минуту.",
            }
            hint = hints.get(resp.status_code, f"HTTP {resp.status_code}")
            return jsonify({"reply": f"Бот недоступен: {hint}", "status": "error"})
        result = resp.json()
        if "choices" not in result or not result["choices"]:
            return jsonify({"reply": f"Неожиданный ответ от API =( {str(result)[:150]}", "status": "error"})
        reply = result["choices"][0]["message"]["content"]
        return jsonify({"reply": reply, "status": "ok"})
    except requests.exceptions.Timeout:
        return jsonify({"reply": "Бот не ответил за 30 секунд =( Попробуй ещё раз!", "status": "error"})
    except requests.exceptions.ConnectionError:
        return jsonify(
            {"reply": "Нет соединения с OpenRouter. Проверьте интернет-подключение сервера.", "status": "error"})
    except Exception as e:
        return jsonify({"reply": f"Ошибка: {str(e)}", "status": "error"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
