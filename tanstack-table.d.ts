import type { RowData, TableFeatures } from '@tanstack/react-table';
declare module '@tanstack/react-table' {
  interface ColumnMeta<_TFeatures extends TableFeatures, _TData extends RowData, _TValue> {
    displayName?: string;
  }
}