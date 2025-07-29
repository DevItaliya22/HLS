"use client";

import { useState, useEffect, useRef } from "react";
import VideoPlayer from "./VideoPlayer";
import Hls from "hls.js";

interface Stream {
  id: string;
  isLive: boolean;
  chunkCount: number;
  latestChunk: string;
  hasHLS: boolean;
}

interface Resolution {
  level: number;
  height: number;
  width: number;
  bitrate: number;
}

export default function HLSPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [availableResolutions, setAvailableResolutions] = useState<
    Resolution[]
  >([]);
  const [currentResolution, setCurrentResolution] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hlsRef = useRef<Hls | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load available streams
  const loadStreams = async () => {
    try {
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
    }
  };

  // Start HLS playback with resolution switching
  const startHLSPlayback = (streamId: string) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const hlsUrl = `http://localhost:3000/hls/${streamId}/master.m3u8`;

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed, starting playback");

        // Get available resolutions
        const levels = hls.levels;
        if (levels && levels.length > 0) {
          const resolutions = levels.map((level, index) => ({
            level: index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
          }));
          setAvailableResolutions(resolutions);
          setCurrentResolution(-1); // Auto quality
        }

        video.play().catch((err) => {
          console.error("Error starting playback:", err);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentResolution(data.level);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error("HLS Error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError("Fatal HLS error occurred");
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari, iOS)
      video.src = hlsUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch((err) => {
          console.error("Error starting native HLS playback:", err);
        });
      });
    } else {
      setError("HLS not supported in this browser");
    }
  };

  // Change resolution
  const changeResolution = (level: number) => {
    if (hlsRef.current) {
      const hls = hlsRef.current;
      const levels = hls.levels;

      if (levels && level >= -1 && level < levels.length) {
        hls.currentLevel = level;
        setCurrentResolution(level);
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
  const selectStream = (streamId: string) => {
    setSelectedStream(streamId);
    setError(null);
    startHLSPlayback(streamId);
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

    setSelectedStream(null);
    setAvailableResolutions([]);
    setCurrentResolution(-1);
  };

  // Initialize
  useEffect(() => {
    loadStreams();

    // Auto-refresh every 10 seconds
    const interval = setInterval(loadStreams, 10000);

    return () => {
      clearInterval(interval);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
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
          <h1 className="text-4xl font-bold text-blue-500 mb-2">
            🎬 Live HLS Stream Viewer
          </h1>
          <p className="text-gray-400">
            Select a stream to start watching with adaptive quality
          </p>
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
              <div className="text-gray-500 text-lg mb-4">
                No active streams found
              </div>
              <button
                onClick={loadStreams}
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
                  selectedStream === stream.id
                    ? "border-blue-500 bg-gray-700 shadow-lg shadow-blue-500/20"
                    : "border-gray-700 hover:border-blue-400"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-blue-400">
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

        {/* Video Player Section */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-blue-500">
              Now Playing:{" "}
              {selectedStream ? `Stream ${selectedStream}` : "None"}
            </h2>
            <div className="flex items-center gap-2">
              {selectedStream && (
                <button
                  onClick={stopStream}
                  className="px-4 py-2 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
                >
                  ⏹️ Stop
                </button>
              )}
              <button
                onClick={loadStreams}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Video Player */}
          <div className="relative bg-black rounded-lg overflow-hidden mb-4 min-h-[400px] flex items-center justify-center">
            <video
              ref={videoRef}
              className={`w-full h-auto max-h-[500px] ${
                selectedStream ? "block" : "hidden"
              }`}
              controls
              playsInline
              muted={false}
            />
            {!selectedStream && (
              <div className="text-gray-500 text-lg">
                Select a stream to start watching
              </div>
            )}
            {selectedStream &&
              !streams.find((s) => s.id === selectedStream)?.hasHLS && (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <div className="text-gray-500 text-lg">
                    Converting to HLS format...
                  </div>
                  <div className="text-gray-400 text-sm mt-2">
                    This may take a moment for new streams
                  </div>
                </div>
              )}
          </div>

          {/* Resolution Controls */}
          {selectedStream && availableResolutions.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Quality Settings
                </h3>
                <div className="text-xs text-gray-400">
                  Current: {getResolutionName(currentResolution)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => changeResolution(-1)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentResolution === -1
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  }`}
                >
                  🎯 Auto
                </button>
                {availableResolutions.map((resolution, index) => (
                  <button
                    key={index}
                    onClick={() => changeResolution(index)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentResolution === index
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    }`}
                  >
                    {resolution.width}x{resolution.height}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stream Info */}
          {selectedStream && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Stream ID:</span>
                  <div className="font-medium">{selectedStream}</div>
                </div>
                <div>
                  <span className="text-gray-400">Mode:</span>
                  <div className="font-medium">HLS Streaming</div>
                </div>
                <div>
                  <span className="text-gray-400">HLS Status:</span>
                  <div className="font-medium">
                    {streams.find((s) => s.id === selectedStream)?.hasHLS
                      ? "Ready"
                      : "Processing"}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Connection:</span>
                  <div className="font-medium text-green-400">Active</div>
                </div>
                {availableResolutions.length > 0 && (
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

              {/* HLS URL for debugging */}
              {streams.find((s) => s.id === selectedStream)?.hasHLS && (
                <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                  <div className="text-xs text-gray-400 mb-2">HLS URL:</div>
                  <div className="text-xs text-green-400 break-all">
                    http://localhost:3000/hls/{selectedStream}/master.m3u8
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-blue-500 mb-3">
            📖 How to Use
          </h3>
          <div className="text-sm text-gray-300 space-y-2">
            <p>• Select any available stream to start watching</p>
            <p>
              • Use the quality buttons to switch between different resolutions
            </p>
            <p>
              • Auto mode will automatically select the best quality based on
              your connection
            </p>
            <p>
              • The player supports adaptive bitrate streaming for optimal
              performance
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
