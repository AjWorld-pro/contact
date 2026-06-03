import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'contact-book-secret-key-change-in-production')
    DATABASE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'contact_book.db')
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
    PROFILE_FOLDER = os.path.join(UPLOAD_FOLDER, 'profiles')
    EXPORT_FOLDER = os.path.join(UPLOAD_FOLDER, 'exports')
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
    PAGINATION_PER_PAGE = 12
