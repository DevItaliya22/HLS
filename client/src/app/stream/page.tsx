"use client";

import React, { useState, useRef, useEffect } from 'react';

const StreamCreator = () => {
  const [streamId, setStreamId] = useState('');
  const [chunkDuration, setChunkDuration] = useState(3);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [logs, setLogs] = useState<{ message: string; type: string; timestamp: string }[]>([]);
  const [streamStatus, setStreamStatus] = useState('Not Started');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add log entry
  const addLog = (message: string, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), { message, type, timestamp }]);
  };

  // Generate random stream ID
  const generateStreamId = () => {
    const randomId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setStreamId(randomId);
    addLog(`Generated stream ID: ${randomId}`, 'success');
  };

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraOn(true);
        setStreamStatus('Camera Ready');
        addLog('Camera started successfully', 'success');
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      addLog(`Camera error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
      setIsCameraOn(false);
      setStreamStatus('Camera Stopped');
      addLog('Camera stopped', 'info');
    }
  };

  // Upload chunk to server
  const uploadChunk = async (blob: Blob, chunkIndex: number) => {
    try {
      const formData = new FormData();
      formData.append('chunk', blob, `chunk_${chunkIndex}.webm`);
      formData.append('chunkIndex', chunkIndex.toString());

      const response = await fetch(`http://localhost:3000/stream/${streamId}/chunk`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        addLog(`Chunk ${chunkIndex} uploaded successfully`, 'success');
        setChunkCount(prev => prev + 1);
        return true;
      } else {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
    } catch (error) {
      addLog(`Chunk ${chunkIndex} upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return false;
    }
  };

  // Start streaming
  const startStreaming = async () => {
    if (!streamId.trim()) {
      addLog('Please enter a stream ID', 'error');
      return;
    }

    if (!streamRef.current) {
      addLog('Please start camera first', 'error');
      return;
    }

    try {
      // Create MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });

      let chunkIndex = 0;
      let chunks: BlobPart[] = [];

      mediaRecorderRef.current.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'video/webm' });
          await uploadChunk(blob, chunkIndex);
          chunkIndex++;
          chunks = [];
        }
      };

      // Start recording and set up chunk interval
      mediaRecorderRef.current.start();
      setIsStreaming(true);
      setStreamStatus('Live Streaming');
      setChunkCount(0);
      addLog(`Started streaming with ${chunkDuration}s chunks`, 'success');

      // Create chunks at specified intervals
      chunkIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, chunkDuration * 1000);

    } catch (error) {
      console.error('Error starting stream:', error);
      addLog(`Streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  // Stop streaming
  const stopStreaming = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    setIsStreaming(false);
    setStreamStatus('Stream Stopped');
    addLog('Streaming stopped', 'info');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-red-500 mb-2">📹 Stream Creator</h1>
          <p className="text-gray-400">Create and manage your live stream</p>
        </div>

        {/* Stream Setup */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-gray-300 font-medium mb-2">Stream ID</label>
              <input
                type="text"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                placeholder="Enter unique stream ID"
                className="w-full p-3 rounded-lg border border-gray-600 bg-gray-700 text-white focus:border-red-500 focus:outline-none"
                disabled={isStreaming}
              />
            </div>
            <div>
              <label className="block text-gray-300 font-medium mb-2">Chunk Duration</label>
              <select
                value={chunkDuration}
                onChange={(e) => setChunkDuration(Number(e.target.value))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-gray-700 text-white focus:border-red-500 focus:outline-none"
                disabled={isStreaming}
              >
                <option value={2}>2 seconds</option>
                <option value={3}>3 seconds</option>
                <option value={4}>4 seconds</option>
                <option value={5}>5 seconds</option>
              </select>
            </div>
          </div>

          {/* Video Preview */}
          <div className="relative bg-black rounded-lg overflow-hidden mb-6 min-h-[300px] flex items-center justify-center">
            <video
              ref={videoRef}
              className={`w-full h-auto max-h-96 ${isCameraOn ? 'block' : 'hidden'}`}
              muted
              autoPlay
              playsInline
            />
            {!isCameraOn && (
              <div className="text-gray-500 text-lg">Click "Start Camera" to begin</div>
            )}
            {isStreaming && (
              <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium animate-pulse">
                🔴 LIVE STREAMING
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={startCamera}
              disabled={isCameraOn || isStreaming}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              📷 Start Camera
            </button>
            <button
              onClick={startStreaming}
              disabled={!isCameraOn || isStreaming || !streamId.trim()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              🎬 Start Streaming
            </button>
            <button
              onClick={stopStreaming}
              disabled={!isStreaming}
              className="px-6 py-3 bg-red-800 hover:bg-red-900 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              ⏹️ Stop Streaming
            </button>
            <button
              onClick={generateStreamId}
              disabled={isStreaming}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              🎲 Random ID
            </button>
          </div>
        </div>

        {/* Status Section */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-xl font-bold text-red-500 mb-4">Stream Status</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex justify-between border-b border-gray-700 pb-2">
              <span className="text-gray-400">Status:</span>
              <span className="font-medium">{streamStatus}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-2">
              <span className="text-gray-400">Stream ID:</span>
              <span className="font-medium">{streamId || 'Not Set'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-2">
              <span className="text-gray-400">Chunks Sent:</span>
              <span className="font-medium">{chunkCount}</span>
            </div>
          </div>

          {/* Logs */}
          <div className="bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Activity Log</h4>
            {logs.length === 0 ? (
              <div className="text-gray-500 text-sm">No activity yet...</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`text-xs ${
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'error' ? 'text-red-400' : 'text-gray-400'
                    }`}
                  >
                    <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamCreator;