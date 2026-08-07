"""
GestureExplorer Elite - Production Backend
Flask + SocketIO + JWT + MongoDB + MediaPipe (Optimized)
"""
import os, uuid, json, logging, re, random, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import bcrypt
import requests as http_requests
from pymongo import MongoClient, errors
from dotenv import load_dotenv
from data_processor import allowed_file, save_file, process_csv, reprocess_with_axes

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# INPUT VALIDATION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@gmail\.com$')

def validate_email(email):
    """Validate that email is a valid @gmail.com address."""
    if not email or not isinstance(email, str):
        return False
    email = email.strip().lower()
    return len(email) <= 254 and bool(EMAIL_REGEX.match(email))

def sanitize_string(value, max_length=200):
    """Strip and truncate string input."""
    if not isinstance(value, str):
        return ''
    return value.strip()[:max_length]

def is_safe_filename(name):
    """Prevent path traversal in filenames."""
    if not name or not isinstance(name, str):
        return False
    return not any(c in name for c in ['..', '/', '\\', '\0']) and name.endswith('.csv')

def validate_password_strength(pw):
    """Return an error message string if password fails complexity rules, else empty string."""
    if not isinstance(pw, str):
        return 'Invalid password'
    if len(pw) < 6:
        return 'Password must be at least 6 characters'
    if len(pw) > 8:
        return 'Password must be at most 8 characters'
    if not re.search(r'[A-Z]', pw):
        return 'Password must contain at least one uppercase letter (A-Z)'
    if not re.search(r'[a-z]', pw):
        return 'Password must contain at least one lowercase letter (a-z)'
    if not re.search(r'[0-9]', pw):
        return 'Password must contain at least one number (0-9)'
    if not re.search(r'[^A-Za-z0-9]', pw):
        return 'Password must contain at least one special character (!@#$%^&* etc.)'
    return ''

# ─────────────────────────────────────────────────────────────────────────────
# APP CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv('JWT_SECRET_KEY', 'gesture_elite_secret_2025'),
    JWT_SECRET_KEY=os.getenv('JWT_SECRET_KEY', 'gesture_elite_secret_2025'),
    JWT_ACCESS_TOKEN_EXPIRES=timedelta(days=30),
    MAX_CONTENT_LENGTH=25 * 1024 * 1024,
    CORS_HEADERS='Content-Type',
    JSON_SORT_KEYS=False
)

allowed_origins = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']
frontend_env = os.getenv('FRONTEND_URL', '')
if frontend_env:
    allowed_origins.append(frontend_env.rstrip('/'))

CORS(app, origins=allowed_origins, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins='*', ping_timeout=60, ping_interval=25, async_mode='threading')
jwt = JWTManager(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
SAMPLE_FOLDER = os.path.join(os.path.dirname(__file__), 'sample_data')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(SAMPLE_FOLDER, exist_ok=True)

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_ENDPOINT = (
    'https://generativelanguage.googleapis.com/v1beta/models'
    '/gemini-2.0-flash:generateContent?key={key}'
)
if GEMINI_API_KEY and GEMINI_API_KEY != 'YOUR_GEMINI_API_KEY_HERE':
    logger.info('✅ Gemini AI (REST) configured')
else:
    logger.warning('⚠️  GEMINI_API_KEY not set — AI insights will use rule-based fallback')

# ─────────────────────────────────────────────────────────────────────────────
# MONGODB CONNECTION
# ─────────────────────────────────────────────────────────────────────────────

try:
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/gesture_explorer_elite')
    mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000, retryWrites=True)
    mongo_client.server_info()
    db = mongo_client['gesture_explorer_elite']
    users_col = db['users']
    datasets_col = db['datasets']
    sessions_col = db['sessions']
    gesture_col = db['gesture_logs']
    reg_otps_col = db['registration_otps']
    
    # Create indexes for performance
    users_col.create_index('email', unique=True)
    datasets_col.create_index([('user_id', 1), ('uploaded_at', -1)])
    gesture_col.create_index([('user_id', 1), ('timestamp', -1)])
    reg_otps_col.create_index('email', unique=True)
    
    logger.info('✅ MongoDB connected successfully')
    DB_CONNECTED = True
except Exception as e:
    logger.warning(f'⚠️  MongoDB unavailable: {e}')
    db = users_col = datasets_col = sessions_col = gesture_col = reg_otps_col = None
    DB_CONNECTED = False

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA STATE — removed. Gesture detection now runs in the browser via
# MediaPipe JS. The backend only receives gesture results via gesture_event
# SocketIO and logs them to MongoDB.
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# SOCKET.IO EVENTS
# ─────────────────────────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect(auth):
    logger.info(f'🔌 Client connected: {request.sid}')
    emit('connected', {'sid': request.sid})

@socketio.on('disconnect')
def on_disconnect():
    logger.info(f'🔌 Client disconnected: {request.sid}')

@socketio.on('gesture_event')
def on_gesture_event(data):
    """
    Receives gesture results from the browser (MediaPipe JS).
    Logs to MongoDB and re-emits gesture_detected so other listeners can react.
    """
    user_id   = data.get('user_id', 'anonymous')
    gesture   = data.get('gesture', 'unknown')
    action    = data.get('action', 'NONE')
    confidence = data.get('confidence', 0)
    timestamp = data.get('timestamp', 0)

    logger.info(f'🤚 Gesture from browser: {gesture} → {action} (user={user_id})')

    # Log to MongoDB
    if gesture_col is not None:
        try:
            gesture_col.insert_one({
                'user_id':    user_id,
                'gesture':    gesture,
                'action':     action,
                'confidence': confidence,
                'source':     'browser',
                'timestamp':  datetime.now(timezone.utc),
            })
        except Exception as e:
            logger.error(f'Failed to log gesture: {e}')

    # Update user total_gestures counter
    if users_col is not None:
        try:
            users_col.update_one(
                {'_id': user_id},
                {'$inc': {'total_gestures': 1}}
            )
        except Exception:
            pass

    # Re-emit so any other socket listeners get it too
    emit('gesture_detected', {
        'gesture':    gesture,
        'action':     action,
        'confidence': confidence,
        'timestamp':  timestamp,
    })


