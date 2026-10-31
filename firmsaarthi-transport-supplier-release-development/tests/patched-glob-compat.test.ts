import {test,expect} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
const require=createRequire(import.meta.url);
function matcher(){const excel=createRequire(require.resolve('exceljs')),archiver=createRequire(excel.resolve('archiver')),utils=createRequire(archiver.resolve('archiver-utils')),glob=createRequire(utils.resolve('glob'));return glob('minimatch');}
test('patched matcher retains callable/CommonJS/named/class/defaults behavior for legacy consumers',()=>{
  const match=matcher();expect(typeof match).toBe('function');expect(match('invoice.xlsx','*.xlsx')).toBe(true);expect(match.minimatch('private.json','*.xlsx')).toBe(false);expect(new match.Minimatch('**/*.xlsx').match('reports/one.xlsx')).toBe(true);expect(match.defaults({nocase:true})('INVOICE.XLSX','*.xlsx')).toBe(true);expect(match.braceExpand('report.{xlsx,pdf}')).toEqual(['report.xlsx','report.pdf']);
});
test('ExcelJS retains Unicode/quotes/formula cells through actual XLSX write/read with patched dependencies',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Synthetic report');sheet.addRow(['नाम','"Quoted"',17.5]);sheet.addRow([{formula:'1+1',result:2},'Synthetic only',0]);const bytes=await book.xlsx.writeBuffer(),read=new ExcelJS.Workbook();await read.xlsx.load(bytes);expect(read.worksheets[0].getRow(1).values).toEqual([undefined,'नाम','"Quoted"',17.5]);expect(read.worksheets[0].getCell('A2').value).toEqual({formula:'1+1',result:2});
});
test('ExcelJS legacy glob/archiver dependencies still walk/include/exclude synthetic paths correctly',async()=>{
  const fromExcel=createRequire(require.resolve('exceljs')),fromArchiver=createRequire(fromExcel.resolve('archiver')),fromUtils=createRequire(fromArchiver.resolve('archiver-utils')),glob=fromUtils('glob');
  const dir=mkdtempSync(join(tmpdir(),'fs-glob-'));try{mkdirSync(join(dir,'reports'));writeFileSync(join(dir,'reports','one.xlsx'),'synthetic');writeFileSync(join(dir,'reports','private.json'),'synthetic');expect(glob.sync('**/*.xlsx',{cwd:dir,nodir:true})).toEqual(['reports/one.xlsx']);expect(glob.sync('**/*',{cwd:dir,nodir:true,ignore:'**/*.json'})).toEqual(['reports/one.xlsx']);}finally{rmSync(dir,{recursive:true,force:true});}
});
