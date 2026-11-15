import type { CollectionConfig } from 'payload'

/** Admin components shared by Pages and Posts, which use Payload's stock publish flow. */
export const statusPanelComponents: NonNullable<CollectionConfig['admin']>['components'] = {
  edit: {
    PublishButton: '@/components/StatusPanel/RoleButtons#RolePublishButton',
    UnpublishButton: '@/components/StatusPanel/RoleButtons#RoleUnpublishButton',
    beforeDocumentControls: ['@/components/StatusPanel'],
  },
}
