import {test,expect} from 'vitest';
import {sitesWebsiteEntry} from '../lib/sites-entry';
const stage='https://firmsaarthi-sites-private-staging.arjit-tiwari-ece14.chatgpt.site';
test('private staging website entry uses only its matching private Sites origin',()=>{
 expect(sitesWebsiteEntry({APP_ENV:'staging',SITES_ORIGIN:stage,FIRMSAARTHI_SSO_ENABLED:'true'})).toBe(stage+'/api/auth/firmsaarthi/start');
 expect(sitesWebsiteEntry({APP_ENV:'staging',SITES_ORIGIN:stage})).toBe(stage);
 for(const origin of [undefined,'https://sites.firmsaarthi.com','https://unrelated.example',stage+'/','https://user:password@'+new URL(stage).host])expect(sitesWebsiteEntry({APP_ENV:'staging',SITES_ORIGIN:origin,FIRMSAARTHI_SSO_ENABLED:'true'})).toBeNull();
});
test('public website entry preserves the requested production domain and fails closed on a crossed binding',()=>{
 expect(sitesWebsiteEntry({})).toBe('https://sites.firmsaarthi.com');
 expect(sitesWebsiteEntry({APP_ENV:'production',SITES_ORIGIN:'https://sites.firmsaarthi.com',FIRMSAARTHI_SSO_ENABLED:'true'})).toBe('https://sites.firmsaarthi.com/api/auth/firmsaarthi/start');
 expect(sitesWebsiteEntry({APP_ENV:'production',SITES_ORIGIN:stage,FIRMSAARTHI_SSO_ENABLED:'true'})).toBeNull();
});
