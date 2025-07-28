import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
const PORT = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Base directories
const CHUNKS_DIR = path.join(__dirname, '..', 'chunks');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const HLS_OUTPUT_DIR = path.join(__dirname, '..', 'hls_output');

// HLS Configuration
const HLS_RESOLUTIONS = [
    { name: '240p', resolution: '426x240', bitrate: '400k' },
    { name: '360p', resolution: '640x360', bitrate: '800k' },
    { name: '480p', resolution: '854x480', bitrate: '1200k' },
    { name: '720p', resolution: '1280x720', bitrate: '2000k' },
];

// GLOBAL MEMORY STORE for tracking chunk processing
interface ChunkProcessingStatus {
    streamId: string;
    chunkFilename: string;
    chunkNumber: string;
    completedResolutions: Set<string>;
    totalResolutions: number;
    startTime: number;
}

const processingQueue = new Map<string, ChunkProcessingStatus>();

// Function to ensure directory exists
function ensureDirectoryExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
    }
}

// Initialize directories
function initializeDirectories() {
    ensureDirectoryExists(CHUNKS_DIR);
    ensureDirectoryExists(PUBLIC_DIR);
    ensureDirectoryExists(HLS_OUTPUT_DIR);
    console.log('✅ Directories initialized');
}

// Configure multer for chunk uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const streamId = req.params.streamId;
        const streamDir = path.join(CHUNKS_DIR, streamId);
        ensureDirectoryExists(streamDir);
        cb(null, streamDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const chunkIndex = req.body.chunkIndex || timestamp;
        const filename = `chunk_${chunkIndex}.webm`;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

// HLS PROCESSING FUNCTIONS

// Get chunk processing status
function getChunkProcessingStatus(streamId: string, chunkFilename: string): ChunkProcessingStatus | null {
    const key = `${streamId}:${chunkFilename}`;
    return processingQueue.get(key) || null;
}

// Add chunk to processing queue
function addChunkToProcessingQueue(streamId: string, chunkFilename: string, chunkNumber: string): void {
    const key = `${streamId}:${chunkFilename}`;
    processingQueue.set(key, {
        streamId,
        chunkFilename,
        chunkNumber,
        completedResolutions: new Set(),
        totalResolutions: HLS_RESOLUTIONS.length,
        startTime: Date.now()
    });
    console.log(`📝 Added ${key} to processing queue`);
}

// Mark resolution as completed for a chunk
function markResolutionCompleted(streamId: string, chunkFilename: string, resolution: string): boolean {
    const key = `${streamId}:${chunkFilename}`;
    const status = processingQueue.get(key);
    
    if (status) {
        status.completedResolutions.add(resolution);
        console.log(`✅ Completed ${resolution} for ${key} (${status.completedResolutions.size}/${status.totalResolutions})`);
        
        // If all resolutions are completed, remove from queue and update playlists
        if (status.completedResolutions.size === status.totalResolutions) {
            const processingTime = Date.now() - status.startTime;
            console.log(`🎉 All resolutions completed for ${key} in ${processingTime}ms`);
            processingQueue.delete(key);
            updateMasterPlaylist(streamId);
            updateGlobalPlaylist();
            return true; // All completed
        }
    }
    return false; // Still processing
}

// Get processing statistics
function getProcessingStats() {
    const stats = {
        totalProcessing: processingQueue.size,
        byStream: {} as Record<string, number>,
        oldestProcessing: 0
    };
    
    let oldestTime = Date.now();
    processingQueue.forEach((status) => {
        stats.byStream[status.streamId] = (stats.byStream[status.streamId] || 0) + 1;
        if (status.startTime < oldestTime) {
            oldestTime = status.startTime;
        }
    });
    
    stats.oldestProcessing = processingQueue.size > 0 ? Date.now() - oldestTime : 0;
    return stats;
}

// Convert single resolution for a chunk
function convertChunkToResolution(
    streamId: string, 
    chunkFilename: string, 
    chunkNumber: string, 
    resolution: { name: string; resolution: string; bitrate: string }
): Promise<boolean> {
    return new Promise((resolve) => {
        const chunkPath = path.join(CHUNKS_DIR, streamId, chunkFilename);
        const streamHLSDir = path.join(HLS_OUTPUT_DIR, streamId);
        const resolutionDir = path.join(streamHLSDir, resolution.name);
        
        ensureDirectoryExists(resolutionDir);
        
        const outputPattern = path.join(resolutionDir, `segment_${chunkNumber}_%03d.ts`);
        const playlistPath = path.join(resolutionDir, 'playlist.m3u8');
        
        // FFmpeg command for HLS conversion
        const ffmpegArgs = [
            '-i', chunkPath,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-vf', `scale=${resolution.resolution}`,
            '-b:v', resolution.bitrate,
            '-b:a', '128k',
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '0',
            '-hls_segment_filename', outputPattern,
            '-hls_flags', 'append_list+independent_segments',
            playlistPath
        ];
        // const ffmpeg = spawn("ffmpeg", [
        //     "-i", inputPath,
        //     "-filter_complex",
        //     "[0:v]split=3[v1][v2][v3];" +
        //     "[v1]scale=w=640:h=360[v360];" +
        //     "[v2]scale=w=854:h=480[v480];" +
        //     "[v3]scale=w=1280:h=720[v720]",
        //     "-map", "[v360]", "-c:v:0", "libx264", "-b:v:0", "800k",
        //     "-map", "[v480]", "-c:v:1", "libx264", "-b:v:1", "1400k",
        //     "-map", "[v720]", "-c:v:2", "libx264", "-b:v:2", "2500k",
        //     "-f", "hls",
        //     "-hls_time", "6",
        //     "-hls_list_size", "0",
        //     "-hls_segment_filename", `${outputDir}/v%v/seg_%03d.ts`,
        //     "-master_pl_name", "master.m3u8",
        //     "-var_stream_map", "v:0 v:1 v:2",
        //     `${outputDir}/v%v/prog.m3u8`
        //   ], { stdio: "inherit" });
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.on('close', (code) => {
            const success = code === 0;
            if (success) {
                console.log(`✅ ${resolution.name} conversion completed for ${chunkFilename}`);
                const allCompleted = markResolutionCompleted(streamId, chunkFilename, resolution.name);
                resolve(allCompleted);
            } else {
                console.error(`❌ ${resolution.name} conversion failed for ${chunkFilename}: exit code ${code}`);
                resolve(false);
            }
        });
        
        ffmpeg.stderr.on('data', (data) => {
            // Uncomment for debugging: console.log(`FFmpeg ${resolution.name}: ${data}`);
        });
    });
}

// Convert chunk to HLS segments for all resolutions (parallel processing)
async function convertChunkToHLS(streamId: string, chunkFilename: string): Promise<void> {
    const chunkMatch = chunkFilename.match(/chunk_(\d+)/);
    const chunkNumber = chunkMatch ? chunkMatch[1] : Date.now().toString();
    
    // Add to processing queue
    addChunkToProcessingQueue(streamId, chunkFilename, chunkNumber);
    
    const streamHLSDir = path.join(HLS_OUTPUT_DIR, streamId);
    ensureDirectoryExists(streamHLSDir);
    
    // Process all resolutions in parallel
    const conversionPromises = HLS_RESOLUTIONS.map(resolution => 
        convertChunkToResolution(streamId, chunkFilename, chunkNumber, resolution)
    );
    
    try {
        await Promise.all(conversionPromises);
        console.log(`🎬 All resolutions processed for ${chunkFilename}`);
    } catch (error) {
        console.error(`Error processing chunk ${chunkFilename}:`, error);
    }
}

// Update master playlist for a stream
function updateMasterPlaylist(streamId: string) {
    const streamHLSDir = path.join(HLS_OUTPUT_DIR, streamId);
    const masterPlaylistPath = path.join(streamHLSDir, 'master.m3u8');
    
    let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    HLS_RESOLUTIONS.forEach((resolution) => {
        const resolutionDir = path.join(streamHLSDir, resolution.name);
        const playlistPath = path.join(resolutionDir, 'playlist.m3u8');
        
        if (fs.existsSync(playlistPath)) {
            const bandwidth = parseInt(resolution.bitrate.replace('k', '')) * 1000;
            masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution.resolution}\n`;
            masterContent += `${resolution.name}/playlist.m3u8\n\n`;
        }
    });
    
    fs.writeFileSync(masterPlaylistPath, masterContent);
    console.log(`📝 Updated master playlist for stream ${streamId}`);
}

// Update global media playlist
function updateGlobalPlaylist() {
    const globalPlaylistPath = path.join(HLS_OUTPUT_DIR, 'media.m3u8');
    let globalContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    try {
        const streams = fs.readdirSync(HLS_OUTPUT_DIR)
            .filter(item => {
                const streamPath = path.join(HLS_OUTPUT_DIR, item);
                return fs.statSync(streamPath).isDirectory();
            });
        
        streams.forEach((streamId) => {
            const masterPlaylistPath = path.join(HLS_OUTPUT_DIR, streamId, 'master.m3u8');
            if (fs.existsSync(masterPlaylistPath)) {
                globalContent += `#EXT-X-STREAM-INF:STREAM-ID="${streamId}",RESOLUTION=1920x1080\n`;
                globalContent += `${streamId}/master.m3u8\n\n`;
            }
        });
        
        fs.writeFileSync(globalPlaylistPath, globalContent);
        console.log('📝 Updated global media playlist');
    } catch (error) {
        console.error('Error updating global playlist:', error);
    }
}