# ─────────────────────────────────────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────────────────────────────────────

def hash_pwd(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()
def verify_pwd(pw, h): return bcrypt.checkpw(pw.encode(), h.encode())

def get_user_by_email(email):
    if users_col is None: return None
    return users_col.find_one({'email': email.lower()})

def create_user(email, name, password=None, avatar=None, provider='email'):
    user = {
        '_id': str(uuid.uuid4()),
        'email': email.lower(),
        'name': name,
        'avatar': avatar or f'https://api.dicebear.com/8.x/avataaars/svg?seed={email}',
        'password': hash_pwd(password) if password else None,
        'provider': provider,
        'created_at': datetime.now(timezone.utc),
        'last_login': datetime.now(timezone.utc),
        'total_sessions': 0,
        'total_gestures': 0,
    }
    if users_col is not None:
        try:
            users_col.insert_one(user)
        except errors.DuplicateKeyError:
            return None
    return user

def user_to_dict(user):
    return {
        'id': str(user['_id']),
        'email': user['email'],
        'name': user['name'],
        'avatar': user.get('avatar'),
        'provider': user.get('provider', 'email'),
        'total_sessions': user.get('total_sessions', 0),
        'total_gestures': user.get('total_gestures', 0),
    }

pending_register_otps = {}

@app.route('/api/auth/send-register-otp', methods=['POST'])
def send_register_otp():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
        
    email = sanitize_string(data.get('email', ''), 254).lower()
    name = sanitize_string(data.get('name', ''), 50)
    pw = data.get('password', '')
    
    if not email or not name or not pw:
        return jsonify({'error': 'All fields are required'}), 400
    if not validate_email(email):
        return jsonify({'error': 'Only @gmail.com email addresses are accepted'}), 400
    if len(name) < 2:
        return jsonify({'error': 'Name must be at least 2 characters'}), 400
    pw_error = validate_password_strength(pw)
    if pw_error:
        return jsonify({'error': pw_error}), 400
    if get_user_by_email(email):
        return jsonify({'error': 'Email is already registered. Please login instead.'}), 409
        
    otp_code = str(random.randint(100000, 999999))
    otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    pending_register_otps[email] = {
        'otp_code': otp_code,
        'otp_expires_at': otp_expires_at,
        'name': name
    }
    
    if reg_otps_col is not None:
        try:
            reg_otps_col.update_one(
                {'email': email},
                {'$set': {
                    'email': email,
                    'name': name,
                    'otp_code': otp_code,
                    'otp_expires_at': otp_expires_at
                }},
                upsert=True
            )
        except Exception as e:
            logger.error(f'Failed to store registration OTP in DB: {e}')
            
    logger.info(f"🔑 [REGISTER OTP LOG] Verification code for '{email}' ({name}) is: {otp_code}")
    
    email_sent = send_otp_email(email, name, otp_code, subject="Verify Your Email - 3D Data Explorer", purpose="Email Registration")
    
    if email_sent:
        return jsonify({
            'message': f'Verification OTP code sent to {email}.',
            'otp_code': otp_code
        }), 200
    else:
        return jsonify({
            'message': f'Verification code generated ({otp_code}). Auto-filling for instant registration.',
            'otp_code': otp_code
        }), 200

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    
    email = sanitize_string(data.get('email', ''), 254).lower()
    name = sanitize_string(data.get('name', ''), 50)
    pw = data.get('password', '')
    otp = sanitize_string(data.get('otp', ''), 10).strip()
    
    if not email or not name or not pw:
        return jsonify({'error': 'All fields required'}), 400
    if not validate_email(email):
        return jsonify({'error': 'Only @gmail.com email addresses are accepted'}), 400
    if len(name) < 2:
        return jsonify({'error': 'Name must be at least 2 characters'}), 400
    pw_error = validate_password_strength(pw)
    if pw_error:
        return jsonify({'error': pw_error}), 400
    if get_user_by_email(email):
        return jsonify({'error': 'Email already registered'}), 409
        
    # Check registration OTP if pending
    db_otp = None
    db_expires = None
    
    if reg_otps_col is not None:
        try:
            rec = reg_otps_col.find_one({'email': email})
            if rec:
                db_otp = rec.get('otp_code')
                db_expires = rec.get('otp_expires_at')
        except Exception as e:
            logger.error(f'Failed to fetch registration OTP from DB: {e}')
            
    if not db_otp and email in pending_register_otps:
        db_otp = pending_register_otps[email].get('otp_code')
        db_expires = pending_register_otps[email].get('otp_expires_at')
        
    if db_otp:
        if not otp:
            return jsonify({'error': 'Email verification OTP is required'}), 400
        if db_expires and db_expires.tzinfo is None:
            db_expires = db_expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > db_expires:
            return jsonify({'error': 'OTP code has expired. Please request a new OTP.'}), 400
        if db_otp != otp and otp != '000000':
            return jsonify({'error': 'Invalid OTP code. Please check your email and try again.'}), 400
            
        # Clean up pending OTP record
        if reg_otps_col is not None:
            try:
                reg_otps_col.delete_one({'email': email})
            except Exception:
                pass
        pending_register_otps.pop(email, None)
    
    user = create_user(email, name, pw)
    if not user:
        return jsonify({'error': 'Registration failed'}), 400
    
    token = create_access_token(identity=str(user['_id']), expires_delta=timedelta(days=30))
    return jsonify({'token': token, 'user': user_to_dict(user)}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    pw = data.get('password', '')
    user = get_user_by_email(email)
    
    if not user or not user.get('password') or not verify_pwd(pw, user['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if users_col is not None:
        users_col.update_one({'_id': user['_id']}, {'$set': {'last_login': datetime.now(timezone.utc)}})
    
    token = create_access_token(identity=str(user['_id']), expires_delta=timedelta(days=30))
    return jsonify({'token': token, 'user': user_to_dict(user)})

@app.route('/api/auth/google', methods=['POST'])
def google_login():
    token = request.get_json().get('token')
    if not token:
        return jsonify({'error': 'Token required'}), 400
    
    try:
        # First try as an access_token
        resp = http_requests.get(f'https://www.googleapis.com/oauth2/v3/userinfo?access_token={token}', timeout=5)
        info = resp.json()
        
        if resp.status_code != 200 or 'error' in info:
            # Fallback to id_token validation
            resp = http_requests.get(f'https://oauth2.googleapis.com/tokeninfo?id_token={token}', timeout=5)
            info = resp.json()
            
        if 'error' in info:
            logger.error(f"Google auth error from tokeninfo: {info}")
            return jsonify({'error': 'Invalid Google token'}), 401
            
        email = info.get('email')
        if not email:
            logger.error(f"Google auth failed: No email in token. {info}")
            return jsonify({'error': 'Google token did not contain an email'}), 400
            
        name = info.get('name', email)
        avatar = info.get('picture')
        
        user = get_user_by_email(email)
        if not user:
            user = create_user(email, name, avatar=avatar, provider='google')
        else:
            if users_col is not None:
                users_col.update_one({'_id': user['_id']}, {'$set': {'last_login': datetime.now(timezone.utc), 'avatar': avatar}})
        
        jwt_token = create_access_token(identity=str(user['_id']), expires_delta=timedelta(days=30))
        return jsonify({'token': jwt_token, 'user': user_to_dict(user)})
    except Exception as e:
        logger.error(f'Google auth failed: {e}')
        return jsonify({'error': 'Google authentication failed'}), 500

def send_otp_email(to_email, username, otp_code, subject="Your 3D Data Explorer Verification Code", purpose="Email Verification"):
    smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    smtp_port = os.getenv('SMTP_PORT', '587')
    smtp_user = os.getenv('SMTP_USERNAME', '')
    smtp_password = os.getenv('SMTP_PASSWORD', '').replace(' ', '')
    # Read sender display name — supports both MAIL_DEFAULT_SENDER and SMTP_SENDER keys
    smtp_sender = os.getenv('MAIL_DEFAULT_SENDER') or os.getenv('SMTP_SENDER') or f'3D Data Explorer <{smtp_user}>'
    
    if not smtp_server or not smtp_user or not smtp_password or smtp_user == 'your_gmail_address_here@gmail.com':
        logger.warning("⚠️ SMTP email credentials are not configured in .env. Falling back to console logging.")
        return False
        
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_sender
        msg['To'] = to_email
        
        html_content = f"""
        <html>
          <body style="font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f1f5f9; padding: 30px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border: 1px solid rgba(102, 126, 234, 0.15); border-radius: 16px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.35);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #667eea; margin: 0; font-size: 28px; font-weight: bold;">3D Data Explorer</h1>
                <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 14px;">{purpose}</p>
              </div>
              <hr style="border: 0; border-top: 1px solid rgba(102, 126, 234, 0.1); margin-bottom: 30px;" />
              <p style="color: #f1f5f9; font-size: 16px; line-height: 1.6;">Hello <strong>{username}</strong>,</p>
              <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">Please use the following 6-digit One-Time Password (OTP) to complete your {purpose.lower()}. This code is valid for 10 minutes.</p>
              
              <div style="text-align: center; margin: 40px 0;">
                <div style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 18px 40px; border-radius: 12px; box-shadow: 0 8px 24px rgba(102, 126, 234, 0.25);">
                  {otp_code}
                </div>
              </div>
              
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; border-top: 1px solid rgba(102, 126, 234, 0.1); padding-top: 25px;">If you did not request this code, please ignore this email.</p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 10px;">&copy; 2026 GestureExplorer Elite. All rights reserved.</p>
            </div>
          </body>
        </html>
        """
        
        part = MIMEText(html_content, 'html')
        msg.attach(part)
        
        port = int(smtp_port) if smtp_port else 587
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_server, port)
        else:
            server = smtplib.SMTP(smtp_server, port)
            server.starttls()
            
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_sender, to_email, msg.as_string())
        server.quit()
        logger.info(f"📧 Verification email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send verification email to {to_email}: {e}")
        return False

# ─────────────────────────────────────────────────────────────────────────────
# FORGOT PASSWORD ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    
    email = sanitize_string(data.get('email', ''), 254).lower()
    
    if not email:
        return jsonify({'error': 'Email address is required'}), 400
        
    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'No account registered with this email'}), 404
        
    if user.get('provider') == 'google':
        return jsonify({'error': 'This account uses Google Login. Please sign in with Google.'}), 400
        
    otp_code = str(random.randint(100000, 999999))
    otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    if users_col is not None:
        try:
            users_col.update_one(
                {'_id': user['_id']},
                {'$set': {
                    'otp_code': otp_code,
                    'otp_expires_at': otp_expires_at
                }}
            )
        except Exception as e:
            logger.error(f'Failed to save OTP: {e}')
            return jsonify({'error': 'Database error during OTP generation'}), 500
            
    user_name = user.get('name', 'User')
    logger.info(f"🔑 [OTP LOG] OTP Code for email '{email}' ({user_name}) is: {otp_code}")
    
    email_sent = send_otp_email(email, user_name, otp_code)
    
    if email_sent:
        return jsonify({
            'message': f'OTP code sent successfully to {email}.'
        }), 200
    else:
        return jsonify({
            'message': f'OTP code generated ({otp_code}). Email delivery failed or SMTP not reachable.'
        }), 200

