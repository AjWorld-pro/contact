import os
import json
import csv
import io
from datetime import datetime, timedelta, date
from functools import wraps
from hashlib import sha256
import secrets
import bcrypt
from flask import Flask, jsonify, request, session, send_file, make_response
from flask_cors import CORS
from backend.config import Config
from backend import utils

app = Flask(__name__, static_folder='../frontend', static_url_path='')
app.config.from_object(Config)
app.secret_key = Config.SECRET_KEY
CORS(app, supports_credentials=True)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        conn = utils.get_db()
        cur = conn.cursor()
        cur.execute("SELECT role FROM users WHERE id = ?", [session['user_id']])
        user = cur.fetchone()
        cur.close()
        conn.close()
        if not user or user['role'] != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated

# ===================== AUTH ROUTES =====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip()
    if not all([username, email, password, full_name]):
        return jsonify({'error': 'All fields are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if not utils.validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username = ? OR email = ?", [username, email])
    if cur.fetchone():
        cur.close(); conn.close()
        return jsonify({'error': 'Username or email already exists'}), 409
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    cur.execute("""INSERT INTO users (username, email, password_hash, full_name, role)
        VALUES (?, ?, ?, ?, 'user')""",
        [username, email, password_hash, full_name])
    conn.commit()
    user_id = cur.lastrowid
    utils.log_activity(conn, user_id, 'register', 'user', user_id, 'User registered', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Registration successful'}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ? OR email = ?", [username, username])
    user = cur.fetchone()
    if not user or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        cur.close(); conn.close()
        return jsonify({'error': 'Invalid credentials'}), 401
    if not user['is_active']:
        cur.close(); conn.close()
        return jsonify({'error': 'Account is deactivated'}), 403
    cur.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user['id']])
    conn.commit()
    session['user_id'] = user['id']
    session['role'] = user['role']
    session['username'] = user['username']
    utils.log_activity(conn, user['id'], 'login', 'user', user['id'], 'User logged in', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({
        'message': 'Login successful',
        'user': {
            'id': user['id'], 'username': user['username'], 'email': user['email'],
            'full_name': user['full_name'], 'role': user['role'],
            'profile_picture': user['profile_picture']
        }
    })

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    conn = utils.get_db()
    utils.log_activity(conn, session['user_id'], 'logout', 'user', session['user_id'], 'User logged out', utils.get_client_ip(request))
    conn.close()
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

@app.route('/api/auth/me', methods=['GET'])
@login_required
def get_current_user():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, username, email, full_name, role, profile_picture, is_active, email_verified, last_login, created_at FROM users WHERE id = ?", [session['user_id']])
    user = cur.fetchone()
    cur.close(); conn.close()
    if not user:
        session.clear()
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': dict(user)})

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({'error': 'Email is required'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email = ?", [email])
    user = cur.fetchone()
    if user:
        token = secrets.token_urlsafe(48)
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        cur.execute("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)",
                    [user['id'], token, expires])
        conn.commit()
    cur.close(); conn.close()
    return jsonify({'message': 'If the email exists, a reset link has been sent'})

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    token = data.get('token', '')
    password = data.get('password', '')
    if not token or not password:
        return jsonify({'error': 'Token and password required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')", [token])
    reset = cur.fetchone()
    if not reset:
        cur.close(); conn.close()
        return jsonify({'error': 'Invalid or expired token'}), 400
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", [password_hash, reset['user_id']])
    cur.execute("UPDATE password_resets SET used = 1 WHERE id = ?", [reset['id']])
    conn.commit()
    utils.log_activity(conn, reset['user_id'], 'password_reset', 'user', reset['user_id'], 'Password reset completed', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Password reset successful'})

@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    current = data.get('current_password', '')
    new_password = data.get('new_password', '')
    if not current or not new_password:
        return jsonify({'error': 'Both passwords are required'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT password_hash FROM users WHERE id = ?", [session['user_id']])
    user = cur.fetchone()
    if not bcrypt.checkpw(current.encode(), user['password_hash'].encode()):
        cur.close(); conn.close()
        return jsonify({'error': 'Current password is incorrect'}), 400
    password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", [password_hash, session['user_id']])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'change_password', 'user', session['user_id'], 'Password changed', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Password changed successfully'})

# ===================== CONTACT ROUTES =====================

@app.route('/api/contacts', methods=['GET'])
@login_required
def get_contacts():
    conn = utils.get_db()
    cur = conn.cursor()
    user_id = session['user_id']
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', Config.PAGINATION_PER_PAGE, type=int)
    search = request.args.get('search', '').strip()
    category = request.args.get('category', type=int)
    favorite = request.args.get('favorite', type=int)
    sort_by = request.args.get('sort_by', 'full_name')
    sort_order = request.args.get('sort_order', 'asc')
    trashed = request.args.get('trashed', '0')
    allowed_sort = {'full_name', 'created_at', 'updated_at', 'company', 'email'}
    if sort_by not in allowed_sort:
        sort_by = 'full_name'
    sort_dir = 'ASC' if sort_order.lower() == 'asc' else 'DESC'
    if session.get('role') == 'admin' and request.args.get('user_id'):
        user_id = request.args.get('user_id', type=int)
    base_query = "FROM contacts c LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.user_id = ?"
    params = [user_id]
    if trashed == '1':
        base_query += " AND c.is_deleted = 1"
    else:
        base_query += " AND c.is_deleted = 0"
    if search:
        base_query += " AND (c.full_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.company LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s])
    if category:
        base_query += " AND c.category_id = ?"
        params.append(category)
    if favorite is not None:
        base_query += " AND c.is_favorite = ?"
        params.append(favorite)
    cur.execute(f"SELECT COUNT(*) as total {base_query}", params)
    total = cur.fetchone()['total']
    offset = (page - 1) * per_page
    cur.execute(f"""SELECT c.*, cat.name as category_name, cat.color as category_color
        {base_query} ORDER BY c.{sort_by} {sort_dir}, c.id DESC LIMIT ? OFFSET ?""",
        params + [per_page, offset])
    contacts = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'contacts': contacts, 'total': total, 'page': page, 'per_page': per_page})

@app.route('/api/contacts', methods=['POST'])
@login_required
def create_contact():
    data = request.get_json()
    full_name = data.get('full_name', '').strip()
    if not full_name:
        return jsonify({'error': 'Full name is required'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    dup = utils.check_duplicate_contact(conn, session['user_id'], full_name,
                                        data.get('phone'), data.get('email'))
    if dup:
        cur.close(); conn.close()
        return jsonify({'error': 'Duplicate contact detected', 'duplicate_id': dup['id']}), 409
    cur.execute("""INSERT INTO contacts (user_id, full_name, phone, email, address,
        company, job_title, category_id, birthday, notes, is_favorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [session['user_id'], full_name, data.get('phone'), data.get('email'),
         data.get('address'), data.get('company'), data.get('job_title'),
         data.get('category_id'),
         data.get('birthday') if data.get('birthday') else None,
         data.get('notes'), data.get('is_favorite', 0)])
    conn.commit()
    contact_id = cur.lastrowid
    utils.log_activity(conn, session['user_id'], 'create', 'contact', contact_id,
                       f'Created contact: {full_name}', utils.get_client_ip(request))
    cur.execute("SELECT c.*, cat.name as category_name, cat.color as category_color FROM contacts c LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.id = ?", [contact_id])
    contact = dict(cur.fetchone())
    cur.close(); conn.close()
    return jsonify({'message': 'Contact created', 'contact': contact}), 201

@app.route('/api/contacts/<int:contact_id>', methods=['GET'])
@login_required
def get_contact(contact_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("""SELECT c.*, cat.name as category_name, cat.color as category_color
        FROM contacts c LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.id = ?""", [contact_id])
    contact = cur.fetchone()
    cur.close(); conn.close()
    if not contact:
        return jsonify({'error': 'Contact not found'}), 404
    if contact['user_id'] != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    return jsonify({'contact': dict(contact)})

@app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
@login_required
def update_contact(contact_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM contacts WHERE id = ?", [contact_id])
    contact = cur.fetchone()
    if not contact:
        cur.close(); conn.close()
        return jsonify({'error': 'Contact not found'}), 404
    if contact['user_id'] != session['user_id'] and session.get('role') != 'admin':
        cur.close(); conn.close()
        return jsonify({'error': 'Access denied'}), 403
    data = request.get_json()
    full_name = data.get('full_name', '').strip() or contact['full_name']
    dup = utils.check_duplicate_contact(conn, session['user_id'], full_name,
                                        data.get('phone', contact['phone']),
                                        data.get('email', contact['email']),
                                        contact_id)
    if dup:
        cur.close(); conn.close()
        return jsonify({'error': 'Duplicate contact detected', 'duplicate_id': dup['id']}), 409
    cur.execute("""UPDATE contacts SET full_name=?, phone=?, email=?, address=?,
        company=?, job_title=?, category_id=?, birthday=?, notes=?, is_favorite=?,
        updated_at=datetime('now') WHERE id=?""",
        [full_name, data.get('phone', contact['phone']),
         data.get('email', contact['email']),
         data.get('address', contact['address']),
         data.get('company', contact['company']),
         data.get('job_title', contact['job_title']),
         data.get('category_id', contact['category_id']),
         data.get('birthday') if data.get('birthday') else contact['birthday'],
         data.get('notes', contact['notes']),
         data.get('is_favorite', contact['is_favorite']),
         contact_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'update', 'contact', contact_id,
                       f'Updated contact: {full_name}', utils.get_client_ip(request))
    cur.execute("SELECT c.*, cat.name as category_name, cat.color as category_color FROM contacts c LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.id = ?", [contact_id])
    updated = dict(cur.fetchone())
    cur.close(); conn.close()
    return jsonify({'message': 'Contact updated', 'contact': updated})

@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
@login_required
def delete_contact(contact_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM contacts WHERE id = ?", [contact_id])
    contact = cur.fetchone()
    if not contact:
        cur.close(); conn.close()
        return jsonify({'error': 'Contact not found'}), 404
    if contact['user_id'] != session['user_id'] and session.get('role') != 'admin':
        cur.close(); conn.close()
        return jsonify({'error': 'Access denied'}), 403
    cur.execute("UPDATE contacts SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ?", [contact_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'soft_delete', 'contact', contact_id,
                       f'Moved contact to trash: {contact["full_name"]}', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Contact moved to trash'})

@app.route('/api/contacts/<int:contact_id>/restore', methods=['POST'])
@login_required
def restore_contact(contact_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM contacts WHERE id = ? AND is_deleted = 1", [contact_id])
    contact = cur.fetchone()
    if not contact:
        cur.close(); conn.close()
        return jsonify({'error': 'Contact not found in trash'}), 404
    if contact['user_id'] != session['user_id'] and session.get('role') != 'admin':
        cur.close(); conn.close()
        return jsonify({'error': 'Access denied'}), 403
    cur.execute("UPDATE contacts SET is_deleted = 0, deleted_at = NULL WHERE id = ?", [contact_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'restore', 'contact', contact_id,
                       f'Restored contact: {contact["full_name"]}', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Contact restored'})

@app.route('/api/contacts/<int:contact_id>/hard-delete', methods=['DELETE'])
@login_required
def hard_delete_contact(contact_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM contacts WHERE id = ?", [contact_id])
    contact = cur.fetchone()
    if not contact:
        cur.close(); conn.close()
        return jsonify({'error': 'Contact not found'}), 404
    if contact['user_id'] != session['user_id'] and session.get('role') != 'admin':
        cur.close(); conn.close()
        return jsonify({'error': 'Access denied'}), 403
    cur.execute("DELETE FROM contacts WHERE id = ?", [contact_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'hard_delete', 'contact', contact_id,
                       f'Permanently deleted contact: {contact["full_name"]}', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Contact permanently deleted'})

@app.route('/api/contacts/<int:contact_id>/favorite', methods=['POST'])
@login_required
def toggle_favorite(contact_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT is_favorite FROM contacts WHERE id = ?", [contact_id])
    contact = cur.fetchone()
    if not contact:
        cur.close(); conn.close()
        return jsonify({'error': 'Contact not found'}), 404
    new_val = 0 if contact['is_favorite'] else 1
    cur.execute("UPDATE contacts SET is_favorite = ? WHERE id = ?", [new_val, contact_id])
    conn.commit()
    cur.close(); conn.close()
    return jsonify({'message': 'Favorite updated', 'is_favorite': new_val})

# ===================== CATEGORY ROUTES =====================

@app.route('/api/categories', methods=['GET'])
@login_required
def get_categories():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT c.*, (SELECT COUNT(*) FROM contacts WHERE category_id = c.id AND is_deleted = 0) as contact_count FROM categories c ORDER BY c.name")
    categories = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'categories': categories})

@app.route('/api/categories', methods=['POST'])
@login_required
def create_category():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Category name is required'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM categories WHERE name = ?", [name])
    if cur.fetchone():
        cur.close(); conn.close()
        return jsonify({'error': 'Category already exists'}), 409
    cur.execute("INSERT INTO categories (name, color, icon, created_by) VALUES (?, ?, ?, ?)",
                [name, data.get('color', '#10B981'), data.get('icon', 'folder'), session['user_id']])
    conn.commit()
    cat_id = cur.lastrowid
    utils.log_activity(conn, session['user_id'], 'create', 'category', cat_id, f'Created category: {name}', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Category created', 'id': cat_id}), 201

@app.route('/api/categories/<int:cat_id>', methods=['PUT'])
@login_required
def update_category(cat_id):
    data = request.get_json()
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("UPDATE categories SET name=?, color=?, icon=? WHERE id=?",
                [data.get('name'), data.get('color'), data.get('icon'), cat_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'update', 'category', cat_id, f'Updated category', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Category updated'})

@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
@login_required
def delete_category(cat_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("UPDATE contacts SET category_id = NULL WHERE category_id = ?", [cat_id])
    cur.execute("DELETE FROM categories WHERE id = ?", [cat_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'delete', 'category', cat_id, f'Deleted category', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Category deleted'})

# ===================== IMPORT/EXPORT =====================

@app.route('/api/contacts/export/<fmt>', methods=['GET'])
@login_required
def export_contacts(fmt):
    conn = utils.get_db()
    cur = conn.cursor()
    user_id = session['user_id']
    if session.get('role') == 'admin' and request.args.get('user_id'):
        user_id = int(request.args.get('user_id'))
    cur.execute("""SELECT c.*, cat.name as category_name FROM contacts c
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.user_id = ? AND c.is_deleted = 0 ORDER BY c.full_name""", [user_id])
    contacts = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    if fmt == 'csv':
        csv_data = utils.export_to_csv(contacts)
        output = make_response(csv_data)
        output.headers['Content-Type'] = 'text/csv'
        output.headers['Content-Disposition'] = f'attachment; filename=contacts_{datetime.now().strftime("%Y%m%d")}.csv'
        return output
    elif fmt == 'excel':
        excel_data = utils.export_to_excel(contacts)
        output = make_response(excel_data)
        output.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        output.headers['Content-Disposition'] = f'attachment; filename=contacts_{datetime.now().strftime("%Y%m%d")}.xlsx'
        return output
    elif fmt == 'pdf':
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        title = Paragraph("Contacts Report", styles['Title'])
        elements.append(title)
        data = [['Name', 'Phone', 'Email', 'Company', 'Category']]
        for c in contacts:
            data.append([c['full_name'], c.get('phone') or '', c.get('email') or '',
                        c.get('company') or '', c.get('category_name') or ''])
        table = Table(data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.06, 0.73, 0.51)),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(table)
        doc.build(elements)
        buf.seek(0)
        output = make_response(buf.getvalue())
        output.headers['Content-Type'] = 'application/pdf'
        output.headers['Content-Disposition'] = f'attachment; filename=contacts_{datetime.now().strftime("%Y%m%d")}.pdf'
        return output
    return jsonify({'error': 'Unsupported format'}), 400

@app.route('/api/contacts/import', methods=['POST'])
@login_required
def import_contacts():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'Only CSV files supported for import'}), 400
    conn = utils.get_db()
    imported, errors = utils.import_from_csv(file, session['user_id'], conn)
    utils.log_activity(conn, session['user_id'], 'import', 'contact', None,
                       f'Imported {imported} contacts', utils.get_client_ip(request))
    conn.close()
    return jsonify({'imported': imported, 'errors': errors, 'total_errors': len(errors)})

# ===================== PROFILE =====================

@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    data = request.get_json()
    conn = utils.get_db()
    cur = conn.cursor()
    full_name = data.get('full_name', '').strip()
    email = data.get('email', '').strip().lower()
    if not full_name or not email:
        cur.close(); conn.close()
        return jsonify({'error': 'Name and email are required'}), 400
    if not utils.validate_email(email):
        cur.close(); conn.close()
        return jsonify({'error': 'Invalid email'}), 400
    cur.execute("SELECT id FROM users WHERE email = ? AND id != ?", [email, session['user_id']])
    if cur.fetchone():
        cur.close(); conn.close()
        return jsonify({'error': 'Email already in use'}), 409
    cur.execute("UPDATE users SET full_name=?, email=?, updated_at=datetime('now') WHERE id=?", [full_name, email, session['user_id']])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'update_profile', 'user', session['user_id'], 'Profile updated', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Profile updated'})

@app.route('/api/profile/picture', methods=['POST'])
@login_required
def upload_profile_picture():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    filename = utils.save_profile_picture(file, session['user_id'])
    if not filename:
        return jsonify({'error': 'Invalid file type'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET profile_picture = ? WHERE id = ?", [filename, session['user_id']])
    conn.commit()
    cur.close(); conn.close()
    return jsonify({'message': 'Picture uploaded', 'filename': filename})

@app.route('/api/contacts/<int:contact_id>/picture', methods=['POST'])
@login_required
def upload_contact_picture(contact_id):
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    filename = utils.save_contact_picture(file, contact_id)
    if not filename:
        return jsonify({'error': 'Invalid file type'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("UPDATE contacts SET profile_picture = ? WHERE id = ?", [filename, contact_id])
    conn.commit()
    cur.close(); conn.close()
    return jsonify({'message': 'Picture uploaded', 'filename': filename})

@app.route('/uploads/profiles/<filename>')
def serve_profile(filename):
    return send_file(os.path.join(Config.PROFILE_FOLDER, filename))

# ===================== ADMIN ROUTES =====================

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as total FROM users")
    total_users = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE is_deleted = 0")
    total_contacts = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE is_deleted = 1")
    trashed_contacts = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE is_favorite = 1 AND is_deleted = 0")
    favorite_contacts = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM activity_logs")
    total_activities = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM users WHERE created_at >= datetime('now', '-30 days')")
    new_users_30d = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE created_at >= datetime('now', '-30 days') AND is_deleted = 0")
    new_contacts_30d = cur.fetchone()['total']
    cur.execute("""SELECT COUNT(*) as total FROM contacts
        WHERE is_deleted = 0 AND birthday IS NOT NULL
        AND strftime('%m-%d', birthday) = strftime('%m-%d', 'now')""")
    birthdays_today = cur.fetchone()['total']
    cur.execute("""SELECT COUNT(*) as total FROM contacts
        WHERE is_deleted = 0 AND birthday IS NOT NULL
        AND strftime('%m', birthday) = strftime('%m', 'now')""")
    birthdays_this_month = cur.fetchone()['total']
    cur.execute("""SELECT cat.name, COUNT(c.id) as count FROM categories cat
        LEFT JOIN contacts c ON c.category_id = cat.id AND c.is_deleted = 0
        GROUP BY cat.id, cat.name ORDER BY count DESC""")
    category_stats = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT date(created_at) as date, COUNT(*) as count
        FROM contacts WHERE is_deleted = 0 AND created_at >= datetime('now', '-30 days')
        GROUP BY date(created_at) ORDER BY date""")
    contact_growth = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({
        'total_users': total_users, 'total_contacts': total_contacts,
        'trashed_contacts': trashed_contacts, 'favorite_contacts': favorite_contacts,
        'total_activities': total_activities, 'new_users_30d': new_users_30d,
        'new_contacts_30d': new_contacts_30d, 'birthdays_today': birthdays_today,
        'birthdays_this_month': birthdays_this_month,
        'category_stats': category_stats, 'contact_growth': contact_growth
    })

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_get_users():
    conn = utils.get_db()
    cur = conn.cursor()
    page = request.args.get('page', 1, type=int)
    per_page = 20
    search = request.args.get('search', '').strip()
    query = "FROM users"
    params = []
    if search:
        query += " WHERE username LIKE ? OR email LIKE ? OR full_name LIKE ?"
        s = f"%{search}%"
        params.extend([s, s, s])
    cur.execute(f"SELECT COUNT(*) as total {query}", params)
    total = cur.fetchone()['total']
    offset = (page - 1) * per_page
    cur.execute(f"SELECT id, username, email, full_name, role, is_active, last_login, created_at {query} ORDER BY created_at DESC LIMIT ? OFFSET ?", params + [per_page, offset])
    users = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'users': users, 'total': total, 'page': page})

@app.route('/api/admin/users/<int:user_id>/role', methods=['PUT'])
@admin_required
def admin_update_user_role(user_id):
    data = request.get_json()
    role = data.get('role', '')
    if role not in ('admin', 'user'):
        return jsonify({'error': 'Invalid role'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET role = ?, updated_at=datetime('now') WHERE id = ?", [role, user_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'change_role', 'user', user_id,
                       f'Changed user role to {role}', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Role updated'})

@app.route('/api/admin/users/<int:user_id>/toggle-active', methods=['POST'])
@admin_required
def admin_toggle_user_active(user_id):
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT is_active FROM users WHERE id = ?", [user_id])
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({'error': 'User not found'}), 404
    new_status = 0 if user['is_active'] else 1
    cur.execute("UPDATE users SET is_active = ? WHERE id = ?", [new_status, user_id])
    conn.commit()
    action = 'Activated' if new_status else 'Deactivated'
    utils.log_activity(conn, session['user_id'], 'toggle_active', 'user', user_id,
                       f'{action} user', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'Status updated', 'is_active': new_status})

@app.route('/api/admin/users/<int:user_id>/delete', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    if user_id == session['user_id']:
        return jsonify({'error': 'Cannot delete yourself'}), 400
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM contacts WHERE user_id = ?", [user_id])
    cur.execute("DELETE FROM users WHERE id = ?", [user_id])
    conn.commit()
    utils.log_activity(conn, session['user_id'], 'delete_user', 'user', user_id,
                       'Deleted user', utils.get_client_ip(request))
    cur.close(); conn.close()
    return jsonify({'message': 'User deleted'})

@app.route('/api/admin/activities', methods=['GET'])
@admin_required
def admin_get_activities():
    conn = utils.get_db()
    cur = conn.cursor()
    page = request.args.get('page', 1, type=int)
    per_page = 30
    action_filter = request.args.get('action', '')
    query = "FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id"
    params = []
    if action_filter:
        query += " WHERE al.action = ?"
        params.append(action_filter)
    cur.execute(f"SELECT COUNT(*) as total {query}", params)
    total = cur.fetchone()['total']
    offset = (page - 1) * per_page
    cur.execute(f"""SELECT al.*, u.username, u.full_name as user_full_name
        {query} ORDER BY al.created_at DESC LIMIT ? OFFSET ?""", params + [per_page, offset])
    activities = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'activities': activities, 'total': total, 'page': page})

@app.route('/api/admin/birthdays', methods=['GET'])
@admin_required
def admin_birthdays():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("""SELECT c.*, u.username as owner, cat.name as category_name
        FROM contacts c JOIN users u ON c.user_id = u.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.is_deleted = 0 AND c.birthday IS NOT NULL
        AND strftime('%m', c.birthday) = strftime('%m', 'now')
        ORDER BY strftime('%d', c.birthday)""")
    birthdays = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'birthdays': birthdays})

@app.route('/api/admin/dashboard-data', methods=['GET'])
@admin_required
def admin_dashboard_data():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("""SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM contacts WHERE user_id = u.id AND is_deleted = 0) as contact_count,
        (SELECT COUNT(*) FROM activity_logs WHERE user_id = u.id) as activity_count
        FROM users u ORDER BY u.created_at DESC LIMIT 10""")
    users = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT c.*, u.username as owner, cat.name as category_name
        FROM contacts c JOIN users u ON c.user_id = u.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.is_deleted = 0 ORDER BY c.created_at DESC LIMIT 10""")
    recent_contacts = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT al.*, u.username FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC LIMIT 15""")
    recent_activities = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT c.full_name, c.birthday, u.username as owner
        FROM contacts c JOIN users u ON c.user_id = u.id
        WHERE c.is_deleted = 0 AND c.birthday IS NOT NULL
        AND strftime('%m-%d', c.birthday) = strftime('%m-%d', 'now')""")
    todays_birthdays = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({
        'users': users, 'recent_contacts': recent_contacts,
        'recent_activities': recent_activities, 'todays_birthdays': todays_birthdays
    })

@app.route('/api/admin/activity-actions', methods=['GET'])
@admin_required
def admin_activity_actions():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT action FROM activity_logs ORDER BY action")
    actions = [r['action'] for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'actions': actions})

# ===================== BIRTHDAY REMINDERS =====================

@app.route('/api/birthdays/upcoming', methods=['GET'])
@login_required
def upcoming_birthdays():
    conn = utils.get_db()
    cur = conn.cursor()
    days = request.args.get('days', 7, type=int)
    cur.execute("""SELECT c.*, cat.name as category_name, cat.color as category_color
        FROM contacts c LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.user_id = ? AND c.is_deleted = 0 AND c.birthday IS NOT NULL
        ORDER BY strftime('%m-%d', c.birthday)""", [session['user_id']])
    all_birthdays = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()

    today = date.today()
    results = []
    for b in all_birthdays:
        try:
            bd = datetime.strptime(b['birthday'], '%Y-%m-%d').date()
        except:
            continue
        next_bday = date(today.year, bd.month, bd.day)
        if next_bday < today:
            next_bday = date(today.year + 1, bd.month, bd.day)
        days_until = (next_bday - today).days
        if 0 <= days_until <= days:
            b['days_until'] = days_until
            results.append(b)
    results.sort(key=lambda x: x['days_until'])
    return jsonify({'birthdays': results})

# ===================== USER DASHBOARD =====================

@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def user_dashboard_stats():
    conn = utils.get_db()
    cur = conn.cursor()
    uid = session['user_id']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = ? AND is_deleted = 0", [uid])
    total_contacts = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = ? AND is_deleted = 0 AND is_favorite = 1", [uid])
    favorite_count = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = ? AND is_deleted = 1", [uid])
    trashed_count = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = ? AND is_deleted = 0 AND birthday IS NOT NULL AND strftime('%m', birthday) = strftime('%m', 'now')", [uid])
    birthdays_month = cur.fetchone()['total']
    cur.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = ? AND is_deleted = 0 AND strftime('%m', created_at) = strftime('%m', 'now') AND strftime('%Y', created_at) = strftime('%Y', 'now')", [uid])
    added_this_month = cur.fetchone()['total']
    cur.close(); conn.close()
    return jsonify({
        'total_contacts': total_contacts, 'favorite_count': favorite_count,
        'trashed_count': trashed_count, 'birthdays_month': birthdays_month,
        'added_this_month': added_this_month
    })

@app.route('/api/dashboard/recent', methods=['GET'])
@login_required
def user_dashboard_recent():
    conn = utils.get_db()
    cur = conn.cursor()
    uid = session['user_id']
    cur.execute("""SELECT c.*, cat.name as category_name, cat.color as category_color
        FROM contacts c LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.user_id = ? AND c.is_deleted = 0
        ORDER BY c.updated_at DESC LIMIT 5""", [uid])
    recent = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'recent': recent})

# ===================== BACKUP =====================

@app.route('/api/admin/backups', methods=['GET'])
@admin_required
def get_backups():
    conn = utils.get_db()
    cur = conn.cursor()
    cur.execute("""SELECT b.*, u.username FROM backups b
        LEFT JOIN users u ON b.user_id = u.id ORDER BY b.created_at DESC""")
    backups = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'backups': backups})

@app.route('/api/admin/backups/create', methods=['POST'])
@admin_required
def create_backup():
    conn = utils.get_db()
    cur = conn.cursor()
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"backup_full_{timestamp}.sql"
    filepath = os.path.join(Config.EXPORT_FOLDER, filename)
    try:
        tables = ['users', 'categories', 'contacts', 'activity_logs', 'password_resets', 'backups']
        with open(filepath, 'w') as f:
            for table in tables:
                cur.execute(f"SELECT * FROM {table}")
                rows = cur.fetchall()
                f.write(f"-- {table} ({len(rows)} rows)\n")
                for row in rows:
                    d = dict(row)
                    cols = ', '.join(d.keys())
                    vals = ', '.join(f"'{str(v)}'" if v is not None else 'NULL' for v in d.values())
                    f.write(f"INSERT INTO {table} ({cols}) VALUES ({vals});\n")
                f.write("\n")
        filesize = os.path.getsize(filepath)
        cur.execute("SELECT COUNT(*) as total FROM contacts WHERE is_deleted = 0")
        total = cur.fetchone()['total']
        cur.execute("""INSERT INTO backups (user_id, filename, filepath, size_bytes, type, records_count)
            VALUES (?, ?, ?, ?, 'full', ?)""",
            [session['user_id'], filename, filepath, filesize, total])
        conn.commit()
        utils.log_activity(conn, session['user_id'], 'create_backup', 'backup', cur.lastrowid,
                           f'Created backup: {filename}', utils.get_client_ip(request))
        cur.close(); conn.close()
        return jsonify({'message': 'Backup created', 'filename': filename, 'size': filesize})
    except Exception as e:
        return jsonify({'error': f'Backup failed: {str(e)}'}), 500

@app.route('/api/admin/reports/summary', methods=['GET'])
@admin_required
def admin_report_summary():
    conn = utils.get_db()
    cur = conn.cursor()
    period = request.args.get('period', 'month')
    interval_map = {'week': '-7 days', 'month': '-30 days', 'year': '-1 years'}
    interval = interval_map.get(period, '-30 days')
    cur.execute(f"""SELECT date(created_at) as date, COUNT(*) as registrations
        FROM users WHERE created_at >= datetime('now', ?)
        GROUP BY date(created_at) ORDER BY date""", [interval])
    user_registrations = [dict(r) for r in cur.fetchall()]
    cur.execute(f"""SELECT date(created_at) as date, COUNT(*) as contacts_added
        FROM contacts WHERE created_at >= datetime('now', ?) AND is_deleted = 0
        GROUP BY date(created_at) ORDER BY date""", [interval])
    contacts_added = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT action, COUNT(*) as count FROM activity_logs
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY action ORDER BY count DESC""")
    action_counts = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT u.username, u.full_name, COUNT(c.id) as contact_count
        FROM users u LEFT JOIN contacts c ON c.user_id = u.id AND c.is_deleted = 0
        GROUP BY u.id, u.username, u.full_name ORDER BY contact_count DESC""")
    user_contact_counts = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({
        'user_registrations': user_registrations,
        'contacts_added': contacts_added,
        'action_counts': action_counts,
        'user_contact_counts': user_contact_counts
    })

# ===================== FRONTEND ROUTES =====================

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def serve_static(path):
    full_path = os.path.join(app.static_folder, path)
    if os.path.exists(full_path):
        return app.send_static_file(path)
    return app.send_static_file('index.html')

# ===================== ERROR HANDLERS =====================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

# Initialize database on module load (for Gunicorn/production)
os.makedirs(Config.PROFILE_FOLDER, exist_ok=True)
os.makedirs(Config.EXPORT_FOLDER, exist_ok=True)
utils.init_db()
utils.seed_default_admin()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
