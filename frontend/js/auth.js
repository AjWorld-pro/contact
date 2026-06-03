const Auth = {
    currentUser: null,

    init() {
        const token = localStorage.getItem('auth_token');
        this.setupEventListeners();
    },

    setupEventListeners() {
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('userDropdown').classList.toggle('show');
        });
        document.addEventListener('click', () => {
            document.getElementById('userDropdown')?.classList.remove('show');
        });
        document.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                App.navigate(page);
            });
        });
    },

    toggleTheme() {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-theme') === 'dark';
        html.setAttribute('data-theme', isDark ? 'light' : 'dark');
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
        document.querySelector('#themeToggle i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    },

    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        const icon = document.querySelector('#themeToggle i');
        if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    },

    async checkAuth() {
        try {
            const data = await Utils.api('GET', '/api/auth/me');
            this.currentUser = data.user;
            return data.user;
        } catch {
            return null;
        }
    },

    showLogin() {
        Utils.showPageContent(`
            <div class="auth-container">
                <div class="auth-card">
                    <div class="logo">
                        <i class="fas fa-address-card"></i>
                        <h1>ContactPro</h1>
                        <p>Sign in to your account</p>
                    </div>
                    <form id="loginForm">
                        <div class="form-group">
                            <label>Username or Email</label>
                            <input type="text" name="username" placeholder="Enter your username or email" required autofocus>
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" name="password" placeholder="Enter your password" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg btn-block">
                            <i class="fas fa-sign-in-alt"></i> Sign In
                        </button>
                    </form>
                    <div class="auth-footer">
                        <p>Don't have an account? <a onclick="App.navigate('register')">Register</a></p>
                        <p style="margin-top:4px"><a onclick="App.navigate('forgot-password')">Forgot password?</a></p>
                    </div>
                </div>
            </div>
        `);
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                const data = await Utils.api('POST', '/api/auth/login', Object.fromEntries(fd));
                Utils.toast('Login successful!', 'success');
                Auth.currentUser = data.user;
                App.showApp(data.user);
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        });
    },

    showRegister() {
        Utils.showPageContent(`
            <div class="auth-container">
                <div class="auth-card">
                    <div class="logo">
                        <i class="fas fa-address-card"></i>
                        <h1>ContactPro</h1>
                        <p>Create your account</p>
                    </div>
                    <form id="registerForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Full Name</label>
                                <input type="text" name="full_name" placeholder="John Doe" required>
                            </div>
                            <div class="form-group">
                                <label>Username</label>
                                <input type="text" name="username" placeholder="johndoe" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" placeholder="john@example.com" required>
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" name="password" placeholder="Min 6 characters" required minlength="6">
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg btn-block">
                            <i class="fas fa-user-plus"></i> Create Account
                        </button>
                    </form>
                    <div class="auth-footer">
                        <p>Already have an account? <a onclick="App.navigate('login')">Sign In</a></p>
                    </div>
                </div>
            </div>
        `);
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('POST', '/api/auth/register', Object.fromEntries(fd));
                Utils.toast('Registration successful! Please login.', 'success');
                App.navigate('login');
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        });
    },

    showForgotPassword() {
        Utils.showPageContent(`
            <div class="auth-container">
                <div class="auth-card">
                    <div class="logo">
                        <i class="fas fa-address-card"></i>
                        <h1>Reset Password</h1>
                        <p>Enter your email to receive reset link</p>
                    </div>
                    <form id="forgotForm">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" placeholder="your@email.com" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg btn-block">
                            <i class="fas fa-paper-plane"></i> Send Reset Link
                        </button>
                    </form>
                    <div class="auth-footer">
                        <p><a onclick="App.navigate('login')">Back to Sign In</a></p>
                    </div>
                </div>
            </div>
        `);
        document.getElementById('forgotForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('POST', '/api/auth/forgot-password', Object.fromEntries(fd));
                Utils.toast('If the email exists, a reset link has been sent.', 'success');
                App.navigate('login');
            } catch (err) {
                Utils.toast(err.message, 'error');
            }
        });
    },

    async showProfile() {
        if (!Auth.currentUser) await Auth.checkAuth();
        const u = Auth.currentUser;
        Utils.showPageContent(`
            <div class="page-header"><h1><i class="fas fa-user-circle"></i> My Profile</h1></div>
            <div class="profile-header">
                <div class="profile-avatar" id="profileAvatarUpload">
                    ${u.profile_picture ? `<img src="${Utils.getAvatarUrl(u.profile_picture)}" alt="">` : Utils.getInitials(u.full_name)}
                    <div class="upload-overlay"><i class="fas fa-camera"></i></div>
                </div>
                <div class="profile-info">
                    <h2>${Utils.escapeHtml(u.full_name)}</h2>
                    <p>@${Utils.escapeHtml(u.username)} &middot; ${Utils.escapeHtml(u.email)}</p>
                    <span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-green'}">${u.role === 'admin' ? 'Administrator' : 'User'}</span>
                    <p style="margin-top:8px;font-size:0.8rem;color:var(--text-muted)">Joined ${Utils.formatDate(u.created_at)}</p>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-edit"></i> Edit Profile</h2></div>
                <div class="card-body">
                    <form id="profileForm">
                        <div class="form-group"><label>Full Name</label><input type="text" name="full_name" value="${Utils.escapeHtml(u.full_name)}" required></div>
                        <div class="form-group"><label>Email</label><input type="email" name="email" value="${Utils.escapeHtml(u.email)}" required></div>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
                    </form>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-lock"></i> Change Password</h2></div>
                <div class="card-body">
                    <form id="passwordForm">
                        <div class="form-group"><label>Current Password</label><input type="password" name="current_password" required></div>
                        <div class="form-group"><label>New Password</label><input type="password" name="new_password" required minlength="6"></div>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-key"></i> Change Password</button>
                    </form>
                </div>
            </div>
        `);
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('PUT', '/api/profile', Object.fromEntries(fd));
                Utils.toast('Profile updated!', 'success');
                Auth.currentUser = (await Utils.api('GET', '/api/auth/me')).user;
            } catch (err) { Utils.toast(err.message, 'error'); }
        });
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('POST', '/api/auth/change-password', Object.fromEntries(fd));
                Utils.toast('Password changed!', 'success');
                e.target.reset();
            } catch (err) { Utils.toast(err.message, 'error'); }
        });
        document.getElementById('profileAvatarUpload')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = async () => {
                const file = input.files[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                try {
                    await Utils.api('POST', '/api/profile/picture', fd, true);
                    Utils.toast('Picture updated!', 'success');
                    Auth.currentUser = (await Utils.api('GET', '/api/auth/me')).user;
                    App.updateNav();
                    Auth.showProfile();
                } catch (err) { Utils.toast(err.message, 'error'); }
            };
            input.click();
        });
    },

    async showSettings() {
        Utils.showPageContent(`
            <div class="page-header"><h1><i class="fas fa-cog"></i> Settings</h1></div>
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-palette"></i> Appearance</h2></div>
                <div class="card-body">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <div><strong>Dark Mode</strong><p style="font-size:0.8rem;color:var(--text-muted)">Toggle between light and dark theme</p></div>
                        <button class="btn btn-secondary" onclick="Auth.toggleTheme()">
                            <i class="fas ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>
                            ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark'} Mode
                        </button>
                    </div>
                </div>
            </div>
        `);
    },

    async logout() {
        try {
            await Utils.api('POST', '/api/auth/logout');
        } catch {}
        Auth.currentUser = null;
        localStorage.removeItem('auth_token');
        App.showAuth();
    }
};