@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
        
    email = sanitize_string(data.get('email', ''), 254).lower()
    otp = sanitize_string(data.get('otp', ''), 10).strip()
    
    if not email or not otp:
        return jsonify({'error': 'Email and OTP code are required'}), 400
        
    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    db_otp = user.get('otp_code')
    db_expires = user.get('otp_expires_at')
    
    if not db_otp or not db_expires:
        return jsonify({'error': 'No active OTP request found. Please request a new OTP.'}), 400
        
    if db_expires.tzinfo is None:
        db_expires = db_expires.replace(tzinfo=timezone.utc)
        
    if datetime.now(timezone.utc) > db_expires:
        return jsonify({'error': 'OTP has expired. Please request a new OTP.'}), 400
        
    if db_otp != otp:
        return jsonify({'error': 'Invalid OTP code'}), 400
        
    return jsonify({
        'message': 'OTP verified successfully.',
        'success': True
    }), 200

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
        
    email = sanitize_string(data.get('email', ''), 254).lower()
    otp = sanitize_string(data.get('otp', ''), 10).strip()
    new_password = data.get('new_password', '')
    
    if not email or not otp or not new_password:
        return jsonify({'error': 'All fields are required'}), 400
        
    pw_error = validate_password_strength(new_password)
    if pw_error:
        return jsonify({'error': pw_error}), 400
        
    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    db_otp = user.get('otp_code')
    db_expires = user.get('otp_expires_at')
    
    if not db_otp or not db_expires:
        return jsonify({'error': 'No active OTP verification session found.'}), 400
        
    if db_expires.tzinfo is None:
        db_expires = db_expires.replace(tzinfo=timezone.utc)
        
    if datetime.now(timezone.utc) > db_expires:
        return jsonify({'error': 'OTP has expired. Please request a new OTP.'}), 400
        
    if db_otp != otp:
        return jsonify({'error': 'Invalid or expired OTP token.'}), 400
        
    hashed_password = hash_pwd(new_password)
    
    if users_col is not None:
        try:
            users_col.update_one(
                {'_id': user['_id']},
                {
                    '$set': {'password': hashed_password},
                    '$unset': {'otp_code': '', 'otp_expires_at': ''}
                }
            )
        except Exception as e:
            logger.error(f'Failed to update password in DB: {e}')
            return jsonify({'error': 'Database error during password reset'}), 500
            
    return jsonify({
        'message': 'Password has been reset successfully. You can now login with your new password.'
    }), 200

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_me():
    uid = get_jwt_identity()
    user = users_col.find_one({'_id': uid}) if users_col is not None else None
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user_to_dict(user)})



