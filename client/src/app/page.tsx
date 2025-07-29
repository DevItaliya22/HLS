import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-blue-500 mb-4">
            🎬 HLS Streaming Platform
          </h1>
          <p className="text-xl text-gray-400">
            Live streaming with adaptive quality and resolution switching
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* HLS Viewer */}
          <Link href="/hls" className="group">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500 transition-all hover:transform hover:scale-105">
              <div className="text-4xl mb-4">📺</div>
              <h2 className="text-xl font-bold text-blue-400 mb-2">
                HLS Viewer
              </h2>
              <p className="text-gray-400">
                Watch live streams with adaptive quality and resolution
                switching
              </p>
              <div className="mt-4 text-sm text-gray-500">
                Features: • Adaptive streaming • Quality switching • Live
                monitoring
              </div>
            </div>
          </Link>

          {/* Watch Page */}
          <Link href="/watch" className="group">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-green-500 transition-all hover:transform hover:scale-105">
              <div className="text-4xl mb-4">🎥</div>
              <h2 className="text-xl font-bold text-green-400 mb-2">
                Advanced Viewer
              </h2>
              <p className="text-gray-400">
                Advanced streaming viewer with HLS and chunk modes
              </p>
              <div className="mt-4 text-sm text-gray-500">
                Features: • HLS & Chunk modes • Resolution controls • Stream
                management
              </div>
            </div>
          </Link>

          {/* Stream Management */}
          <Link href="/stream" className="group">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-all hover:transform hover:scale-105">
              <div className="text-4xl mb-4">📡</div>
              <h2 className="text-xl font-bold text-purple-400 mb-2">
                Stream Info
              </h2>
              <p className="text-gray-400">
                View stream information and manage active streams
              </p>
              <div className="mt-4 text-sm text-gray-500">
                Features: • Stream monitoring • Chunk management • Status
                tracking
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-12 bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-yellow-400 mb-4">
            🚀 Quick Start
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h4 className="font-medium text-white mb-2">For Viewers:</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Click "HLS Viewer" for simple streaming</li>
                <li>Use "Advanced Viewer" for more features</li>
                <li>Select any available stream to start watching</li>
                <li>Switch quality levels using the resolution buttons</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">For Developers:</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Server runs on http://localhost:3000</li>
                <li>Upload chunks to /stream/:streamId/chunk</li>
                <li>HLS playlists available at /hls/:streamId/master.m3u8</li>
                <li>Check /streams for active stream list</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Built with Next.js, HLS.js, and FFmpeg</p>
          <p className="mt-2">
            Server:{" "}
            <span className="text-green-400">http://localhost:3000</span> |
            Client: <span className="text-blue-400">http://localhost:3001</span>
          </p>
        </div>
      </div>
    </div>
  );
}
