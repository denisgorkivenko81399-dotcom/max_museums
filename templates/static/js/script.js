// Глобальные переменные
let currentUserId = null;
let isAdmin = false;
let museums = [];
let events = [];
let subscriptions = [];
let visits = [];
let ymapsReady = false;

// Получение user_id (из URL или localStorage)
function getUserId() {
    const urlParams = new URLSearchParams(window.location.search);
    let uid = urlParams.get('userId') || urlParams.get('user_id');
    if (!uid) {
        uid = localStorage.getItem('demo_user_id');
        if (!uid) {
            uid = 'user_' + Math.random().toString(36).substr(2, 8);
            localStorage.setItem('demo_user_id', uid);
        }
    }
    document.getElementById('userIdDisplay').innerText = uid.slice(0, 8);
    return uid;
}

// API вызовы
async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (isAdmin) headers['X-Admin-Password'] = 'admin123';
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// Загрузка данных
async function loadMuseums() {
    museums = await api('/api/museums');
    return museums;
}
async function loadEvents() {
    const params = new URLSearchParams();
    if (document.getElementById('showOnlySubscribedEvents')?.checked && subscriptions.length) {
        params.append('user_id', currentUserId);
    }
    events = await api('/api/events?' + params.toString());
    return events;
}
async function loadSubscriptions() {
    subscriptions = await api(`/api/user/subscriptions?user_id=${currentUserId}`);
    return subscriptions;
}
async function loadVisits() {
    const data = await api(`/api/visits?user_id=${currentUserId}`);
    visits = data;
    return visits;
}
async function setVisit(museumId, visited) {
    await api('/api/visits', {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUserId, museum_id: museumId, visited: visited ? 1 : 0 })
    });
    await loadVisits();
}