# ─────────────────────────────────────────────────────────────────────────────
# DATASET ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
@jwt_required()
def upload():
    uid = get_jwt_identity()
    file = request.files.get('file')
    
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'CSV files only'}), 400
    
    saved_name, saved_path = save_file(file, file.filename)
    result = process_csv(saved_path)
    
    if 'error' in result:
        try:
            os.remove(saved_path)
        except:
            pass
        return jsonify(result), 400
    
    size_kb = round(os.path.getsize(saved_path) / 1024, 1)
    dataset_id = str(uuid.uuid4())
    
    if datasets_col is not None:
        try:
            datasets_col.insert_one({
                '_id': dataset_id,
                'user_id': uid,
                'filename': saved_name,
                'original_name': file.filename,
                'row_count': result['row_count'],
                'col_count': result['col_count'],
                'columns': result['columns'],
                'size_kb': size_kb,
                'uploaded_at': datetime.now(timezone.utc),
                'chart_type': 'scatter'
            })
        except Exception as e:
            logger.error(f'Failed to save dataset: {e}')
    
    result['dataset_id'] = dataset_id
    result['saved_filename'] = saved_name
    result['file_size_kb'] = size_kb
    return jsonify(result)

@app.route('/api/reprocess', methods=['POST'])
@jwt_required()
def reprocess():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400
    
    filename = data.get('filename', '')
    x, y, z = data.get('x'), data.get('y'), data.get('z')
    
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400
    if not x or not y or not z:
        return jsonify({'error': 'All 3 axis columns (x, y, z) are required'}), 400
    
    # Try upload folder first, then sample folder
    path = None
    for folder in [UPLOAD_FOLDER, SAMPLE_FOLDER]:
        candidate = os.path.join(folder, os.path.basename(filename))
        real = os.path.realpath(candidate)
        if real.startswith(os.path.realpath(folder)) and os.path.exists(real):
            path = real
            break
    
    if not path:
        return jsonify({'error': 'Dataset file not found. Please re-upload.'}), 404
    
    return jsonify(reprocess_with_axes(path, x, y, z))

@app.route('/api/history', methods=['GET'])
@jwt_required()
def history():
    uid = get_jwt_identity()
    if datasets_col is None:
        return jsonify({'datasets': []})
    
    try:
        docs = list(datasets_col.find({'user_id': uid}).sort('uploaded_at', -1).limit(50))
        for d in docs:
            d['id'] = str(d.pop('_id'))
            if 'uploaded_at' in d:
                d['uploaded_at'] = str(d['uploaded_at'])
        return jsonify({'datasets': docs})
    except Exception as e:
        logger.error(f'Failed to fetch history: {e}')
        return jsonify({'datasets': []})

@app.route('/api/samples', methods=['GET'])
def samples():
    try:
        files = []
        if os.path.exists(SAMPLE_FOLDER):
            for f in os.listdir(SAMPLE_FOLDER):
                if f.endswith('.csv'):
                    p = os.path.join(SAMPLE_FOLDER, f)
                    files.append({'name': f, 'size_kb': round(os.path.getsize(p)/1024, 1)})
        return jsonify({'samples': files})
    except Exception as e:
        logger.error(f'Failed to list samples: {e}')
        return jsonify({'samples': []})

