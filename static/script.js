var chatHistory = [];
var RATES_FULL = window.RATES_FULL || {};
var CURRENT_USER = window.CURRENT_USER || null;
var articles = [];
var currentCaptchaQuestion = '';

function updateClock() {
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    if (h < 10) h = "0" + h;
    if (m < 10) m = "0" + m;
    if (s < 10) s = "0" + s;
    var t = h + ":" + m + ":" + s;
    var el = document.getElementById("live-clock");
    if (el) el.innerHTML = t;
    var upd = document.getElementById("update-time");
    if (upd) upd.innerHTML = t;
}
setInterval(updateClock, 1000);
updateClock();

function randomizeOnline() {
    var el = document.getElementById("online-count");
    if (el) el.innerHTML = Math.floor(Math.random() * 14) + 17;
}
setInterval(randomizeOnline, 18000);

function showRegForm() {
    document.getElementById("login-form-area").style.display = "none";
    document.getElementById("reg-form-area").style.display = "block";
    document.getElementById("login-error").innerHTML = "";
}
function showLoginForm() {
    document.getElementById("reg-form-area").style.display = "none";
    document.getElementById("login-form-area").style.display = "block";
    document.getElementById("reg-error").innerHTML = "";
}

function doLogin() {
    var login = (document.getElementById("login-input").value || "").trim();
    var password = (document.getElementById("password-input").value || "").trim();
    var errEl = document.getElementById("login-error");
    errEl.innerHTML = "";
    if (!login || !password) {
        errEl.innerHTML = "Введите логин и пароль!";
        return;
    }
    var btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.value = "Входим...";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/login", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        btn.disabled = false;
        btn.value = "Войти";
        try {
            var d = JSON.parse(xhr.responseText);
            if (d.status === "ok") showLoggedIn(d.username);
            else errEl.innerHTML = d.message || "Ошибка входа =(";
        } catch(e) { errEl.innerHTML = "Ошибка сервера =("; }
    };
    xhr.send(JSON.stringify({ login: login, password: password }));
}

function doRegister() {
    var login = (document.getElementById("reg-login").value || "").trim();
    var pass1 = (document.getElementById("reg-password").value || "").trim();
    var pass2 = (document.getElementById("reg-password2").value || "").trim();
    var question = document.getElementById("reg-question") ? document.getElementById("reg-question").value : "";
    var answer = document.getElementById("reg-answer") ? document.getElementById("reg-answer").value : "";
    var errEl = document.getElementById("reg-error");
    errEl.innerHTML = "";
    if (!login || !pass1 || !pass2) {
        errEl.innerHTML = "Заполните все поля!";
        return;
    }
    if (pass1 !== pass2) {
        errEl.innerHTML = "Пароли не совпадают!";
        return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/register", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        try {
            var d = JSON.parse(xhr.responseText);
            if (d.status === "ok") showLoggedIn(d.username);
            else errEl.innerHTML = d.message || "Ошибка регистрации =(";
        } catch(e) { errEl.innerHTML = "Ошибка сервера =("; }
    };
    xhr.send(JSON.stringify({ login: login, password: pass1, question: question, answer: answer }));
}

function doLogout() {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/logout", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        showLoggedOut();
    };
    xhr.send("{}");
}

function showLoggedIn(username) {
    document.getElementById("login-form-area").style.display = "none";
    document.getElementById("reg-form-area").style.display = "none";
    document.getElementById("logged-area").style.display = "block";
    var unEl = document.getElementById("logged-username");
    if (unEl) unEl.innerHTML = escHtml(username);
    var artAuthor = document.getElementById("art-author");
    if (artAuthor && !artAuthor.value) artAuthor.value = username;
    var titleEl = document.querySelector("#auth-block .sidebar-title");
    if (titleEl) {
        var img = titleEl.querySelector("img");
        titleEl.innerHTML = "";
        if (img) titleEl.appendChild(img);
        titleEl.appendChild(document.createTextNode(" ЛИЧНЫЙ КАБИНЕТ"));
    }
}

function showLoggedOut() {
    document.getElementById("logged-area").style.display = "none";
    document.getElementById("reg-form-area").style.display = "none";
    document.getElementById("login-form-area").style.display = "block";
    document.getElementById("login-input").value = "";
    document.getElementById("password-input").value = "";
    var titleEl = document.querySelector("#auth-block .sidebar-title");
    if (titleEl) {
        var img = titleEl.querySelector("img");
        titleEl.innerHTML = "";
        if (img) titleEl.appendChild(img);
        titleEl.appendChild(document.createTextNode(" ВОЙТИ НА САЙТ"));
    }
}

