const API_BASE = '';

const Utils = {
    toast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
    },

    showLoader(show = true) { document.getElementById('page-loader').classList.toggle('hidden', !show); },

    api(method, url, data = null, isFormData = false) {
        const options = { method, credentials: 'include', headers: {} };
        if (data && !isFormData) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(data); }
        else if (data && isFormData) { options.body = data; }
        return fetch(`${API_BASE}${url}`, options).then(async r => {
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                const json = await r.json();
                if (!r.ok) throw new Error(json.error || 'Request failed');
                return json;
            }
            if (!r.ok) throw new Error('Request failed');
            return r;
        });
    },

    openModal(html, options = {}) {
        const container = document.getElementById('modal-container');
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay show';
        overlay.innerHTML = `<div class="modal ${options.lg ? 'modal-lg' : ''}">${html}</div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay && !options.noClose) Utils.closeModal(); });
        container.innerHTML = '';
        container.appendChild(overlay);
        if (options.onOpen) options.onOpen(overlay.querySelector('.modal'));
        document.body.style.overflow = 'hidden';
        return overlay.querySelector('.modal');
    },

    closeModal() {
        const container = document.getElementById('modal-container');
        container.innerHTML = '';
        document.body.style.overflow = '';
    },

    formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getInitials(name) {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    },

    getAvatarUrl(filename) {
        if (!filename) return '';
        return `${API_BASE}/uploads/profiles/${filename}`;
    },

    confirm(message) {
        return new Promise((resolve) => {
            const modal = Utils.openModal(`
                <div class="modal-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--gold)"></i> Confirm</h2></div>
                <div class="modal-body"><p>${Utils.escapeHtml(message)}</p></div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="Utils.closeModal(); resolve(false)">Cancel</button>
                    <button class="btn btn-danger" id="confirmBtn">Confirm</button>
                </div>
            `);
            modal.querySelector('#confirmBtn').addEventListener('click', () => { Utils.closeModal(); resolve(true); });
            const resolveFn = resolve;
            const origClose = Utils.closeModal;
            Utils.closeModal = function() { origClose(); resolveFn(false); Utils.closeModal = origClose; };
        });
    },

    debounce(fn, ms = 300) {
        let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    },

    renderPagination(total, page, perPage, onPageChange) {
        const totalPages = Math.ceil(total / perPage) || 1;
        if (totalPages <= 1) return '';
        let html = `<button ${page <= 1 ? 'disabled' : ''} onclick="(${onPageChange})(${page - 1})"><i class="fas fa-chevron-left"></i></button>`;
        for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
            html += `<button class="${i === page ? 'active' : ''}" onclick="(${onPageChange})(${i})">${i}</button>`;
        }
        html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="(${onPageChange})(${page + 1})"><i class="fas fa-chevron-right"></i></button>`;
        html += `<span style="margin-left:12px;font-size:0.8rem;color:var(--text-muted)">Page ${page} of ${totalPages} (${total} total)</span>`;
        return html;
    },

    showPageContent(html) {
        document.getElementById('page-content').innerHTML = html;
    },

    async loadPage(page, params = {}) {
        Utils.showLoader(true);
        try {
            switch(page) {
                case 'login': Auth.showLogin(); break;
                case 'register': Auth.showRegister(); break;
                case 'forgot-password': Auth.showForgotPassword(); break;
                case 'dashboard': await Contacts.showDashboard(); break;
                case 'contacts': await Contacts.showContacts(params); break;
                case 'categories': await Contacts.showCategories(); break;
                case 'trash': await Contacts.showTrash(); break;
                case 'profile': await Auth.showProfile(); break;
                case 'settings': await Auth.showSettings(); break;
                case 'admin': await Admin.showDashboard(); break;
                case 'admin-users': await Admin.showUsers(); break;
                case 'admin-activities': await Admin.showActivities(); break;
                case 'admin-categories': await Admin.showCategories(); break;
                case 'admin-backups': await Admin.showBackups(); break;
                case 'admin-reports': await Admin.showReports(); break;
                default: Utils.showPageContent('<h1>Page not found</h1>');
            }
        } catch (e) {
            console.error(e);
            Utils.showPageContent(`<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>${Utils.escapeHtml(e.message)}</p></div>`);
        }
        Utils.showLoader(false);
    }
};
