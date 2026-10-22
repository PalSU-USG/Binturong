import * as migration_20261019_151632_baseline from './20261019_151632_baseline'
import * as migration_20261019_173146_access_roles from './20261019_173146_access_roles'
import * as migration_20261019_180133_auth_authority_guard from './20261019_180133_auth_authority_guard'
import * as migration_20261020_055631_auth_credential_guard from './20261020_055631_auth_credential_guard'
import * as migration_20261020_060134_account_auth_revision from './20261020_060134_account_auth_revision'
import * as migration_20261022_051329_domain_metadata from './20261022_051329_domain_metadata'
import * as migration_20261022_071500_domain_directory from './20261022_071500_domain_directory'
import * as migration_20261022_075642_formal_record_drafts from './20261022_075642_formal_record_drafts'

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
  {
    up: migration_20261022_051329_domain_metadata.up,
    down: migration_20261022_051329_domain_metadata.down,
    name: '20261022_051329_domain_metadata',
  },
  {
    up: migration_20261022_071500_domain_directory.up,
    down: migration_20261022_071500_domain_directory.down,
    name: '20261022_071500_domain_directory',
  },
  {
    up: migration_20261022_075642_formal_record_drafts.up,
    down: migration_20261022_075642_formal_record_drafts.down,
    name: '20261022_075642_formal_record_drafts',
  },
]