// STREAMING FUNCTIONS (keeping existing ones)

// Function to get all active streams
function getActiveStreams() {
    try {
        if (!fs.existsSync(CHUNKS_DIR)) return [];
        
        const streams = fs.readdirSync(CHUNKS_DIR)
            .filter(item => {
                const streamPath = path.join(CHUNKS_DIR, item);
                return fs.statSync(streamPath).isDirectory();
            })
            .map(streamId => {
                const streamPath = path.join(CHUNKS_DIR, streamId);
                const chunks = fs.readdirSync(streamPath)
                    .filter(file => file.endsWith('.webm'))
                    .sort();
                
                // Check if HLS is available
                const hlsPath = path.join(HLS_OUTPUT_DIR, streamId, 'master.m3u8');
                const hasHLS = fs.existsSync(hlsPath);
                
                // Get processing status
                const processingChunks = Array.from(processingQueue.values())
                    .filter(status => status.streamId === streamId).length;
                
                return {
                    id: streamId,
                    chunkCount: chunks.length,
                    latestChunk: chunks[chunks.length - 1] || null,
                    isLive: chunks.length > 0,
                    hasHLS: hasHLS,
                    processingChunks: processingChunks
                };
            });
        
        return streams;
    } catch (error) {
        console.error('Error getting active streams:', error);
        return [];
    }
}

