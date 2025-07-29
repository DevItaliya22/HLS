"use client";

import { useEffect, useRef, useState } from "react";
import Hls, { Level } from "hls.js";

interface Variant {
  id: string;
  level: number;
  height?: number;
}

interface HLSPlayerProps {
  masterUrl: string;      
  variants: Variant[];  
}

export default function HLSPlayer({ masterUrl, variants }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(masterUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels);
        setCurrentLevel(hls.currentLevel);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = masterUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
    }
  }, [masterUrl]);

  const selectLevel = (level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level;
    }
  };

  return (
    <div className="space-y-2">
      <video ref={videoRef} controls style={{ width: "100%", maxWidth: 800 }} />

      <div className="flex items-center gap-2 text-sm">
        <span>Quality:</span>
        <button
          onClick={() => selectLevel(-1)}
          className={`px-2 py-1 rounded ${
            currentLevel === -1 ? "bg-blue-600 text-black" : "bg-gray-200 text-black"
          }`}
        >
          Auto
        </button>
        {levels.map((lvl, idx) => (
          <button
            key={idx}
            onClick={() => selectLevel(idx)}
            className={`px-2 py-1 rounded ${
              currentLevel === idx ? "bg-blue-600 text-black" : "bg-gray-200 text-black"
            }`}
          >
            {lvl.height ?? `L${idx}`}
          </button>
        ))}
      </div>
    </div>
  );
}