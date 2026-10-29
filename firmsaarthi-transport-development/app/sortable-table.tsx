'use client';
import {Children,Fragment,cloneElement,isValidElement,useEffect,useState,type ReactElement,type ReactNode,type TableHTMLAttributes} from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown} from 'lucide-react';
import {sortedRows,sortValue,type SortValue} from '@/lib/table-sort';
type Element=ReactElement<Record<string,unknown>>;
function elements(nodes:ReactNode):Element[]{return Children.toArray(nodes).flatMap(node=>isValidElement(node)?node.type===Fragment?elements((node.props as {children?:ReactNode}).children):[node as Element]:[]);}
export function cellText(node:ReactNode):string{return Children.toArray(node).map(n=>{if(!isValidElement(n))return String(n);const p=n.props as Record<string,unknown>;if(n.type==='br')return '\n';return String(p['aria-label']||cellText(p.children as ReactNode)||'');}).join(' ').trim();}
export function cellValue(node:ReactNode):SortValue{
  for(const n of Children.toArray(node)){
    if(typeof n==='number')return n;if(typeof n==='string'&&n.trim())return n;
    if(isValidElement(n)){const p=n.props as Record<string,unknown>;if(p['data-sort-value']!==undefined)return p['data-sort-value'] as SortValue;
      if(n.type==='input'&&p.type==='checkbox')return !!p.checked;
      if(p.value!==undefined&&n.type!=='option')return p.value as SortValue;
      const child=cellValue(p.children as ReactNode);if(child!==undefined&&child!==null&&child!=='')return child;
    }
  }return null;
}
function interactive(nodes:ReactNode):boolean{return elements(nodes).some(n=>['input','button','select','a'].includes(String(n.type))||interactive(n.props.children as ReactNode));}
function valueControl(nodes:ReactNode):boolean{return elements(nodes).some(n=>n.props.value!==undefined||['input','select','textarea'].includes(String(n.type))||valueControl(n.props.children as ReactNode));}
export function sortCellValue(cell:ReactNode):SortValue{const value=cellValue(cell);if(isValidElement(cell)&&(cell.props as Record<string,unknown>)['data-sort-value']!==undefined)return value;return typeof sortValue(value)==='string'&&!valueControl(cell)?cellText(cell)||value:value;}
export default function SortableTable({children,pageSize,initialSort,...props}:TableHTMLAttributes<HTMLTableElement>&{pageSize?:number;initialSort?:{column:number;direction:1|-1}}){
  const [sort,setSort]=useState<{column:number;direction:1|-1}|null>(initialSort||null),[page,setPage]=useState(0),sections=elements(children),body=sections.find(n=>n.type==='tbody'),rows=elements(body?.props.children as ReactNode),signature=rows.map(r=>r.key).join('|'),pages=pageSize?Math.max(1,Math.ceil(rows.length/pageSize)):1;
  useEffect(()=>setPage(0),[signature]);
  const ordered=sort?sortedRows(rows,row=>sortCellValue(elements(row.props.children as ReactNode)[sort.column]),sort.direction):rows,currentPage=Math.min(page,pages-1),visible=pageSize?ordered.slice(currentPage*pageSize,(currentPage+1)*pageSize):ordered;
  function change(column:number){setSort(s=>({column,direction:s?.column===column&&s.direction===1?-1:1}));setPage(0);}
  const name=String(props['aria-label']||cellText(sections.find(n=>n.type==='thead')?.props.children as ReactNode).slice(0,140)||'Records table');
  return <><div className="table-viewport" role="region" aria-label={name+' — scroll horizontally or vertically'} tabIndex={0}><table {...props}>{sections.map(section=>{
    if(section.type==='tbody')return cloneElement(section,{},visible);
    if(section.type!=='thead')return section;
    return cloneElement(section,{},elements(section.props.children as ReactNode).map(row=>cloneElement(row,{},elements(row.props.children as ReactNode).map((header,column)=>{
      const label=cellText(header.props.children as ReactNode)||'Column '+(column+1),active=sort?.column===column,Icon=active?(sort.direction===1?ArrowUp:ArrowDown):ArrowUpDown,control=<button type="button" className="table-sort-button" aria-label={'Sort by '+label} onClick={()=>change(column)}>{!interactive(header.props.children as ReactNode)&&header.props.children as ReactNode}<Icon size={13} aria-hidden="true"/></button>;
      return cloneElement(header,{scope:'col','aria-sort':active?(sort.direction===1?'ascending':'descending'):'none'},interactive(header.props.children as ReactNode)?<div className="table-column-heading">{header.props.children as ReactNode}{control}</div>:control);
    }))));
  })}</table></div>{pageSize&&pages>1&&<div className="table-pagination"><button type="button" className="small" disabled={currentPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Previous</button><span>Page {currentPage+1} of {pages}</span><button type="button" className="small" disabled={currentPage>=pages-1} onClick={()=>setPage(p=>p+1)}>Next</button></div>}</>;
}
