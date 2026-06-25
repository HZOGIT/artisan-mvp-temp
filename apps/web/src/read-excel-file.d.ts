declare module "read-excel-file" {
  export type CellValue = string | number | boolean | Date | null;
  export type Row = (CellValue | null)[];
  export type SheetData = Row[];

  export interface Sheet {
    sheet: string;
    data: SheetData;
  }

  function readXlsxFile(input: File | Blob): Promise<Sheet[]>;
  export default readXlsxFile;
}
