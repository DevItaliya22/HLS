"use client";

import React, { useState, useEffect, useRef } from "react";

const HLSStreamViewer = () => {
  const [streams, setStreams] = useState<
    {
      id: string;
      isLive: boolean;
      chunkCount: number;
      latestChunk: string;
      hasHLS: boolean;
    }[]
  >([]);
  const [currentStream, setCurrentStream] = useState<string | null>(null);
  const [currentChunks, setCurrentChunks] = useState<
    { url: string; mtime: string }[]
  >([]);
  const [selectedChunkIndex, setSelectedChunkIndex] = useState(-1);
  const [viewMode, setViewMode] = useState<"hls" | "chunks">("hls");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hlsSupported, setHlsSupported] = useState(false);
  const [availableResolutions, setAvailableResolutions] = useState<
    { level: number; height: number; width: number; bitrate: number }[]
  >([]);
  const [currentResolution, setCurrentResolution] = useState<number>(-1);
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check HLS support
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check native HLS support
      const video = document.createElement("video");
      const nativeSupport =
        video.canPlayType("application/vnd.apple.mpegurl") !== "";

      // Check HLS.js support (for browsers without native support)
      const hlsJsSupport =
        typeof window !== "undefined" && "MediaSource" in window;

      setHlsSupported(nativeSupport || hlsJsSupport);

      // Load HLS.js if needed and not natively supported
      if (!nativeSupport && hlsJsSupport) {
        loadHlsJs();
      }
    }
  }, []);

  // Dynamically load HLS.js
  const loadHlsJs = () => {
    if (document.querySelector('script[src*="hls.js"]')) return;

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
    script.onload = () => {
      console.log("HLS.js loaded");
    };
    document.head.appendChild(script);
  };

  // Load all available streams
  const loadStreams = async () => {
    try {
      setRefreshing(true);
      const response = await fetch("http://localhost:3000/streams");
      if (!response.ok) throw new Error("Failed to fetch streams");

      const streamsData = await response.json();
      setStreams(streamsData);
      setError(null);
    } catch (err) {
      console.error("Error loading streams:", err);
      setError("Failed to load streams");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load chunks for a specific stream (for fallback mode)
  const loadStreamChunks = async (streamId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/stream/${streamId}`);
      if (!response.ok) throw new Error("Stream not found");

      const streamData = await response.json();
      setCurrentChunks(streamData.chunks);
    } catch (err) {
      console.error("Error loading stream chunks:", err);
      setError(`Failed to load stream: ${streamId}`);
    }
  };

  // Start HLS playback
  const startHLSPlayback = (streamId: string) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const hlsUrl = `http://localhost:3000/hls/${streamId}/master.m3u8`;

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Check if browser supports HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari, iOS)
      video.src = hlsUrl;
      video.play().catch((err) => {
        console.error("Error starting native HLS playback:", err);
        setError("Failed to start HLS playback");
      });
    } else if (
      typeof window !== "undefined" &&
      (window as any).Hls &&
      (window as any).Hls.isSupported()
    ) {
      // Use HLS.js for other browsers
      const hls = new (window as any).Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed, starting playback");

        // Get available resolutions
        const levels = hls.levels;
        if (levels && levels.length > 0) {
          const resolutions = levels.map((level: any, index: number) => ({
            level: index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
          }));
          setAvailableResolutions(resolutions);
          setCurrentResolution(-1); // Auto quality
        }

        video.play().catch((err) => {
          console.error("Error starting HLS.js playback:", err);
          setError("Failed to start HLS playback");
        });
      });

      hls.on((window as any).Hls.Events.ERROR, (event: any, data: any) => {
        console.error("HLS.js error:", data);
        if (data.fatal) {
          switch (data.type) {
            case (window as any).Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case (window as any).Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError("Fatal HLS error occurred");
              break;
          }
        }
      });
    } else {
      setError("HLS not supported in this browser");
    }
  };

  // Change resolution
  const changeResolution = (level: number) => {
    if (
      hlsRef.current &&
      typeof window !== "undefined" &&
      (window as any).Hls
    ) {
      const hls = hlsRef.current;
      const levels = hls.levels;

      if (levels && level >= -1 && level < levels.length) {
        hls.currentLevel = level;
        setCurrentResolution(level);
        setShowResolutionMenu(false);
        console.log(`Switched to resolution level: ${level}`);
      }
    }
  };

  // Get resolution display name
  const getResolutionName = (level: number) => {
    if (level === -1) return "Auto";
    if (level >= 0 && level < availableResolutions.length) {
      const res = availableResolutions[level];
      return `${res.width}x${res.height} (${Math.round(
        res.bitrate / 1000
      )}kbps)`;
    }
    return "Unknown";
  };

  // Select a stream
  const selectStream = async (streamId: string) => {
    setCurrentStream(streamId);
    setSelectedChunkIndex(-1);
    setError(null);

    const selectedStreamData = streams.find((s) => s.id === streamId);

    if (viewMode === "hls" && selectedStreamData?.hasHLS) {
      startHLSPlayback(streamId);
    } else {
      await loadStreamChunks(streamId);
    }
  };

  // Play a specific chunk (fallback mode)
  const playChunk = (chunk: { url: string; mtime: string }, index: number) => {
    if (videoRef.current && chunk) {
      // Clean up HLS if active
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      videoRef.current.src = `http://localhost:3000${chunk.url}`;
      setSelectedChunkIndex(index);
    }
  };

  // Stop current stream
  const stopStream = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setCurrentStream(null);
    setCurrentChunks([]);
    setSelectedChunkIndex(-1);
    setCurrentResolution(-1); // Reset resolution when stopping
  };

  // Switch view mode
  const switchViewMode = (mode: "hls" | "chunks") => {
    setViewMode(mode);
    if (currentStream) {
      selectStream(currentStream);
    }
  };

  // Refresh streams and current stream
  const refreshAll = async () => {
    await loadStreams();
    if (currentStream && viewMode === "chunks") {
      await loadStreamChunks(currentStream);
    }
  };

  // Initialize and set up auto-refresh
  useEffect(() => {
    loadStreams();

    // Auto-refresh every 5 seconds
    refreshIntervalRef.current = setInterval(() => {
      loadStreams();
      if (currentStream && viewMode === "chunks") {
        loadStreamChunks(currentStream);
      }
    }, 5000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [currentStream, viewMode]);

  // Handle clicking outside resolution menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showResolutionMenu && !target.closest(".resolution-menu")) {
        setShowResolutionMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showResolutionMenu]);

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
          <h1 className="text-4xl font-bold text-red-500 mb-2">
            🎬 HLS Stream Viewer
          </h1>
          <p className="text-gray-400">
            Select a stream to start watching in HLS or chunk mode
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-center mb-6">
          <div className="bg-gray-800 rounded-lg p-1 border border-gray-700">
            <button
              onClick={() => switchViewMode("hls")}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === "hls"
                  ? "bg-red-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              🎥 HLS Mode
            </button>
            <button
              onClick={() => switchViewMode("chunks")}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === "chunks"
                  ? "bg-red-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              📹 Chunks Mode
            </button>
          </div>
        </div>

        {/* HLS Support Warning */}
        {viewMode === "hls" && !hlsSupported && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4 mb-6">
            <p className="text-yellow-200">
              ⚠️ HLS may not be fully supported in this browser. Consider
              switching to Chunks Mode.
            </p>
          </div>
        )}

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
              <div className="text-gray-500 text-lg mb-4">
                No active streams found
              </div>
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
                    ? "border-red-500 bg-gray-700 shadow-lg shadow-red-500/20"
                    : "border-gray-700 hover:border-red-400"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-red-400">
                    Stream {stream.id}
                  </h3>
                  <div className="flex gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        stream.isLive
                          ? "bg-red-600 text-white"
                          : "bg-gray-600 text-gray-300"
                      }`}
                    >
                      {stream.isLive ? "🔴 LIVE" : "⚫ OFFLINE"}
                    </span>
                    {stream.hasHLS && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-600 text-white">
                        📺 HLS
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chunks: {stream.chunkCount}</div>
                  <div>Latest: {stream.latestChunk || "None"}</div>
                  <div>
                    HLS Ready: {stream.hasHLS ? "Yes" : "Processing..."}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Player Section */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-red-500">
              Now Playing: {currentStream ? `Stream ${currentStream}` : "None"}
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-sm ${
                  viewMode === "hls"
                    ? "bg-green-600 text-white"
                    : "bg-blue-600 text-white"
                }`}
              >
                {viewMode === "hls" ? "📺 HLS" : "📹 Chunks"}
              </span>
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg transition-colors text-sm"
              >
                {refreshing ? "⏳" : "🔄"} Refresh
              </button>
            </div>
          </div>

          {/* Video Player */}
          <div className="relative bg-black rounded-lg overflow-hidden mb-4 min-h-[400px] flex items-center justify-center">
            <video
              ref={videoRef}
              className={`w-full h-auto max-h-[500px] ${
                (viewMode === "hls" && currentStream) || selectedChunkIndex >= 0
                  ? "block"
                  : "hidden"
              }`}
              controls
              playsInline
              muted={false}
            />
            {!currentStream && (
              <div className="text-gray-500 text-lg">
                Select a stream to start watching
              </div>
            )}
            {currentStream &&
              viewMode === "hls" &&
              !streams.find((s) => s.id === currentStream)?.hasHLS && (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
                  <div className="text-gray-500 text-lg">
                    Converting to HLS format...
                  </div>
                  <div className="text-gray-400 text-sm mt-2">
                    This may take a moment for new streams
                  </div>
                </div>
              )}
            {currentStream &&
              viewMode === "chunks" &&
              selectedChunkIndex < 0 && (
                <div className="text-gray-500 text-lg">
                  Select a chunk to play
                </div>
              )}
          </div>

          {/* Chunk Controls (only in chunks mode) */}
          {viewMode === "chunks" && currentChunks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Available Chunks ({currentChunks.length})
                </h3>
                <div className="text-xs text-gray-400">
                  Playing:{" "}
                  {selectedChunkIndex >= 0
                    ? `Chunk ${selectedChunkIndex + 1}`
                    : "None"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {currentChunks.map((chunk, index) => (
                  <button
                    key={index}
                    onClick={() => playChunk(chunk, index)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      selectedChunkIndex === index
                        ? "bg-red-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
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
            {viewMode === "chunks" && (
              <>
                <button
                  onClick={() => {
                    const prevIndex = selectedChunkIndex - 1;
                    if (prevIndex >= 0) {
                      playChunk(currentChunks[prevIndex], prevIndex);
                    }
                  }}
                  disabled={selectedChunkIndex <= 0}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  ⏮️ Previous
                </button>
                <button
                  onClick={() => {
                    const nextIndex = selectedChunkIndex + 1;
                    if (nextIndex < currentChunks.length) {
                      playChunk(currentChunks[nextIndex], nextIndex);
                    }
                  }}
                  disabled={selectedChunkIndex >= currentChunks.length - 1}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  ⏭️ Next
                </button>
              </>
            )}

            {/* Resolution Button - Only show in HLS mode when resolutions are available */}
            {viewMode === "hls" &&
              currentStream &&
              availableResolutions.length > 0 && (
                <div className="relative resolution-menu">
                  <button
                    onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors flex items-center gap-2"
                  >
                    📺 {getResolutionName(currentResolution)}
                    <span className="text-xs">▼</span>
                  </button>

                  {/* Resolution Dropdown Menu */}
                  {showResolutionMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 min-w-[200px]">
                      <div className="p-2">
                        <div className="text-xs text-gray-400 mb-2 px-2">
                          Select Resolution:
                        </div>
                        {/* Auto Quality Option */}
                        <button
                          onClick={() => changeResolution(-1)}
                          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            currentResolution === -1
                              ? "bg-blue-600 text-white"
                              : "text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          🎯 Auto Quality
                        </button>

                        {/* Available Resolutions */}
                        {availableResolutions.map((resolution, index) => (
                          <button
                            key={index}
                            onClick={() => changeResolution(index)}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                              currentResolution === index
                                ? "bg-blue-600 text-white"
                                : "text-gray-300 hover:bg-gray-700"
                            }`}
                          >
                            {resolution.width}x{resolution.height} (
                            {Math.round(resolution.bitrate / 1000)}kbps)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            <button
              onClick={stopStream}
              className="px-4 py-2 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
            >
              ⏹️ Stop
            </button>
            {viewMode === "hls" && currentStream && (
              <button
                onClick={() => startHLSPlayback(currentStream)}
                className="px-4 py-2 bg-green-700 hover:bg-green-800 rounded-lg transition-colors"
              >
                🔄 Restart HLS
              </button>
            )}
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
                  <span className="text-gray-400">Mode:</span>
                  <div className="font-medium">
                    {viewMode === "hls" ? "HLS Streaming" : "Chunk Playback"}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">
                    {viewMode === "hls" ? "HLS Status:" : "Total Chunks:"}
                  </span>
                  <div className="font-medium">
                    {viewMode === "hls"
                      ? streams.find((s) => s.id === currentStream)?.hasHLS
                        ? "Ready"
                        : "Processing"
                      : currentChunks.length}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Connection:</span>
                  <div className="font-medium text-green-400">Active</div>
                </div>
                {viewMode === "hls" && availableResolutions.length > 0 && (
                  <>
                    <div>
                      <span className="text-gray-400">Resolution:</span>
                      <div className="font-medium text-blue-400">
                        {getResolutionName(currentResolution)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">Available:</span>
                      <div className="font-medium">
                        {availableResolutions.length} quality levels
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* HLS URLs for debugging */}
              {viewMode === "hls" &&
                currentStream &&
                streams.find((s) => s.id === currentStream)?.hasHLS && (
                  <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                    <div className="text-xs text-gray-400 mb-2">HLS URLs:</div>
                    <div className="text-xs text-green-400 break-all">
                      Master: http://localhost:3000/hls/{currentStream}
                      /master.m3u8
                    </div>
                    <div className="text-xs text-blue-400 break-all mt-1">
                      Global: http://localhost:3000/hls/media.m3u8
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-red-500 mb-3">📖 How to Use</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h4 className="font-medium text-white mb-2">🎥 HLS Mode</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Adaptive quality streaming</li>
                <li>Automatic buffering</li>
                <li>Low latency playback</li>
                <li>Works best for live streams</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">📹 Chunks Mode</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Manual chunk selection</li>
                <li>Frame-by-frame control</li>
                <li>Fallback for unsupported browsers</li>
                <li>Good for debugging</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HLSStreamViewer;