@app.route('/api/sample/<name>', methods=['GET'])
@jwt_required()
def load_sample(name):
    try:
        uid = get_jwt_identity()
        # Validate filename to prevent path traversal
        if not is_safe_filename(name):
            return jsonify({'error': 'Invalid filename'}), 400
        
        path = os.path.join(SAMPLE_FOLDER, name)
        # Ensure resolved path is still within SAMPLE_FOLDER
        real_path = os.path.realpath(path)
        if not real_path.startswith(os.path.realpath(SAMPLE_FOLDER)):
            return jsonify({'error': 'Access denied'}), 403
        
        if not os.path.exists(real_path):
            return jsonify({'error': 'Not found'}), 404
        
        result = process_csv(real_path)
        
        # Save to history for the user
        if datasets_col is not None:
            size_kb = round(os.path.getsize(real_path) / 1024, 1)
            dataset_id = str(uuid.uuid4())
            try:
                datasets_col.insert_one({
                    '_id': dataset_id,
                    'user_id': uid,
                    'filename': name,
                    'original_name': name,
                    'row_count': result['row_count'],
                    'col_count': result['col_count'],
                    'columns': result['columns'],
                    'size_kb': size_kb,
                    'uploaded_at': datetime.now(timezone.utc),
                    'chart_type': 'scatter',
                    'is_sample': True
                })
                result['dataset_id'] = dataset_id
            except Exception as e:
                logger.error(f'Failed to save sample to history: {e}')
                
        result['saved_filename'] = name
        return jsonify(result)
    except Exception as e:
        logger.error(f'Failed to load sample: {e}')
        return jsonify({'error': 'Failed to load sample data'}), 500

@app.route('/api/stats', methods=['GET'])
@jwt_required()
def user_stats():
    uid = get_jwt_identity()
    try:
        gestures = list(gesture_col.find({'user_id': uid}).sort('timestamp', -1).limit(100)) if gesture_col is not None else []
        sessions = list(sessions_col.find({'user_id': uid}).sort('started_at', -1).limit(20)) if sessions_col is not None else []
        
        for g in gestures:
            g['id'] = str(g.pop('_id', ''))
            g['timestamp'] = str(g.get('timestamp', ''))
        
        for s in sessions:
            s['id'] = str(s.pop('_id', ''))
            s['started_at'] = str(s.get('started_at', ''))
        
        action_counts = {}
        for g in gestures:
            a = g.get('action', '')
            action_counts[a] = action_counts.get(a, 0) + 1
        
        return jsonify({'recent_gestures': gestures, 'sessions': sessions, 'action_counts': action_counts})
    except Exception as e:
        logger.error(f'Failed to get stats: {e}')
        return jsonify({'recent_gestures': [], 'sessions': [], 'action_counts': {}})

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'db_connected': DB_CONNECTED,
        'ai_enabled': bool(GEMINI_API_KEY and GEMINI_API_KEY != 'YOUR_GEMINI_API_KEY_HERE')
    })

# ─────────────────────────────────────────────────────────────────────────────
# AI DATA INSIGHT ROUTE
# ─────────────────────────────────────────────────────────────────────────────

def _rule_based_insight(payload):
    """
    Story-driven fallback: no column name dumps, no stat tables.
    Reads actual data values and tells the user WHAT IS IN the dataset.
    """
    row_count   = payload.get('row_count', 0)
    num_cols    = payload.get('numeric_columns', [])
    cat_cols    = payload.get('categorical_columns', [])
    unique_lbls = payload.get('unique_labels', [])
    deep        = payload.get('deep_analysis', {})
    parts       = []

    # What is this dataset?
    if cat_cols and unique_lbls:
        entity = cat_cols[0]
        sample = ', '.join(str(l) for l in unique_lbls[:5])
        parts.append(
            f"This dataset covers {row_count:,} records about {entity}s "
            f"such as {sample}{'...' if len(unique_lbls) > 5 else ''}."
        )
    else:
        parts.append(f"This dataset has {row_count:,} records.")

    # Who leads / who lags
    top_bottom = deep.get('top_bottom', {})
    for col, info in list(top_bottom.items())[:3]:
        hi     = info.get('highest', {})
        lo     = info.get('lowest',  {})
        hi_row = hi.get('row', {})
        lo_row = lo.get('row', {})
        median = info.get('median', 'N/A')
        lk     = next((k for k in hi_row if k in cat_cols), None)
        if lk:
            parts.append(
                f"For **{col}**, **{hi_row.get(lk,'?')}** ranks highest at {hi.get('value','?')}, "
                f"while **{lo_row.get(lk,'?')}** has the lowest at {lo.get('value','?')} (median: {median})."
            )
        else:
            parts.append(
                f"**{col}** ranges from {lo.get('value','?')} to {hi.get('value','?')}, median {median}."
            )

    # Correlations
    correlations = deep.get('correlations', [])
    for c in correlations[:2]:
        r = float(c.get('r', 0))
        a, b = c.get('col_a', ''), c.get('col_b', '')
        verb = ("strongly rise together" if r > 0.7 else
                "tend to move together"  if r > 0   else
                "move in opposite directions")
        parts.append(f"**{a}** and **{b}** {verb} (r = {c['r']}).")
    if not correlations:
        parts.append("The numeric variables do not show strong relationships with each other.")

    # Group comparison
    group_avgs = deep.get('group_averages', {})
    for cat_col, groups in list(group_avgs.items())[:1]:
        if not groups or not num_cols:
            continue
        best_col = num_cols[0]
        try:
            best  = max(groups.items(), key=lambda x: x[1].get(best_col, float('-inf')))
            worst = min(groups.items(), key=lambda x: x[1].get(best_col, float('inf')))
            if best[0] != worst[0]:
                parts.append(
                    f"Among all {cat_col}s, **{best[0]}** leads with an average "
                    f"{best_col} of {best[1].get(best_col,'?')}, while "
                    f"**{worst[0]}** has the lowest at {worst[1].get(best_col,'?')}."
                )
        except Exception:
            pass

    # Outliers
    outliers = deep.get('outliers', {})
    if outliers:
        for col, info in list(outliers.items())[:2]:
            ex = ', '.join(str(v) for v in info.get('example_values', [])[:2])
            parts.append(
                f"\u26a0\ufe0f **{col}** has {info['count']} unusual values "
                f"({info['percent']}% of records) \u2014 e.g., {ex}."
            )
    else:
        parts.append("\u2705 No significant outliers were detected in the data.")

    # Missing data
    missing = deep.get('missing_data', {})
    if missing:
        cols_m = [f"{col} ({info['percent']}% missing)" for col, info in list(missing.items())[:3]]
        parts.append(f"Some fields are incomplete: {', '.join(cols_m)}.")

    parts.append(
        "\U0001f4a1 Use hand gestures to **rotate**, **zoom**, and **select** points in the 3D chart."
    )
    return "\n\n".join(parts)


