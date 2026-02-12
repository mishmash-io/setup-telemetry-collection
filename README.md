# setup-telemetry-collection

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/mishmash-io/setup-telemetry-collection/badge)](https://scorecard.dev/viewer/?uri=github.com/mishmash-io/setup-telemetry-collection)


This action sets up [OpenTelemetry](https://opentelemetry.io/) in your CI/CD
environment. Instrument your tests, run them and when your pipeline finishes -
emitted `logs`, `metrics`, `traces` and `profiles` are available as
[Apache Parquet](https://parquet.apache.org/) files. Use these files for
analytics on the behaviour of your code, before code reaches production.

For inspiration, see
[tests telemetry analytics @ mishmash.io.](https://github.com/mishmash-io/opentelemetry-server-embedded)

## Usage

Internally, this action:

1. Downloads the necessary OpenTelemetry agents for your programming languages

1. Optionally caches them

1. Launches a
   [small backend server](https://github.com/mishmash-io/opentelemetry-server-embedded/tree/main/server-parquet)
   that saves the telemetry to disk

1. Configures the OpenTelemetry agents and SDKs to send signals to that server

1. Optionally launches tools for additional telemetry (see below)

1. Once your CI/CD job completes - the action attaches the collected telemetry
   data as an artifact of your build.

> [!TIP]
>
> With this action you don't have to download OpenTelemetry agents or configure
> them, by, say, setting and exporting the numerous variables like
> `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`, etc.
>
> Setup-telemetry-collection does all that for you.

To use this action simply add it as a step of a job in your `workflow.yaml`:

```yaml

...

jobs:
  test:

    ...

    steps:

      ...

      # Add this step before any steps where you wish telemetry to be collected
      - name: Setup telemetry coolection
        id: telemetry
        uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
        with:
          instrument-java: true
          save-logs: true
          save-metrics: true
          save-traces: true
          # see below for additional configuration options

      ...
```

The following sections contain more details about the various configuration
options that you can set in your workflow.

### Supported telemetry signals

This action configures emission and collection of `logs`, `metrics`, `traces`
and `profiles` signals. By default, only `logs`, `metrics` and `traces` are
enabled. To enable or disable a given signal set the following `boolean` action
inputs:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to disable logs add in this section:
    save-logs: false
    # to disable metrics add:
    save-metrics: false
    # to disable traces add:
    save-traces: false
    # to enable profiles:
    save-profiles: true
    ...

```

### Accessing collected data

Similarly to
[actions/upload-artifact](https://github.com/actions/upload-artifact), this
action uploads one artifact for each of the **_enabled_** signals. Default
artifacts are `telemetry-logs`, `telemetry-metrics`, `telemetry-traces` and
`telemetry-profiles`, but you can change these names:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to customize the name of the logs artifact:
    logs-artifact: my-logs-artifact
    # ... and of the metrics artifact:
    metrics-artifact: my-metrics-artifact
    # ... traces:
    traces-artifact: my-traces-artifact
    # ... profiles:
    profiles-artifact: my-profiles-artifact
    ...
```

The build artifacts contain [Apache Parquet](https://parquet.apache.org/) files
with all signals of the given type. An external analytics backend can ingest
them on regular intervals and provide sophisticated reports on the evolution of
your code. For more information on how you can build your own analytics backend
with open source; or for general information, like the schema of the files - see
[mishmash.io's tools for telemetry analytics repository.](https://github.com/mishmash-io/opentelemetry-server-embedded)

> [!TIP]
>
> If collection for a given signal is enabled (its `save-*` option is `true`)
> artifact upload can be disabled by setting its `*-artifact` option to an empty
> string. Such a setup collects and saves the data inside the worker, but
> doesn't upload it at the end.

### Supported programming languages

You can selectively enable or disable instrumentation for particular programming
languages too.

#### Java

To setup your environment for instrumenting Java code add this to your CI/CD
workflow configuration:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to setup java instrumentation:
    instrument-java: true
    # optionally set a version of the OpenTelemetry java agent:
    java-agent-version: 2.24.0
    # (optional) if you have a tool cache enabled on your worker you can use it to cache the download
    cache-agents: true
    ...
```

Or, if you would like to always use the latest version of the agent:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to setup java instrumentation:
    instrument-java: true
    # optionally set a version of the OpenTelemetry java agent:
    java-agent-version: latest
    # In this case the action will need a GITHUB token:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    # (optional) if you have a tool cache enabled on your worker you can use it to cache the download
    cache-agents: true
    ...
```

When Java instrumentation is enabled the action downloads the
[OpenTelemetry Java zero-code agent](https://opentelemetry.io/docs/zero-code/java/agent/)
and configures it. As you may need the path to this agent in subsequent workflow
steps you can get the `java-agent` output of this action. Do it like this:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to setup java instrumentation:
    instrument-java: true
    # optionally set a version of the OpenTelemetry java agent:
    java-agent-version: 2.24.0
    ...

- name: Run auto-instrumented java
  run: java -javaagent:${{ steps.telemetry.outputs.java-agent }} myJar

# or like this:
- name: Another way of Instrumenting java
  env:
    JAVA_TOOL_OPTIONS: '-javaagent:${{ steps.telemetry.outputs.java-agent }}'
  run: mvn test
```

#### Other programming languages

TBD - 'watch' this repository for updates.

### Operating system metrics

If you would like to capture hardware- and OS- related metrics, like CPU, RAM,
disk, and network usage, add the following to your configuration:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to collect OS- and hardware- related metrics:
    collect-host-metrics: true
    # optionally set a version of the OpenTelemetry host metrics collector:
    host-collector-version: latest
    # (optional) if you have a tool cache enabled on your worker you can use it to cache the download
    cache-agents: true
    ...
```

### Quick SQL to generate summaries

You can tell this action to run small SQL scripts on the collected telemetry
data. Configure with:

```yaml
- name: Setup telemetry collection
  id: telemetry
  uses: mishmash-io/setup-telemetry-collection@v1 # Set the latest version here
  with:
    # to run SQL scripts on collected telemetry:
    summary-queries: summaries/*.sql # 'glob' your sql scripts with patterns here
    ...
```

> [!IMPORTANT]
>
> Configure only light SQL scripts with short result sets. Focus perhaps on a
> few key metrics or a limited number of error log messages. Don't run complex
> analytics on your CI/CD runners, use an appropriate analytics backend instead.
>
> Get some
> [open source ideas here.](https://github.com/mishmash-io/opentelemetry-server-embedded)

When you add SQL scripts, `setup-telemetry-collection` launches an in-memory
[DuckDB](https://duckdb.org/) instance and runs your scripts in it. You can see
the results of your queries on the Job summary page.

Take a look at some scripts in the [summaries/](summaries/) folder. These
scripts run as part of the 'local' CI/CD and you can see their results. Go to
[Actions page](https://github.com/mishmash-io/setup-telemetry-collection/actions/workflows/ci.yml),
choose a recent build in the right section, and scroll down to see the summary.

See an [example screenshot.](docs/images/sql-summaries-screenshot.png)

### Additional configuration options

In rare cases you might need to further customize your CI/CD steps telemetry.

| Configuration option | Default value                             | Description                                                                                           |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `grpc-port`[^1]      | 4317                                      | The OTLP (OpenTelemetry Line Protocol) over gRPC network port                                         |
| `http-port`[^1]      | 4318                                      | The OTLP over HTTP network port                                                                       |
| `server-image`       | `mishmashio/opentelemetry-parquet-server` | The Docker image to use for the backend server, add `:version` at the end to bind to concrete version |
| `cache-agents`       | true                                      | Use the runner's `tool-cache`[^2] to avoid repetitive downloads                                       |
| `github-token`       |                                           | See the [security section](#security-and-job-permissions) below                                       |

[^1]:
    Clients and servers are automatically configured to use the ports you
    specify, no additional configuration is needed

[^2]:
    The `tool-cache` must be available on your workers before setting this
    configuration option

## Outputs

On successful completion, this action adds a number of outputs that you can use
to further customize your CI/CD job.

| Output         | Available when          | Usage                                                                 | Description                                                            |
| -------------- | ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `java-agent`   | `instrument-java: true` | `${{ steps.<setup-telemetry-collection-step>.outputs.java-agent }}`   | Contains the path to the OpenTelemetry Java auto-instrumentation agent |
| `signals-path` | Always                  | `${{ steps.<setup-telemetry-collection-step>.outputs.signals-path }}` | Tells you where telemetry files are saved.                             |

Additionally it sets a number of configuration settings needed by OpenTelemetry.

### The job summary

This step also publishes a summary. See
[the summaries section](#quick-sql-to-generate-summaries) for an example.

## Using it to collect tests telemetry

Coming soon, 'watch' this repository to get notified.

> [!TIP]
>
> See it in action - check out
> [this repository](https://github.com/mishmash-io/distributed-computing-stacks)
> where we're collecting telemetry from tests.

## Limitations

> [!CAUTION]
>
> At the moment `setup-telemetry-collection` works only on Linux runners.

## Security and job permissions

For its simplest scenarios this action doesn't require specific permissions or
the use of a `GITHUB_TOKEN`.

A `GITHUB_TOKEN` is only needed, and therefore must be set in the `github-token`
input parameter, when one or more of these input combinations are set:

```yaml
# java instrumentation is enabled and latest agent version is requested (which is the default configuration):
instrument-java: true
java-agent-version: latest

# Host metrics are to be collected and the host metrics collector version is set to latest (which is also default):
collect-host-metrics: true
host-collector-version: latest

# Profile signals are enabled and the profiler version is set to latest (by default profiling is disabled):
save-profiles: true
profiler-version: latest
```

If you wish to **_NOT_** provide a `GITHUB_TOKEN` to this action either disable
all of the above, if you don't need them, or set `*-version` inputs to specific
versions. Choose versions among the official OpenTelemetry releases:

- [Official OpenTelemetry Java instrumentation agent releases](https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases)
- [Official OpenTelemetry Host metrics and profiler releases](https://github.com/open-telemetry/opentelemetry-collector-releases/releases)

## License

The `setup-telemetry-collection` action is available under the open source
[Apache-2.0 license.](https://github.com/mishmash-io/setup-telemetry-collection?tab=Apache-2.0-1-ov-file#readme)

## Contributions

(TODO: contributor's guide)

### Working with the source code

Clone this repository and perform a few initial setup steps before developing.

> [!NOTE]
>
> You'll need to have a reasonably modern version of
> [Node.js](https://nodejs.org) handy (20.x or later should work!). If you are
> using a version manager like [`nodenv`](https://github.com/nodenv/nodenv) or
> [`fnm`](https://github.com/Schniz/fnm), this template has a `.node-version`
> file at the root of the repository that can be used to automatically switch to
> the correct version when you `cd` into the repository. Additionally, this
> `.node-version` file is used by GitHub Actions in any `actions/setup-node`
> actions.

1. Install the dependencies

   ```bash
   npm install
   ```

1. Package the JavaScript for distribution

   ```bash
   npm run bundle
   ```

1. Run the tests

   ```bash
   $ npm test

   PASS  ./index.test.js
     ✓ throws invalid number (3ms)
     ✓ wait 500 ms (504ms)
     ✓ test runs (95ms)

   ...
   ```

The [`src/`](./src/) directory contains this action's source code. **_Before
committing_** though, make sure you run:

```bash
npm run all
```

> [!CAUTION]
>
> This step is important! It runs [`rollup`](https://rollupjs.org/) to build the
> final JavaScript action code with all dependencies included. If you don't run
> this step, the action will not work correctly when it is used in a workflow.

### Testing locally

To test your changes locally on your computer you can use the
[`@github/local-action`](https://github.com/github/local-action) utility. It's a
simple command-line tool that "stubs" (or simulates) the GitHub Actions Toolkit.
This way, you can run this action locally without having to commit and push your
changes.

Run the `local-action` utility in one of the following ways:

- Visual Studio Code Debugger

  Configured in [`.vscode/launch.json`](./.vscode/launch.json)

- Terminal/Command Prompt

  ```bash
  # npx @github/local action <action-yaml-path> <entrypoint> <dotenv-file>
  npx @github/local-action . src/main.js .env
  ```

  You can provide a `.env` file to the `local-action` CLI to set environment
  variables used by the GitHub Actions Toolkit. For example, setting inputs and
  event payload data used by the action. For more information, see the example
  file, [`.env.example`](./.env.example), and the
  [GitHub Actions Documentation](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables).

### Updating Licenses

Whenever you install or update dependencies, you can use the Licensed CLI to
update the licenses database. To install Licensed, see the project's
[Readme](https://github.com/licensee/licensed?tab=readme-ov-file#installation).

To update the cached licenses, run the following command:

```bash
licensed cache
```

To check the status of cached licenses, run the following command:

```bash
licensed status
```

## Code of conduct

See the
[Code of conduct tab.](https://github.com/mishmash-io/setup-telemetry-collection?tab=coc-ov-file#contributor-covenant-code-of-conduct)

## OpenTelemetry at mishmash io

[![GitHub followers](https://img.shields.io/github/followers/mishmash-io)](https://github.com/mishmash-io)
[![Bluesky posts](https://img.shields.io/bluesky/posts/mishmash.io)](https://bsky.app/profile/mishmash.io)
[![GitHub Discussions](https://img.shields.io/github/discussions/mishmash-io/about?logo=github&logoColor=white)](https://github.com/orgs/mishmash-io/discussions)
[![Discord](https://img.shields.io/discord/1208043287001169990?logo=discord&logoColor=white)](https://discord.gg/JqC6VMZTgJ)

OpenTelemetry's main intent is the observability of production environments, but
at [mishmash.io](https://mishmash.io) it's part of our software development
process. By saving telemetry from **experiments** and **tests** of our own
algorithms we ensure things like **performance** and **resource usage** of our
distributed database, continuously and across releases.

We believe that adopting OpenTelemetry as a software development tool might be
useful to you too, which is why we decided to open-source the tools we've built.

Learn more about the broader set of
[OpenTelemetry-related activities](https://mishmash.io/open_source/opentelemetry)
at [mishmash.io](https://mishmash.io/) and `follow`
[GitHub profile](https://github.com/mishmash-io) for updates and new releases.
