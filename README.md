# setup-telemetry-collection

This action sets up OpenTelemetry exports, a backend to save the data... and
some stuff (short description with bullets)

## Usage

configuration examples and what settings do...

a basic config example

Supported versions and etc... (limitations?)

## Using it to collect tests

some nicer examples

## Permissions

recommendations on what permissions to give it

## License

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

## About mishmash.io
