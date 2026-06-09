import os
import csv
import io
import re
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta, date
from PIL import Image
from backend.config import Config
import openpyxl
from io import BytesIO

def get_db():
    conn = psycopg2.connect(Config.DATABASE_URL, sslmode='require')
    conn.autocommit = False
    return conn

def serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        d[k] = serialize(v)
    return d

def rows_to_list(rows):
    return [row_to_dict(r) for r in rows]

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
            is_active INTEGER DEFAULT 1,
            profile_picture TEXT DEFAULT NULL,
            email_verified INTEGER DEFAULT 0,
            last_login TIMESTAMP DEFAULT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#10B981',
            icon TEXT DEFAULT 'folder',
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            full_name TEXT NOT NULL,
            phone TEXT DEFAULT NULL,
            email TEXT DEFAULT NULL,
            address TEXT DEFAULT NULL,
            company TEXT DEFAULT NULL,
            job_title TEXT DEFAULT NULL,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            birthday DATE DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            profile_picture TEXT DEFAULT NULL,
            is_favorite INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TIMESTAMP DEFAULT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER DEFAULT NULL,
            details TEXT DEFAULT NULL,
            ip_address TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS password_resets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS backups (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            size_bytes INTEGER DEFAULT 0,
            type TEXT DEFAULT 'full',
            records_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category_id)",
        "CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts(is_deleted)",
        "CREATE INDEX IF NOT EXISTS idx_contacts_favorite ON contacts(is_favorite)",
        "CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action)",
        "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
    ]
    for idx in indexes:
        cur.execute(idx)

    cur.execute("SELECT COUNT(*) as cnt FROM categories")
    if cur.fetchone()[0] == 0:
        defaults = [
            ('Family', '#059669', 'users'),
            ('Friends', '#3B82F6', 'heart'),
            ('Work', '#F59E0B', 'briefcase'),
            ('Business', '#8B5CF6', 'building'),
            ('School', '#EC4899', 'graduation-cap'),
            ('Healthcare', '#EF4444', 'heartbeat')
        ]
        cur.executemany("INSERT INTO categories (name, color, icon) VALUES (%s, %s, %s)", defaults)

    conn.commit()
    cur.close()
    conn.close()
    print("  Database initialized (PostgreSQL)")

def seed_default_admin():
    import bcrypt
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM users")
    if cur.fetchone()[0] == 0:
        admin_hash = bcrypt.hashpw(b'admin123', bcrypt.gensalt(rounds=4)).decode()
        user_hash = bcrypt.hashpw(b'user123', bcrypt.gensalt(rounds=4)).decode()
        cur.execute("INSERT INTO users (username, email, password_hash, full_name, role, is_active, email_verified) VALUES (%s, %s, %s, %s, 'admin', 1, 1)",
                    ['admin', 'admin@contactpro.com', admin_hash, 'Administrator'])
        cur.execute("INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES (%s, %s, %s, %s, 'user', 1)",
                    ['user', 'user@contactpro.com', user_hash, 'User'])
        conn.commit()
        print("  Default accounts created: admin / admin123, user / user123")
    conn.close()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def validate_email(email):
    return re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email) is not None

def save_profile_picture(file, user_id):
    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"user_{user_id}_{int(datetime.utcnow().timestamp())}.{ext}"
        filepath = os.path.join(Config.PROFILE_FOLDER, filename)
        file.save(filepath)
        try:
            img = Image.open(filepath)
            img.thumbnail((300, 300))
            img.save(filepath)
        except:
            pass
        return filename
    return None

def save_contact_picture(file, contact_id):
    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"contact_{contact_id}_{int(datetime.utcnow().timestamp())}.{ext}"
        filepath = os.path.join(Config.PROFILE_FOLDER, filename)
        file.save(filepath)
        try:
            img = Image.open(filepath)
            img.thumbnail((300, 300))
            img.save(filepath)
        except:
            pass
        return filename
    return None

