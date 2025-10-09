from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from datetime import datetime
import secrets

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', secrets.token_hex(32))
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Genesys configuration
GENESYS_WEBHOOK_URL = os.getenv('GENESYS_WEBHOOK_URL')

# Store connected users
connected_users = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/manifest.json')
def manifest():
    return jsonify({
        "name": "Genesys Cloud Chat",
        "short_name": "Chat",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#2196F3",
        "orientation": "portrait",
        "icons": [
            {
                "src": "/static/icons/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": "/static/icons/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ]
    })

@app.route('/static/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')

# Health check endpoint
@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

# Receive messages FROM Genesys Cloud
@app.route('/genesys-webhook', methods=['POST'])
def receive_from_genesys():
    try:
        data = request.json
        message = data.get('message', '')
        metadata = data.get('metadata', '')
        
        print(f"Received from Genesys: {message}")
        
        # Broadcast to all connected clients
        socketio.emit('new_message', {
            'message': message,
            'metadata': metadata,
            'timestamp': datetime.now().isoformat(),
            'from': 'genesys'
        })
        
        return jsonify({'status': 'received', 'message': 'Message broadcast to clients'}), 200
    except Exception as e:
        print(f"Error receiving message: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Send messages TO Genesys Cloud
@socketio.on('send_message')
def handle_send_message(data):
    try:
        message = data.get('message', '')
        user = data.get('user', 'Anonymous')
        
        if not message:
            emit('error', {'message': 'Message cannot be empty'})
            return
        
        if not GENESYS_WEBHOOK_URL:
            emit('error', {'message': 'Genesys webhook URL not configured'})
            return
        
        # Send to Genesys via webhook
        payload = {
            "message": f"**{user}**: {message}",
            "metadata": f"pwa_user_{user}"
        }
        
        print(f"Sending to Genesys: {payload}")
        response = requests.post(GENESYS_WEBHOOK_URL, json=payload, timeout=10)
        
        if response.status_code == 200:
            emit('message_sent', {
                'status': 'success',
                'message': message,
                'timestamp': datetime.now().isoformat()
            })
            
            # Broadcast to other connected users
            socketio.emit('new_message', {
                'message': message,
                'user': user,
                'timestamp': datetime.now().isoformat(),
                'from': 'pwa'
            }, skip_sid=request.sid)
        else:
            print(f"Genesys error: {response.status_code} - {response.text}")
            emit('error', {'message': f'Failed to send to Genesys: {response.status_code}'})
            
    except requests.exceptions.Timeout:
        print("Timeout sending to Genesys")
        emit('error', {'message': 'Request timeout - Genesys not responding'})
    except Exception as e:
        print(f"Error sending message: {e}")
        emit('error', {'message': f'Error: {str(e)}'})

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    emit('connected', {'message': 'Connected to chat server'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    if request.sid in connected_users:
        username = connected_users[request.sid]
        del connected_users[request.sid]
        print(f"User {username} disconnected")

@socketio.on('set_user')
def handle_set_user(data):
    username = data.get('username', 'Anonymous')
    connected_users[request.sid] = username
    print(f"User set: {username}")
    emit('user_set', {'username': username})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
