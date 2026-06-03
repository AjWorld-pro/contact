const App = {
    currentPage: 'dashboard',

    async init() {
        Auth.loadTheme();
        Auth.setupEventListeners();
        const user = await Auth.checkAuth();
        if (user) {
            this.showApp(user);
        } else {
            this.showAuth();
        }
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.navigate(e.state.page, true);
            }
        });
    },

    showAuth() {
        document.getElementById('navbar').classList.add('hidden');
        this.navigate('login', true);
    },

    showApp(user) {
        document.getElementById('navbar').classList.remove('hidden');
        Auth.currentUser = user;
        this.updateNav();
        const page = this.getPageFromUrl() || 'dashboard';
        this.navigate(page, true);
    },

    updateNav() {
        const u = Auth.currentUser;
        if (!u) return;
        document.getElementById('navUserName').textContent = u.full_name || u.username;
        const avatar = document.getElementById('navAvatar');
        if (u.profile_picture) {
            avatar.src = Utils.getAvatarUrl(u.profile_picture);
            avatar.alt = u.full_name;
        } else {
            avatar.src = '';
            avatar.alt = '';
            avatar.style.display = 'none';
            document.getElementById('navUserName').style.marginLeft = '0';
        }
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.toggle('hidden', u.role !== 'admin');
        });
    },

    navigate(page, noPush = false) {
        this.currentPage = page;
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.page === page);
        });
        if (!noPush) {
            const url = page === 'dashboard' ? '/' : `/${page}`;
            window.history.pushState({ page }, '', url);
        }
        Utils.loadPage(page);
    },

    getPageFromUrl() {
        const path = window.location.pathname.replace(/^\//, '');
        if (!path || path === '') return 'dashboard';
        const validPages = [
            'login', 'register', 'forgot-password', 'dashboard', 'contacts',
            'categories', 'trash', 'profile', 'settings', 'admin',
            'admin-users', 'admin-activities', 'admin-categories',
            'admin-backups', 'admin-reports'
        ];
        return validPages.includes(path) ? path : null;
    },

    async handleContactClick(id) {
        await Contacts.viewContact(id);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