// Function to get chunks for a specific stream
function getStreamChunks(streamId: string) {
    try {
        const streamPath = path.join(CHUNKS_DIR, streamId);
        if (!fs.existsSync(streamPath)) return [];
        
        const chunks = fs.readdirSync(streamPath)
            .filter(file => file.endsWith('.webm'))
            .sort()
            .map(filename => ({
                filename,
                url: `/stream/${streamId}/chunk/${filename}`,
                timestamp: fs.statSync(path.join(streamPath, filename)).mtime
            }));
        
        return chunks;
    } catch (error) {
        console.error(`Error getting chunks for stream ${streamId}:`, error);
        return [];
    }
}

// Function to clean up old chunks (optional - for managing storage)
function cleanupOldChunks(streamId: string, keepLast = 10) {
    try {
        const streamPath = path.join(CHUNKS_DIR, streamId);
        if (!fs.existsSync(streamPath)) return;
        
        const chunks = fs.readdirSync(streamPath)
            .filter(file => file.endsWith('.webm'))
            .map(filename => ({
                filename,
                path: path.join(streamPath, filename),
                mtime: fs.statSync(path.join(streamPath, filename)).mtime
            }))
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        
        // Keep only the latest N chunks
        const chunksToDelete = chunks.slice(keepLast);
        chunksToDelete.forEach(chunk => {
            fs.unlinkSync(chunk.path);
            console.log(`Deleted old chunk: ${chunk.filename}`);
        });
        
    } catch (error) {
        console.error(`Error cleaning up chunks for stream ${streamId}:`, error);
    }
}

