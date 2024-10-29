import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import HttpClient from '../lib/http-client.js';
import { wait } from './utilities.js';

let httpServer,
    host = 'localhost',
    port = 3003;

const url = `http://${host}:${port}`;

function beforeEach() {
    httpServer = http.createServer(async (request, response) => {
        response.writeHead(200);
        response.end();
    });
    httpServer.listen(port, host);
}

function closeServer() {
    return new Promise((resolve) => {
        httpServer.close(resolve);
        console.log('Closed');
    });
}
async function afterEach(client) {
    await client.close();
    await closeServer();
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
    await t.test('returns 200 response when given valid input', async () => {
        beforeEach();
        const client = new HttpClient();
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        assert.strictEqual(response.statusCode, 200);
        await afterEach(client);
    });

    // await t.test('does not cause havoc with built in fetch', async () => {
    //     beforeEach();
    //     const client = new HttpClient();
    //     await fetch(url);
    //     const response = await client.request({
    //         path: '/',
    //         origin: url,
    //         method: 'GET',
    //     });
    //     assert.strictEqual(response.statusCode, 200);
    //     await client.close();
    //     await fetch(url);
    //     await afterEach(client);
    // });
    await t.test('can pass in an abort controller', async () => {
        beforeEach();
        const abortController = new AbortController();

        const client = new HttpClient();
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        await afterEach(client);
    });
});

await test('http-client - circuit breaker behaviour', async (t) => {
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
