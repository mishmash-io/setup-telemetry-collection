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
 * This file is used to mock the `@actions/core` module in tests.
 */
import { jest } from '@jest/globals'

export const debug = jest.fn()
export const error = jest.fn()
export const info = jest.fn()
export const getInput = jest.fn()
export const getBooleanInput = jest.fn()
export const exportVariable = jest.fn()
export const setOutput = jest.fn()
export const setFailed = jest.fn()
export const setSecret = jest.fn()
export const warning = jest.fn()
export const getState = jest.fn()
export const saveState = jest.fn()
export const group = jest.fn()
export const toPlatformPath = jest.fn()
export const platform = {
  isLinux: true,
  platform: 'linux',
  arch: 'amd64'
}
export const summary = {
  addHeading: jest.fn(),
  addLink: jest.fn(),
  addBreak: jest.fn(),
  addRaw: jest.fn(),
  addEOL: jest.fn(),
  addTable: jest.fn(),
  write: jest.fn()
}
