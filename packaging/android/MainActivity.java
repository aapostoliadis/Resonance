package local.resonance.visualizer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String AUDIO = PermissionRequest.RESOURCE_AUDIO_CAPTURE;
    private static final int MICROPHONE = 1;
    private WebView view;
    private PermissionRequest pending;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        view = new WebView(this);
        view.setBackgroundColor(0xff090b0b);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isLocal(uri)) return missing();
                String path = uri.getPath();
                if ("/api/spotify".equals(path)) return json("{\"available\":false,\"reason\":\"Control playback in your music app\"}");
                if ("/api/apple-music".equals(path)) return json("{\"available\":false}");
                if (path == null || !path.matches("/[a-zA-Z0-9.-]+")) return missing();
                String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
                try {
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open("web" + path));
                } catch (IOException ignored) { return missing(); }
            }

            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) return false;
                if (request.isForMainFrame() && ("spotify".equals(uri.getScheme())
                        || ("https".equals(uri.getScheme()) && ("music.apple.com".equals(uri.getHost())
                        || "open.spotify.com".equals(uri.getHost()))))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (android.content.ActivityNotFoundException ignored) {}
                }
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                if (!isLocal(request.getOrigin()) || !Arrays.equals(request.getResources(), new String[]{AUDIO})
                        || pending != null) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{AUDIO});
                } else {
                    pending = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE);
                }
            }

            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pending == request) pending = null;
            }
        });
        setContentView(view);
        view.loadUrl("https://" + HOST + "/index.html?mobile=1");
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != MICROPHONE || pending == null) return;
        PermissionRequest request = pending;
        pending = null;
        if (results.length == 1 && results[0] == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{AUDIO});
        else request.deny();
    }

    @Override protected void onDestroy() {
        if (pending != null) { pending.deny(); pending = null; }
        view.destroy();
        super.onDestroy();
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private static WebResourceResponse json(String value) {
        return new WebResourceResponse("application/json", "UTF-8", bytes(value));
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), bytes("Not Found"));
    }

    private static ByteArrayInputStream bytes(String value) {
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
    }
}
