/*
 *    Copyright 2026 Mishmash IO UK Ltd.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

import * as core from '@actions/core'
import * as cache from '@actions/tool-cache'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import { DefaultArtifactClient } from '@actions/artifact'

import * as fs from 'node:fs/promises'
import { spawn } from 'node:child_process'

import { getMacros } from './dbmacros.js'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    if (!core.platform.isLinux) {
      throw new Error('This action only runs on linux runners')
    }

    const cacheAgents = core.getBooleanInput('cache-agents', {
      required: false
    })
    const instrumentJava = core.getBooleanInput('instrument-java', {
      required: false
    })
    const saveLogs = core.getBooleanInput('save-logs', {
      required: false
    })
    const saveMetrics = core.getBooleanInput('save-metrics', {
      required: false
    })
    const saveTraces = core.getBooleanInput('save-traces', {
      required: false
    })
    const saveProfiles = core.getBooleanInput('save-profiles', {
      required: false
    })

    const resourceAttrs = buildResourceAttributes()
    const resourceAttrsFlat = Object.entries(resourceAttrs)
      .map(([key, value]) => `${key}=${value ? value : ''}`)
      .join(',')

    const signalsPath = await createTempDir()
    const containerId = await launchServer(signalsPath, resourceAttrsFlat)

    if (containerId) {
      core.saveState('containerId', containerId)
      core.saveState('signalsPath', signalsPath)
    } else {
      throw new Error('Failed to launch server container')
    }

    if (instrumentJava === true) {
      // configure java SDK
      // https://opentelemetry.io/docs/languages/java/configuration/
      // configure java agent
      // https://opentelemetry.io/docs/zero-code/java/agent/configuration/

      const javaAgentPath = await setupJava(cacheAgents)

      core.setOutput('java-agent', javaAgentPath)
    }

    if (core.getInput('summary-queries')) {
      // if we're going to run summary queries - setup DuckDB
      const duckdbCli = await setupDuckdb(cacheAgents)

      core.saveState('duckdbCli', duckdbCli)
    }

    // add configuration variables
    // https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/
    core.exportVariable('OTEL_RESOURCE_ATTRIBUTES', resourceAttrsFlat)

    // OTLP exporter configuration
    // https://opentelemetry.io/docs/specs/otel/protocol/exporter/
    core.exportVariable('OTEL_EXPORTER_OTLP_PROTOCOL', 'grpc')
    core.exportVariable('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317')

    core.exportVariable(
      'OTEL_LOGS_EXPORTER',
      saveLogs === true ? 'otlp' : 'none'
    )
    core.exportVariable(
      'OTEL_METRICS_EXPORTER',
      saveMetrics === true ? 'otlp' : 'none'
    )
    core.exportVariable(
      'OTEL_TRACES_EXPORTER',
      saveTraces === true ? 'otlp' : 'none'
    )

    if (saveProfiles === true) {
      const profilerPath = await setupProfiler(cacheAgents)
      // TODO: set environment variables accordingly!

      core.debug(`Launching profiler ${profilerPath}`)
      const [pid, cfgFile] = await launchProfiler(profilerPath)
      core.saveState('profilerPid', pid)
      core.saveState('profilerConfig', cfgFile)
    }

    const collectHostMetrics = core.getBooleanInput('collect-host-metrics', {
      required: false
    })
    if (collectHostMetrics === true) {
      const hostCollectorPath = await setupHostCollector(cacheAgents)
      // TODO: setup env vars!

      core.debug(`Launching host collector ${hostCollectorPath}`)
      const [pid, cfgFile] = await launchHostCollector(hostCollectorPath)
      core.saveState('hostCollectorPid', pid)
      core.saveState('hostCollectorConfig', cfgFile)
    }

    // Set outputs for other workflow steps to use
    core.setOutput('signals-path', signalsPath)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

/**
 * The post-run function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function post() {
  try {
    const containerId = core.getState('containerId')
    if (containerId) {
      const profilerPid = core.getState('profilerPid')
      if (profilerPid) {
        core.debug(`Stopping profiler pid ${profilerPid}`)
        await stopProfiler(profilerPid)
      }

      const hostCollectorPid = core.getState('hostCollectorPid')
      if (hostCollectorPid) {
        core.debug(`Stopping host collector pid ${hostCollectorPid}`)
        await stopHostCollector(hostCollectorPid)
      }

      // stop the server
      core.debug(`Stopping server container ${containerId}`)
      await stopServer(containerId)

      core.summary.addHeading('Collected telemetry', '1')
      core.summary.addRaw(
        `<p>The following files contain telemetry signals saved by <a href="https://github.com/${process.env['GITHUB_ACTION_REPOSITORY']}">${process.env['GITHUB_ACTION_REPOSITORY']} ${process.env['GITHUB_ACTION_REF']}</a> action during this run of <code>${process.env['GITHUB_WORKFLOW']}</code></p>`
      )
      core.summary.addEOL()
      core.summary.addBreak()

      // upload the artifacts
      const signalsPath = core.getState('signalsPath')
      const files = await fs.readdir(signalsPath, { withFileTypes: true })

      const saveLogs = core.getBooleanInput('save-logs', {
        required: false
      })
      const logsArtifact = core.getInput('logs-artifact')
      const logs = await selectLogs(files)
      const saveMetrics = core.getBooleanInput('save-metrics', {
        required: false
      })
      const metricsArtifact = core.getInput('metrics-artifact')
      const metrics = await selectMetrics(files)
      const saveTraces = core.getBooleanInput('save-traces', {
        required: false
      })
      const tracesArtifact = core.getInput('traces-artifact')
      const traces = await selectTraces(files)
      const saveProfiles = core.getInput('save-profiles', {
        required: false
      })
      const profilesArtifact = core.getInput('profiles-artifact')
      const profiles = await selectProfiles(files)

      const artifact = new DefaultArtifactClient()
      let summaryTable = [
        [
          { data: 'Signal', header: true },
          { data: 'Artifact', header: true }
        ]
      ]

      if (logs.length > 0 && saveLogs && logsArtifact) {
        const { id, size } = await artifact.uploadArtifact(
          logsArtifact,
          logs.map((e) => `${signalsPath}/${e}`),
          signalsPath
        )

        core.debug(`Uploaded logs artifact ${id} with size ${size}`)

        summaryTable.push([
          { data: 'Logs' },
          {
            data: `<a href="${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/artifacts/${id}">${logsArtifact}</a>`
          }
        ])
      } else {
        summaryTable.push([{ data: 'Logs' }, { data: 'None' }])

        core.debug(
          'Not uploading telemetry logs artifact: logs not saved or upload disabled'
        )
      }

      if (metrics.length > 0 && saveMetrics && metricsArtifact) {
        const { id, size } = await artifact.uploadArtifact(
          metricsArtifact,
          metrics.map((e) => `${signalsPath}/${e}`),
          signalsPath
        )

        core.debug(`Uploaded metrics artifact ${id} with size ${size}`)

        summaryTable.push([
          { data: 'Metrics' },
          {
            data: `<a href="${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/artifacts/${id}">${metricsArtifact}</a>`
          }
        ])
      } else {
        summaryTable.push([{ data: 'Metrics' }, { data: 'None' }])

        core.debug(
          'Not uploading telemetry metrics artifact: metrics not saved or upload disabled'
        )
      }

      if (traces.length > 0 && saveTraces && tracesArtifact) {
        const { id, size } = await artifact.uploadArtifact(
          tracesArtifact,
          traces.map((e) => `${signalsPath}/${e}`),
          signalsPath
        )

        core.debug(`Uploaded traces artifact ${id} with size ${size}`)

        summaryTable.push([
          { data: 'Traces' },
          {
            data: `<a href="${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/artifacts/${id}">${tracesArtifact}</a>`
          }
        ])
      } else {
        summaryTable.push([{ data: 'Traces' }, { data: 'None' }])

        core.debug(
          'Not uploading telemetry traces artifact: traces not saved or upload disabled'
        )
      }

      if (profiles.length > 0 && saveProfiles && profilesArtifact) {
        const { id, size } = await artifact.uploadArtifact(
          profilesArtifact,
          profiles.map((e) => `${signalsPath}/${e}`),
          signalsPath
        )

        core.debug(`Uploaded profiles artifact ${id} with size ${size}`)

        summaryTable.push([
          { data: 'Profiles' },
          {
            data: `<a href="${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/artifacts/${id}">${profilesArtifact}</a>`
          }
        ])
      } else {
        summaryTable.push([{ data: 'Profiles' }, { data: 'None' }])

        core.debug(
          'Not uploading telemetry profiles artifact: profiles not saved or upload disabled'
        )
      }

      core.summary.addTable(summaryTable)
      core.summary.addEOL()

      const summaries = core.getInput('summary-queries')
      if (summaries) {
        const duckdbCli = core.getState('duckdbCli')
        const globber = await glob.create(summaries)
        const queries = await globber.glob()

        if (queries) {
          if (duckdbCli) {
            core.summary.addHeading('Telemetry summaries', '2')
            core.summary.addRaw(
              '<p>Below is the output of all queries configured to run on the collected telemetry.</p>'
            )

            for (const query of queries) {
              core.debug(`Found summary query ${query}`)

              const queryResults = await runSummaryQuery(duckdbCli, query)
              let queryTable = []

              core.summary.addSeparator()

              if (query.startsWith(process.env['GITHUB_WORKSPACE'])) {
                const relativePath = query.substring(
                  process.env['GITHUB_WORKSPACE'].length + 1
                )

                core.summary.addRaw(
                  `<p><a href="${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/blob/${process.env['GITHUB_HEAD_REF']}/${relativePath}">${relativePath}</a></p>`
                )
                core.summary.addEOL()
              } else {
                core.summary.addRaw(`<p>${query}</p>`)
                core.summary.addEOL()
              }

              if (queryResults) {
                const columns = Object.keys(queryResults[0])
                queryTable.push(columns.map((k) => ({ data: k, header: true })))

                for (const r of queryResults) {
                  queryTable.push(Object.values(r).map((v) => ({ data: v })))
                }
              }

              core.summary.addTable(queryTable)
              core.summary.addEOL()
            }
          } else {
            core.debug(`Cannot find DuckDB, not running summary queries`)
          }
        } else {
          core.debug(
            'No summary queries found matching the given glob pattern(s)'
          )
        }
      }

      core.summary.write()

      // not using issue comments at the moment
      // await commentOnIssue()
    } else {
      core.debug('No server container launched, skipping stop command')
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  } finally {
    const signalsPath = core.getState('signalsPath')
    if (signalsPath) {
      quietlyDeleteTempDir(signalsPath)
    }

    const profilerCfgPath = core.getState('profilerConfig')
    if (profilerCfgPath) {
      core.info(`deleting profiler config ${profilerCfgPath}`)
      quietlyDeleteTempFile(profilerCfgPath)
    }

    const hostCollectorCfgPath = core.getState('hostCollectorConfig')
    if (hostCollectorCfgPath) {
      core.info(`deleting host collector config ${hostCollectorCfgPath}`)
      quietlyDeleteTempFile(hostCollectorCfgPath)
    }
  }
}

async function setupJava(shouldCache) {
  const agentVersion = core.getInput('java-agent-version', {
    required: false
  })
  const javaAgentVersion = await getReleasedVersion(
    'open-telemetry',
    'opentelemetry-java-instrumentation',
    agentVersion,
    '2.24.0'
  )

  let javaAgentPath = ''
  if (shouldCache === true) {
    const cached = cache.find('opentelemetry-java-agent', javaAgentVersion)

    if (cached) {
      javaAgentPath = core.toPlatformPath(
        `${cached}/opentelemetry-javaagent.jar`
      )
    }
  }

  if (javaAgentPath) {
    core.debug(
      `Using cached java agent ${javaAgentPath}, version ${javaAgentVersion}`
    )
  } else {
    core.debug('Downloading java agent')

    let downloadPath = await cache.downloadTool(
      `https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${javaAgentVersion}/opentelemetry-javaagent.jar`
    )

    if (downloadPath) {
      if (shouldCache === true) {
        downloadPath = await cache.cacheFile(
          downloadPath,
          'opentelemetry-javaagent.jar',
          'opentelemetry-java-agent',
          javaAgentVersion
        )
      }

      javaAgentPath = core.toPlatformPath(
        `${downloadPath}/opentelemetry-javaagent.jar`
      )
    } else {
      throw new Error('Failed to download java agent')
    }
  }

  return javaAgentPath
}

async function runSummaryQuery(duckdbCli, queryFile) {
  let tmpInit = ''

  try {
    const macros = getMacros(core.getState('signalsPath'))
    tmpInit = await createTempFile()
    await fs.writeFile(tmpInit, macros)

    let json = ''
    const exitStatus = await exec.exec(
      duckdbCli,
      ['-json', ':memory:', '--init', tmpInit, '-f', queryFile],
      {
        listeners: {
          stdout: (data) => {
            json += data.toString()
          }
        }
      }
    )

    if (exitStatus) {
      throw new Error(`DB client failed with exit code: ${exitStatus}`)
    } else {
      return JSON.parse(json)
    }
  } catch (e) {
    core.warning(`Could not run summary query ${queryFile}: ${e.message}`)
  } finally {
    if (tmpInit) {
      quietlyDeleteTempFile(tmpInit)
    }
  }

  return []
}

async function setupDuckdb(shouldCache) {
  let duckdbPath = ''
  const duckdbVersion = '1.4.4'
  if (shouldCache === true) {
    const cached = cache.find('duckdb_cli', duckdbVersion)

    if (cached) {
      duckdbPath = core.toPlatformPath(`${cached}/duckdb`)
    }
  }

  if (duckdbPath) {
    core.debug(
      `Using cached duckdb client ${duckdbPath}, version ${duckdbVersion}`
    )
  } else {
    core.debug('Downloading DuckDB cli')

    let downloadPath = await cache.downloadTool(
      `https://install.duckdb.org/v${duckdbVersion}/duckdb_cli-${core.platform.platform}-${core.platform.arch == 'x64' ? 'amd64' : core.platform.arch}.zip`
    )

    if (downloadPath) {
      const tmpDir = await createTempDir()
      try {
        downloadPath = await cache.extractZip(downloadPath, tmpDir)

        if (shouldCache === true) {
          downloadPath = await cache.cacheFile(
            core.toPlatformPath(`${downloadPath}/duckdb`),
            'duckdb',
            'duckdb_cli',
            duckdbVersion
          )
        }

        duckdbPath = core.toPlatformPath(`${downloadPath}/duckdb`)
      } finally {
        quietlyDeleteTempDir(tmpDir)
      }
    } else {
      throw new Error('Failed to download the DuckDB cli')
    }
  }

  return duckdbPath
}

async function setupHostCollector(shouldCache) {
  const hostCollectorVersion = core.getInput('host-collector-version', {
    required: false
  })
  const collectorVersion = await getReleasedVersion(
    'open-telemetry',
    'opentelemetry-collector-releases',
    hostCollectorVersion,
    '0.144.0'
  )

  let collectorPath = ''
  if (shouldCache === true) {
    const cached = cache.find('otelcol', collectorVersion)

    if (cached) {
      collectorPath = core.toPlatformPath(`${cached}/otelcol`)
    }
  }

  if (collectorPath) {
    core.debug(
      `Using cached host collector ${collectorPath}, version ${collectorVersion}`
    )
  } else {
    core.debug('Downloading host collector')

    let downloadPath = await cache.downloadTool(
      `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${collectorVersion}/otelcol_${collectorVersion}_${core.platform.platform}_${core.platform.arch == 'x64' ? 'amd64' : core.platform.arch}.tar.gz`
    )

    if (downloadPath) {
      const tmpDir = await createTempDir()
      try {
        downloadPath = await cache.extractTar(downloadPath, tmpDir)

        if (shouldCache === true) {
          downloadPath = await cache.cacheFile(
            core.toPlatformPath(`${downloadPath}/otelcol`),
            'otelcol',
            'otelcol',
            collectorVersion
          )
        }

        collectorPath = core.toPlatformPath(`${downloadPath}/otelcol`)
      } finally {
        quietlyDeleteTempDir(tmpDir)
      }
    } else {
      throw new Error('Failed to download the host collector')
    }
  }

  return collectorPath
}

async function setupProfiler(shouldCache) {
  const profilerVersion = core.getInput('profiler-version', {
    required: false
  })
  const collectorVersion = await getReleasedVersion(
    'open-telemetry',
    'opentelemetry-collector-releases',
    profilerVersion,
    '0.144.0'
  )

  let collectorPath = ''
  if (shouldCache === true) {
    const cached = cache.find('otelcol-ebpf-profiler', collectorVersion)

    if (cached) {
      collectorPath = core.toPlatformPath(`${cached}/otelcol-ebpf-profiler`)
    }
  }

  if (collectorPath) {
    core.debug(
      `Using cached profiler ${collectorPath}, version ${collectorVersion}`
    )
  } else {
    core.debug('Downloading profiler')

    let downloadPath = await cache.downloadTool(
      `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${collectorVersion}/otelcol-ebpf-profiler_${collectorVersion}_${core.platform.platform}_${core.platform.arch == 'x64' ? 'amd64' : core.platform.arch}.tar.gz`
    )

    if (downloadPath) {
      const tmpDir = await createTempDir()
      try {
        downloadPath = await cache.extractTar(downloadPath, tmpDir)

        if (shouldCache === true) {
          downloadPath = await cache.cacheFile(
            core.toPlatformPath(`${downloadPath}/otelcol-ebpf-profiler`),
            'otelcol-ebpf-profiler',
            'otelcol-ebpf-profiler',
            collectorVersion
          )
        }

        collectorPath = core.toPlatformPath(
          `${downloadPath}/otelcol-ebpf-profiler`
        )
      } finally {
        quietlyDeleteTempDir(tmpDir)
      }
    } else {
      throw new Error('Failed to download the profiler')
    }
  }

  return collectorPath
}

async function commentOnIssue() {
  // this function is not used at the moment
  try {
    if (process.env['GITHUB_EVENT_NAME'] != 'pull_request') {
      core.info('Not invoked on a PR, not posting comments')
    } else {
      if (!getGithubToken()) {
        core.info('Cannot comment on PR, "github-token" configuration not set')
      }

      core.info(
        `owner: ${process.env['GITHUB_REPOSITORY_OWNER']} repo ${process.env['GITHUB_REPOSITORY'].split(/[/]+/).pop()} issue: ${process.env['GITHUB_REF_NAME'].split(/[/]+/)[0]}`
      )
      const octokit = getOctokit()
      const resp = await octokit.request(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
        {
          owner: process.env['GITHUB_REPOSITORY_OWNER'],
          repo: process.env['GITHUB_REPOSITORY'].split(/[/]+/).pop(),
          issue_number: process.env['GITHUB_REF_NAME'].split(/[/]+/)[0],
          body: 'Hello, world! :)',
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      )
    }
  } catch (e) {
    core.info(`Error when posting issue comment: ${e.message}`)
  }
}

async function getReleasedVersion(owner, repo, requestedVersion, safeVersion) {
  let toolVersion = ''

  if (requestedVersion == 'latest') {
    // get the latest release in the repo

    if (!getGithubToken()) {
      throw new Error(
        `Cannot get latest ${owner}/${repo} release without an auth token, "github-token" must be set`
      )
    }

    const octokit = getOctokit()
    try {
      const resp = await octokit.request(
        'GET /repos/{owner}/{repo}/releases/latest',
        {
          owner: owner,
          repo: repo,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      )

      // remove the leading 'v' from the tag name to get the version
      toolVersion = resp.data.tag_name.substring(1)
      core.debug(
        `Using latest ${owner}/${repo} release, version: ${toolVersion}`
      )
    } catch (e) {
      throw new Error(
        `Failed to get latest release of ${owner}/${repo}, error message: ${e.message}`
      )
    }
  } else if (requestedVersion) {
    if (getGithubToken()) {
      // check that this release exists in the repo
      const octokit = getOctokit()
      try {
        const resp = await octokit.request(
          'GET /repos/{owner}/{repo}/releases/tags/{tag}',
          {
            owner: owner,
            repo: repo,
            tag: `v${requestedVersion}`,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          }
        )

        core.debug(
          `Verified ${owner}/${repo} release version ${requestedVersion}, will use it`
        )
      } catch (e) {
        throw new Error(
          `Release version ${requestedVersion} does not exist in ${owner}/${repo}`
        )
      }

      toolVersion = requestedVersion
    } else {
      core.debug(
        `Auth token not provided, cannot verify ${owner}/${repo} release, relying on provided "${requestedVersion}"`
      )

      toolVersion = requestedVersion
    }
  } else {
    // use a hard-coded default
    core.debug(
      `Using a hard-coded ${owner}/${repo} default release version ${safeVersion} because config did not specify a value`
    )

    toolVersion = safeVersion
  }

  return toolVersion
}

function getGithubToken() {
  return core.getInput('github-token')
}

function getOctokit() {
  const token = getGithubToken()

  if (!token) {
    throw new Error(
      'Cannot authenticate to GitHub APIs, GITHUB_TOKEN not provided'
    )
  }

  return github.getOctokit(token)
}

async function launchServer(tempDir, defaultAttrs) {
  const grpcPort = +core.getInput('grpc-port', {
    required: false
  })
  const httpPort = +core.getInput('http-port', {
    required: false
  })
  const serverImage = core.getInput('server-image', {
    required: false
  })

  if (isNaN(grpcPort)) {
    throw new Error('grpc-port must be an integer')
  }

  if (isNaN(httpPort)) {
    throw new Error('http-port must be an integer')
  }

  if (!serverImage) {
    throw new Error('server-image cannot be empty')
  }

  let containerId = ''
  const dockerExitCode = await exec.exec(
    'docker',
    [
      'run',
      '-d',
      '-e',
      `DEFAULT_RESOURCE_ATTRIBUTES=${defaultAttrs}`,
      '-p',
      `${grpcPort}:4317`,
      '-p',
      `${httpPort}:4318`,
      '-v',
      `${tempDir}:/parquet:z`,
      serverImage
    ],
    {
      listeners: {
        stdout: (data) => {
          containerId = data.toString().trim()
        }
      }
    }
  )

  if (dockerExitCode) {
    throw new Error(
      `Failed to launch server container, exit code: ${dockerExitCode}`
    )
  }

  return containerId
}

async function stopServer(containerId) {
  core.debug(`Shutting down server container ${containerId}`)

  const exitStatus = await exec.exec('docker', [
    'stop',
    '-t',
    '10', // TODO: set to a configurable timeout
    containerId
  ])

  if (exitStatus) {
    core.warning(
      `Server container stop command failed with exit code: ${exitStatus}`
    )
  }

  await core.group('Telemetry server logs', async () => {
    return await exec.exec('docker', ['container', 'logs', containerId], {
      listeners: {
        stdout: (data) => {
          core.info(data.toString())
        },
        stderr: (data) => {
          core.error(data.toString())
        }
      }
    })
  })
}

async function launchProfiler(exePath) {
  const tempCfg = await createTempFile()

  await fs.writeFile(tempCfg, ebpfConfig)
  const child = spawn(
    `sudo ${exePath} --config=file:${tempCfg} --feature-gates=service.profilesSupport`,
    {
      detached: true,
      stdio: 'ignore',
      shell: true
    }
  )

  child.unref()

  return [child.pid, tempCfg]
}

async function stopProfiler(pid) {
  try {
    await exec.exec('sudo', ['kill', '-9', pid])
  } catch (e) {
    core.debug(`Ignoring error when stopping profiler: ${e.message}`)
  }
}

async function launchHostCollector(exePath) {
  const tempCfg = await createTempFile()

  await fs.writeFile(tempCfg, hostMetricsConfig)
  const child = spawn(exePath, [`--config=file:${tempCfg}`], {
    detached: true,
    stdio: 'ignore'
  })

  child.unref()

  return [child.pid, tempCfg]
}

async function stopHostCollector(pid) {
  try {
    await exec.exec('kill', ['-9', pid])
  } catch (e) {
    core.debug(`Ignoring error when stopping host collector: ${e.message}`)
  }
}

async function createTempFile() {
  let path = ''

  const exitStatus = await exec.exec('mktemp', [], {
    listeners: {
      stdout: (data) => {
        path = data.toString().trim()
      }
    }
  })

  if (exitStatus) {
    throw new Error(
      `Could not create temporary file, exit status ${exitStatus} `
    )
  }

  return path
}

async function createTempDir() {
  let path = ''

  const exitStatus = await exec.exec('mktemp', ['-d'], {
    listeners: {
      stdout: (data) => {
        path = data.toString().trim()
      }
    }
  })

  if (exitStatus) {
    throw new Error(
      `Could not create temporary directory, exit status ${exitStatus} `
    )
  }

  return path
}

async function quietlyDeleteTempFile(path) {
  return await quietlyDeleteTempDir(path)
}

async function quietlyDeleteTempDir(path) {
  try {
    await exec.exec('rm', ['-rf', path])
  } catch (e) {
    core.debug(
      `Got exception while removing temp dir ${path}, message is: ${e.message}`
    )
  }
}

async function selectLogs(files) {
  const logsRx = /^logs-[0-9]+-[0-9]+\.parquet/

  return await selectFiles(files, logsRx)
}

async function selectMetrics(files) {
  const metricsRx = /^metrics-[0-9]+-[0-9]+\.parquet/

  return await selectFiles(files, metricsRx)
}

async function selectTraces(files) {
  const tracesRx = /^traces-[0-9]+-[0-9]+\.parquet/

  return await selectFiles(files, tracesRx)
}

async function selectProfiles(files) {
  const profilesRx = /^profiles-[-a-z]*-[0-9]+-[0-9]+\.parquet/

  return await selectFiles(files, profilesRx)
}

async function selectFiles(files, pattern) {
  let res = []

  for (const file of files) {
    if (file.isFile()) {
      const fstat = await fs.stat(`${file.parentPath}/${file.name}`)
      if (fstat.size > 0 && pattern.test(file.name)) {
        res.push(file.name)
      }
    }
  }

  return res
}

function buildResourceAttributes() {
  let resourceAttrs = {}

  // configure general CI/CD resource attributes
  // see https://opentelemetry.io/docs/specs/semconv/resource/cicd/
  resourceAttrs['cicd.pipeline.name'] = process.env['GITHUB_WORKFLOW']
  resourceAttrs['cicd.pipeline.run.id'] = process.env['GITHUB_RUN_ID']
  resourceAttrs['cicd.pipeline.run.url.full'] =
    `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
  resourceAttrs['cicd.worker.id'] = process.env['RUNNER_NAME']
  resourceAttrs['cicd.worker.name'] = process.env['RUNNER_ENVIRONMENT']
  resourceAttrs['vcs.repository.name'] =
    'GITHUB_REPOSITORY' in process.env
      ? process.env['GITHUB_REPOSITORY'].split(/[/]+/).pop()
      : undefined
  resourceAttrs['vcs.repository.url.full'] =
    `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}`
  resourceAttrs['vcs.ref.head.name'] = process.env['GITHUB_REF']
  resourceAttrs['vcs.ref.head.revision'] = process.env['GITHUB_SHA']
  resourceAttrs['vcs.ref.type'] = process.env['GITHUB_REF_TYPE']

  // add some extra attrs that may be helpful
  resourceAttrs['github.repository.id'] = process.env['GITHUB_REPOSITORY_ID']
  resourceAttrs['github.repository.name'] = process.env['GITHUB_REPOSITORY']
  resourceAttrs['github.repository.owner.name'] =
    process.env['GITHUB_REPOSITORY_OWNER']
  resourceAttrs['github.repository.owner.id'] =
    process.env['GITHUB_REPOSITORY_OWNER_ID']

  resourceAttrs['github.event.name'] = process.env['GITHUB_EVENT_NAME']
  resourceAttrs['github.actor.name'] = process.env['GITHUB_ACTOR']
  resourceAttrs['github.actor.id'] = process.env['GITHUB_ACTOR_ID']
  resourceAttrs['github.triggering_actor.name'] =
    process.env['GITHUB_TRIGGERING_ACTOR']
  resourceAttrs['github.head.ref'] = process.env['GITHUB_HEAD_REF']
  resourceAttrs['github.base.ref'] = process.env['GITHUB_BASE_REF']
  resourceAttrs['github.ref.name'] = process.env['GITHUB_REF_NAME']
  resourceAttrs['github.ref.protected'] = process.env['GITHUB_REF_PROTECTED']

  resourceAttrs['github.workflow.ref'] = process.env['GITHUB_WORKFLOW_REF']
  resourceAttrs['github.workflow.sha'] = process.env['GITHUB_WORKFLOW_SHA']
  resourceAttrs['github.job.name'] = process.env['GITHUB_JOB']
  resourceAttrs['github.run.number'] = process.env['GITHUB_RUN_NUMBER']
  resourceAttrs['github.run.attempt'] = process.env['GITHUB_RUN_ATTEMPT']

  resourceAttrs['github.runner.os'] = process.env['RUNNER_OS']
  resourceAttrs['github.runner.arch'] = process.env['RUNNER_ARCH']
  resourceAttrs['github.runner.image.os'] = process.env['ImageOS']
  resourceAttrs['github.runner.image.version'] = process.env['ImageVersion']

  return resourceAttrs
}

const ebpfConfig = `
receivers:
  profiling:

exporters:
  otlp_grpc:
    endpoint: 127.0.0.1:4317
    tls:
      insecure: true

service:
  pipelines:
    profiles:
      receivers: [profiling]
      exporters: [otlp_grpc]
  # own telemetry
  telemetry:
    traces: # https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-traces
      processors:
        - batch:
            exporter:
              otlp:
                protocol: grpc
                endpoint: http://127.0.0.1:4317
    logs: # https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-logs
      processors:
        - batch: 
            exporter:
              otlp:
                protocol: grpc
                endpoint: http://127.0.0.1:4317
    metrics: # https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-metrics
      level: detailed
      readers:
        - periodic:
            exporter:
              otlp:
                protocol: grpc
                endpoint: http://127.0.0.1:4317
`

const hostMetricsConfig = `
receivers:
  hostmetrics: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/README.md
    collection_interval: 1m
    initial_delay: 1s
    scrapers:
      cpu: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/cpuscraper/documentation.md
        metrics:
          system.cpu.time:
            enabled: true
          system.cpu.frequency:
            enabled: true
          system.cpu.logical.count:
            enabled: true
          system.cpu.physical.count:
            enabled: true
          system.cpu.utilization:
            enabled: true
      disk: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/diskscraper/documentation.md
        metrics:
          system.disk.io:
            enabled: true
          system.disk.io_time:
            enabled: true
          system.disk.merged:
            enabled: true
          system.disk.operation_time:
            enabled: true
          system.disk.operations:
            enabled: true
          system.disk.pending_operations:
            enabled: true
          system.disk.weighted_io_time:
            enabled: true
      load: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/loadscraper/documentation.md
        metrics:
          system.cpu.load_average.15m:
            enabled: true
          system.cpu.load_average.1m:
            enabled: true
          system.cpu.load_average.5m:
            enabled: true
      filesystem: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/filesystemscraper/documentation.md
        metrics:
          system.filesystem.inodes.usage:
            enabled: true
          system.filesystem.usage:
            enabled: true
          system.filesystem.utilization:
            enabled: true
      memory: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/memoryscraper/documentation.md
        metrics:
          system.memory.usage:
            enabled: true
          system.linux.memory.available:
            enabled: true
          system.linux.memory.dirty:
            enabled: true
          system.memory.limit:
            enabled: true
          system.memory.page_size:
            enabled: true
          system.memory.utilization:
            enabled: true
      network: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/networkscraper/documentation.md
        metrics:
          system.network.connections:
            enabled: true
          system.network.dropped:
            enabled: true
          system.network.errors:
            enabled: true
          system.network.io:
            enabled: true
          system.network.packets:
            enabled: true
          system.network.conntrack.count:
            enabled: true
          system.network.conntrack.max:
            enabled: true
      paging: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/pagingscraper/documentation.md
        metrics:
          system.paging.faults:
            enabled: true
          system.paging.operations:
            enabled: true
          system.paging.usage:
            enabled: true
          system.paging.utilization:
            enabled: true
      processes: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/processesscraper/documentation.md
        metrics:
          system.processes.count:
            enabled: true
          system.processes.created:
            enabled: true
      process: # https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/processscraper/documentation.md
        mute_process_all_errors: true # ignore 'access denied' errors when reading processes of other users (alternatively: run as root)
        metrics:
          process.cpu.time:
            enabled: true
          process.disk.io:
            enabled: true
          process.memory.usage:
            enabled: true
          process.memory.virtual:
            enabled: true
          process.context_switches:
            enabled: true
          process.cpu.utilization:
            enabled: true
          process.disk.operations:
            enabled: true
          process.handles:
            enabled: false # Only available on windows
          process.memory.utilization:
            enabled: true
          process.open_file_descriptors:
            enabled: true
          process.paging.faults:
            enabled: true
          process.signals_pending:
            enabled: true
          process.threads:
            enabled: true
          process.uptime:
            enabled: true
     # system: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/hostmetricsreceiver/internal/scraper/systemscraper/documentation.md

exporters:
  otlp_grpc:
    endpoint: 127.0.0.1:4317
    tls:
      insecure: true

service:
  pipelines:
    logs:
      receivers: [hostmetrics]
      exporters: [otlp_grpc]
    metrics:
      receivers: [hostmetrics]
      exporters: [otlp_grpc]
  # own telemetry
  telemetry:
    traces: # https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-traces
      processors:
        - batch:
            exporter:
              otlp:
                protocol: grpc
                endpoint: http://127.0.0.1:4317
    logs: # https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-logs
      processors:
        - batch: 
            exporter:
              otlp:
                protocol: grpc
                endpoint: http://127.0.0.1:4317
    metrics: # https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-metrics
      level: detailed
      readers:
        - periodic:
            exporter:
              otlp:
                protocol: grpc
                endpoint: http://127.0.0.1:4317
`
