import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from backend.app import app
from backend.utils import init_db, seed_default_admin

if __name__ == '__main__':
    os.makedirs(os.path.join(os.path.dirname(__file__), 'uploads', 'profiles'), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), 'uploads', 'exports'), exist_ok=True)
    init_db()
    seed_default_admin()
    print("=" * 60)
    print("  ContactPro - Address Book Management System")
    print("  ==========================================")
    print("  Database: SQLite (no setup required)")
    print("  Server:   http://localhost:5000")
    print("  Accounts: admin / admin123,  user / user123")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)
