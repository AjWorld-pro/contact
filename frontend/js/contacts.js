const Contacts = {
    currentView: 'grid',
    currentFilters: {},

    async showDashboard() {
        Utils.showLoader(true);
        try {
            const [stats, recent, birthdays] = await Promise.all([
                Utils.api('GET', '/api/dashboard/stats'),
                Utils.api('GET', '/api/dashboard/recent'),
                Utils.api('GET', '/api/birthdays/upcoming?days=30')
            ]);
            const s = stats;
            const isBirthdayMonth = birthdays.birthdays && birthdays.birthdays.length > 0;

            Utils.showPageContent(`
                <div class="page-header">
                    <div>
                        <h1>Dashboard</h1>
                        <p class="subtitle">Welcome back, ${Utils.escapeHtml(Auth.currentUser?.full_name || 'User')}</p>
                    </div>
                    <button class="btn btn-primary" onclick="Contacts.showAddModal()"><i class="fas fa-plus"></i> Add Contact</button>
                </div>

                ${isBirthdayMonth ? `
                <div class="card" style="border-left:4px solid var(--gold);margin-bottom:16px">
                    <div class="card-body" style="display:flex;align-items:center;gap:12px">
                        <i class="fas fa-birthday-cake" style="font-size:1.5rem;color:var(--gold)"></i>
                        <div>
                            <strong>Upcoming Birthdays</strong>
                            <div style="font-size:0.8rem;color:var(--text-secondary)">
                                ${birthdays.birthdays.slice(0, 5).map(b =>
                                    `${Utils.escapeHtml(b.full_name)} (${b.days_until === 0 ? 'Today!' : `${b.days_until} days`})`
                                ).join(', ')}
                                ${birthdays.birthdays.length > 5 ? ` and ${birthdays.birthdays.length - 5} more` : ''}
                            </div>
                        </div>
                    </div>
                </div>` : ''}

                <div class="dashboard-grid">
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-users"></i></div>
                        <div class="stat-info"><h3>${s.total_contacts}</h3><p>Total Contacts</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon gold"><i class="fas fa-star"></i></div>
                        <div class="stat-info"><h3>${s.favorite_count}</h3><p>Favorites</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-calendar-alt"></i></div>
                        <div class="stat-info"><h3>${s.birthdays_month}</h3><p>Birthdays This Month</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-calendar-plus"></i></div>
                        <div class="stat-info"><h3>${s.added_this_month}</h3><p>Added This Month</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon red"><i class="fas fa-trash"></i></div>
                        <div class="stat-info"><h3>${s.trashed_count}</h3><p>In Trash</p></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-history"></i> Recently Updated</h2></div>
                    <div class="card-body">
                        ${recent.recent && recent.recent.length ? recent.recent.map(c => `
                            <div class="contact-card" onclick="Contacts.viewContact(${c.id})" style="margin-bottom:8px">
                                <div class="avatar" style="width:40px;height:40px;font-size:0.9rem">${Utils.getInitials(c.full_name)}</div>
                                <div class="info">
                                    <h3 style="font-size:0.9rem">${Utils.escapeHtml(c.full_name)} ${c.is_favorite ? '<i class="fas fa-star" style="color:var(--gold);font-size:0.7rem"></i>' : ''}</h3>
                                    <div class="subtitle">${c.email || c.phone || ''}</div>
                                </div>
                                <span style="font-size:0.75rem;color:var(--text-muted)">${Utils.formatDate(c.updated_at)}</span>
                            </div>
                        `).join('') : '<div class="empty-state"><i class="fas fa-address-book"></i><h3>No contacts yet</h3><p>Add your first contact to get started</p></div>'}
                    </div>
                </div>
            `);
        } catch (err) {
            Utils.toast(err.message, 'error');
        }
        Utils.showLoader(false);
    },

    async showContacts(params = {}) {
        Utils.showLoader(true);
        try {
            const page = params.page || 1;
            const search = params.search || '';
            const category = params.category || '';
            const favorite = params.favorite || '';
            const sort_by = params.sort_by || 'full_name';
            const sort_order = params.sort_order || 'asc';
            let url = `/api/contacts?page=${page}&sort_by=${sort_by}&sort_order=${sort_order}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (category) url += `&category=${category}`;
            if (favorite) url += `&favorite=1`;

            const [data, categories] = await Promise.all([
                Utils.api('GET', url),
                Utils.api('GET', '/api/categories')
            ]);

            Utils.showPageContent(`
                <div class="page-header">
                    <div>
                        <h1><i class="fas fa-users"></i> Contacts</h1>
                        <p class="subtitle">${data.total} contact${data.total !== 1 ? 's' : ''}</p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                        <div class="import-export-bar">
                            <button class="btn btn-sm btn-secondary" onclick="Contacts.exportContacts('csv')"><i class="fas fa-file-csv"></i> CSV</button>
                            <button class="btn btn-sm btn-secondary" onclick="Contacts.exportContacts('excel')"><i class="fas fa-file-excel"></i> Excel</button>
                            <button class="btn btn-sm btn-secondary" onclick="Contacts.exportContacts('pdf')"><i class="fas fa-file-pdf"></i> PDF</button>
                            <button class="btn btn-sm btn-secondary" onclick="Contacts.showImportModal()"><i class="fas fa-file-import"></i> Import</button>
                        </div>
                        <button class="btn btn-primary" onclick="Contacts.showAddModal()"><i class="fas fa-plus"></i> Add Contact</button>
                    </div>
                </div>

                <div class="toolbar">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="contactSearch" placeholder="Search contacts..." value="${Utils.escapeHtml(search)}">
                    </div>
                    <select id="categoryFilter" style="padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--white);color:var(--text);font-family:var(--font);font-size:0.875rem">
                        <option value="">All Categories</option>
                        ${categories.categories.map(c => `<option value="${c.id}" ${category == c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}
                    </select>
                    <div class="view-toggle">
                        <button class="${this.currentView === 'grid' ? 'active' : ''}" onclick="Contacts.setView('grid')"><i class="fas fa-th"></i></button>
                        <button class="${this.currentView === 'list' ? 'active' : ''}" onclick="Contacts.setView('list')"><i class="fas fa-list"></i></button>
                    </div>
                </div>

                <div class="filter-chips">
                    <button class="chip ${!favorite ? 'active' : ''}" onclick="Contacts.showContacts({})">All</button>
                    <button class="chip ${favorite ? 'active' : ''}" onclick="Contacts.showContacts({favorite: '1'})"><i class="fas fa-star"></i> Favorites</button>
                </div>

                ${data.total === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-address-book"></i>
                    <h3>No contacts found</h3>
                    <p>${search ? 'Try a different search term' : 'Add your first contact to get started'}</p>
                    <button class="btn btn-primary" style="margin-top:16px" onclick="Contacts.showAddModal()"><i class="fas fa-plus"></i> Add Contact</button>
                </div>` :
                (this.currentView === 'grid' ? `
                <div class="contact-grid">${data.contacts.map(c => this.renderContactCard(c)).join('')}</div>` : `
                <div class="card"><div class="table-wrapper"><table>
                    <thead><tr>
                        <th onclick="Contacts.sortContacts('full_name')">Name ${sort_by === 'full_name' ? (sort_order === 'asc' ? '▲' : '▼') : ''}</th>
                        <th>Contact Info</th>
                        <th onclick="Contacts.sortContacts('company')">Company ${sort_by === 'company' ? (sort_order === 'asc' ? '▲' : '▼') : ''}</th>
                        <th>Category</th>
                        <th onclick="Contacts.sortContacts('created_at')">Created ${sort_by === 'created_at' ? (sort_order === 'asc' ? '▲' : '▼') : ''}</th>
                        <th>Actions</th>
                    </tr></thead>
                    <tbody>${data.contacts.map(c => this.renderContactRow(c)).join('')}</tbody>
                </table></div></div>`)}
                <div class="pagination">${Utils.renderPagination(data.total, data.page, data.per_page, 'Contacts.showContacts')}</div>
            `);

            document.getElementById('contactSearch')?.addEventListener('input', Utils.debounce(function() {
                Contacts.showContacts({ search: this.value, category: document.getElementById('categoryFilter')?.value || '', page: 1 });
            }, 400));

            document.getElementById('categoryFilter')?.addEventListener('change', function() {
                Contacts.showContacts({ category: this.value, search: document.getElementById('contactSearch')?.value || '', page: 1 });
            });
        } catch (err) {
            Utils.toast(err.message, 'error');
        }
        Utils.showLoader(false);
    },

    renderContactCard(c) {
        const initials = Utils.getInitials(c.full_name);
        return `
            <div class="contact-card fade-in" onclick="Contacts.viewContact(${c.id})">
                <button class="favorite-btn ${c.is_favorite ? 'active' : ''}" onclick="event.stopPropagation();Contacts.toggleFavorite(${c.id})">
                    <i class="fas ${c.is_favorite ? 'fa-star' : 'fa-star'}"></i>
                </button>
                <div class="avatar">${c.profile_picture ? `<img src="${Utils.getAvatarUrl(c.profile_picture)}">` : initials}</div>
                <div class="info">
                    <h3>${Utils.escapeHtml(c.full_name)}</h3>
                    <div class="subtitle">${c.job_title ? Utils.escapeHtml(c.job_title) : ''}${c.company && c.job_title ? ' at ' : ''}${c.company ? Utils.escapeHtml(c.company) : ''}</div>
                    <div class="detail"><i class="fas fa-phone" style="width:14px"></i> ${c.phone || '—'}</div>
                    <div class="detail"><i class="fas fa-envelope" style="width:14px"></i> ${c.email || '—'}</div>
                    ${c.category_name ? `<span class="category-badge" style="background:${c.category_color || '#10B981'}20;color:${c.category_color || '#10B981'}">${Utils.escapeHtml(c.category_name)}</span>` : ''}
                </div>
            </div>`;
    },

    renderContactRow(c) {
        return `<tr onclick="Contacts.viewContact(${c.id})" style="cursor:pointer">
            <td><strong>${Utils.escapeHtml(c.full_name)}</strong> ${c.is_favorite ? '<i class="fas fa-star" style="color:var(--gold);font-size:0.7rem"></i>' : ''}</td>
            <td>${c.email || ''}<br><small style="color:var(--text-muted)">${c.phone || ''}</small></td>
            <td>${c.company || '—'}</td>
            <td>${c.category_name ? `<span class="badge" style="background:${c.category_color}20;color:${c.category_color}">${c.category_name}</span>` : '—'}</td>
            <td>${Utils.formatDate(c.created_at)}</td>
            <td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();Contacts.toggleFavorite(${c.id})"><i class="fas ${c.is_favorite ? 'fa-star' : 'fa-star'}"></i></button></td>
        </tr>`;
    },

    setView(view) { this.currentView = view; this.showContacts(this.currentFilters); },

    sortContacts(field) {
        const params = { ...this.currentFilters };
        if (params.sort_by === field) params.sort_order = params.sort_order === 'asc' ? 'desc' : 'asc';
        else { params.sort_by = field; params.sort_order = 'asc'; }
        this.showContacts(params);
    },

    async viewContact(id) {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', `/api/contacts/${id}`);
            const c = data.contact;
            Utils.openModal(`
                <div class="modal-header">
                    <h2><i class="fas fa-user"></i> Contact Details</h2>
                    <button class="modal-close" onclick="Utils.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
                        <div class="avatar" style="width:64px;height:64px;font-size:1.4rem">${c.profile_picture ? `<img src="${Utils.getAvatarUrl(c.profile_picture)}">` : Utils.getInitials(c.full_name)}</div>
                        <div>
                            <h3 style="font-size:1.2rem">${Utils.escapeHtml(c.full_name)} ${c.is_favorite ? '<i class="fas fa-star" style="color:var(--gold)"></i>' : ''}</h3>
                            ${c.category_name ? `<span class="category-badge" style="background:${c.category_color}20;color:${c.category_color}">${Utils.escapeHtml(c.category_name)}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:grid;gap:12px">
                        ${c.phone ? `<div><i class="fas fa-phone" style="color:var(--primary);width:20px"></i> ${Utils.escapeHtml(c.phone)}</div>` : ''}
                        ${c.email ? `<div><i class="fas fa-envelope" style="color:var(--primary);width:20px"></i> ${Utils.escapeHtml(c.email)}</div>` : ''}
                        ${c.address ? `<div><i class="fas fa-map-marker-alt" style="color:var(--primary);width:20px"></i> ${Utils.escapeHtml(c.address)}</div>` : ''}
                        ${c.company ? `<div><i class="fas fa-building" style="color:var(--primary);width:20px"></i> ${Utils.escapeHtml(c.company)}${c.job_title ? ` — ${Utils.escapeHtml(c.job_title)}` : ''}</div>` : ''}
                        ${c.birthday ? `<div><i class="fas fa-birthday-cake" style="color:var(--gold);width:20px"></i> ${Utils.formatDate(c.birthday)}</div>` : ''}
                        ${c.notes ? `<div style="margin-top:8px;padding:12px;background:var(--bg);border-radius:var(--radius-sm)"><small style="color:var(--text-muted)">Notes:</small><br>${Utils.escapeHtml(c.notes)}</div>` : ''}
                    </div>
                    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:0.8rem;color:var(--text-muted)">
                        <span>Created: ${Utils.formatDateTime(c.created_at)}</span> &middot;
                        <span>Updated: ${Utils.formatDateTime(c.updated_at)}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="Utils.closeModal();Contacts.showEditModal(${c.id})"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn btn-danger" onclick="Utils.closeModal();Contacts.deleteContact(${c.id})"><i class="fas fa-trash"></i> Delete</button>
                </div>
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async showAddModal() {
        const cats = await Utils.api('GET', '/api/categories');
        Utils.openModal(`
            <div class="modal-header">
                <h2><i class="fas fa-plus-circle"></i> Add Contact</h2>
                <button class="modal-close" onclick="Utils.closeModal()">&times;</button>
            </div>
            <form id="contactForm">
                <div class="modal-body">
                    <div class="form-group"><label>Full Name *</label><input type="text" name="full_name" required></div>
                    <div class="form-row">
                        <div class="form-group"><label>Phone</label><input type="text" name="phone"></div>
                        <div class="form-group"><label>Email</label><input type="email" name="email"></div>
                    </div>
                    <div class="form-group"><label>Address</label><textarea name="address" rows="2"></textarea></div>
                    <div class="form-row">
                        <div class="form-group"><label>Company</label><input type="text" name="company"></div>
                        <div class="form-group"><label>Job Title</label><input type="text" name="job_title"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Category</label><select name="category_id"><option value="">None</option>${cats.categories.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join('')}</select></div>
                        <div class="form-group"><label>Birthday</label><input type="date" name="birthday"></div>
                    </div>
                    <div class="form-group"><label>Notes</label><textarea name="notes" rows="3"></textarea></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Contact</button>
                </div>
            </form>
        `);
        document.getElementById('contactForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('POST', '/api/contacts', Object.fromEntries(fd));
                Utils.closeModal();
                Utils.toast('Contact created!', 'success');
                Contacts.showContacts();
            } catch (err) { Utils.toast(err.message, 'error'); }
        });
    },

    async showEditModal(id) {
        const [data, cats] = await Promise.all([
            Utils.api('GET', `/api/contacts/${id}`),
            Utils.api('GET', '/api/categories')
        ]);
        const c = data.contact;
        Utils.openModal(`
            <div class="modal-header">
                <h2><i class="fas fa-edit"></i> Edit Contact</h2>
                <button class="modal-close" onclick="Utils.closeModal()">&times;</button>
            </div>
            <form id="contactForm">
                <div class="modal-body">
                    <div class="form-group"><label>Full Name *</label><input type="text" name="full_name" value="${Utils.escapeHtml(c.full_name)}" required></div>
                    <div class="form-row">
                        <div class="form-group"><label>Phone</label><input type="text" name="phone" value="${Utils.escapeHtml(c.phone || '')}"></div>
                        <div class="form-group"><label>Email</label><input type="email" name="email" value="${Utils.escapeHtml(c.email || '')}"></div>
                    </div>
                    <div class="form-group"><label>Address</label><textarea name="address" rows="2">${Utils.escapeHtml(c.address || '')}</textarea></div>
                    <div class="form-row">
                        <div class="form-group"><label>Company</label><input type="text" name="company" value="${Utils.escapeHtml(c.company || '')}"></div>
                        <div class="form-group"><label>Job Title</label><input type="text" name="job_title" value="${Utils.escapeHtml(c.job_title || '')}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Category</label><select name="category_id"><option value="">None</option>${cats.categories.map(cat => `<option value="${cat.id}" ${cat.id === c.category_id ? 'selected' : ''}>${Utils.escapeHtml(cat.name)}</option>`).join('')}</select></div>
                        <div class="form-group"><label>Birthday</label><input type="date" name="birthday" value="${c.birthday || ''}"></div>
                    </div>
                    <div class="form-group"><label>Notes</label><textarea name="notes" rows="3">${Utils.escapeHtml(c.notes || '')}</textarea></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update Contact</button>
                </div>
            </form>
        `);
        document.getElementById('contactForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('PUT', `/api/contacts/${id}`, Object.fromEntries(fd));
                Utils.closeModal();
                Utils.toast('Contact updated!', 'success');
                Contacts.showContacts();
            } catch (err) { Utils.toast(err.message, 'error'); }
        });
    },

    async toggleFavorite(id) {
        try {
            await Utils.api('POST', `/api/contacts/${id}/favorite`);
            Contacts.showContacts();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async deleteContact(id) {
        const confirmed = await Utils.confirm('Move this contact to trash?');
        if (!confirmed) return;
        try {
            await Utils.api('DELETE', `/api/contacts/${id}`);
            Utils.toast('Contact moved to trash', 'success');
            Utils.closeModal();
            Contacts.showContacts();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async showTrash() {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', '/api/contacts?trashed=1&per_page=100');
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-trash"></i> Trash</h1><p class="subtitle">${data.total} deleted contact${data.total !== 1 ? 's' : ''}</p></div>
                </div>
                ${data.total === 0 ? `
                <div class="empty-state"><i class="fas fa-trash"></i><h3>Trash is empty</h3></div>` : `
                <div class="card"><div class="table-wrapper"><table>
                    <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Deleted</th><th>Actions</th></tr></thead>
                    <tbody>${data.contacts.map(c => `
                        <tr>
                            <td><strong>${Utils.escapeHtml(c.full_name)}</strong></td>
                            <td>${c.email || '—'}</td>
                            <td>${c.phone || '—'}</td>
                            <td>${Utils.formatDateTime(c.deleted_at)}</td>
                            <td>
                                <button class="btn btn-sm btn-primary" onclick="Contacts.restoreContact(${c.id})"><i class="fas fa-undo"></i> Restore</button>
                                <button class="btn btn-sm btn-danger" onclick="Contacts.permanentDelete(${c.id})"><i class="fas fa-times"></i> Delete</button>
                            </td>
                        </tr>`).join('')}</tbody>
                </table></div></div>`}
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    async restoreContact(id) {
        try {
            await Utils.api('POST', `/api/contacts/${id}/restore`);
            Utils.toast('Contact restored!', 'success');
            Contacts.showTrash();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async permanentDelete(id) {
        const confirmed = await Utils.confirm('Permanently delete this contact? This cannot be undone.');
        if (!confirmed) return;
        try {
            await Utils.api('DELETE', `/api/contacts/${id}/hard-delete`);
            Utils.toast('Contact permanently deleted', 'info');
            Contacts.showTrash();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    async showCategories() {
        Utils.showLoader(true);
        try {
            const data = await Utils.api('GET', '/api/categories');
            Utils.showPageContent(`
                <div class="page-header">
                    <div><h1><i class="fas fa-tags"></i> Categories</h1><p class="subtitle">${data.categories.length} categories</p></div>
                    <button class="btn btn-primary" onclick="Contacts.showAddCategoryModal()"><i class="fas fa-plus"></i> Add Category</button>
                </div>
                <div class="card">
                    <div class="card-body">
                        ${data.categories.length === 0 ? '<div class="empty-state"><i class="fas fa-tags"></i><h3>No categories</h3></div>' : `
                        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
                            ${data.categories.map(c => `
                                <div style="padding:16px;border:1px solid var(--border);border-radius:var(--radius);display:flex;align-items:center;gap:12px;border-left:4px solid ${c.color || '#10B981'}">
                                    <div style="flex:1">
                                        <strong>${Utils.escapeHtml(c.name)}</strong>
                                        <div style="font-size:0.8rem;color:var(--text-muted)">${c.contact_count || 0} contacts</div>
                                    </div>
                                    <button class="btn btn-sm btn-secondary" onclick="Contacts.showEditCategoryModal(${c.id}, '${Utils.escapeHtml(c.name)}', '${c.color}')"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-danger" onclick="Contacts.deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
                                </div>
                            `).join('')}
                        </div>`}
                    </div>
                </div>
            `);
        } catch (err) { Utils.toast(err.message, 'error'); }
        Utils.showLoader(false);
    },

    showAddCategoryModal() {
        Utils.openModal(`
            <div class="modal-header"><h2>Add Category</h2><button class="modal-close" onclick="Utils.closeModal()">&times;</button></div>
            <form id="categoryForm">
                <div class="modal-body">
                    <div class="form-group"><label>Name</label><input type="text" name="name" required></div>
                    <div class="form-group"><label>Color</label><input type="color" name="color" value="#10B981"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create</button>
                </div>
            </form>
        `);
        document.getElementById('categoryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('POST', '/api/categories', Object.fromEntries(fd));
                Utils.closeModal(); Utils.toast('Category created!', 'success');
                Contacts.showCategories();
            } catch (err) { Utils.toast(err.message, 'error'); }
        });
    },

    showEditCategoryModal(id, name, color) {
        Utils.openModal(`
            <div class="modal-header"><h2>Edit Category</h2><button class="modal-close" onclick="Utils.closeModal()">&times;</button></div>
            <form id="categoryForm">
                <div class="modal-body">
                    <div class="form-group"><label>Name</label><input type="text" name="name" value="${name}" required></div>
                    <div class="form-group"><label>Color</label><input type="color" name="color" value="${color || '#10B981'}"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Update</button>
                </div>
            </form>
        `);
        document.getElementById('categoryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await Utils.api('PUT', `/api/categories/${id}`, Object.fromEntries(fd));
                Utils.closeModal(); Utils.toast('Category updated!', 'success');
                Contacts.showCategories();
            } catch (err) { Utils.toast(err.message, 'error'); }
        });
    },

    async deleteCategory(id) {
        const confirmed = await Utils.confirm('Delete this category? Contacts in this category will be uncategorized.');
        if (!confirmed) return;
        try {
            await Utils.api('DELETE', `/api/categories/${id}`);
            Utils.toast('Category deleted', 'info');
            Contacts.showCategories();
        } catch (err) { Utils.toast(err.message, 'error'); }
    },

    exportContacts(fmt) {
        const url = `/api/contacts/export/${fmt}`;
        window.open(url, '_blank');
    },

    showImportModal() {
        Utils.openModal(`
            <div class="modal-header"><h2><i class="fas fa-file-import"></i> Import Contacts</h2><button class="modal-close" onclick="Utils.closeModal()">&times;</button></div>
            <div class="modal-body">
                <p style="margin-bottom:16px;font-size:0.875rem;color:var(--text-secondary)">
                    Upload a CSV file with columns: Full Name, Phone, Email, Address, Company, Job Title, Category, Birthday, Notes, Favorite
                </p>
                <div class="dropzone" id="importDropzone">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Drop CSV file here or click to browse</p>
                </div>
                <div id="importResults" style="margin-top:16px"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="Utils.closeModal()">Close</button>
            </div>
        `);
        const dropzone = document.getElementById('importDropzone');
        dropzone.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.csv';
            input.onchange = () => Contacts.doImport(input.files[0]);
            input.click();
        });
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; });
        dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = ''; });
        dropzone.addEventListener('drop', (e) => { e.preventDefault(); Contacts.doImport(e.dataTransfer.files[0]); });
    },

    async doImport(file) {
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        document.getElementById('importResults').innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Importing...</p>';
        try {
            const data = await Utils.api('POST', '/api/contacts/import', fd, true);
            let html = `<div style="padding:12px;border-radius:var(--radius-sm);background:var(--success-bg);color:var(--success)"><i class="fas fa-check-circle"></i> ${data.imported} contacts imported</div>`;
            if (data.errors && data.errors.length) {
                html += `<div style="margin-top:8px;max-height:200px;overflow-y:auto;font-size:0.8rem;color:var(--danger)">${data.errors.slice(0, 20).map(e => `<div>${Utils.escapeHtml(e)}</div>`).join('')}</div>`;
            }
            document.getElementById('importResults').innerHTML = html;
            setTimeout(() => Utils.closeModal(), 3000);
            Contacts.showContacts();
        } catch (err) {
            document.getElementById('importResults').innerHTML = `<div style="padding:12px;border-radius:var(--radius-sm);background:var(--danger-bg);color:var(--danger)"><i class="fas fa-exclamation-circle"></i> ${Utils.escapeHtml(err.message)}</div>`;
        }
    }
};