app.post('/stream/:streamId/chunk', upload.single('chunk'), async (req, res) => {
    try {
        const { streamId } = req.params;
        const { chunkIndex } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No chunk file provided' });
        }
        
        console.log(`📥 Received chunk for stream ${streamId}: ${req.file.filename}`);
        
        // Process chunk to HLS in background (non-blocking)
        convertChunkToHLS(streamId, req.file.filename).catch(error => {
            console.error(`Error converting chunk to HLS: ${error}`);
        });
        
        // Optional: Clean up old chunks to manage storage
        // cleanupOldChunks(streamId, 20);
        
        res.json({
            success: true,
            streamId,
            filename: req.file.filename,
            chunkIndex,
            message: 'Chunk uploaded successfully and HLS processing started'
        });
        
    } catch (error) {
        console.error('Error uploading chunk:', error);
        res.status(500).json({ error: 'Failed to upload chunk' });
    }
});

// Get processing statistics
app.get('/processing-stats', (req, res) => {
    try {
        const stats = getProcessingStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching processing stats:', error);
        res.status(500).json({ error: 'Failed to fetch processing stats' });
    }
});

// Get all streams
app.get('/streams', (req, res) => {
    try {
        const streams = getActiveStreams();
        res.json(streams);
    } catch (error) {
        console.error('Error fetching streams:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

// Get specific stream info
app.get('/stream/:streamId', (req, res) => {
    try {
        const { streamId } = req.params;
        const chunks = getStreamChunks(streamId);
        
        if (chunks.length === 0) {
            return res.status(404).json({ error: 'Stream not found or no chunks available' });
        }
        
        // Check if HLS is available
        const hlsPath = path.join(HLS_OUTPUT_DIR, streamId, 'master.m3u8');
        const hasHLS = fs.existsSync(hlsPath);
        
        // Get available resolutions
        const availableResolutions: string[] = [];
        if (hasHLS) {
            const streamHLSDir = path.join(HLS_OUTPUT_DIR, streamId);
            HLS_RESOLUTIONS.forEach(res => {
                const resPath = path.join(streamHLSDir, res.name, 'playlist.m3u8');
                if (fs.existsSync(resPath)) {
                    availableResolutions.push(res.name);
                }
            });
        }
        
        res.json({
            id: streamId,
            chunks,
            totalChunks: chunks.length,
            isLive: true,
            hasHLS: hasHLS,
            hlsUrl: hasHLS ? `/hls/${streamId}/master.m3u8` : null,
            availableResolutions: availableResolutions
        });
    } catch (error) {
        console.error(`Error fetching stream ${req.params.streamId}:`, error);
        res.status(500).json({ error: 'Failed to fetch stream' });
    }
});

// Serve individual chunks
app.get('/stream/:streamId/chunk/:filename', (req, res) => {
    try {
        const { streamId, filename } = req.params;
        const chunkPath = path.join(CHUNKS_DIR, streamId, filename);
        
        if (!fs.existsSync(chunkPath)) {
            return res.status(404).json({ error: 'Chunk not found' });
        }
        
        // Set appropriate headers for video streaming
        res.setHeader('Content-Type', 'video/webm');
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Stream the file
        const stream = fs.createReadStream(chunkPath);
        stream.pipe(res);
        
    } catch (error) {
        console.error(`Error serving chunk ${req.params.filename}:`, error);
        res.status(500).json({ error: 'Failed to serve chunk' });
    }
});

// NEW HLS ROUTES

// Serve global media playlist
app.get('/hls/media.m3u8', (req, res) => {
    try {
        const globalPlaylistPath = path.join(HLS_OUTPUT_DIR, 'media.m3u8');
        
        if (!fs.existsSync(globalPlaylistPath)) {
            return res.status(404).json({ error: 'No streams available' });
        }
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(globalPlaylistPath);
        
    } catch (error) {
        console.error('Error serving global playlist:', error);
        res.status(500).json({ error: 'Failed to serve global playlist' });
    }
});

// Serve stream master playlist
app.get('/hls/:streamId/master.m3u8', (req, res) => {
    try {
        const { streamId } = req.params;
        const masterPlaylistPath = path.join(HLS_OUTPUT_DIR, streamId, 'master.m3u8');
        
        if (!fs.existsSync(masterPlaylistPath)) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(masterPlaylistPath);
        
    } catch (error) {
        console.error(`Error serving master playlist for ${req.params.streamId}:`, error);
        res.status(500).json({ error: 'Failed to serve master playlist' });
    }
});

// Serve resolution-specific playlists
app.get('/hls/:streamId/:resolution/playlist.m3u8', (req, res) => {
    try {
        const { streamId, resolution } = req.params;
        const playlistPath = path.join(HLS_OUTPUT_DIR, streamId, resolution, 'playlist.m3u8');
        
        if (!fs.existsSync(playlistPath)) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(playlistPath);
        
    } catch (error) {
        console.error(`Error serving playlist for ${req.params.streamId}/${req.params.resolution}:`, error);
        res.status(500).json({ error: 'Failed to serve playlist' });
    }
});

// Serve HLS segments
app.get('/hls/:streamId/:resolution/:segmentFile', (req, res) => {
    try {
        const { streamId, resolution, segmentFile } = req.params;
        const segmentPath = path.join(HLS_OUTPUT_DIR, streamId, resolution, segmentFile);
        
        if (!fs.existsSync(segmentPath)) {
            return res.status(404).json({ error: 'Segment not found' });
        }
        
        res.setHeader('Content-Type', 'video/MP2T');
        res.setHeader('Cache-Control', 'max-age=3600');
        res.sendFile(segmentPath);
        
    } catch (error) {
        console.error(`Error serving segment ${req.params.segmentFile}:`, error);
        res.status(500).json({ error: 'Failed to serve segment' });
    }
});

// Serve static files (for frontend)
app.use(express.static(PUBLIC_DIR));

// Basic HTML page for testing (will be served at /)
app.get('/', (req, res) => {
    res.send(`
        <h1>Streaming Server with HLS - Enhanced</h1>
        <p>Server is running! 🚀</p>
        <ul>
            <li><a href="/streams">View all streams</a></li>
            <li><a href="/processing-stats">Processing Statistics</a></li>
            <li><a href="/watch">Watch streams</a></li>
            <li><a href="/hls/media.m3u8">Global HLS Playlist</a></li>
        </ul>
    `);
});

// Start server
function startServer() {
    initializeDirectories();
    
    app.listen(PORT, () => {
        console.log(`Server running on: http://localhost:${PORT}`);
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    console.log(`📊 Final processing queue size: ${processingQueue.size}`);
    process.exit(0);
});

// Start the server
startServer();

module.exports = { app, getActiveStreams, getStreamChunks, getProcessingStats };