const http = require('http');
const fs = require('fs');
const path = require('path');

const native = require('./build/Release/pacing.node');

const PORT = process.env.PORT||8080;

const server = http.createServer((req, res) => {
    console.log("Request:", req.url);

    let filePath = path.join(__dirname, 'videos', req.url);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end("Not found");
    }

    // 🔥 READ pacing header (from client)
    let pacingKBps = parseInt(req.headers['pacing-rate-kbps']);

    if (pacingKBps) {
        let fd = req.socket._handle.fd;
        let pacingRate = pacingKBps * 1024;

        console.log("Setting pacing:", pacingRate, "bytes/sec");

        native.setPacingRate(fd, pacingRate);
    }

    // ✅ CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Tell the browser our custom pacing header is allowed
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, pacing-rate-kbps');
    
    // Handle the CORS Preflight (OPTIONS) request immediately
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const ext = path.extname(filePath);

    const mimeTypes = {
        '.mpd': 'application/dash+xml',
        '.m4v': 'video/mp4',
        '.m4a': 'audio/mp4'
    };

    res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream'
    });

    const stream = fs.createReadStream(filePath);
    
    stream.on('end', () => {
        console.log("Streaming finished");
    });

    stream.pipe(res);
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});