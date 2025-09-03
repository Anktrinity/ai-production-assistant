import os
import json
import sqlite3
import logging
from datetime import datetime
from flask import Flask, request, jsonify, render_template_string
from werkzeug.exceptions import BadRequest, InternalServerError
import openai
import hashlib
import hmac
from functools import wraps
import traceback
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

openai.api_key = os.getenv('OPENAI_API_KEY')
SLACK_SIGNING_SECRET = os.getenv('SLACK_SIGNING_SECRET')
SLACK_BOT_TOKEN = os.getenv('SLACK_BOT_TOKEN')

def init_db():
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id TEXT,
            channel_id TEXT
        )
    ''')
    conn.commit()
    conn.close()

def verify_slack_signature(request_data, timestamp, signature):
    if not SLACK_SIGNING_SECRET:
        return True
    
    basestring = f"v0:{timestamp}:{request_data}"
    my_signature = 'v0=' + hmac.new(
        SLACK_SIGNING_SECRET.encode(),
        basestring.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(my_signature, signature)

def require_slack_verification(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not SLACK_SIGNING_SECRET:
            return f(*args, **kwargs)
            
        timestamp = request.headers.get('X-Slack-Request-Timestamp', '')
        signature = request.headers.get('X-Slack-Signature', '')
        
        if not timestamp or not signature:
            logger.warning("Missing Slack headers")
            return jsonify({'error': 'Unauthorized'}), 401
            
        if not verify_slack_signature(request.get_data(as_text=True), timestamp, signature):
            logger.warning("Invalid Slack signature")
            return jsonify({'error': 'Unauthorized'}), 401
            
        return f(*args, **kwargs)
    return decorated_function

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(BadRequest)
def bad_request(error):
    return jsonify({'error': 'Bad request', 'message': str(error)}), 400

@app.route('/')
def home():
    html = '''
    <h1>AI Production Assistant</h1>
    <p>Status: <span style="color: green;">Running</span></p>
    <h2>Available Endpoints:</h2>
    <ul>
        <li><strong>GET /health</strong> - Health check</li>
        <li><strong>POST /slack/events</strong> - Slack event webhooks</li>
        <li><strong>POST /slack/commands</strong> - Slack slash commands</li>
        <li><strong>GET /tasks</strong> - Get all tasks</li>
        <li><strong>POST /tasks</strong> - Create new task</li>
        <li><strong>POST /chat</strong> - Chat with AI assistant</li>
    </ul>
    '''
    return render_template_string(html)

@app.route('/health', methods=['GET'])
def health_check():
    try:
        conn = sqlite3.connect('tasks.db')
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        conn.close()
        
        openai_status = "configured" if openai.api_key else "not configured"
        slack_status = "configured" if SLACK_BOT_TOKEN else "not configured"
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'database': 'connected',
            'openai': openai_status,
            'slack': slack_status
        }), 200
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 503

@app.route('/slack/events', methods=['POST'])
@require_slack_verification
def slack_events():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data received'}), 400
            
        if data.get('type') == 'url_verification':
            return jsonify({'challenge': data.get('challenge')})
            
        event = data.get('event', {})
        event_type = event.get('type')
        
        if event_type == 'message' and not event.get('bot_id'):
            user_id = event.get('user')
            channel_id = event.get('channel')
            text = event.get('text', '')
            
            if 'ai assistant' in text.lower():
                response = chat_with_openai(text, user_id)
                logger.info(f"AI response generated for user {user_id}")
                
        return jsonify({'status': 'ok'})
        
    except Exception as e:
        logger.error(f"Slack events error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal error'}), 500

@app.route('/slack/commands', methods=['POST'])
@require_slack_verification
def slack_commands():
    try:
        command = request.form.get('command')
        text = request.form.get('text', '')
        user_id = request.form.get('user_id')
        channel_id = request.form.get('channel_id')
        
        if command == '/ai':
            if not text:
                return jsonify({
                    'text': 'Please provide a message to chat with the AI assistant.',
                    'response_type': 'ephemeral'
                })
            
            response = chat_with_openai(text, user_id)
            return jsonify({
                'text': response,
                'response_type': 'in_channel'
            })
            
        elif command == '/task':
            if not text:
                return jsonify({
                    'text': 'Usage: /task [create|list|complete] <description>',
                    'response_type': 'ephemeral'
                })
            
            parts = text.split(' ', 1)
            action = parts[0].lower()
            
            if action == 'create' and len(parts) > 1:
                task_id = create_task(parts[1], user_id, channel_id)
                return jsonify({
                    'text': f'Task created with ID: {task_id}',
                    'response_type': 'in_channel'
                })
                
            elif action == 'list':
                tasks = get_user_tasks(user_id)
                if not tasks:
                    task_list = "No tasks found."
                else:
                    task_list = "\n".join([
                        f"#{task[0]}: {task[1]} ({task[3]})" 
                        for task in tasks
                    ])
                return jsonify({
                    'text': f"Your tasks:\n{task_list}",
                    'response_type': 'ephemeral'
                })
                
            elif action == 'complete' and len(parts) > 1:
                try:
                    task_id = int(parts[1])
                    if complete_task(task_id, user_id):
                        return jsonify({
                            'text': f'Task #{task_id} marked as complete!',
                            'response_type': 'in_channel'
                        })
                    else:
                        return jsonify({
                            'text': f'Task #{task_id} not found or not yours.',
                            'response_type': 'ephemeral'
                        })
                except ValueError:
                    return jsonify({
                        'text': 'Please provide a valid task ID number.',
                        'response_type': 'ephemeral'
                    })
            
            return jsonify({
                'text': 'Usage: /task [create|list|complete] <description>',
                'response_type': 'ephemeral'
            })
            
        return jsonify({
            'text': 'Unknown command',
            'response_type': 'ephemeral'
        })
        
    except Exception as e:
        logger.error(f"Slack command error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'text': 'An error occurred processing your command.',
            'response_type': 'ephemeral'
        }), 500

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400
            
        message = data['message']
        user_id = data.get('user_id', 'api_user')
        
        response = chat_with_openai(message, user_id)
        
        return jsonify({
            'response': response,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to process chat message'}), 500

@app.route('/tasks', methods=['GET', 'POST'])
def tasks():
    try:
        if request.method == 'GET':
            user_id = request.args.get('user_id')
            if user_id:
                tasks = get_user_tasks(user_id)
            else:
                tasks = get_all_tasks()
                
            return jsonify({
                'tasks': [
                    {
                        'id': task[0],
                        'title': task[1],
                        'description': task[2],
                        'status': task[3],
                        'created_at': task[4],
                        'updated_at': task[5],
                        'user_id': task[6],
                        'channel_id': task[7]
                    } for task in tasks
                ]
            })
            
        elif request.method == 'POST':
            data = request.get_json()
            if not data or 'title' not in data:
                return jsonify({'error': 'Title is required'}), 400
                
            title = data['title']
            description = data.get('description', '')
            user_id = data.get('user_id', 'api_user')
            channel_id = data.get('channel_id')
            
            task_id = create_task(title, user_id, channel_id, description)
            
            return jsonify({
                'id': task_id,
                'message': 'Task created successfully'
            }), 201
            
    except Exception as e:
        logger.error(f"Tasks error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to process task request'}), 500

def chat_with_openai(message, user_id=None):
    try:
        if not openai.api_key:
            return "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
        
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "You are an AI Production Assistant helping with event planning and production tasks. Be helpful, concise, and professional."
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
        
    except openai.error.AuthenticationError:
        logger.error("OpenAI authentication failed")
        return "Authentication failed. Please check your OpenAI API key."
    except openai.error.RateLimitError:
        logger.error("OpenAI rate limit exceeded")
        return "Rate limit exceeded. Please try again later."
    except Exception as e:
        logger.error(f"OpenAI error: {e}")
        return "Sorry, I encountered an error processing your request."

def create_task(title, user_id, channel_id=None, description=""):
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO tasks (title, description, user_id, channel_id)
        VALUES (?, ?, ?, ?)
    ''', (title, description, user_id, channel_id))
    task_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return task_id

def get_user_tasks(user_id):
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, title, description, status, created_at, updated_at, user_id, channel_id
        FROM tasks WHERE user_id = ?
        ORDER BY created_at DESC
    ''', (user_id,))
    tasks = cursor.fetchall()
    conn.close()
    return tasks

def get_all_tasks():
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, title, description, status, created_at, updated_at, user_id, channel_id
        FROM tasks
        ORDER BY created_at DESC
    ''')
    tasks = cursor.fetchall()
    conn.close()
    return tasks

def complete_task(task_id, user_id):
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE tasks 
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    ''', (task_id, user_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_ENV') == 'development')