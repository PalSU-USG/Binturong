import * as migration_20261019_151632_baseline from './20261019_151632_baseline'
import * as migration_20261019_173146_access_roles from './20261019_173146_access_roles'

export const migrations = [
  {
    up: migration_20261019_151632_baseline.up,
    down: migration_20261019_151632_baseline.down,
    name: '20261019_151632_baseline',
  },
  {
    up: migration_20261019_173146_access_roles.up,
    down: migration_20261019_173146_access_roles.down,
    name: '20261019_173146_access_roles',
  },
]
