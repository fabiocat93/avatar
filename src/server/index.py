import socket
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import base64
import os
import time
import json
import threading
import pickle
import struct

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

SEND_PORT = 12345  # Port for sending audio data
RECV_PORT = 12346  # Port for receiving processed data
SERVER_HOST = "localhost"  # The host for the second server

def receive_full_chunk(recv_socket, chunk_size):
    """Helper function to receive the full chunk of data from the socket."""
    data = b''
    while len(data) < chunk_size:
        chunk = recv_socket.recv(chunk_size - len(data))
        if not chunk:
            break  # Handle disconnection or end of data
        data += chunk
    return data if data else None

def stream_json_bytes_from_server(recv_socket):
    """Yields JSON response chunks from the other server in real-time."""
    while True:
        # Step 1: Receive the first 4 bytes to get the packet length
        length_data = receive_full_chunk(recv_socket, 4)
        print("length_data", length_data)
        if not length_data:
            continue  # Handle disconnection or no data

        # Step 2: Unpack the length (4 bytes)
        packet_length = struct.unpack('!I', length_data)[0]
        print("packet_length", packet_length)

        # Step 3: Receive the full packet based on the length
        serialized_packet = receive_full_chunk(recv_socket, packet_length)
        print(serialized_packet)
        if serialized_packet:
            # Step 4: Deserialize the packet using pickle
            packet = pickle.loads(serialized_packet)
            
            # Step 5: Convert the packet to JSON if it's valid
            json_packet = json.dumps(packet)
            yield json_packet + '\n'
            
            # Simulate delay between chunks
            time.sleep(0.01)


@app.route('/stream-audio', methods=['POST'])
def stream_audio():
    data = request.json

    if 'audio' in data:
        # Decode base64 audio
        audio_data = base64.b64decode(data['audio'])

        # Initialize send and recv sockets
        send_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        recv_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

        try:
            # Connect to the server send port
            send_socket.connect((SERVER_HOST, SEND_PORT))

            # Connect to the server recv port
            recv_socket.connect((SERVER_HOST, RECV_PORT))

            # Send the audio data to the second server
            send_socket.sendall(audio_data)

            # Stream the response from the second server back to the client
            return Response(stream_json_bytes_from_server(recv_socket), content_type='application/json')

        except socket.error as e:
            print(f"Socket error: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500

        finally:
            send_socket.close()
            recv_socket.close()

    else:
        return jsonify({'status': 'error', 'message': 'No audio data found'}), 400

if __name__ == '__main__':
    if os.path.exists('audio_chunk.wav'):
        os.remove('audio_chunk.wav')  # Clean previous session if necessary
    app.run(port=5001)
