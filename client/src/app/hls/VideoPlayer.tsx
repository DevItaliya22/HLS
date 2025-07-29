"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  data: {
    src: string;
  };
  className?: string;
  [key: string]: any;
}

export default function VideoPlayer({
  data,
  className = "",
  ...props
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const hls = new Hls({
      debug: true,
      enableWorker: true,
      lowLatencyMode: true,
    });

    if (Hls.isSupported()) {
      hls.loadSource(data.src);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed, starting playback");
        videoRef.current?.play().catch((err) => {
          console.error("Error starting playback:", err);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.log("HLS Error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("Network error, trying to recover...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("Media error, trying to recover...");
              hls.recoverMediaError();
              break;
            default:
              console.error("Fatal HLS error:", data);
              break;
          }
        }
      });

      return () => {
        hls.destroy();
      };
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari, iOS)
      videoRef.current.src = data.src;
      videoRef.current.addEventListener("loadedmetadata", () => {
        videoRef.current?.play().catch((err) => {
          console.error("Error starting native HLS playback:", err);
        });
      });
    } else {
      console.log("HLS not supported in this browser");
    }
  }, [data.src]);

  return <video ref={videoRef} controls {...props} className={className} />;
}
