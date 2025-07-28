
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Base directories
const CHUNKS_DIR = path.join(__dirname, '..', 'chunks');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

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

// STREAMING FUNCTIONS

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
                
                return {
                    id: streamId,
                    chunkCount: chunks.length,
                    latestChunk: chunks[chunks.length - 1] || null,
                    isLive: chunks.length > 0
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

// API ROUTES

// Upload chunk endpoint
app.post('/stream/:streamId/chunk', upload.single('chunk'), (req, res) => {
    try {
        const { streamId } = req.params;
        const { chunkIndex } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No chunk file provided' });
        }
        
        console.log(`📥 Received chunk for stream ${streamId}: ${req.file.filename}`);
        
        // Optional: Clean up old chunks to manage storage
        // cleanupOldChunks(streamId, 20);
        
        res.json({
            success: true,
            streamId,
            filename: req.file.filename,
            chunkIndex,
            message: 'Chunk uploaded successfully'
        });
        
    } catch (error) {
        console.error('Error uploading chunk:', error);
        res.status(500).json({ error: 'Failed to upload chunk' });
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
        
        res.json({
            id: streamId,
            chunks,
            totalChunks: chunks.length,
            isLive: true
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

// Serve static files (for frontend)
app.use(express.static(PUBLIC_DIR));

// Basic HTML page for testing (will be served at /)
app.get('/', (req, res) => {
    res.send(`
        <h1>Streaming Server - Step 1</h1>
        <p>Server is running! 🚀</p>
        <ul>
            <li><a href="/streams">View all streams</a></li>
            <li><a href="/watch">Watch streams</a></li>
        </ul>
    `);
});

// Start server
function startServer() {
    initializeDirectories();
    
    app.listen(PORT, () => {
        console.log(`
🚀 Streaming Server Started!
📡 Server running on: http://localhost:${PORT}
📁 Chunks directory: ${CHUNKS_DIR}
📺 Ready to receive streams!

API Endpoints:
- POST /stream/:streamId/chunk (upload chunks)
- GET /streams (list all streams)  
- GET /stream/:streamId (get stream info)
- GET /stream/:streamId/chunk/:filename (serve chunks)
        `);
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

// Start the server
startServer();

module.exports = { app, getActiveStreams, getStreamChunks };