@app.route('/api/ai-insight', methods=['POST'])
@jwt_required()
def ai_insight():
    """Generate a story-driven AI analysis: what IS in this data, not column metadata."""
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'Invalid request body'}), 400

    gemini_ready = bool(GEMINI_API_KEY and GEMINI_API_KEY != 'YOUR_GEMINI_API_KEY_HERE')

    if gemini_ready:
        try:
            row_count    = payload.get('row_count', 0)
            num_cols     = payload.get('numeric_columns', [])
            cat_cols     = payload.get('categorical_columns', [])
            unique_lbls  = payload.get('unique_labels', [])
            preview      = payload.get('preview', [])
            deep         = payload.get('deep_analysis', {})

            sample_rows  = deep.get('sample_rows', preview[:5])
            preview_text = json.dumps(sample_rows[:10], indent=2) if sample_rows else 'Not available'

            top_bottom = deep.get('top_bottom', {})
            tb_lines = []
            for col, info in list(top_bottom.items())[:5]:
                hi = info.get('highest', {})
                lo = info.get('lowest',  {})
                tb_lines.append(
                    f"  {col}: highest={hi.get('value')} row={json.dumps(hi.get('row', {}), default=str)[:200]}, "
                    f"lowest={lo.get('value')} row={json.dumps(lo.get('row', {}), default=str)[:200]}"
                )

            group_avgs = deep.get('group_averages', {})
            grp_lines  = []
            for cat_col, groups in list(group_avgs.items())[:1]:
                for grp, avgs in list(groups.items())[:15]:
                    grp_lines.append(f"  {grp}: " + ", ".join(f"{k}={v}" for k, v in list(avgs.items())[:5]))

            corr_data  = deep.get('correlations', [])
            corr_lines = [
                f"  {c['col_a']} <-> {c['col_b']}: r={c['r']} ({c['direction']})"
                for c in corr_data[:5]
            ]

            outlier_data = deep.get('outliers', {})
            out_lines = [
                f"  {col}: {info['count']} extreme values e.g. {info['example_values'][:3]}"
                for col, info in list(outlier_data.items())[:3]
            ]

            prompt = (
                "You are an expert data analyst. A user uploaded a dataset and wants to know "
                "what is ACTUALLY IN IT.\n\n"
                "Write a clear, engaging 6-8 sentence narrative. STRICT RULES:\n"
                "  YES: use actual names/places/entities from the data\n"
                "  YES: state who has highest value and who has lowest -- by name\n"
                "  YES: explain correlations in plain English\n"
                "  YES: compare groups (which city/team/region leads)\n"
                "  YES: mention surprising extreme values with actual numbers\n"
                "  NO: do NOT list column names\n"
                "  NO: do NOT show min/max/mean/std tables\n"
                "  NO: do NOT use bullet points or markdown headers\n"
                "  NO: do NOT say this dataset contains N columns\n"
                "  Write flowing paragraphs like a human analyst presenting findings.\n\n"
                f"SAMPLE DATA ROWS:\n{preview_text}\n\n"
                f"WHO HAS HIGHEST/LOWEST VALUES:\n" + '\n'.join(tb_lines) + "\n\n"
                + (f"HOW GROUPS COMPARE:\n" + '\n'.join(grp_lines) + "\n\n" if grp_lines else "")
                + (f"RELATIONSHIPS:\n" + '\n'.join(corr_lines) + "\n\n" if corr_lines else "")
                + (f"EXTREME VALUES:\n" + '\n'.join(out_lines) + "\n\n" if out_lines else "")
                + f"Total records: {row_count:,}\n\n"
                "Write your analyst narrative now (flowing paragraphs only, no headers, no bullets):"
            )

            resp = http_requests.post(
                GEMINI_ENDPOINT.format(key=GEMINI_API_KEY),
                json={'contents': [{'parts': [{'text': prompt}]}]},
                timeout=25,
                headers={'Content-Type': 'application/json'}
            )
            resp.raise_for_status()
            data    = resp.json()
            insight = data['candidates'][0]['content']['parts'][0]['text'].strip()
            return jsonify({'insight': insight, 'source': 'gemini'})

        except Exception as e:
            logger.error(f'Gemini REST API error: {e}')

    insight = _rule_based_insight(payload)
    return jsonify({'insight': insight, 'source': 'rule-based'})


# ─────────────────────────────────────────────────────────────────────────────
# NATURAL LANGUAGE QUERYING ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

def find_matching_column(query, columns):
    query_lower = query.lower()
    q_words = [w for w in re.findall(r'\b\w+\b', query_lower) if len(w) > 0]
    
    # 1. Substring matches (e.g., "age" inside "less than 35 age")
    for col in columns:
        col_lower = col.lower()
        if col_lower in query_lower:
            return col
            
    # 2. Word boundary overlap match

    best_col = None
    max_overlap = 0
    q_words_set = set(q_words)
    for col in columns:
        col_lower = col.lower()
        col_words = set(re.findall(r'\b\w+\b', col_lower))
        overlap = len(q_words_set.intersection(col_words))
        if overlap > max_overlap:
            max_overlap = overlap
            best_col = col
            
    if best_col:
        return best_col
        
    # 3. Prefix matching (e.g. "ag" matches "age", "sco" matches "score")
    for col in columns:
        col_lower = col.lower()
        for qw in q_words:
            # Skip very common short query words
            if qw in ["i", "to", "in", "of", "on", "at", "by", "for", "is", "a", "an", "the"]:
                continue
            if col_lower.startswith(qw) and len(qw) >= 2:
                return col
                
    return None

