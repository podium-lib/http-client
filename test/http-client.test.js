import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import PodiumHttpClient from "../lib/http-client.js";

let httpServer,
	host = "localhost",
	port = 3003;

async function beforeEach() {
	httpServer = http.createServer(async (request, response) => {
		response.writeHead(200);
		response.end();
	});
	httpServer.listen(port, host, () => Promise.resolve());
}

async function afterEach(client) {
	await client.close();
	await httpServer.close();
}

test("http-client - basics", async (t) => {
	await t.test("http-client: returns 200 response when given valid input", async () => {
		await beforeEach();
		const url = `http://${host}:${port}`;
		const client = new PodiumHttpClient();
		const response = await client.request({ path: "/", origin: url, method: "GET" });
		assert.strictEqual(response.statusCode, 200);
		await afterEach(client);
	});

	await t.test("does not cause havoc with built in fetch", async () => {
		await beforeEach();
		const url = `http://${host}:${port}`;
		const client = new PodiumHttpClient();
		await fetch(url);
		const response = await client.request({ path: "/", origin: url, method: "GET" });
		assert.strictEqual(response.statusCode, 200);
		await client.close();
		await fetch(url);
		await afterEach(client);
	});

	await t.skip("http-client: should not invalid port input", async () => {
		await beforeEach();
		const url = `http://${host}:3013`;
		const client = new PodiumHttpClient();
		await client.request({
			path: "/",
			origin: url,
			method: "GET",
		});
		const response = await client.request({ path: "/", origin: url, method: "GET" });
		assert.strictEqual(response.statusCode, 200);
		await afterEach(client);
	});
});

test.skip("http-client circuit breaker behaviour", async (t) => {
	await t.test("closes on failure threshold", async () => {
		await beforeEach();
		const url = `http://${host}:3014`;
		const client = new PodiumHttpClient({ threshold: 2 });
		await client.request({
			path: "/",
			origin: url,
			method: "GET",
		});
		const response = await client.request({ path: "/", origin: url, method: "GET" });
		assert.strictEqual(response.statusCode, 200);
		await afterEach(client);
	});
});
