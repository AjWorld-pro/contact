const Admin = {
    async showDashboard() {
        Utils.showLoader(true);
        try {
            const [stats, data] = await Promise.all([
                Utils.api('GET', '/api/admin/stats'),
                Utils.api('GET', '/api/admin/dashboard-data')
            ]);

            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-shield-alt"></i> Admin Dashboard</h1><p class="subtitle">System overview and management</p></div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-secondary" onclick="App.navigate('admin-users')"><i class="fas fa-users"></i> Users</button>
                        <button class="btn btn-secondary" onclick="App.navigate('admin-activities')"><i class="fas fa-history"></i> Logs</button>
                    </div>
                </div>

                <div class="dashboard-grid">
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-users"></i></div>
                        <div class="stat-info"><h3>${stats.total_users}</h3><p>Total Users <small style="color:var(--text-muted)">(+${stats.new_users_30d} in 30d)</small></p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-address-book"></i></div>
                        <div class="stat-info"><h3>${stats.total_contacts}</h3><p>Total Contacts <small style="color:var(--text-muted)">(+${stats.new_contacts_30d} in 30d)</small></p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon gold"><i class="fas fa-star"></i></div>
                        <div class="stat-info"><h3>${stats.favorite_contacts}</h3><p>Favorites</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon red"><i class="fas fa-trash"></i></div>
                        <div class="stat-info"><h3>${stats.trashed_contacts}</h3><p>Trashed Contacts</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-history"></i></div>
                        <div class="stat-info"><h3>${stats.total_activities}</h3><p>Activities Logged</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon gold"><i class="fas fa-birthday-cake"></i></div>
                        <div class="stat-info"><h3>${stats.birthdays_today}</h3><p>Birthdays Today</p></div>
                    </div>
                </div>

                ${data.todays_birthdays && data.todays_birthdays.length ? `
                <div class="card" style="border-left:4px solid var(--gold)">
                    <div class="card-header"><h2><i class="fas fa-birthday-cake"></i> Today's Birthdays</h2></div>
                    <div class="card-body">
                        ${data.todays_birthdays.map(b => `<div style="padding:8px 0"><strong>${Utils.escapeHtml(b.full_name)}</strong> (${Utils.escapeHtml(b.owner)})</div>`).join('')}
                    </div>
                </div>` : ''}

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                    <div class="card">
                        <div class="card-header"><h2><i class="fas fa-users"></i> Recent Users</h2></div>
                        <div class="card-body">
                            ${data.users.map(u => `
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                                    <div>
                                        <strong>${Utils.escapeHtml(u.full_name)}</strong>
                                        <div style="font-size:0.8rem;color:var(--text-muted)">@${Utils.escapeHtml(u.username)}</div>
                                    </div>
                                    <span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-green'}">${u.role}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h2><i class="fas fa-clock"></i> Recent Activities</h2></div>
                        <div class="card-body" style="max-height:400px;overflow-y:auto">
                            <div class="timeline">
                                ${data.recent_activities.map(a => `
                                    <div class="timeline-item">
                                        <div class="dot"></div>
                                        <div class="action"><strong>${Utils.escapeHtml(a.username || 'System')}</strong> ${Utils.escapeHtml(a.action)} ${Utils.escapeHtml(a.entity_type || '')}</div>
                                        <div class="time">${Utils.formatDateTime(a.created_at)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                ${stats.category_stats && stats.category_stats.length ? `
                <div class="card" style="margin-top:16px">
                    <div class="card-header"><h2><i class="fas fa-chart-bar"></i> Contacts by Category</h2></div>
                    <div class="card-body">
                        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
                            ${stats.category_stats.map(c => `
                                <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm)">
                                    <strong>${Utils.escapeHtml(c.name)}</strong>
                                    <div style="font-size:1.3rem;font-weight:700;color:var(--primary)">${c.count}</div>
                                    <div style="height:4px;background:var(--bg);border-radius:2px;margin-top:4px">
                                        <div style="height:100%;background:var(--primary);border-radius:2px;width:${stats.total_contacts ? Math.min(100, (c.count / stats.total_contacts) * 100) : 0}%"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>` : ''}
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showUsers() {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', '/api/admin/users');
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-users-cog"></i> User Management</h1><p class="subtitle">${data.total} users</p></div>
                </div>
                <div class="toolbar">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="userSearch" placeholder="Search users...">
                    </div>
                </div>
                <div class="card">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Joined</th><th>Actions</th></tr></thead>
                            <tbody>${data.users.map(u => `
                                <tr>
                                    <td><strong>${Utils.escapeHtml(u.full_name)}</strong><br><small style="color:var(--text-muted)">@${Utils.escapeHtml(u.username)}</small></td>
                                    <td>${Utils.escapeHtml(u.email)}</td>
                                    <td><span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-green'}">${u.role}</span></td>
                                    <td><span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                                    <td>${u.last_login ? Utils.formatDateTime(u.last_login) : 'Never'}</td>
                                    <td>${Utils.formatDate(u.created_at)}</td>
                                    <td>
                                        <button class="btn btn-sm ${u.role === 'admin' ? 'btn-secondary' : 'btn-gold'}" onclick="Admin.toggleRole(${u.id}, '${u.role}')">
                                            ${u.role === 'admin' ? 'Demote' : 'Promote'}
                                        </button>
                                        <button class="btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-primary'}" onclick="Admin.toggleActive(${u.id})">
                                            ${u.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="Admin.deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                </div>
                <div class="pagination">${Utils.renderPagination(data.total, data.page, 20, 'Admin.showUsers')}</div>
            `);
            document.getElementById('userSearch')?.addEventListener('input', Utils.debounce(function() {
                Utils.showLoader(true);
                Utils.api('GET', `/api/admin/users?search=${encodeURIComponent(this.value)}`).then(d => {
                    Admin.renderUsersTable(d);
                }).catch(e => Utils.toast(e.message, 'error')).finally(() => Utils.showLoader(false));
            }, 400));
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    renderUsersTable(data) {
        const tbody = document.querySelector('table tbody');
        if (!tbody) return;
        tbody.innerHTML = data.users.map(u => `
            <tr>
                <td><strong>${Utils.escapeHtml(u.full_name)}</strong><br><small style="color:var(--text-muted)">@${Utils.escapeHtml(u.username)}</small></td>
                <td>${Utils.escapeHtml(u.email)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-green'}">${u.role}</span></td>
                <td><span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>${u.last_login ? Utils.formatDateTime(u.last_login) : 'Never'}</td>
                <td>${Utils.formatDate(u.created_at)}</td>
                <td>
                    <button class="btn btn-sm ${u.role === 'admin' ? 'btn-secondary' : 'btn-gold'}" onclick="Admin.toggleRole(${u.id}, '${u.role}')">${u.role === 'admin' ? 'Demote' : 'Promote'}</button>
                    <button class="btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-primary'}" onclick="Admin.toggleActive(${u.id})">${u.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button class="btn btn-sm btn-danger" onclick="Admin.deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    async toggleRole(userId, currentRole) {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        const confirmed = await Utils.confirm(`Change this user's role to ${newRole}?`);
        if (!confirmed) return;
        try {
            await Utils.api('PUT', `/api/admin/users/${userId}/role`, { role: newRole });
            Utils.toast('Role updated!', 'success');
            Admin.showUsers();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async toggleActive(userId) {
        try {
            await Utils.api('POST', `/api/admin/users/${userId}/toggle-active`);
            Utils.toast('Status updated!', 'success');
            Admin.showUsers();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async deleteUser(userId) {
        const confirmed = await Utils.confirm('Delete this user and all their contacts? This cannot be undone.');
        if (!confirmed) return;
        try {
            await Utils.api('DELETE', `/api/admin/users/${userId}/delete`);
            Utils.toast('User deleted', 'info');
            Admin.showUsers();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async showActivities() {
        Utils.showLoader(true);
        try {
            const [data, actions] = await Promise.all([
                Utils.api('GET', '/api/admin/activities'),
                Utils.api('GET', '/api/admin/activity-actions')
            ]);
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-history"></i> Audit Logs</h1><p class="subtitle">${data.total} activities</p></div>
                </div>
                <div class="toolbar">
                    <select id="actionFilter" style="padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--white);color:var(--text);font-family:var(--font)">
                        <option value="">All Actions</option>
                        ${actions.actions.map(a => `<option value="${a}">${a}</option>`).join('')}
                    </select>
                </div>
                <div class="card">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
                            <tbody>${data.activities.map(a => `
                                <tr>
                                    <td style="white-space:nowrap">${Utils.formatDateTime(a.created_at)}</td>
                                    <td>${Utils.escapeHtml(a.username || 'System')}</td>
                                    <td><span class="badge badge-blue">${Utils.escapeHtml(a.action)}</span></td>
                                    <td>${Utils.escapeHtml(a.entity_type || '')}${a.entity_id ? ` #${a.entity_id}` : ''}</td>
                                    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(a.details || '')}</td>
                                    <td style="font-size:0.8rem;color:var(--text-muted)">${a.ip_address || '—'}</td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                </div>
                <div class="pagination">${Utils.renderPagination(data.total, data.page, 30, 'Admin.showActivities')}</div>
            `);
            document.getElementById('actionFilter')?.addEventListener('change', function() {
                Admin.showActivitiesWithFilter(this.value);
            });
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showActivitiesWithFilter(action) {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', `/api/admin/activities?action=${encodeURIComponent(action)}`);
            document.querySelector('table tbody').innerHTML = data.activities.map(a => `
                <tr>
                    <td style="white-space:nowrap">${Utils.formatDateTime(a.created_at)}</td>
                    <td>${Utils.escapeHtml(a.username || 'System')}</td>
                    <td><span class="badge badge-blue">${Utils.escapeHtml(a.action)}</span></td>
                    <td>${Utils.escapeHtml(a.entity_type || '')}${a.entity_id ? ` #${a.entity_id}` : ''}</td>
                    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(a.details || '')}</td>
                    <td style="font-size:0.8rem;color:var(--text-muted)">${a.ip_address || '—'}</td>
                </tr>
            `).join('');
            document.querySelector('.pagination').innerHTML = Utils.renderPagination(data.total, data.page, 30, 'Admin.showActivities');
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showCategories() {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', '/api/categories');
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-tags"></i> Category Management</h1><p class="subtitle">${data.categories.length} categories</p></div>
                    <button class="btn btn-primary" onclick="Contacts.showAddCategoryModal()"><i class="fas fa-plus"></i> Add Category</button>
                </div>
                <div class="card">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>Name</th><th>Color</th><th>Contacts</th><th>Created</th><th>Actions</th></tr></thead>
                            <tbody>${data.categories.map(c => `
                                <tr>
                                    <td><strong>${Utils.escapeHtml(c.name)}</strong></td>
                                    <td><span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${c.color || '#10B981'};vertical-align:middle"></span></td>
                                    <td>${c.contact_count || 0}</td>
                                    <td>${Utils.formatDate(c.created_at)}</td>
                                    <td>
                                        <button class="btn btn-sm btn-secondary" onclick="Contacts.showEditCategoryModal(${c.id}, '${Utils.escapeHtml(c.name)}', '${c.color}')"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-sm btn-danger" onclick="Contacts.deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showBackups() {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', '/api/admin/backups');
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-database"></i> Backups</h1><p class="subtitle">Database backups</p></div>
                    <button class="btn btn-primary" onclick="Admin.createBackup()"><i class="fas fa-plus"></i> Create Backup</button>
                </div>
                <div class="card">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>Filename</th><th>Created By</th><th>Size</th><th>Records</th><th>Date</th><th>Actions</th></tr></thead>
                            <tbody>${data.backups && data.backups.length ? data.backups.map(b => `
                                <tr>
                                    <td>${Utils.escapeHtml(b.filename)}</td>
                                    <td>${Utils.escapeHtml(b.username || '—')}</td>
                                    <td>${b.size_bytes ? (b.size_bytes / 1024).toFixed(1) + ' KB' : '—'}</td>
                                    <td>${b.records_count || 0}</td>
                                    <td>${Utils.formatDateTime(b.created_at)}</td>
                                    <td><button class="btn btn-sm btn-secondary"><i class="fas fa-download"></i></button></td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No backups yet</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async createBackup() {
        Utils.showLoader(true);
        try {
            await Utils.api('POST', '/api/admin/backups/create');
            Utils.toast('Backup created successfully!', 'success');
            Admin.showBackups();
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showReports() {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', '/api/admin/reports/summary');
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-chart-bar"></i> Reports</h1><p class="subtitle">System analytics and statistics</p></div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-sm btn-secondary" onclick="Admin.showReportsPeriod('week')">Week</button>
                        <button class="btn btn-sm btn-primary" onclick="Admin.showReportsPeriod('month')">Month</button>
                        <button class="btn btn-sm btn-secondary" onclick="Admin.showReportsPeriod('year')">Year</button>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                    <div class="card">
                        <div class="card-header"><h2><i class="fas fa-chart-line"></i> Action Distribution</h2></div>
                        <div class="card-body">
                            ${data.action_counts.map(a => {
                                const maxCount = Math.max(...data.action_counts.map(x => x.count));
                                const pct = (a.count / maxCount) * 100;
                                return `<div style="margin-bottom:12px">
                                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.85rem">
                                        <span>${Utils.escapeHtml(a.action)}</span><strong>${a.count}</strong>
                                    </div>
                                    <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
                                        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),var(--primary-light));border-radius:4px;transition:width 0.5s"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h2><i class="fas fa-users"></i> Contacts per User</h2></div>
                        <div class="card-body">
                            ${data.user_contact_counts.map(u => `
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
                                    <span>${Utils.escapeHtml(u.full_name || u.username)}</span>
                                    <span class="badge badge-blue">${u.contact_count} contacts</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showReportsPeriod(period) {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', `/api/admin/reports/summary?period=${period}`);
            const html = data.action_counts.map(a => {
                const maxCount = Math.max(...data.action_counts.map(x => x.count), 1);
                const pct = (a.count / maxCount) * 100;
                return `<div style="margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.85rem">
                        <span>${Utils.escapeHtml(a.action)}</span><strong>${a.count}</strong>
                    </div>
                    <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
                        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),var(--primary-light));border-radius:4px"></div>
                    </div>
                </div>`;
            }).join('');
            const card = document.querySelectorAll('.card')[0];
            if (card) card.querySelector('.card-body').innerHTML = html;
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    }
};
