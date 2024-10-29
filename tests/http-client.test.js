import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import HttpClient from '../lib/http-client.js';
import { wait } from './utilities.js';

let httpServer,
    host = 'localhost',
    port = 3003;

function beforeEach() {
    httpServer = http.createServer(async (request, response) => {
        response.writeHead(200);
        response.end();
    });
    httpServer.listen(port, host);
}

function closeServer(s) {
    return new Promise((resolve) => {
        s.close(resolve);
    });
}
async function afterEach(client, server = httpServer) {
    await client.close();
    await closeServer(server);
}

async function queryUrl({
    client,
    path = '/',
    url = `http://${host}:${port}`,
    loop = 2,
    supresErrors = true,
}) {
    for (let i = 0; i < loop; i++) {
        try {
            await client.request({ path, origin: url, method: 'GET' });
        } catch (err) {
            if (!supresErrors) throw err;
        }
    }
}
await test('http-client - basics', async (t) => {
    const url = `http://${host}:2001`;
    const server = http.createServer(async (request, response) => {
        response.writeHead(200);
        response.end();
    });
    server.listen(2001, host);
    await t.test('returns 200 response when given valid input', async () => {
        const client = new HttpClient();
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        assert.strictEqual(response.statusCode, 200);
        await client.close();
    });

    await t.test('does not cause havoc with built in fetch', async () => {
        const client = new HttpClient();
        await fetch(url);
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        assert.strictEqual(response.statusCode, 200);
        await client.close();
        await fetch(url);
        await client.close();
    });
    await closeServer(server);
});

await test('http-client - abort controller', async (t) => {
    // Slow responding server to enable us to abort a request
    const slowServer = http.createServer(async (request, response) => {
        await wait(200);
        response.writeHead(200);
        response.end();
    });
    slowServer.listen(2010, host);
    await t.test('cancel a request', async () => {
        const abortController = new AbortController();
        let aborted = false;
        setTimeout(() => {
            abortController.abort();
            aborted = true;
        }, 100);
        const client = new HttpClient({ timeout: 2000 });
        await client.request({
            path: '/',
            origin: 'http://localhost:2010',
            method: 'GET',
        });
        assert.ok(aborted);
        await client.close();
    });

    // await t.test('auto renew an abort controller', async () => {
    //     const abortController = new AbortController();
    //     const client = new HttpClient({ timeout: 2000 });
    //     await client.request({
    //         autoRenewAbortController: true,
    //         path: '/',
    //         origin: 'http://localhost:2010',
    //         method: 'GET',
    //     });
    //     await client.close();
    // });
    slowServer.close();
});

await test('http-client - circuit breaker behaviour', async (t) => {
    const url = `http://${host}:${port}`;
    await t.test('opens on failure threshold', async () => {
        beforeEach();
        const invalidUrl = `http://${host}:3013`;
        const client = new HttpClient({ threshold: 50 });
        let hasOpened = false;
        client.on('open', () => {
            hasOpened = true;
        });
        await queryUrl({ client, url: invalidUrl });

        assert.strictEqual(hasOpened, true);
        await afterEach(client);
    });
    await t.test('can reset breaker', async () => {
        beforeEach();
        const invalidUrl = `http://${host}:3013`;
        const client = new HttpClient({ threshold: 50, reset: 1 });
        await queryUrl({ client, url: invalidUrl });

        let hasClosed = false;
        client.on('close', () => {
            hasClosed = true;
        });
        await wait();
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        assert.strictEqual(hasClosed, true);
        assert.strictEqual(response.statusCode, 200);
        await afterEach(client);
    });
});
