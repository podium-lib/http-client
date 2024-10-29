import { unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import cluster from 'node:cluster';
import path from 'node:path';
import os from 'node:os';

const socketPath = path.join(os.tmpdir(), 'undici.sock');

const port = process.env.PORT || socketPath;
const timeout = parseInt(process.env.TIMEOUT, 10) || 1;
const workers = parseInt(process.env.WORKERS) || os.cpus().length;

if (cluster.isPrimary) {
    try {
        unlinkSync(socketPath);
        // eslint-disable-next-line no-unused-vars
    } catch (_) {
        // Do nothing if the socket does not exist
    }

    for (let i = 0; i < workers; i++) {
        cluster.fork();
    }
} else {
    const buf = Buffer.alloc(64 * 1024, '_');
    const server = createServer((req, res) => {
        setTimeout(function () {
            res.end(buf);
        }, timeout);
    }).listen(port);
    server.keepAliveTimeout = 600e3;
}
