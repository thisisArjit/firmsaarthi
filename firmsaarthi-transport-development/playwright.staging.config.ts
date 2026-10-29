import {defineConfig,devices} from '@playwright/test';
import environments from './config/environments.json';
const baseURL=process.env.E2E_BASE_URL||environments.staging.origin;
if(baseURL!==environments.staging.origin)throw new Error('Hosted mutation tests may run only against the configured staging origin.');
export default defineConfig({testDir:'tests/e2e',fullyParallel:false,workers:1,timeout:90000,use:{baseURL,trace:'off',extraHTTPHeaders:process.env.SITES_STAGING_ACCESS_TOKEN?{'OAI-Sites-Authorization':'Bearer '+process.env.SITES_STAGING_ACCESS_TOKEN}:{}},reporter:[['list'],['json',{outputFile:'outputs/staging-e2e.json'}],['html',{outputFolder:'outputs/staging-e2e-report',open:'never'}]],outputDir:'outputs/staging-e2e-results',projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'phone',use:{...devices['Pixel 7']}}]});
