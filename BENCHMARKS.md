# Benchmarks
## Running benchmarks

Benchmarks are run using the [cronometro](https://www.npmjs.com/package/cronometro) module.

First start the cluster
```sh
cd benchmarks
PORT=3030 node server
```
See [server options](#server-options) for details on how to start the server.

Open a new terminal session and run the benchmarks:
```sh
PORT=3030 node benchmark.js
```
You should see something similar to this:
```sh
┌──────────────────────────────┬─────────┬──────────────────┬───────────┬─────────────────────────┐
│ Tests                        │ Samples │           Result │ Tolerance │ Difference with slowest │
|──────────────────────────────|─────────|──────────────────|───────────|─────────────────────────|
│ http - no keepalive          │       1 │  1563.48 req/sec │  ± 0.00 % │                       - │
|──────────────────────────────|─────────|──────────────────|───────────|─────────────────────────|
│ fetch                        │       1 │  3702.40 req/sec │  ± 0.00 % │              + 136.81 % │
|──────────────────────────────|─────────|──────────────────|───────────|─────────────────────────|
│ http - keepalive             │       1 │  5509.85 req/sec │  ± 0.00 % │              + 252.41 % │
|──────────────────────────────|─────────|──────────────────|───────────|─────────────────────────|
│ undici - pipeline            │       1 │  6413.69 req/sec │  ± 0.00 % │              + 310.22 % │
|──────────────────────────────|─────────|──────────────────|───────────|─────────────────────────|
│ undici - request             │       1 │  8025.89 req/sec │  ± 0.00 % │              + 413.34 % │
|──────────────────────────────|─────────|──────────────────|───────────|─────────────────────────|
│ podium-http-client - request │       1 │ 80482.90 req/sec │  ± 0.00 % │             + 5047.68 % │
└──────────────────────────────┴─────────┴──────────────────┴───────────┴─────────────────────────┘
```

See [benchmark options](#benchmark-options) for details options when running the benchmark.

### Server options

| Name      | Default             | Description                  |
|-----------|---------------------|------------------------------|
| `PORT`    | `3030`              | Server port                  |
| `TIMEOUT` | `1`                 | Server delay                 |
| `WORKERS` | `os.cpus().length`  | Number of workers to spin up |

### Benchmark options

| Name            | Default | Description                    |
|-----------------|----- ---|--------------------------------|
| `SAMPLES`         | `1`      | Number of iterations pr sample |
| `ERROR_TRESHOLD`  | `3`      | Benchmark error threshold      |
| `CONNECTIONS`     | `50`     | Undici: max sockets            |
| `PIPELINING`      | `10`     | Unidici: pipelining config     |
| `PARALLEL`        | `100`    | Number of workers to spawn     |
| `HEADERS_TIMEOUT` | `0`      | Undici: headers timeout        |
| `BODY_TIMEOUT`    | `0`      | Unidic: body timeout           |
