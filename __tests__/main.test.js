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

/**
 * Unit tests for the action's main functionality, src/main.js
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as cache from '../__fixtures__/cache.js'
import * as exec from '../__fixtures__/exec.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/tool-cache', () => cache)
jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('node:child_process', () => ({
  spawn: jest.fn().mockImplementation(() => ({
    pid: 9999999,
    unref: () => {}
  }))
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.js', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getBooleanInput().
    core.getBooleanInput.mockImplementation(() => true)
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case 'java-agent-version':
          return undefined // TODO: get a token from the user
        case 'github-token':
          return undefined
        case 'grpc-port':
          return '4317'
        case 'http-port':
          return '4318'
        case 'server-image':
          return 'mishmashio/opentelemetry-parquet-server'
        default:
          return `test-${name}-value`
      }
    })
    core.saveState.mockImplementation(() => true)
    core.getState.mockImplementation(() => 'test-state-value')
    core.toPlatformPath.mockImplementation((p) => p)

    exec.exec.mockImplementation((exec, args, opts) => {
      if (opts && opts.listeners && opts.listeners.stdout) {
        opts.listeners.stdout(Buffer.from('test-stdout'))
      }

      return 0
    })

    cache.find.mockImplementation(
      (tool, version) => `/path/to/test-tool/${tool}/${version}`
    )
    cache.downloadTool.mockImplementation(
      (tool, version) => `/path/to/downloaded-test-tool/${tool}/${version}`
    )
    cache.cacheFile.mockImplementation(
      (tool, version) => `/path/to/newly-cached-test-tool/${tool}/${version}`
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Sets the signals files path', async () => {
    await run()

    // Verify signal files location has been set
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'java-agent',
      expect.stringMatching(
        '/path/to/test-tool/opentelemetry-java-agent/2.24.0/opentelemetry-javaagent.jar'
      )
    )

    // Verify signal files location has been set
    expect(core.setOutput).toHaveBeenNthCalledWith(
      2,
      'signals-path',
      expect.stringMatching('test-stdout')
    )
  })

  /*
  skip this test for now

  it('Sets a failed status', async () => {
    // Clear the getInput mock and return an invalid value.
    core.getBooleanInput
      .mockClear()
      .mockReturnValueOnce('this is not a boolean')

    await run()

    // Verify that the action was marked as failed.
    expect(core.setFailed).toHaveBeenNthCalledWith(
      1,
      'milliseconds is not a number'
    )
  })
*/
})