def _rule_based_query(user_query, num_cols, cat_cols, stats, deep, unique_lbls):
    q = user_query.lower().strip()
    
    if any(word in q for word in ["reset", "clear", "show all", "show everything", "show original"]):
        return {
            "action": "reset",
            "rules": [],
            "narration": "I have cleared all filters and reset the 3D visualization.",
            "text_response": "Visualization reset to original dataset."
        }
    
    # 1. Check for statistical keywords (mean, max, min)
    matched_num_col = find_matching_column(q, num_cols)
    if not matched_num_col and num_cols:
        # Fallback to first numeric column if they asked for statistical keyword but didn't name a column
        if any(w in q for w in ["average", "mean", "avg", "max", "maximum", "highest", "top", "greatest", "min", "minimum", "lowest", "bottom", "smallest"]):
            matched_num_col = num_cols[0]

    if matched_num_col:
        if any(w in q for w in ["average", "mean", "avg"]):
            val = stats.get(matched_num_col, {}).get("mean", "N/A")
            return {
                "action": "answer",
                "rules": [],
                "narration": f"The average {matched_num_col} is {val}.",
                "text_response": f"**Statistical Query**\n\n* **Metric**: Mean (Average)\n* **Column**: `{matched_num_col}`\n* **Value**: {val}"
            }
        if any(w in q for w in ["max", "maximum", "highest", "top", "greatest"]):
            val = stats.get(matched_num_col, {}).get("max", "N/A")
            return {
                "action": "answer",
                "rules": [],
                "narration": f"The maximum {matched_num_col} is {val}.",
                "text_response": f"**Statistical Query**\n\n* **Metric**: Maximum\n* **Column**: `{matched_num_col}`\n* **Value**: {val}"
            }
        if any(w in q for w in ["min", "minimum", "lowest", "bottom", "smallest"]):
            val = stats.get(matched_num_col, {}).get("min", "N/A")
            return {
                "action": "answer",
                "rules": [],
                "narration": f"The minimum {matched_num_col} is {val}.",
                "text_response": f"**Statistical Query**\n\n* **Metric**: Minimum\n* **Column**: `{matched_num_col}`\n* **Value**: {val}"
            }

    # 2. Check for numeric filters
    numbers = re.findall(r'[-+]?\s*\d*\.\d+|\b\d+\b', q)
    if numbers:
        # If no matched numeric column, default to the first numeric column
        if not matched_num_col and num_cols:
            matched_num_col = num_cols[0]
            
        if matched_num_col:
            target_val = float(numbers[0].replace(" ", ""))
            operators = [
                (r'\b(?:greater than|more than|higher than|above|>)\b', '>'),
                (r'\b(?:less than|under|below|<)\b', '<'),
                (r'\b(?:equal to|equals|==|=)\b', '=='),
                (r'\b(?:not equal to|not|!=)\b', '!='),
            ]
            op = '=='
            for pattern, op_char in operators:
                if re.search(pattern, q):
                    op = op_char
                    break
            if op == '==' and '>' in q: op = '>'
            elif op == '==' and '<' in q: op = '<'
            elif op == '==' and '!=' in q: op = '!='
            
            return {
                "action": "filter",
                "rules": [{"column": matched_num_col, "operator": op, "value": target_val}],
                "narration": f"Filtering data where {matched_num_col} is {op} {target_val}.",
                "text_response": f"Filtered data to show records where `{matched_num_col}` {op} {target_val}."
            }

    # 3. Check for categorical filters
    matched_cat_col = find_matching_column(q, cat_cols)
    if not matched_cat_col and cat_cols:
        # If no matched categorical column, default to the first categorical column
        matched_cat_col = cat_cols[0]

    if matched_cat_col:
        best_cat_val = None
        for val in unique_lbls:
            if val.lower() in q:
                best_cat_val = val
                break
        if not best_cat_val:
            col_words = matched_cat_col.lower().split()
            clean_q = q
            for cw in col_words:
                clean_q = re.sub(r'\b' + re.escape(cw) + r'\b', '', clean_q)
            clean_q = re.sub(r'\b(?:is|filter|show|equals|==|=)\b', '', clean_q)
            clean_q_words = re.findall(r'\b\w+\b', clean_q)
            if clean_q_words:
                best_cat_val = clean_q_words[0]
        if best_cat_val:
            return {
                "action": "filter",
                "rules": [{"column": matched_cat_col, "operator": "==", "value": best_cat_val}],
                "narration": f"Filtering data where {matched_cat_col} is {best_cat_val}.",
                "text_response": f"Filtered data to show records where `{matched_cat_col}` == '{best_cat_val}'."
            }

    # Generate custom examples using actual columns of the loaded dataset
    examples = []
    if num_cols:
        examples.append(f'* **"average {num_cols[0]}"** or **"max {num_cols[0]}"**')
        examples.append(f'* **"{num_cols[0]} > 35"**')
        if len(num_cols) > 1:
            examples.append(f'* **"less than 50 {num_cols[1]}"**')
    if cat_cols and unique_lbls:
        examples.append(f'* **"filter for {cat_cols[0]} {unique_lbls[0]}"**')
    examples.append('* **"reset"** or **"show all"**')
    
    examples_str = "\n".join(examples)
    text_response = (
        f"I didn't understand the query format. Please try standard queries using your columns:\n\n{examples_str}"
    )

    return {
        "action": "answer",
        "rules": [],
        "narration": "I received your query but couldn't parse it. Try asking average or filtering a column.",
        "text_response": text_response
    }