var currencyNames = {
    "USD": "Доллар США", "EUR": "Евро", "RUB": "Российский рубль",
    "GBP": "Фунт стерлингов", "JPY": "Японская йена",
    "CNY": "Китайский юань", "BYN": "Белорусский рубль",
    "UAH": "Украинская гривна", "KZT": "Казахстанский тенге"
};

function convertCurrency() {
    var amountEl = document.getElementById("conv-amount");
    var fromEl = document.getElementById("conv-from");
    var toEl = document.getElementById("conv-to");
    var resultEl = document.getElementById("conv-result-text");
    var hintEl = document.getElementById("conv-rate-hint");
    if (!amountEl || !fromEl || !toEl || !resultEl) return;
    var amount = parseFloat(amountEl.value.replace(",", "."));
    var from = fromEl.value;
    var to = toEl.value;
    if (isNaN(amount) || amount < 0) {
        resultEl.innerHTML = "Введите корректную сумму";
        hintEl.innerHTML = "";
        return;
    }
    if (!RATES_FULL || Object.keys(RATES_FULL).length === 0) {
        resultEl.innerHTML = "Нет данных о курсах =(";
        hintEl.innerHTML = "Проверьте соединение с интернетом";
        return;
    }
    var rateFrom = from === "USD" ? 1 : RATES_FULL[from];
    var rateTo = to === "USD" ? 1 : RATES_FULL[to];
    if (!rateFrom || !rateTo) {
        resultEl.innerHTML = "Нет данных для этой пары =(";
        hintEl.innerHTML = "";
        return;
    }
    var amountUSD = amount / rateFrom;
    var amountResult = amountUSD * rateTo;
    var decimals = (to === "JPY" || to === "KZT") ? 0 : 2;
    var formatted = amountResult.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
    var rate1 = rateTo / rateFrom;
    var rDecimals = (to === "JPY" || to === "KZT") ? 2 : 4;
    var rate1Fmt = rate1.toFixed(rDecimals);
    resultEl.innerHTML = escHtml(amount.toFixed(amount % 1 === 0 ? 0 : 2)) + "&nbsp;" + escHtml(from) + "&nbsp;=&nbsp;" + "<b>" + formatted + "&nbsp;" + escHtml(to) + "</b>";
    hintEl.innerHTML = "1&nbsp;" + escHtml(from) + "&nbsp;=&nbsp;" + rate1Fmt + "&nbsp;" + escHtml(to) + "&nbsp;&nbsp;|&nbsp;&nbsp;" + escHtml(currencyNames[from] || from) + " → " + escHtml(currencyNames[to] || to);
}

function swapCurrencies() {
    var fromEl = document.getElementById("conv-from");
    var toEl = document.getElementById("conv-to");
    var tmp = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value = tmp;
    convertCurrency();
}

function refreshRates() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/rates", true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || xhr.status !== 200) return;
        try {
            var d = JSON.parse(xhr.responseText);
            if (d.status !== "ok") return;
            function set(id, val, suffix) {
                var el = document.getElementById(id);
                if (el && val != null) el.innerHTML = val + (suffix || "");
            }
            set("rate-usd-rub", d.usd_rub, "&nbsp;₽");
            set("rate-eur-rub", d.eur_rub, "&nbsp;₽");
            set("rate-gbp-rub", d.gbp_rub, "&nbsp;₽");
            set("rate-jpy-rub", d.jpy_rub, "&nbsp;₽");
            set("rate-cny-rub", d.cny_rub, "&nbsp;₽");
            set("banner-usd-rub", d.usd_rub, "");
            set("banner-eur-rub", d.eur_rub, "");
            if (d.all) {
                RATES_FULL = d.all;
                convertCurrency();
            }
            var rows = document.querySelectorAll("#market-table tr");
            for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll("td");
                if (cells.length < 3) continue;
                var name = (cells[1].innerText || cells[1].textContent).trim();
                var pc = cells[2];
                if (name.indexOf("USD/RUB") !== -1 && d.usd_rub) pc.innerHTML = "<b>" + d.usd_rub + "&nbsp;₽</b>";
                else if (name.indexOf("EUR/RUB") !== -1 && d.eur_rub) pc.innerHTML = "<b>" + d.eur_rub + "&nbsp;₽</b>";
                else if (name.indexOf("GBP/RUB") !== -1 && d.gbp_rub) pc.innerHTML = "<b>" + d.gbp_rub + "&nbsp;₽</b>";
                else if (name.indexOf("CNY/RUB") !== -1 && d.cny_rub) pc.innerHTML = "<b>" + d.cny_rub + "&nbsp;₽</b>";
                else if (name.indexOf("EUR/USD") !== -1 && d.eur_usd) pc.innerHTML = "<b>" + d.eur_usd + "</b>";
                else if (name.indexOf("USD/JPY") !== -1 && d.usd_jpy) pc.innerHTML = "<b>" + d.usd_jpy + "</b>";
                else if (name.indexOf("XAU") !== -1 && d.gold_usd) pc.innerHTML = "<b>$" + d.gold_usd + "</b>";
            }
        } catch(e) {}
    };
    xhr.send();
}