// Рендер главной (карточки музеев)
async function renderMain() {
    const container = document.getElementById('museums-list');
    if (!container) return;
    container.innerHTML = '';
    for (const m of museums) {
        const isSubscribed = subscriptions.includes(m.id);
        const isVisited = visits.some(v => v.museum_id === m.id && v.visited === 1);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3>${escapeHtml(m.name)}</h3>
            ${m.photo_url ? `<img src="${m.photo_url}" alt="фото музея" onerror="this.src='https://placehold.co/600x400?text=Нет+фото'">` : ''}
            <p>${escapeHtml(m.description || '')}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(m.address)}</p>
            ${m.website ? `<p><i class="fas fa-globe"></i> <a href="${m.website}" target="_blank">Сайт музея</a></p>` : ''}
            <div>
                <button class="exhibits-btn" data-id="${m.id}"><i class="fas fa-search"></i> Экспонаты</button>
                <button class="subscribe-btn" data-id="${m.id}">${isSubscribed ? '<i class="fas fa-bell-slash"></i> Отписаться' : '<i class="fas fa-bell"></i> Подписаться'}</button>
                <button class="visit-btn" data-id="${m.id}" data-visited="${isVisited}">${isVisited ? '<i class="fas fa-check-circle"></i> Посещён' : '<i class="fas fa-circle"></i> Отметить посещение'}</button>
            </div>
        `;
        container.appendChild(card);
    }
    // Навешиваем обработчики
    document.querySelectorAll('.exhibits-btn').forEach(btn => {
        btn.addEventListener('click', () => showExhibits(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.subscribe-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const museumId = parseInt(btn.dataset.id);
            const isSub = subscriptions.includes(museumId);
            if (isSub) {
                await api('/api/unsubscribe', { method: 'POST', body: JSON.stringify({ user_id: currentUserId, museum_id: museumId }) });
            } else {
                await api('/api/subscribe', { method: 'POST', body: JSON.stringify({ user_id: currentUserId, museum_id: museumId }) });
            }
            await loadSubscriptions();
            renderMain();
            if (document.getElementById('showOnlySubscribedEvents')?.checked) renderEvents();
        });
    });
    document.querySelectorAll('.visit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const museumId = parseInt(btn.dataset.id);
            const currentlyVisited = btn.dataset.visited === 'true';
            await setVisit(museumId, !currentlyVisited);
            renderMain();
            renderPassport();
        });
    });
}

// Показать экспонаты в модалке
async function showExhibits(museumId) {
    const exhibits = await api(`/api/exhibits/${museumId}`);
    const modal = document.getElementById('exhibitsModal');
    const container = document.getElementById('exhibitsListModal');
    container.innerHTML = exhibits.length ? exhibits.map(ex => `
        <div class="card">
            <h4>${escapeHtml(ex.name)}</h4>
            <p>${escapeHtml(ex.description || '')}</p>
            ${ex.photo_url ? `<img src="${ex.photo_url}" style="max-height:150px">` : ''}
        </div>
    `).join('') : '<p>Экспонатов пока нет.</p>';
    modal.classList.remove('hidden');
    modal.querySelector('.close').onclick = () => modal.classList.add('hidden');
}

// Яндекс.Карты
function initYandexMap() {
    if (!ymapsReady) return;
    const map = new ymaps.Map('map', {
        center: [45.04, 41.97],
        zoom: 8,
        controls: ['zoomControl', 'fullscreenControl']
    });
    museums.forEach(m => {
        if (m.lat && m.lng) {
            const placemark = new ymaps.Placemark([m.lat, m.lng], {
                balloonContentHeader: `<b>${escapeHtml(m.name)}</b>`,
                balloonContentBody: `<p>${escapeHtml(m.address)}</p><a href="${m.website || '#'}" target="_blank">Сайт</a><br><button onclick="window.showExhibitsFromMap(${m.id})">Экспонаты</button>`
            });
            map.geoObjects.add(placemark);
        }
    });
}
window.showExhibitsFromMap = function(museumId) {
    showExhibits(museumId);
};

// Рендер событий
async function renderEvents() {
    await loadEvents();
    const container = document.getElementById('events-list');
    if (!container) return;
    container.innerHTML = events.map(ev => `
        <div class="card">
            <h3>${escapeHtml(ev.title)}</h3>
            <p><i class="fas fa-calendar-day"></i> ${ev.date || 'Дата не указана'}</p>
            <p><i class="fas fa-landmark"></i> ${escapeHtml(ev.museum_name)}</p>
            <p>${escapeHtml(ev.description || '')}</p>
        </div>
    `).join('');
}

// Паспорт: список музеев с чекбоксами, прогресс-бар
async function renderPassport() {
    await loadVisits();
    const total = museums.length;
    const visitedCount = visits.filter(v => v.visited === 1).length;
    const percent = total ? (visitedCount / total * 100) : 0;
    const container = document.getElementById('passport-info');
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <h3><i class="fas fa-passport"></i> Мои посещения</h3>
            <p>Посещено музеев: ${visitedCount} из ${total}</p>
            <div style="background:#ddd; border-radius:10px;"><div style="width:${percent}%; background:#7b4a2e; height:20px; border-radius:10px;"></div></div>
        </div>
        <div id="museumsChecklist"></div>
    `;
    const checklistDiv = document.getElementById('museumsChecklist');
    checklistDiv.innerHTML = museums.map(m => {
        const isChecked = visits.some(v => v.museum_id === m.id && v.visited === 1);
        return `
            <div class="card">
                <label style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" class="museum-visit-checkbox" data-id="${m.id}" ${isChecked ? 'checked' : ''}>
                    <strong>${escapeHtml(m.name)}</strong>
                </label>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.museum-visit-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const museumId = parseInt(cb.dataset.id);
            await setVisit(museumId, cb.checked);
            renderPassport();
            renderMain(); // обновить кнопки на главной
        });
    });
}

// Админ-панель (CRUD музеев и событий)
async function initAdmin() {
    document.getElementById('adminLoginBtn').addEventListener('click', () => {
        document.getElementById('adminLoginForm').classList.toggle('hidden');
    });
    document.getElementById('doAdminLogin').addEventListener('click', async () => {
        const pwd = document.getElementById('adminPassword').value;
        if (pwd === 'admin123') {
            isAdmin = true;
            document.getElementById('adminControls').classList.remove('hidden');
            document.getElementById('adminLoginForm').classList.add('hidden');
            loadAdminData();
        } else alert('Неверный пароль');
    });
    document.getElementById('addMuseumBtn').addEventListener('click', () => showMuseumForm());
    document.getElementById('addEventBtn').addEventListener('click', () => showEventForm());
}
async function loadAdminData() {
    const museumsData = await api('/api/admin/museums');
    const eventsData = await api('/api/events');
    const museumsDiv = document.getElementById('museumsAdminList');
    museumsDiv.innerHTML = museumsData.map(m => `
        <div class="admin-item">
            <span><strong>${escapeHtml(m.name)}</strong></span>
            <div>
                <button class="edit-museum" data-id="${m.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-museum" data-id="${m.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('.edit-museum').forEach(btn => {
        btn.addEventListener('click', () => showMuseumForm(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.delete-museum').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Удалить музей?')) {
                await api('/api/admin/museums', { method: 'DELETE', body: JSON.stringify({ id: parseInt(btn.dataset.id) }) });
                loadAdminData();
                await loadMuseums();
                renderMain();
                renderPassport();
                if (window.ymaps && ymapsReady) initYandexMap();
            }
        });
    });
    const eventsDiv = document.getElementById('eventsAdminList');
    eventsDiv.innerHTML = eventsData.map(e => `
        <div class="admin-item">
            <span><strong>${escapeHtml(e.title)}</strong> (${e.museum_name})</span>
            <div>
                <button class="edit-event" data-id="${e.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-event" data-id="${e.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('.edit-event').forEach(btn => {
        btn.addEventListener('click', () => showEventForm(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.delete-event').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Удалить событие?')) {
                await api('/api/admin/events', { method: 'DELETE', body: JSON.stringify({ id: parseInt(btn.dataset.id) }) });
                loadAdminData();
                renderEvents();
            }
        });
    });
}
function showMuseumForm(id = null) {
    const museum = id ? museums.find(m => m.id === id) : null;
    const name = prompt('Название музея', museum?.name || '');
    if (!name) return;
    const address = prompt('Адрес', museum?.address || '');
    const lat = parseFloat(prompt('Широта', museum?.lat || '45.0'));
    const lng = parseFloat(prompt('Долгота', museum?.lng || '41.97'));
    const desc = prompt('Описание', museum?.description || '');
    const contacts = prompt('Контакты', museum?.contacts || '');
    const website = prompt('Сайт', museum?.website || '');
    const photo = prompt('Фото URL', museum?.photo_url || '');
    const data = { name, address, lat, lng, description: desc, contacts, website, photo_url: photo };
    if (id) {
        data.id = id;
        api('/api/admin/museums', { method: 'PUT', body: JSON.stringify(data) }).then(() => {
            loadAdminData(); loadMuseums(); renderMain(); renderPassport(); if(window.ymaps && ymapsReady) initYandexMap();
        });
    } else {
        api('/api/admin/museums', { method: 'POST', body: JSON.stringify(data) }).then(() => {
            loadAdminData(); loadMuseums(); renderMain(); renderPassport(); if(window.ymaps && ymapsReady) initYandexMap();
        });
    }
}
function showEventForm(id = null) {
    const event = id ? events.find(e => e.id === id) : null;
    const museumId = prompt('ID музея (посмотрите в админке списке музеев)', event?.museum_id || '');
    if (!museumId) return;
    const title = prompt('Название события', event?.title || '');
    const date = prompt('Дата (YYYY-MM-DD)', event?.date || '');
    const desc = prompt('Описание', event?.description || '');
    const data = { museum_id: parseInt(museumId), title, date, description: desc };
    if (id) {
        data.id = id;
        api('/api/admin/events', { method: 'PUT', body: JSON.stringify(data) }).then(() => { loadAdminData(); renderEvents(); });
    } else {
        api('/api/admin/events', { method: 'POST', body: JSON.stringify(data) }).then(() => { loadAdminData(); renderEvents(); });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Переключение вкладок
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            document.getElementById(`${tab}-tab`).classList.add('active');
            if (tab === 'map' && window.ymaps && ymapsReady) {
                setTimeout(() => window.ymaps.geolocation?.(), 100);
            }
            if (tab === 'events') renderEvents();
            if (tab === 'passport') renderPassport();
        });
    });
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', async () => {
    currentUserId = getUserId();
    await loadMuseums();
    await loadSubscriptions();
    await loadVisits();
    renderMain();
    renderPassport();
    initTabs();
    initAdmin();
    const filterCheckbox = document.getElementById('showOnlySubscribedEvents');
    if (filterCheckbox) {
        filterCheckbox.addEventListener('change', () => renderEvents());
    }
    ymaps.ready(() => {
        ymapsReady = true;
        initYandexMap();
    });
});
