"use client";

import React, { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "@videojs/themes/dist/forest/index.css";
import "@videojs/http-streaming";

interface VideoJSPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onReady?: (player: any) => void;
  onError?: (error: any) => void;
}

export default function VideoJSPlayer({
  src,
  poster,
  title = "Live Stream",
  onReady,
  onError,
}: VideoJSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    // Initialize Video.js player
    const player = videojs(videoRef.current, {
      controls: true,
      fluid: true,
      responsive: true,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      controlBar: {
        children: [
          "playToggle",
          "volumePanel",
          "currentTimeDisplay",
          "timeDivider",
          "durationDisplay",
          "progressControl",
          "liveDisplay",
          "remainingTimeDisplay",
          "customControlSpacer",
          "playbackRateMenuButton",
          "qualitySelector",
          "pictureInPictureToggle",
          "fullscreenToggle",
        ],
      },
      sources: [
        {
          src: src,
          type: "application/x-mpegURL",
        },
      ],
      poster: poster || "/placeholder.svg",
      liveui: true,
      liveTracker: {
        trackingThreshold: 0,
        liveTolerance: 15,
      },
      html5: {
        hls: {
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          overrideNative: true,
        },
      },
      preload: "metadata",
    });

    playerRef.current = player;

    // Add custom styling
    player.addClass("vjs-theme-forest");
    player.addClass("vjs-live");

    // Event listeners
    player.on("ready", () => {
      setIsLoading(false);
      console.log("Video.js player is ready");
      if (onReady) onReady(player);
    });

    player.on("loadstart", () => {
      console.log("Video.js: Load started for", src);
      setIsLoading(true);
      setError(null);
    });

    player.on("loadeddata", () => {
      console.log("Video.js: Data loaded for", src);
      setIsLoading(false);
    });

    player.on("error", (err: any) => {
      setIsLoading(false);
      const errorMessage =
        player.error()?.message || "An error occurred while loading the video";
      setError(errorMessage);
      console.error("Video.js error:", err);
      console.error("Error details:", player.error());
      if (onError) onError(err);
    });

    player.on("loadedmetadata", () => {
      console.log("Video.js: Metadata loaded for", src);
      setIsLoading(false);
    });

    player.on("canplay", () => {
      console.log("Video.js: Can play for", src);
      setIsLoading(false);
    });

    player.on("canplaythrough", () => {
      console.log("Video.js: Can play through for", src);
      setIsLoading(false);
    });

    // Cleanup function
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, poster, onReady, onError]);

  // Custom CSS for enhanced styling
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .video-js {
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      }
      
      .video-js .vjs-control-bar {
        background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.8) 100%);
        backdrop-filter: blur(10px);
      }
      
      .video-js .vjs-big-play-button {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        border: none;
        border-radius: 50%;
        width: 80px;
        height: 80px;
        line-height: 80px;
        font-size: 2.5em;
        box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3);
        transition: all 0.3s ease;
      }
      
      .video-js .vjs-big-play-button:hover {
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        transform: scale(1.1);
        box-shadow: 0 15px 35px rgba(239, 68, 68, 0.4);
      }
      
      .video-js .vjs-progress-control .vjs-progress-holder {
        height: 6px;
        border-radius: 3px;
      }
      
      .video-js .vjs-play-progress {
        background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
        border-radius: 3px;
      }
      
      .video-js .vjs-load-progress {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
      }
      
      .video-js .vjs-live-display {
        background: #ef4444;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8em;
        font-weight: 600;
      }
      
      .video-js .vjs-time-control {
        font-size: 0.9em;
        font-weight: 500;
      }
      
      .video-js .vjs-volume-panel {
        margin-right: 10px;
      }
      
      .video-js .vjs-playback-rate .vjs-playback-rate-value {
        font-size: 1.1em;
        font-weight: 600;
      }
      
      .video-js .vjs-quality-selector .vjs-menu-button {
        margin: 0;
      }
      
      .video-js .vjs-menu-button-popup .vjs-menu {
        background: rgba(0, 0, 0, 0.9);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .video-js .vjs-menu-item {
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        margin: 2px;
      }
      
      .video-js .vjs-menu-item:hover {
        background: rgba(239, 68, 68, 0.2);
      }
      
      .video-js .vjs-menu-item.vjs-selected {
        background: #ef4444;
        color: white;
      }
      
      .video-js .vjs-picture-in-picture-control {
        margin-right: 5px;
      }
      
      .video-js .vjs-fullscreen-control {
        margin-right: 0;
      }
      
      .video-js .vjs-tech {
        border-radius: 12px;
      }
      
      .video-js .vjs-loading-spinner {
        border: 3px solid rgba(239, 68, 68, 0.3);
        border-top: 3px solid #ef4444;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .video-js .vjs-error-display {
        background: rgba(0, 0, 0, 0.8);
        border-radius: 8px;
        padding: 20px;
      }
      
      .video-js .vjs-error-display .vjs-error-message {
        color: #ef4444;
        font-weight: 600;
      }
      
      .video-js .vjs-text-track-display {
        border-radius: 4px;
      }
      
      .video-js .vjs-text-track-cue {
        background: rgba(0, 0, 0, 0.8);
        border-radius: 4px;
        padding: 4px 8px;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="relative w-full">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10 rounded-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-500 mx-auto mb-4"></div>
            <p className="text-white font-medium">Loading stream...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10 rounded-xl">
          <div className="text-center p-6">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <p className="text-white font-medium mb-2">Stream Error</p>
            <p className="text-gray-300 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Video.js Player */}
      <div className="relative">
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-fluid"
          data-setup="{}"
          title={title}
        />
      </div>

      {/* Stream Title Overlay */}
      <div className="absolute top-4 left-4 z-20">
        <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-lg px-3 py-2">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
        </div>
      </div>

      {/* Live Indicator */}
      <div className="absolute top-4 right-4 z-20">
        <div className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
          🔴 LIVE
        </div>
      </div>
    </div>
  );
}