function escHtml(t) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(t)));
    return d.innerHTML;
}

function loadArticles() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/articles", true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                articles = JSON.parse(xhr.responseText);
                renderArticles();
            } catch(e) {}
        }
    };
    xhr.send();
}

function renderArticles() {
    var list = document.getElementById("articles-list");
    var noMsg = document.getElementById("no-articles-msg");
    if (!list) return;
    var old = list.querySelectorAll(".article-block");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    if (articles.length === 0) {
        if (noMsg) noMsg.style.display = "block";
        updateTopList(); return;
    }
    if (noMsg) noMsg.style.display = "none";
    for (var k = 0; k < articles.length; k++) {
        (function(art) {
            var div = document.createElement("div");
            div.className = "article-block";
            div.id = "art-" + art.id;
            div.innerHTML =
                '<div class="article-title-link">' + escHtml(art.title) + '</div>' +
                '<div class="article-meta">&#128197;&nbsp;' + art.date + '&nbsp;&nbsp;|&nbsp;&nbsp;&#128100;&nbsp;<b>' + escHtml(art.author) + '</b></div>' +
                '<div class="article-body">' + escHtml(art.text) + '</div>' +
                '<button class="article-del-btn" onclick="deleteArticle(' + art.id + ')">[ удалить ]</button>';
            list.appendChild(div);
        })(articles[k]);
    }
    updateTopList();
}

function updateTopList() {
    var ol = document.getElementById("top-articles-list");
    if (!ol) return;
    ol.innerHTML = "";
    var top = articles.slice(0, 5);
    if (top.length === 0) {
        ol.innerHTML = '<li style="font-size:10px;color:#aaa;list-style:none;padding:2px 0;">Статей пока нет</li>';
        return;
    }
    for (var i = 0; i < top.length; i++) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#art-" + top[i].id;
        a.className = "sidebar-link";
        var t = top[i].title;
        a.innerHTML = escHtml(t.length > 28 ? t.slice(0,28)+"…" : t);
        li.appendChild(a);
        ol.appendChild(li);
    }
}

function refreshCaptcha() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/captcha", true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                var d = JSON.parse(xhr.responseText);
                currentCaptchaQuestion = d.question;
                var qEl = document.getElementById("captcha-question");
                if (qEl) qEl.innerHTML = currentCaptchaQuestion;
                var inp = document.getElementById("captcha-input");
                if (inp) inp.value = "";
            } catch(e) {}
        }
    };
    xhr.send();
}

function publishArticle() {
    var author = (document.getElementById("art-author").value || "").trim();
    var title = (document.getElementById("art-title").value || "").trim();
    var text = (document.getElementById("art-text").value || "").trim();
    var captchaInput = (document.getElementById("captcha-input") || {}).value || "";
    var errEl = document.getElementById("art-error");
    errEl.innerHTML = "";
    if (!author) { errEl.innerHTML = "Введите ваше имя!"; return; }
    if (!title) { errEl.innerHTML = "Введите заголовок!"; return; }
    if (text.length < 30) { errEl.innerHTML = "Текст слишком короткий (мин. 30 символов)!"; return; }
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/articles", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
            try {
                var resp = JSON.parse(xhr.responseText);
                if (resp.status === "ok") {
                    document.getElementById("art-title").value = "";
                    document.getElementById("art-text").value = "";
                    var el = document.getElementById("articles-list");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                    var btn = document.querySelector(".publish-btn");
                    if (btn) {
                        btn.value = "  ОПУБЛИКОВАНО!  ";
                        btn.style.background = "linear-gradient(to bottom, #44bb44, #228822)";
                        setTimeout(function() { btn.value = "  ОПУБЛИКОВАТЬ!  "; btn.style.background = ""; }, 2200);
                    }
                    loadArticles();
                    refreshCaptcha();
                } else {
                    errEl.innerHTML = resp.message || "Ошибка сохранения";
                    refreshCaptcha();
                }
            } catch(e) {
                errEl.innerHTML = "Ошибка сервера";
                refreshCaptcha();
            }
        } else {
            errEl.innerHTML = "Ошибка соединения с сервером";
            refreshCaptcha();
        }
    };
    xhr.send(JSON.stringify({ author: author, title: title, text: text, captcha: captchaInput }));
}

