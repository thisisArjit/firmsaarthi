package com.firmsaarthi.transport;

import java.net.URI;
import java.net.URISyntaxException;

/** App entry points accept only this build's HTTPS origin; never caller-selected hosts. */
public final class UrlPolicy {
 private UrlPolicy() {}
 public static boolean allows(String value, String host) {
  if (value == null || host == null || value.length() > 8192) return false;
  try {
   URI uri = new URI(value);
   return "https".equalsIgnoreCase(uri.getScheme()) && host.equalsIgnoreCase(uri.getHost())
    && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
  } catch (URISyntaxException exception) { return false; }
 }
}
