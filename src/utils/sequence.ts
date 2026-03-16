/**
 * Generate a simple sequence number for inventory documents.
 * Uses a MAX()+1 approach from the database.
 * Format: PREFIX-YYYY-NNNNN (e.g., PO-2025-00001, GRN-2025-00001)
 *
 * SECURITY: Only whitelisted table/column pairs are allowed to prevent SQL injection.
 */

/** Whitelisted table→column pairs for sequence generation */
const SEQUENCE_WHITELIST: Record<string, string> = {
  InventoryPurchaseOrder: 'PONumber',
  InventoryGoodsReceipt: 'GoodsReceiptNo',
  InventoryRequisition: 'RequisitionNo',
  InventoryDispatch: 'DispatchNo',
  InventoryReturnToVendor: 'ReturnNo',
  InventoryWriteOff: 'WriteOffNo',
  InventoryRFQ: 'RFQNo',
  InventoryQuotation: 'QuotationNo',
  InventoryPurchaseOrderDraft: 'DraftPurchaseOrderNo',
};

export async function generateSequenceNo(
  db: D1Database,
  prefix: string,
  tableName: string,
  columnName: string,
  tenantId?: string,
): Promise<string> {
  // Validate against whitelist to prevent SQL injection
  const allowedColumn = SEQUENCE_WHITELIST[tableName];
  if (!allowedColumn || allowedColumn !== columnName) {
    throw new Error(
      `Invalid sequence target: ${tableName}.${columnName}. Not whitelisted.`,
    );
  }

  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  // Build tenant-scoped query
  const tenantClause = tenantId ? ' AND tenant_id = ?' : '';
  const params: unknown[] = [pattern];
  if (tenantId) params.push(tenantId);

  const result = await db
    .prepare(
      `SELECT ${allowedColumn} FROM ${tableName} WHERE ${allowedColumn} LIKE ?${tenantClause} ORDER BY ROWID DESC LIMIT 1`,
    )
    .bind(...params)
    .first<Record<string, string>>();

  let nextNum = 1;
  if (result) {
    // D1 returns columns as-is; mock-db normalizes to lowercase — try both
    const lastCode = result[allowedColumn] ?? result[allowedColumn.toLowerCase()];
    if (lastCode) {
      const parts = lastCode.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
  }

  return `${prefix}-${year}-${String(nextNum).padStart(5, '0')}`;
}
