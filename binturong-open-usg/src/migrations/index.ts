import * as migration_20261019_151632_baseline from './20261019_151632_baseline'

export const migrations = [
  {
    up: migration_20261019_151632_baseline.up,
    down: migration_20261019_151632_baseline.down,
    name: '20261019_151632_baseline',
  },
]