function deleteArticle(id) {
    if (!confirm("Удалить эту статью?")) return;
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", "/api/articles/" + id, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) loadArticles();
    };
    xhr.send();
}

function calculateDeposit() {
    var amount = parseFloat(document.getElementById("calc-amount").value);
    var rate = parseFloat(document.getElementById("calc-rate").value);
    var months = parseInt(document.getElementById("calc-months").value);
    var compound = document.getElementById("calc-compound").value;
    var out = document.getElementById("calc-output");
    if (isNaN(amount) || isNaN(rate) || amount <= 0 || rate <= 0) {
        out.innerHTML = '<span style="color:red;">Ошибка! Введите корректные данные&nbsp;=(</span>';
        return;
    }
    var total = compound === "yes"
        ? amount * Math.pow(1 + rate/100/12, months)
        : amount * (1 + (rate/100) * (months/12));
    var income = total - amount;
    var fmt = function(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0"); };
    var html = '<table cellpadding="4" cellspacing="1" width="100%" style="font-size:11px;">';
    html += '<tr style="background:#eef5ff;"><td>Сумма вклада:</td><td align="right"><b>' + fmt(amount) + '&nbsp;₽</b></td></tr>';
    html += '<tr style="background:#fff;"><td>Ставка:</td><td align="right"><b>' + rate + '%&nbsp;год.</b></td></tr>';
    html += '<tr style="background:#eef5ff;"><td>Срок:</td><td align="right"><b>' + months + '&nbsp;мес.</b></td></tr>';
    html += '<tr style="background:#fff8e0; border-top:2px solid #f5a800;"><td><b>Доход:</b></td><td align="right"><b style="color:#007700;">+&nbsp;' + fmt(income) + '&nbsp;₽</b></td></tr>';
    html += '<tr style="background:#fff3cc;"><td><b>Итого:</b></td><td align="right"><b style="color:#0d2a5e; font-size:14px;">' + fmt(total) + '&nbsp;₽</b></td></tr>';
    html += '</table>';
    html += '<div style="font-size:10px;color:#777;margin:6px 4px 2px;padding:4px 6px;background:#fffff0;border:1px dashed #cccc88;line-height:15px;">';
    if (rate >= 18) html += 'Очень высокая ставка — проверьте условия в договоре! =)';
    else if (rate >= 12) html += 'Хорошая ставка! Рассмотри ещё ПИФы для диверсификации ;)';
    else html += 'Маловато... попробуй поискать предложения получше!';
    html += '</div>';
    out.innerHTML = html;
    out.className = "";
}

function addMessage(text, type) {
    var container = document.getElementById("chat-messages");
    var div = document.createElement("div");
    div.className = "chat-msg " + type + "-msg";
    if (type === "user") div.innerHTML = "<b>Вы:</b>&nbsp;" + escHtml(text);
    else if (type === "bot") div.innerHTML = "<b>Бот&nbsp:</b>&nbsp;" + escHtml(text);
    else div.innerHTML = "<i>" + escHtml(text) + "</i>";
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function sendMessage() {
    var input = document.getElementById("chat-input");
    var message = input.value.trim();
    if (!message) return;
    input.value = ""; input.disabled = true;
    addMessage(message, "user");
    var typingDiv = addMessage("Бот думает... ⏳", "typing");
    chatHistory.push({ role: "user", content: message });
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/chat", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (typingDiv && typingDiv.parentNode) typingDiv.parentNode.removeChild(typingDiv);
        if (xhr.status === 200) {
            try {
                var resp = JSON.parse(xhr.responseText);
                addMessage(resp.reply || "Ошибка ответа =(", "bot");
                chatHistory.push({ role: "assistant", content: resp.reply });
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
            } catch(e) { addMessage("Ошибка обработки ответа =(", "bot"); }
        } else { addMessage("Сервер недоступен. Попробуй позже&nbsp;=(", "bot"); }
        input.disabled = false; input.focus();
    };
    xhr.send(JSON.stringify({ message: message, history: chatHistory.slice(0, -1) }));
}

window.onload = function () {
    loadArticles();
    convertCurrency();
    refreshRates();
    setInterval(refreshRates, 5 * 60 * 1000);
    refreshCaptcha();
    if (CURRENT_USER) showLoggedIn(CURRENT_USER);
    var passInput = document.getElementById("password-input");
    if (passInput) passInput.onkeydown = function(e) { if (e.keyCode === 13) doLogin(); };
    var regPass2 = document.getElementById("reg-password2");
    if (regPass2) regPass2.onkeydown = function(e) { if (e.keyCode === 13) doRegister(); };
};