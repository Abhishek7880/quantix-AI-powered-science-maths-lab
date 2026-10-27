package com.abhishek.quantix;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Quantix for Android: the full Quantix site (photo AI, Measure, Formulas, Elements, Chemistry / Physics / Circuit /
 * PLC labs, Solver, Converter, Graphs, Contact) in a fast WebView, plus what a phone needs: camera or gallery for photo
 * uploads, saving downloads (PDF, CSV, PNG, JSON) to Downloads, the back button, external links in their own apps and a
 * friendly offline screen.
 */
public class MainActivity extends Activity {
    private static final String SITE = BuildConfig.SITE;
    private static final String HOST = Uri.parse(SITE).getHost();
    private static final int REQ_FILE = 1, REQ_CAMERA_PERMISSION = 2;

    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams pendingParams;
    private Uri cameraUri;
    private long lastBack;
    private boolean showingOffline;

    @Override
    protected void onCreate(Bundle saved) {
        setTheme(R.style.Theme_Quantix);       // swap the splash theme for the normal one
        super.onCreate(saved);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#050a16"));
        w.setNavigationBarColor(Color.parseColor("#050a16"));
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#050a16"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#38bdf8")));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(3));
        root.addView(progress, lp);
        setContentView(root);

        setUpWebView();
        if (saved != null) web.restoreState(saved);
        else web.loadUrl(startUrl(getIntent()));
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private String startUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && HOST.equals(data.getHost())) return data.toString();
        String path = intent != null ? intent.getStringExtra("path") : null;   // app shortcuts
        return SITE + (path != null ? path : "/");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        web.loadUrl(startUrl(intent));
    }

    private void setUpWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // localStorage: saved circuits, settings, language
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " QuantixApp/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "QuantixAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (("https".equals(scheme) || "http".equals(scheme)) && HOST.equals(u.getHost())) return false;   // stay in the app
                if ("about".equals(scheme) || "javascript".equals(scheme)) return false;
                openOutside(u);                    // YouTube, GitHub, LinkedIn, mail, phone ... in their own apps
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (!url.startsWith("file:")) { showingOffline = false; injectDownloadHook(); }
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(req.getUrl().toString());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) { progress.setProgress(p); }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                pendingParams = params;
                if (wantsImages(params) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_CAMERA_PERMISSION);   // then openChooser()
                } else openChooser();
                return true;
            }
        });

        // http(s) downloads (formula PDFs): the system download manager; blob:/data: are handled by the page hook
        web.setDownloadListener((url, ua, disposition, mime, length) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                web.evaluateJavascript("window.__quantixSave && window.__quantixSave(" + js(url) + ", '');", null);
                return;
            }
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String name = URLUtil.guessFileName(url, disposition, mime);
                r.setMimeType(mime);
                r.addRequestHeader("User-Agent", ua);
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Quantix/" + name);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                toast(getString(R.string.downloading) + " " + name);
            } catch (Exception e) {
                openOutside(Uri.parse(url));
            }
        });
    }

    private static String js(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }

    /** In-page downloads (<a download> with blob: or data: links, e.g. measurements.csv, circuit.png) go to the bridge. */
    private void injectDownloadHook() {
        String hook = "(function(){if(window.__quantixHooked)return;window.__quantixHooked=true;"
            + "window.__quantixSave=function(href,name){"
            + " if(href.indexOf('data:')===0){QuantixAndroid.save(href,name||'quantix-file');return;}"
            + " fetch(href).then(function(r){return r.blob();}).then(function(b){var fr=new FileReader();"
            + "  fr.onload=function(){QuantixAndroid.save(fr.result,name||('quantix.'+((b.type.split('/')[1])||'bin')));};fr.readAsDataURL(b);})"
            + "  .catch(function(e){QuantixAndroid.toast('Download failed');});};"
            + "function grab(a){var h=a.getAttribute('href')||'';if(a.hasAttribute('download')&&(h.indexOf('blob:')===0||h.indexOf('data:')===0)){"
            + " window.__quantixSave(a.href,a.getAttribute('download'));return true;}return false;}"
            + "var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!grab(this))return oc.apply(this,arguments);};"
            + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[download]');if(a&&grab(a)){e.preventDefault();}},true);"
            + "})();";
        web.evaluateJavascript(hook, null);
    }

    /** Called from the page. */
    private class Bridge {
        @JavascriptInterface
        public void save(String dataUrl, String name) {
            runOnUiThread(() -> saveDataUrl(dataUrl, name));
        }

        @JavascriptInterface
        public void toast(String msg) { runOnUiThread(() -> MainActivity.this.toast(msg)); }

        @JavascriptInterface
        public void retry(String url) { runOnUiThread(() -> MainActivity.this.retry(url)); }
    }

    private void saveDataUrl(String dataUrl, String name) {
        try {
            int comma = dataUrl.indexOf(',');
            String meta = dataUrl.substring(5, comma);            // e.g. "text/csv;base64"
            String mime = meta.split(";")[0];
            if (mime.isEmpty()) mime = "application/octet-stream";
            byte[] bytes = meta.contains(";base64") ? Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                    : Uri.decode(dataUrl.substring(comma + 1)).getBytes("UTF-8");
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (!name.contains(".")) {
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
                if (ext != null) name += "." + ext;
            }
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Quantix");
                Uri out = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                try (OutputStream os = getContentResolver().openOutputStream(out)) { os.write(bytes); }
            } else {
                if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, 3);
                    toast(getString(R.string.allow_storage));
                    return;
                }
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Quantix");
                dir.mkdirs();
                try (OutputStream os = new FileOutputStream(new File(dir, name))) { os.write(bytes); }
            }
            toast(getString(R.string.saved) + " Downloads/Quantix/" + name);
        } catch (Exception e) {
            toast(getString(R.string.save_failed));
        }
    }

    // ---------------------------------------------------------------- photo / file picking
    private boolean wantsImages(WebChromeClient.FileChooserParams p) {
        if (p == null) return false;
        for (String t : p.getAcceptTypes()) if (t == null || t.isEmpty() || t.startsWith("image") || t.equals("*/*")) return true;
        return false;
    }

    private void openChooser() {
        WebChromeClient.FileChooserParams p = pendingParams;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        String[] types = p != null ? p.getAcceptTypes() : new String[0];
        List<String> mimes = new ArrayList<>();
        for (String t : types) {
            if (t == null || t.trim().isEmpty()) continue;
            for (String one : t.split(",")) {
                one = one.trim();
                if (one.startsWith(".")) { String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(one.substring(1)); if (m != null) mimes.add(m); }
                else if (!one.isEmpty()) mimes.add(one);
            }
        }
        pick.setType(mimes.size() == 1 ? mimes.get(0) : "*/*");
        if (mimes.size() > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
        if (p != null && p.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        List<Intent> extra = new ArrayList<>();
        if (wantsImages(p) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            try {
                File dir = new File(getCacheDir(), "camera");
                dir.mkdirs();
                File f = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
                cameraUri = CameraFileProvider.uriFor(f);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                extra.add(cam);
            } catch (Exception ignored) { cameraUri = null; }
        }
        Intent chooser = Intent.createChooser(pick, getString(R.string.choose));
        if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
        try {
            startActivityForResult(chooser, REQ_FILE);
        } catch (ActivityNotFoundException e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (req != REQ_FILE || fileCallback == null) return;
        Uri[] out = null;
        if (result == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                out = new Uri[] {data.getData()};
            } else if (cameraUri != null) {
                File f = new File(new File(getCacheDir(), "camera"), cameraUri.getLastPathSegment());
                if (f.exists() && f.length() > 0) out = new Uri[] {cameraUri};
            }
        }
        fileCallback.onReceiveValue(out);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(req, perms, grants);
        if (req == REQ_CAMERA_PERMISSION) openChooser();     // without the camera the gallery still works
    }

    // ---------------------------------------------------------------- navigation, offline
    private void openOutside(Uri u) {
        try {
            Intent i = "intent".equals(u.getScheme()) ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast(getString(R.string.no_app));
        }
    }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo ni = cm != null ? cm.getActiveNetworkInfo() : null;
        return ni != null && ni.isConnected();
    }

    private void showOffline(String failedUrl) {
        if (showingOffline) return;
        showingOffline = true;
        web.loadUrl("file:///android_asset/offline.html?u=" + Uri.encode(failedUrl));
    }

    /** "Try again" on the offline screen. */
    public void retry(String url) {
        if (!online()) { toast(getString(R.string.still_offline)); return; }
        showingOffline = false;
        web.loadUrl(url != null && url.startsWith(SITE) ? url : SITE + "/");
    }

    @Override
    public void onBackPressed() {
        if (showingOffline) { finish(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { finish(); return; }
        lastBack = now;
        toast(getString(R.string.press_again));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }
}
