"use client";

import React, { useState, useEffect, useRef } from 'react';

const StreamViewer = () => {
  const [streams, setStreams] = useState<{ id: string; isLive: boolean; chunkCount: number; latestChunk: string }[]>([]);
  const [currentStream, setCurrentStream] = useState<string | null>(null);
  const [currentChunks, setCurrentChunks] = useState<{ url: string; mtime: string }[]>([]);
  const [selectedChunkIndex, setSelectedChunkIndex] = useState(-1);
  const [autoPlay, setAutoPlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load all available streams
  const loadStreams = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('http://localhost:3000/streams');
      if (!response.ok) throw new Error('Failed to fetch streams');
      
      const streamsData = await response.json();
      setStreams(streamsData);
      setError(null);
    } catch (err) {
      console.error('Error loading streams:', err);
      setError('Failed to load streams');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load chunks for a specific stream
  const loadStreamChunks = async (streamId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/stream/${streamId}`);
      if (!response.ok) throw new Error('Stream not found');
      
      const streamData = await response.json();
      setCurrentChunks(streamData.chunks);
      
      // Auto-play the latest chunk if auto-play is enabled
      if (streamData.chunks.length > 0 && autoPlay) {
        const latestIndex = streamData.chunks.length - 1;
        playChunk(streamData.chunks[latestIndex], latestIndex);
      }
    } catch (err) {
      console.error('Error loading stream chunks:', err);
      setError(`Failed to load stream: ${streamId}`);
    }
  };

  // Select a stream
  const selectStream = async (streamId: string) => {
    setCurrentStream(streamId);
    setSelectedChunkIndex(-1);
    await loadStreamChunks(streamId);
  };

  // Play a specific chunk
  const playChunk = (chunk: { url: string; mtime: string }, index: number) => {
    if (videoRef.current && chunk) {
      videoRef.current.src = `http://localhost:3000${chunk.url}`;
      setSelectedChunkIndex(index);
      
      // Handle video end for auto-play
      videoRef.current.onended = () => {
        if (videoRef.current && autoPlay) {
          playNextChunk();
        }
      };
    }
  };

  // Play next chunk
  const playNextChunk = () => {
    const nextIndex = selectedChunkIndex + 1;
    if (nextIndex < currentChunks.length) {
      playChunk(currentChunks[nextIndex], nextIndex);
    } else if (currentStream) {
      // Refresh to get new chunks
      loadStreamChunks(currentStream);
    }
  };

  // Play previous chunk
  const playPreviousChunk = () => {
    const prevIndex = selectedChunkIndex - 1;
    if (prevIndex >= 0) {
      playChunk(currentChunks[prevIndex], prevIndex);
    }
  };

  // Stop current stream
  const stopStream = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    setCurrentStream(null);
    setCurrentChunks([]);
    setSelectedChunkIndex(-1);
    setAutoPlay(false);
  };

  // Toggle auto-play
  const toggleAutoPlay = () => {
    setAutoPlay(!autoPlay);
  };

  // Refresh streams and current stream chunks
  const refreshAll = async () => {
    await loadStreams();
    if (currentStream) {
      await loadStreamChunks(currentStream);
    }
  };

  // Initialize and set up auto-refresh
  useEffect(() => {
    loadStreams();
    
    // Auto-refresh every 5 seconds
    refreshIntervalRef.current = setInterval(() => {
      loadStreams();
      if (currentStream) {
        loadStreamChunks(currentStream);
      }
    }, 5000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [currentStream]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading streams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-red-500 mb-2">🎬 Stream Viewer</h1>
          <p className="text-gray-400">Select a stream to start watching</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-200">⚠️ {error}</p>
          </div>
        )}

        {/* Streams Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {streams.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-500 text-lg mb-4">No active streams found</div>
              <button
                onClick={refreshAll}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
          ) : (
            streams.map((stream) => (
              <div
                key={stream.id}
                onClick={() => selectStream(stream.id)}
                className={`bg-gray-800 rounded-xl p-4 border cursor-pointer transition-all hover:transform hover:scale-105 ${
                  currentStream === stream.id
                    ? 'border-red-500 bg-gray-700 shadow-lg shadow-red-500/20'
                    : 'border-gray-700 hover:border-red-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-red-400">Stream {stream.id}</h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      stream.isLive 
                        ? 'bg-red-600 text-white' 
                        : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    {stream.isLive ? '🔴 LIVE' : '⚫ OFFLINE'}
                  </span>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chunks: {stream.chunkCount}</div>
                  <div>Latest: {stream.latestChunk || 'None'}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Player Section */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-red-500">
              Now Playing: {currentStream ? `Stream ${currentStream}` : 'None'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg transition-colors text-sm"
              >
                {refreshing ? '⏳' : '🔄'} Refresh
              </button>
            </div>
          </div>

          {/* Video Player */}
          <div className="relative bg-black rounded-lg overflow-hidden mb-4 min-h-[400px] flex items-center justify-center">
            <video
              ref={videoRef}
              className={`w-full h-auto max-h-[500px] ${selectedChunkIndex >= 0 ? 'block' : 'hidden'}`}
              controls
              playsInline
            />
            {selectedChunkIndex < 0 && (
              <div className="text-gray-500 text-lg">
                {currentStream ? 'Select a chunk to play' : 'Select a stream to start watching'}
              </div>
            )}
          </div>

          {/* Chunk Controls */}
          {currentChunks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Available Chunks ({currentChunks.length})
                </h3>
                <div className="text-xs text-gray-400">
                  Playing: {selectedChunkIndex >= 0 ? `Chunk ${selectedChunkIndex + 1}` : 'None'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {currentChunks.map((chunk, index) => (
                  <button
                    key={index}
                    onClick={() => playChunk(chunk, index)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      selectedChunkIndex === index
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    Chunk {index + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Player Controls */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={playPreviousChunk}
              disabled={selectedChunkIndex <= 0}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              ⏮️ Previous
            </button>
            <button
              onClick={playNextChunk}
              disabled={selectedChunkIndex >= currentChunks.length - 1}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              ⏭️ Next
            </button>
            <button
              onClick={toggleAutoPlay}
              className={`px-4 py-2 rounded-lg transition-colors ${
                autoPlay 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {autoPlay ? '⏸️ Auto Play ON' : '▶️ Auto Play OFF'}
            </button>
            <button
              onClick={stopStream}
              className="px-4 py-2 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
            >
              ⏹️ Stop
            </button>
          </div>

          {/* Stream Info */}
          {currentStream && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Stream ID:</span>
                  <div className="font-medium">{currentStream}</div>
                </div>
                <div>
                  <span className="text-gray-400">Total Chunks:</span>
                  <div className="font-medium">{currentChunks.length}</div>
                </div>
                <div>
                  <span className="text-gray-400">Auto Play:</span>
                  <div className="font-medium">{autoPlay ? 'Enabled' : 'Disabled'}</div>
                </div>
                <div>
                  <span className="text-gray-400">Status:</span>
                  <div className="font-medium text-green-400">Connected</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;