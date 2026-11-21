import * as migration_20261019_151632_baseline from './20261019_151632_baseline'
import * as migration_20261019_173146_access_roles from './20261019_173146_access_roles'
import * as migration_20261019_180133_auth_authority_guard from './20261019_180133_auth_authority_guard'
import * as migration_20261020_055631_auth_credential_guard from './20261020_055631_auth_credential_guard'
import * as migration_20261020_060134_account_auth_revision from './20261020_060134_account_auth_revision'
import * as migration_20261022_051329_domain_metadata from './20261022_051329_domain_metadata'
import * as migration_20261022_071500_domain_directory from './20261022_071500_domain_directory'
import * as migration_20261022_075642_formal_record_drafts from './20261022_075642_formal_record_drafts'
import * as migration_20261022_110027_record_integrity from './20261022_110027_record_integrity'
import * as migration_20261023_010945_reviewed_domain_transitions from './20261023_010945_reviewed_domain_transitions'
import * as migration_20261106_011114_document_upload_sessions from './20261106_011114_document_upload_sessions'
import * as migration_20261109_043524_search_index_fields from './20261109_043524_search_index_fields'
import * as migration_20261109_045910_navigation_hierarchy from './20261109_045910_navigation_hierarchy'
import * as migration_20261110_152826_last_edited_by from './20261110_152826_last_edited_by'
import * as migration_20261117_053700_data_api_lockdown from './20261117_053700_data_api_lockdown'
import * as migration_20261119_162009_draft_autosave_off from './20261119_162009_draft_autosave_off'
import * as migration_20261121_051921_media_storage_fields from './20261121_051921_media_storage_fields'

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
  {
    up: migration_20261022_110027_record_integrity.up,
    down: migration_20261022_110027_record_integrity.down,
    name: '20261022_110027_record_integrity',
  },
  {
    up: migration_20261023_010945_reviewed_domain_transitions.up,
    down: migration_20261023_010945_reviewed_domain_transitions.down,
    name: '20261023_010945_reviewed_domain_transitions',
  },
  {
    up: migration_20261106_011114_document_upload_sessions.up,
    down: migration_20261106_011114_document_upload_sessions.down,
    name: '20261106_011114_document_upload_sessions',
  },
  {
    up: migration_20261109_043524_search_index_fields.up,
    down: migration_20261109_043524_search_index_fields.down,
    name: '20261109_043524_search_index_fields',
  },
  {
    up: migration_20261109_045910_navigation_hierarchy.up,
    down: migration_20261109_045910_navigation_hierarchy.down,
    name: '20261109_045910_navigation_hierarchy',
  },
  {
    up: migration_20261110_152826_last_edited_by.up,
    down: migration_20261110_152826_last_edited_by.down,
    name: '20261110_152826_last_edited_by',
  },
  {
    up: migration_20261117_053700_data_api_lockdown.up,
    down: migration_20261117_053700_data_api_lockdown.down,
    name: '20261117_053700_data_api_lockdown',
  },
  {
    up: migration_20261119_162009_draft_autosave_off.up,
    down: migration_20261119_162009_draft_autosave_off.down,
    name: '20261119_162009_draft_autosave_off',
  },
  {
    up: migration_20261121_051921_media_storage_fields.up,
    down: migration_20261121_051921_media_storage_fields.down,
    name: '20261121_051921_media_storage_fields',
  },
]
