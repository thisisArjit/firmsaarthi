package com.firmsaarthi.transport;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** The browser owns authentication, TLS, file permissions and downloads. No WebView/JS bridge. */
public final class TransportActivity extends LauncherActivity {
 @Override protected Uri getLaunchingUrl() {
  Uri incoming = super.getLaunchingUrl();
  return incoming != null && UrlPolicy.allows(incoming.toString(), BuildConfig.HOST)
   ? incoming : Uri.parse(BuildConfig.START_URL);
 }
}
