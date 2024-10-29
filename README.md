# @podium/http-client

⚠️ This project is still work in progress, should not be used for anything just yet.

Generic http client built on [undici](undici.nodejs.org/) with a circuit breaker, error handling and metrics out of the box.

[![GitHub Actions status](https://github.com/podium-lib/http-client/workflows/Run%20Lint%20and%20Tests/badge.svg)](https://github.com/podium-lib/layout/actions?query=workflow%3A%22Run+Lint+and+Tests%22)
[![Known Vulnerabilities](https://snyk.io/test/github/podium-lib/http-client/badge.svg)](https://snyk.io/test/github/podium-lib/http-client)

## Installation

*Note!* Requires Node.js v20 or later.

```bash
npm install @podium/http-client
```

## Usage

```js
import client from '@podium/http-client';
const client = new HttpClient(options);

const response = await client.request({ path: '/', origin: 'https://host.domain' })
if (response.ok) {
    //
}
```

## API

### Constructor

```js
import client from '@podium/http-client';

const client = new HttpClient(options);
```

#### options

| option     | default | type      | required | details                                                                                                                                    |
|------------|---------|-----------|----------|--------------------------------------------------------------------------------------------------------------------------------------------|
| threshold  | `null`  | `number`  | `25`     | Circuit breaker: How many, in %, requests should error before the circuit should trip. Ex; when 25% of requests fail, trip the circuit.    |
| timeout    | `null`  | `number`  | `500`    | Circuit breaker: How long, in milliseconds, a request can maximum take. Requests exceeding this limit counts against tripping the circuit. |
| throwOn400 | `false` | `boolean` | `false`  | If the client sahould throw on HTTP 400 errors.If true, HTTP 400 errors will counts against tripping the circuit.                          |
| throwOn500 | `false` | `boolean` | `true`   | If the client sahould throw on HTTP 500 errors.If true, HTTP 500 errors will counts against tripping the circuit.                          |
| reset      | `false` | `number`  | `2000`   | Circuit breaker: How long, in milliseconds, to wait before a tripped circuit should be reset.                                              |
| logger     | `null`  | `àb`      | `false`  | A logger which conform to a log4j interface                                                                                                |


##### logger

Any log4j compatible logger can be passed in and will be used for logging.
Console is also supported for easy test / development.

Example:

```js
const layout = new Layout({
    name: 'myLayout',
    pathname: '/foo',
    logger: console,
});
```

Under the hood [abslog] is used to abstract out logging. Please see [abslog] for
further details.


## Methods

### async request(options)
### async close()
### fallback()


[@metrics/metric]: https://github.com/metrics-js/metric '@metrics/metric'
[abslog]: https://github.com/trygve-lie/abslog 'abslog'
