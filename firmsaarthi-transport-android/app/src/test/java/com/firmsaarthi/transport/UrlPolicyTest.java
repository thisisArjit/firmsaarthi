package com.firmsaarthi.transport;
import org.junit.Test;
import static org.junit.Assert.*;
public class UrlPolicyTest {
 private static final String HOST="transport.firmsaarthi.com";
 @Test public void sameOriginRoutesRemainAvailable(){
  for(String value:new String[]{"https://transport.firmsaarthi.com/","https://TRANSPORT.FIRMSAARTHI.COM:443/account","https://transport.firmsaarthi.com/manage-plan?view=current","https://transport.firmsaarthi.com/api/auth/google/callback?code=synthetic"})assertTrue(value,UrlPolicy.allows(value,HOST));
 }
 @Test public void hostileOrOtherEnvironmentIntentsCannotReplaceTheLaunchOrigin(){
  for(String value:new String[]{"http://transport.firmsaarthi.com/","https://transport.firmsaarthi.com.evil.test/","https://evil.test/transport.firmsaarthi.com","https://evil@transport.firmsaarthi.com/","https://transport.firmsaarthi.com@evil.test/","https://transport.firmsaarthi.com:444/","javascript:alert(1)","file:///etc/passwd","intent://transport.firmsaarthi.com/","https://transport.firmsaarthi.com\\@evil.test/","https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site/","//transport.firmsaarthi.com/","bad url",""})assertFalse(value,UrlPolicy.allows(value,HOST));
  assertFalse(UrlPolicy.allows(null,HOST));assertFalse(UrlPolicy.allows("https://"+HOST+"/"+"a".repeat(8200),HOST));
 }
}
