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
    suppressErrors = true,
}) {
    const errors = [];
    for (let i = 0; i <= loop; i++) {
        try {
            await client.request({ path, origin: url, method: 'GET' });
        } catch (err) {
            // Push the actual cause here for the tests
            if (!suppressErrors) errors.push(err);
        }
    }
    if (errors.length > 0) {
        throw new Error(errors.toString());
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

    await t.test('throws error when no fallback provided', async () => {
        const client = new HttpClient();
        assert.rejects(
            async () => {
                await client.request({
                    path: '/',
                    origin: 'https://does-not-exist.domain',
                    method: 'GET',
                });
            },
            {
                name: 'Error',
            },
        );
        await client.close();
    });
    await t.test('does not throw when fallback provided', async () => {
        let isCaught = false;
        const client = new HttpClient({
            fallback: () => {
                isCaught = true;
            },
        });

        await client.request({
            path: '/',
            origin: 'https://does-not-exist.domain',
            method: 'GET',
        });
        assert.strictEqual(isCaught, true);
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

await test('http-client - redirects', async (t) => {
    const to = http.createServer(async (request, response) => {
        response.writeHead(200);
        response.end();
    });
    to.listen(3033, host);

    const from = http.createServer(async (request, response) => {
        if (request.url === '/redirect') {
            response.setHeader('location', 'http://localhost:3033');
        }
        response.writeHead(301);
        response.end();
    });
    from.listen(port, host);

    await t.test('can follow redirects', async () => {
        const client = new HttpClient({ threshold: 50, followRedirects: true });
        const response = await client.request({
            method: 'GET',
            origin: `http://${host}:${port}`,
            path: '/redirect',
        });
        assert.strictEqual(response.statusCode, 200);
    });
    // await t.test.skip('throw on max redirects', async () => {});
    await t.test('does not follow redirects by default', async () => {
        const client = new HttpClient({ threshold: 50 });
        const response = await client.request({
            method: 'GET',
            origin: `http://${host}:${port}`,
            path: '/redirect',
        });
        assert.strictEqual(response.statusCode, 301);
    });
    from.close();
    to.close();
});

await test('http-client - circuit breaker behaviour', async (t) => {
    const url = `http://${host}:${port}`;
    await t.test('opens on failure threshold', async () => {
        beforeEach();
        const invalidUrl = `http://${host}:3013`;
        const client = new HttpClient({ threshold: 50 });

        let broken = 0;
        for (let i = 0; i < 5; i++) {
            try {
                await client.request({
                    path: '/',
                    origin: invalidUrl,
                    method: 'GET',
                });
            } catch (err) {
                if (err.toString() === 'Error: Breaker is open') {
                    broken++;
                }
            }
        }
        assert.strictEqual(
            broken,
            4,
            `breaker open on 4 out of 5 requests, was ${broken}`,
        );
        await afterEach(client);
    });

    await t.test('can reset breaker', async () => {
        beforeEach();
        const invalidUrl = `http://${host}:3023`;
        const breakerReset = 10;
        const client = new HttpClient({ threshold: 50, reset: breakerReset });
        let isOpen = false;
        try {
            await queryUrl({
                client,
                loop: 4,
                url: invalidUrl,
                suppressErrors: false,
            });
        } catch (err) {
            if (err.toString().indexOf('Breaker is open') !== -1) {
                isOpen = true;
            }
        }
        assert.strictEqual(isOpen, true, `breaker opened, ${isOpen}`);
        await wait(breakerReset + 10); // wait for the breaker to close
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        assert.strictEqual(response.statusCode, 200);
        await afterEach(client);
    });
    // await t.test('has a .metrics property', async () => {
    //     const client = new HttpClient({ threshold: 50, reset: breakerReset });
    // });
});
