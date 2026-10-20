import * as migration_20261019_151632_baseline from './20261019_151632_baseline'
import * as migration_20261019_173146_access_roles from './20261019_173146_access_roles'
import * as migration_20261019_180133_auth_authority_guard from './20261019_180133_auth_authority_guard'
import * as migration_20261020_055631_auth_credential_guard from './20261020_055631_auth_credential_guard'
import * as migration_20261020_060134_account_auth_revision from './20261020_060134_account_auth_revision'

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
  {
    up: migration_20261019_180133_auth_authority_guard.up,
    down: migration_20261019_180133_auth_authority_guard.down,
    name: '20261019_180133_auth_authority_guard',
  },
  {
    up: migration_20261020_055631_auth_credential_guard.up,
    down: migration_20261020_055631_auth_credential_guard.down,
    name: '20261020_055631_auth_credential_guard',
  },
  {
    up: migration_20261020_060134_account_auth_revision.up,
    down: migration_20261020_060134_account_auth_revision.down,
    name: '20261020_060134_account_auth_revision',
  },
]