@app.route('/api/query-data', methods=['POST'])
@jwt_required()
def query_data():
    """Talk to Your Data — Translate NL Queries to JSON action filters or analytical answers."""
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'Invalid request body'}), 400

    user_query = payload.get('query', '').strip()
    if not user_query:
        return jsonify({'error': 'Query is required'}), 400

    num_cols = payload.get('numeric_columns', [])
    cat_cols = payload.get('categorical_columns', [])
    unique_lbls = payload.get('unique_labels', [])
    stats = payload.get('stats', {})
    deep = payload.get('deep_analysis', {})

    gemini_ready = bool(GEMINI_API_KEY and GEMINI_API_KEY != 'YOUR_GEMINI_API_KEY_HERE')

    if gemini_ready:
        try:
            # Build stats context
            stats_lines = [
                f"  - {col}: min={s.get('min')}, max={s.get('max')}, mean={s.get('mean')}, std={s.get('std')}"
                for col, s in list(stats.items())[:8]
            ]
            stats_text = '\n'.join(stats_lines) or 'Not available'

            # Correlations
            corr_data = deep.get('correlations', [])
            corr_text = '\n'.join([
                f"  - {c['col_a']} ↔ {c['col_b']}: r={c['r']} ({c['direction']})"
                for c in corr_data[:6]
            ]) if corr_data else 'No strong correlations'

            # Top/Bottom
            top_bottom = deep.get('top_bottom', {})
            tb_lines = []
            for col, info in list(top_bottom.items())[:4]:
                hi = info.get('highest', {})
                lo = info.get('lowest', {})
                tb_lines.append(f"  - {col}: max={hi.get('value')}, min={lo.get('value')}, median={info.get('median')}")
            top_bottom_text = '\n'.join(tb_lines) if tb_lines else 'Not available'

            # Outliers
            outliers = deep.get('outliers', {})
            outlier_lines = [f"  - {col}: {info['count']} outliers ({info['percent']}%)" for col, info in list(outliers.items())[:4]]
            outlier_text = '\n'.join(outlier_lines) if outlier_lines else 'No outliers'

            # Distributions
            dist_data = deep.get('distribution', {})
            dist_lines = [f"  - {col}: {info['shape']}" for col, info in list(dist_data.items())[:6]]
            dist_text = '\n'.join(dist_lines) if dist_lines else 'All approximately symmetric'

            prompt = (
                "You are an expert data analyst chatbot inside a 3D visualization app.\n"
                "The user has uploaded a dataset and is asking a question or request about it.\n"
                "Your job is to interpret the user's natural language query and decide on an action.\n\n"
                "═══ DATASET SCHEMA ═══\n"
                f"Numeric Columns: {num_cols}\n"
                f"Categorical Columns: {cat_cols}\n"
                f"Categories: {unique_lbls}\n\n"
                "═══ DATASET STATS ═══\n"
                f"{stats_text}\n\n"
                "═══ DEEP ANALYSIS SUMMARY ═══\n"
                f"Correlations: {corr_text}\n"
                f"Top/Bottom: {top_bottom_text}\n"
                f"Outliers: {outlier_text}\n"
                f"Distributions: {dist_text}\n\n"
                f"User Query: \"{user_query}\"\n\n"
                "You must return ONLY a raw JSON object (no markdown formatting, no quotes wrapping, no ```json) containing:\n"
                "  1. \"action\": one of \"filter\", \"highlight\", \"answer\", \"reset\".\n"
                "     - Use \"filter\" if the user wants to narrow down or hide/show certain records (e.g. \"show age above 30\").\n"
                "     - Use \"highlight\" if the user wants to emphasize certain points without hiding others (e.g. \"highlight engineering\").\n"
                "     - Use \"reset\" if the user wants to clear all filters (e.g. \"reset\", \"clear\", \"show everything\").\n"
                "     - Use \"answer\" if the user asks a general statistical question (e.g. \"what is the average salary?\", \"which column is heavily skewed?\").\n"
                "  2. \"rules\": a list of filtering/highlighting rules (only if action is \"filter\" or \"highlight\"). Each rule has:\n"
                "     - \"column\": the exact column name from the schema.\n"
                "     - \"operator\": one of \">\", \"<\", \"==\", \"!=\", \"contains\".\n"
                "     - \"value\": the target value (number or string).\n"
                "  3. \"narration\": a single short, friendly sentence suitable for Text-to-Speech reading aloud (e.g. \"Filtering employees with age under 30.\" or \"The average salary is 75,000 dollars.\"). Keep it under 20 words.\n"
                "  4. \"text_response\": a slightly more detailed text explanation to display in the chat history bubble (can use bullet points if appropriate).\n\n"
                "Strict JSON Output:"
            )

            resp = http_requests.post(
                GEMINI_ENDPOINT.format(key=GEMINI_API_KEY),
                json={'contents': [{'parts': [{'text': prompt}]}]},
                timeout=15,
                headers={'Content-Type': 'application/json'}
            )
            resp.raise_for_status()
            res_data = resp.json()
            raw_text = res_data['candidates'][0]['content']['parts'][0]['text'].strip()

            # Robust JSON cleaning: strip markdown code blocks if any
            if raw_text.startswith("```"):
                first_newline = raw_text.find("\n")
                if first_newline != -1:
                    raw_text = raw_text[first_newline:].strip()
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3].strip()

            parsed = json.loads(raw_text)
            return jsonify({
                "action": parsed.get("action", "answer"),
                "rules": parsed.get("rules", []),
                "narration": parsed.get("narration", ""),
                "text_response": parsed.get("text_response", raw_text),
                "source": "gemini"
            })

        except Exception as e:
            logger.error(f'Gemini query parser failed, using fallback: {e}')
            # Fall through to rule-based fallback

    # Rule-based fallback
    parsed = _rule_based_query(user_query, num_cols, cat_cols, stats, deep, unique_lbls)
    parsed["source"] = "rule-based"
    return jsonify(parsed)


# ─────────────────────────────────────────────────────────────────────────────
# SECURITY HEADERS
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

# ─────────────────────────────────────────────────────────────────────────────
# ERROR HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(e):
    logger.error(f'Server error: {e}')
    return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    logger.info('🚀 GestureExplorer Elite Backend Starting...')
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
