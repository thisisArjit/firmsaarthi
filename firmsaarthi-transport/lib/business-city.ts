import {citySuggestions} from './business-directory';
export function validateInterestedCity(value:unknown):string{
  if(value===undefined||value===null||value==='')return '';
  if(typeof value!=='string'||!citySuggestions.includes(value))throw new Error('Select an interested city from the dropdown, or leave it blank.');
  return value;
}
export function defaultBusinessCity(value:unknown):string{return typeof value==='string'&&citySuggestions.includes(value)?value:'All cities';}
