import React, { useState, useRef } from 'react';
import RecordRTC from 'recordrtc';

function StreamAudioComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [streamedData, setStreamedData] = useState([]);  // Store streamed base64 chunks
  const [decodedMessages, setDecodedMessages] = useState([]);  // Store decoded messages
  const recorder = useRef(null);
  const audioStream = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.current = stream;
      
      recorder.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        audioBitsPerSecond: 128000,
        timeSlice: 1000, // Capture chunks every milli second
        ondataavailable: (blob) => {
          sendAudioChunk(blob);
        }
      });

      recorder.current.startRecording();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (recorder.current) {
      recorder.current.stopRecording(() => {
        recorder.current = null;
        audioStream.current.getTracks().forEach(track => track.stop()); // Stop the microphone
      });
      setIsRecording(false);
    }
  };

  const sendAudioChunk = async (blob) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = reader.result.split(',')[1]; // Get base64 audio data
      setStreamedData(prevData => [...prevData, base64Audio]);

      // Send audio chunk to the server
      const url = 'http://localhost:5001/stream-audio';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio })
      });

      const readerStream = response.body.getReader();
      const decoder = new TextDecoder();

      // Read the streamed JSON chunks
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await readerStream.read();
        done = streamDone;
        if (value) {
          const chunkText = decoder.decode(value, { stream: true });
          try {
            const chunkJson = JSON.parse(chunkText.trim());
            const message_chunk = chunkJson.message_chunk;
            setDecodedMessages(prevMessages => [...prevMessages, message_chunk]);
          } catch (err) {
            console.error("Error parsing chunk:", err);
          }
        }
      }
    };
    reader.readAsDataURL(blob); // Convert blob to base64
  };

  return (
    <div>
      <h2>Stream Audio to Server</h2>
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>

      <div>
        <h3>Streamed Base64 Chunks:</h3>
        <ul>
          {streamedData.map((data, index) => (
            <li key={index}>Base64 Chunk {index + 1}: {data}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Decoded Messages:</h3>
        <ul>
          {decodedMessages.map((message, index) => (
            <li key={index}>Decoded Chunk {index + 1}: {message} </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default StreamAudioComponent;
