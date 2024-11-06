import { test, before, after, afterEach, beforeEach } from 'node:test';
import { rejects, notStrictEqual, strictEqual } from 'node:assert/strict';
import http from 'node:http';

import HttpClient from '../lib/http-client.js';
import { wait } from './utilities.js';
import { MockAgent, setGlobalDispatcher } from 'undici';

let httpServer,
    host = 'localhost',
    port = 3003;

function startServer() {
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
async function stopServer(client, server = httpServer) {
    if (client) {
        await client.close();
    }
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
        strictEqual(response.statusCode, 200);
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
        strictEqual(response.statusCode, 200);
        await client.close();
        await fetch(url);
        await client.close();
    });

    await t.test('throws error when no fallback provided', async () => {
        const client = new HttpClient();
        rejects(
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
        strictEqual(isCaught, true);
        await client.close();
    });

    await closeServer(server);
});

await test('http-client - abort controller', async (t) => {
    let slowServer;
    beforeEach(async function () {
        // Slow responding server to enable us to abort a request
        slowServer = http.createServer(async (request, response) => {
            await wait(200);
            response.writeHead(200);
            response.end();
        });
        slowServer.listen(2010, host);
    });
    afterEach(function () {
        slowServer.close();
    });
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
        strictEqual(aborted, true);
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
});

await test('http-client - redirects', async (t) => {
    let to, from;
    before(async function () {
        to = http.createServer(async (request, response) => {
            response.writeHead(200);
            response.end();
        });
        to.listen(3033, host);
        from = http.createServer(async (request, response) => {
            if (request.url === '/redirect') {
                response.setHeader('location', 'http://localhost:3033');
            }
            response.writeHead(301);
            response.end();
        });
        from.listen(port, host);
    });
    after(function () {
        from.close();
        to.close();
    });

    await t.test('redirectable true follows redirects', async () => {
        const client = new HttpClient();
        const response = await client.request({
            method: 'GET',
            origin: `http://${host}:${port}`,
            path: '/redirect',
            redirectable: true,
        });
        strictEqual(response.statusCode, 200);
    });
    // await t.test.skip('throw on max redirects', async () => {});
    await t.test('does not follow redirects by default', async () => {
        const client = new HttpClient({ threshold: 50 });
        const response = await client.request({
            method: 'GET',
            origin: `http://${host}:${port}`,
            path: '/redirect',
        });
        strictEqual(response.statusCode, 301);
    });
});

await test('http-client - retries', async (t) => {
    await t.test(
        `uses the 'retries' options on incoming requests`,
        async () => {
            const agent = new MockAgent();
            agent.disableNetConnect();
            // setGlobalDispatcher(agent);
            agent
                .get('http://somepath.dk')
                .intercept({
                    path: '/',
                    method: 'GET',
                })
                .reply(400, {});

            const client = new HttpClient({ agent });
            await client.request({
                path: '/',
                origin: 'http://somepath.dk',
                method: 'GET',
                retries: 2,
                dispatcher: agent,
            });
            strictEqual(agent._eventsCount, 2);
            agent.assertNoPendingInterceptors();
        },
    );
});

await test('http-client - circuit breaker behaviour', async (t) => {
    const url = `http://${host}:${port}`;
    beforeEach(startServer);
    await t.test('opens on failure threshold', async () => {
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
        strictEqual(
            broken,
            4,
            `breaker open on 4 out of 5 requests, was ${broken}`,
        );
        await stopServer(client);
    });

    await t.test('can reset breaker', async () => {
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
        strictEqual(isOpen, true, `breaker opened, ${isOpen}`);
        await wait(breakerReset + 10); // wait for the breaker to close
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        strictEqual(response.statusCode, 200);
        await stopServer(client);
    });
    await t.test('exposed breaker metrics', async () => {
        const client = new HttpClient();
        notStrictEqual(client.metrics, undefined, 'has a .metrics property');
        await stopServer(client);
    });
});
