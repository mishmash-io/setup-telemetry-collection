# setup-telemetry-collection

This action sets up [OpenTelemetry](https://opentelemetry.io/) in your CICD environment. Instrument your tests, run them and when your pipeline run finishes - telemetry `logs`, `metrics`, `traces` and `profiles` will be saved as [Apache Parquet](https://parquet.apache.org/) files. Use the files for analytics on top of your tests, before code reaches production.

For inspiration, see our [tests telemetry analytics tools.](https://github.com/mishmash-io/opentelemetry-server-embedded) 

## Usage

Internally, this action downloads the necessary OpenTelemetry agents for your programming language(s) to your CICD worker and optionally caches them. It launches a [small OpenTelemetry backend server by mishmash io](https://github.com/mishmash-io/opentelemetry-server-embedded/tree/main/server-parquet) that saves the telemetry to disk and configures the OpenTelemetry agents and SDKs to send signals to that server. Once your CICD job is finished - the telemetry data is saved as an artifact of your build.

> [!TIP]
> With this action you don't have to download OpenTelemetry agents or configure them, by, say, setting and exporting the numerous variables like `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`, etc.
>
> The action does all that for you.

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

The following sections contain more details about the various configuration options that you can set in your workflow.

### Supported telemetry signals

This action can collect `logs`, `metrics`, `traces` and `profiles` signals. By default, only `logs`, `metrics` and `traces` are enabled. Enabling or disabling a given signal
is done with the following boolean action inputs:

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

Once your workflow job has finished execution this action will upload an artifact (similarly to [actions/upload-artifact](https://github.com/actions/upload-artifact)) for each of the ***enabled*** signals. The default
artifacts are named `telemetry-logs`, `telemetry-metrics`, `telemetry-traces` and `telemetry-profiles`, but the names are configurable:

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

These build artifacts contain [Apache Parquet](https://parquet.apache.org/) files that can then be ingested externally by an analytics backend. For more information on how you can self-host an analytics backend, or for general information, like the schema of the files - see [mishmash io's tools for telemetry analytics repo.](https://github.com/mishmash-io/opentelemetry-server-embedded)

> [!TIP]
>
> If collection for a signal is enabled (its `save-*` option is `true`) artifact upload can be disabled by setting its `*-artifact` option to an empty string. This setup will collect and save the data
> inside the worker, but will not upload it at the end.
>

### Supported programming languages

You can selectively enable or disable instrumentation for particular programming languages too.

### Java

To setup your environment for instrumenting java code add this to your workflow config:

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

Or, if you would like to always use the latest version of it:

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

When java instrumentation is enabled the action downloads the [OpenTelemetry Java zero-code agent](https://opentelemetry.io/docs/zero-code/java/agent/) and configures it. As you may need the path
to this agent in subsequent workflow steps it is availble in the `java-agent` output of this action. You can use it like this:

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


## Outputs

## Using it to collect tests

Comming soon...

## Limitations

WARN - linux only for now...

## Security and job permissions

For its simplest use this action does not require specific permissions or the use of a `GITHUB_TOKEN`.

A `GITHUB_TOKEN` is only needed (and must be set in the `github-token` input parameter) when one or more of these input combinations are set:

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

If you wish to ***NOT*** provide a `GITHUB_TOKEN` to this action either disable all of the above, if you don't need them, or set `*-version` inputs to specific versions. Version numbers can be obtained
from the official OpenTelemetry releases:
- [Official OpenTelemetry Java instrumentation agent releases](https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases)
- [Official OpenTelemetry Host metrics and profiler releases](https://github.com/open-telemetry/opentelemetry-collector-releases/releases)

## License

The `setup-telemetry-collection` action is available under the open source [Apache-2.0 license.](https://github.com/mishmash-io/setup-telemetry-collection?tab=Apache-2.0-1-ov-file#readme)

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

> This step is important! It will run [`rollup`](https://rollupjs.org/) to build
> the final JavaScript action code with all dependencies included. If you do not
> run this step, the action will not work correctly when it is used in a
> workflow.

### Testing locally

To test your changes locally on your computer you can use the
[`@github/local-action`](https://github.com/github/local-action) utility. It is
a simple command-line tool that "stubs" (or simulates) the GitHub Actions
Toolkit. This way, you can run this action locally without having to commit and
push your changes.

The `local-action` utility can be run in the following ways:

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

See the [Code of conduct tab.](https://github.com/mishmash-io/setup-telemetry-collection?tab=coc-ov-file#contributor-covenant-code-of-conduct)

## OpenTelemetry at mishmash io

[![GitHub followers](https://img.shields.io/github/followers/mishmash-io)](https://github.com/mishmash-io) [![Bluesky posts](https://img.shields.io/bluesky/posts/mishmash.io)](https://bsky.app/profile/mishmash.io) [![GitHub Discussions](https://img.shields.io/github/discussions/mishmash-io/about?logo=github&logoColor=white)](https://github.com/orgs/mishmash-io/discussions) [![Discord](https://img.shields.io/discord/1208043287001169990?logo=discord&logoColor=white)](https://discord.gg/JqC6VMZTgJ)

OpenTelemetry's main intent is the observability of production environments, but at [mishmash io](https://mishmash.io) it is part of our software development process. By saving telemetry from  **experiments** and **tests** of our own algorithms we ensure things like **performance** and **resource usage** of our distributed database, continuously and across releases.

We believe that adopting OpenTelemetry as a software development tool might be useful to you too, which is why we decided to open-source the tools we've built.

Learn more about the broader set of [OpenTelemetry-related activities](https://mishmash.io/open_source/opentelemetry) at
[mishmash io](https://mishmash.io/) and `follow` [GitHub profile](https://github.com/mishmash-io) for updates and new releases.
