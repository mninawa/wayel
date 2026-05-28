export type OpsRole = 'clerk' | 'lead' | 'finance' | string;

export function can(capabilities: readonly string[], permission: string): boolean {
  return capabilities.includes(permission);
}

export const OPS_CAP = {
  intake: 'intake',
  inspect: 'inspect',
  invoiceView: 'invoice.view',
  invoiceUpload: 'invoice.upload',
  invoiceVerify: 'invoice.verify',
  exceptions: 'exceptions.manage',
  quoteSend: 'quote.send',
  search: 'search',
  teamManage: 'team.manage',
  collectionRead: 'collection.read',
  collectionWrite: 'collection.write',
  warehouseRead: 'warehouse.read',
  warehouseWrite: 'warehouse.write',
  pickingWrite: 'picking.write',
  packingWrite: 'packing.write',
  dispatchWrite: 'dispatch.write',
} as const;
