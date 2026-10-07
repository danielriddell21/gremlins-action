/*
 * Copyright 2022 The Gremlins Authors
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */
import * as core from '@actions/core'
import { ExecOptions, exec } from '@actions/exec'

import { Artifact } from './artifact'
import { Context } from './context'

export class Gremlins {
  constructor(private ctx: Context, private artifact: Artifact) {}

  async run(): Promise<number> {
    const bin = await this.artifact.getExePath()
    const inputs = this.ctx.getInputs()

    const execOptions: ExecOptions = {}
    const args: string[] = ['unleash']

    if (inputs?.args && inputs?.args !== '') {
      const split = inputs?.args.split(' ')
      for (const arg of split) {
        args.push(arg)
      }
    }
    if (inputs?.workers && !args.some((a) => a.startsWith('--workers'))) {
      args.push('--workers', inputs.workers)
    }
    if (inputs?.workdir && inputs?.workdir !== '.') {
      core.info(`Using ${inputs?.workdir} as working directory`)
      execOptions.cwd = inputs?.workdir
    }

    // A mutant that makes a loop infinite while it allocates grows until the
    // runner itself is killed, before gremlins' timeout fires, and the job
    // ends with no result. Capping each process's address space makes that
    // mutant fail its allocation instead, which gremlins counts as killed.
    // ulimit -v is Linux's; elsewhere the cap is skipped.
    const memoryMb = Number(inputs?.memoryMb ?? 0)
    if (memoryMb > 0 && this.ctx.platform() === 'linux') {
      core.info(`Capping each process at ${memoryMb} MiB`)
      return await exec(
        'bash',
        [
          '-c',
          'ulimit -v "$1" && shift && exec "$@"',
          'gremlins',
          String(memoryMb * 1024),
          bin,
          ...args,
        ],
        execOptions
      )
    }

    return await exec(bin, args, execOptions)
  }
}
