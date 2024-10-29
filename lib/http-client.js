import { Agent, setGlobalDispatcher, request, MockAgent } from 'undici';
import createError from 'http-errors';
import Opossum from 'opossum';
import abslog from 'abslog';

/**
 * @typedef HttpClientOptions
 * @property {Number} keepAliveMaxTimeout
 * @property {Number} keepAliveTimeout
 * @property {Number} connections
 * @property {Number} pipelining
 * @property {Boolean} throwOn400 - If the client should throw on http 400 errors. If true, http 400 errors will counts against tripping the circuit.
 * @property {Boolean} throwOn500 - If the client should throw on http 500 errors. If true, http 500 errors will counts against tripping the circuit.
 * @property {Number} threshold - Circuit breaker: How many, in %, requests should error before the circuit should trip. Ex; when 25% of requests fail, trip the circuit.
 * @property {Number} timeout - Circuit breaker: How long, in milliseconds, a request can maximum take. Requests exceeding this limit counts against tripping the circuit.
 * @property {import('abslog')} logger - A logger instance compatible with abslog .
 * @property {Number} reset - Circuit breaker: How long, in milliseconds, to wait before a tripped circuit should be reset.
 **/

export default class PodiumHttpClient {
    #throwOn400;
    #throwOn500;
    #breaker;
    #logger;
    #agent;

    /**
     * @property {HttpClientOptions} options - options
     */
    constructor({
        keepAliveMaxTimeout = undefined,
        keepAliveTimeout = undefined,
        connections = 50,
        pipelining = 10,
        throwOn400 = false,
        throwOn500 = true,
        threshold = 25,
        timeout = 500,
        logger = undefined,
        reset = 20000,
    } = {}) {
        this.#logger = abslog(logger);
        this.#throwOn400 = throwOn400;
        this.#throwOn500 = throwOn500;

        // TODO; Can we avoid bind here in a nice way?????
        this.#breaker = new Opossum(this.#request.bind(this), {
            errorThresholdPercentage: threshold, // When X% of requests fail, trip the circuit
            resetTimeout: reset, // After X milliseconds, try again.
            timeout, // If our function takes longer than X milliseconds, trigger a failure
        });

        this.#agent = new Agent({
            keepAliveMaxTimeout, // TODO unknown option, consider removing
            keepAliveTimeout, // TODO unknown option, consider removing
            connections,
            pipelining, // TODO unknown option, consider removing
        });
    }

    async #request(options = {}) {
        const { statusCode, headers, trailers, body } = await request(options);

        if (this.#throwOn400 && statusCode >= 400 && statusCode <= 499) {
            // Body must be consumed; https://github.com/nodejs/undici/issues/583#issuecomment-855384858
            const errBody = await body.text();
            this.#logger.debug(
                `HTTP ${statusCode} error catched by client. Body: ${errBody}`,
            );
            throw createError(statusCode);
        }

        if (this.#throwOn500 && statusCode >= 500 && statusCode <= 599) {
            // Body must be consumed; https://github.com/nodejs/undici/issues/583#issuecomment-855384858
            await body.text();
            const errBody = await body.text();
            this.#logger.debug(
                `HTTP ${statusCode} error catched by client. Body: ${errBody}`,
            );
            throw createError(statusCode);
        }

        return {
            statusCode,
            headers,
            trailers,
            body,
        };
    }

    fallback(fn) {
        this.#breaker.fallback(fn);
    }

    metrics() {
        // TODO: Implement...
    }

    async request(options = {}) {
        return await this.#breaker.fire(options);
    }

    async close() {
        await this.#breaker.close();
        if (!this.#agent.destroyed && !this.#agent.closed) {
            await this.#agent.close();
        }
    }

    static mock(origin) {
        const agent = new MockAgent();
        setGlobalDispatcher(agent);
        return agent.get(origin);
    }
}