def check_duplicate_contact(conn, user_id, full_name, phone=None, email=None, exclude_id=None):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    query = "SELECT id FROM contacts WHERE user_id = %s AND is_deleted = 0 AND (full_name = %s"
    params = [user_id, full_name]
    if phone:
        query += " OR phone = %s"
        params.append(phone)
    if email:
        query += " OR email = %s"
        params.append(email)
    query += ")"
    if exclude_id:
        query += " AND id != %s"
        params.append(exclude_id)
    cur.execute(query, params)
    result = cur.fetchone()
    cur.close()
    return result

def export_to_csv(contacts):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Full Name', 'Phone', 'Email', 'Address', 'Company', 'Job Title',
                     'Category', 'Birthday', 'Notes', 'Favorite'])
    for c in contacts:
        writer.writerow([
            c['full_name'], c.get('phone') or '', c.get('email') or '',
            c.get('address') or '', c.get('company') or '', c.get('job_title') or '',
            c.get('category_name') or '', str(c.get('birthday') or ''),
            c.get('notes') or '', 'Yes' if c.get('is_favorite') else 'No'
        ])
    return output.getvalue()

def export_to_excel(contacts):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Contacts"
    headers = ['Full Name', 'Phone', 'Email', 'Address', 'Company', 'Job Title',
               'Category', 'Birthday', 'Notes', 'Favorite']
    ws.append(headers)
    for c in contacts:
        ws.append([
            c['full_name'], c.get('phone') or '', c.get('email') or '',
            c.get('address') or '', c.get('company') or '', c.get('job_title') or '',
            c.get('category_name') or '', str(c.get('birthday') or ''),
            c.get('notes') or '', 'Yes' if c.get('is_favorite') else 'No'
        ])
    output = BytesIO()
    wb.save(output)
    return output.getvalue()

def import_from_csv(file_stream, user_id, conn):
    content = file_stream.read().decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(content))
    imported = 0
    errors = []
    cur = conn.cursor()
    for i, row in enumerate(reader):
        try:
            full_name = row.get('Full Name', '').strip()
            if not full_name:
                errors.append(f"Row {i+2}: Full Name is required")
                continue
            phone = row.get('Phone', '').strip() or None
            email = row.get('Email', '').strip() or None
            if email and not validate_email(email):
                errors.append(f"Row {i+2}: Invalid email '{email}'")
                continue
            dup = check_duplicate_contact(conn, user_id, full_name, phone, email)
            if dup:
                errors.append(f"Row {i+2}: Duplicate contact '{full_name}'")
                continue
            category_name = row.get('Category', '').strip()
            category_id = None
            if category_name:
                cur.execute("SELECT id FROM categories WHERE name = %s", [category_name])
                cat = cur.fetchone()
                if cat:
                    category_id = cat[0]
            birthday = None
            bd = row.get('Birthday', '').strip()
            if bd:
                for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
                    try:
                        birthday = datetime.strptime(bd, fmt).date().isoformat()
                        break
                    except:
                        pass
            cur.execute("""INSERT INTO contacts (user_id, full_name, phone, email, address,
                company, job_title, category_id, birthday, notes, is_favorite)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [user_id, full_name, phone, email,
                 row.get('Address', '').strip() or None,
                 row.get('Company', '').strip() or None,
                 row.get('Job Title', '').strip() or None,
                 category_id, birthday,
                 row.get('Notes', '').strip() or None,
                 1 if row.get('Favorite', '').strip().lower() == 'yes' else 0])
            imported += 1
        except Exception as e:
            errors.append(f"Row {i+2}: {str(e)}")
    conn.commit()
    cur.close()
    return imported, errors

def get_client_ip(request):
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or '127.0.0.1'

def log_activity(conn, user_id, action, entity_type, entity_id=None, details=None, ip_address=None):
    cur = conn.cursor()
    cur.execute("""INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES (%s, %s, %s, %s, %s, %s)""",
        [user_id, action, entity_type, entity_id, details, ip_address])
    conn.commit()
    cur.close()
