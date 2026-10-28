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
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
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
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Quantix for Android: the full Quantix site (photo AI, Measure, Formulas, Elements, Chemistry / Physics / Circuit /
 * PLC labs, Solver, Converter, Graphs, Contact) in a fast WebView, plus what a phone needs: camera or gallery for photo
 * uploads, saving downloads (PDF, CSV, PNG, JSON) to Downloads, the back button, external links in their own apps.
 * Offline: the whole site is packed in assets/site (tools/build_app_bundle.py) and served from there when there is no
 * internet, so the labs, formulas, elements, converter, graphs and measuring tools keep working; features that need
 * the server get a "turn on the internet" popup instead.
 */
public class MainActivity extends Activity {
    private static final String SITE = BuildConfig.SITE;
    private static final String HOST = Uri.parse(SITE).getHost();
    private static final int REQ_FILE = 1, REQ_CAMERA_PERMISSION = 2;

    private WebView web;
    private View splash;                       // the launch screen, kept until the first page is drawn
    private ProgressBar spinner;               // small native spinner, only when a page is slow
    private TextView snack;                    // native snackbar: offline / back online
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams pendingParams;
    private Uri cameraUri;
    private long lastBack, lastNetPopup;
    private boolean showingOffline;
    private volatile boolean netOk = true, forcedOffline;
    private android.app.AlertDialog netDialog;
    private Map<String, String[]> bundle;      // offline copy: url key -> {asset file, mime}
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable showSpinner = () -> { if (splash == null) spinner.setVisibility(View.VISIBLE); };
    private ConnectivityManager.NetworkCallback netCallback;

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
        web.setBackgroundColor(Color.parseColor("#050a16"));          // no white flash between pages
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        spinner = new ProgressBar(this, null, android.R.attr.progressBarStyleSmall);
        spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#38bdf8")));
        spinner.setVisibility(View.GONE);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER);
        root.addView(spinner, sp);

        snack = new TextView(this);
        snack.setTextColor(Color.WHITE);
        snack.setTextSize(14);
        snack.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable sb = new GradientDrawable();
        sb.setColor(Color.parseColor("#E61E293B")); sb.setCornerRadius(dp(12));
        snack.setBackground(sb);
        snack.setElevation(dp(6));
        snack.setVisibility(View.GONE);
        FrameLayout.LayoutParams np = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        np.setMargins(dp(16), 0, dp(16), dp(84));
        root.addView(snack, np);

        if (saved == null) {                    // same picture as the window splash, so the hand-over is seamless
            splash = new View(this);
            splash.setBackground(getDrawable(R.drawable.splash));
            root.addView(splash, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            ui.postDelayed(this::hideSplash, 6000);                   // never longer than this
        }
        setContentView(root);

        netOk = online();
        setUpWebView();
        watchNetwork();
        if (saved != null) web.restoreState(saved);
        else web.loadUrl(startUrl(getIntent()));
        checkForUpdate(false);
    }

    private void hideSplash() {
        if (splash == null) return;
        View s = splash;
        splash = null;
        s.animate().alpha(0f).setDuration(220).withEndAction(() -> ((FrameLayout) s.getParent()).removeView(s)).start();
    }

    private void showSnack(String text) {
        ui.removeCallbacksAndMessages(snack);
        snack.setText(text);
        if (snack.getVisibility() != View.VISIBLE) {
            snack.setAlpha(0f); snack.setTranslationY(dp(24)); snack.setVisibility(View.VISIBLE);
            snack.animate().alpha(1f).translationY(0).setDuration(200).start();
        }
        ui.postAtTime(() -> snack.animate().alpha(0f).translationY(dp(24)).setDuration(200)
            .withEndAction(() -> snack.setVisibility(View.GONE)).start(), snack, android.os.SystemClock.uptimeMillis() + 3200);
    }

    // ---------------------------------------------------------------- offline copy and network state
    private Map<String, String[]> bundle() {
        if (bundle != null) return bundle;
        Map<String, String[]> m = new HashMap<>();
        try (InputStream in = getAssets().open("site/index.json")) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            JSONObject j = new JSONObject(b.toString("UTF-8"));
            for (java.util.Iterator<String> it = j.keys(); it.hasNext(); ) {
                String k = it.next(); JSONArray v = j.getJSONArray(k);
                m.put(k, new String[] {v.getString(0), v.getString(1)});
            }
        } catch (Exception ignored) { /* built without the offline copy */ }
        return bundle = m;
    }

    private boolean offline() { return forcedOffline || !netOk; }

    /** A file from the offline copy, or null. Exact URL first (data with a query), then the path alone (?v= on scripts). */
    private WebResourceResponse fromBundle(Uri u) {
        String path = u.getPath() == null || u.getPath().isEmpty() ? "/" : u.getPath();
        if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        String[] hit = u.getQuery() != null ? bundle().get(path + "?" + u.getQuery()) : null;
        if (hit == null) hit = bundle().get(path);
        if (hit == null) return null;
        try {
            boolean text = hit[1].startsWith("text/") || hit[1].contains("json") || hit[1].contains("javascript") || hit[1].contains("svg");
            WebResourceResponse r = new WebResourceResponse(hit[1], text ? "utf-8" : null, getAssets().open("site/" + hit[0]));
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-store");
            r.setResponseHeaders(h);
            return r;
        } catch (Exception e) { return null; }
    }

    /** What a live-only API call gets offline: the site's usual error shape, so every page shows its own message too. */
    private WebResourceResponse offlineApi() {
        boolean hi = "hi".equals(getResources().getConfiguration().locale.getLanguage());
        String body = "{\"success\":false,\"error\":{\"errorCode\":\"OFFLINE\",\"errorTitle\":\"" + (hi ? "इंटरनेट चाहिए" : "Internet needed")
            + "\",\"errorContent\":\"" + (hi ? "यह सुविधा ऑनलाइन चलती है — इंटरनेट चालू करें।" : "This needs the internet — turn on mobile data or Wi-Fi.") + "\"}}";
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        ui.post(this::askForInternet);
        return new WebResourceResponse("application/json", "utf-8", 503, "Offline", h,
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    private void askForInternet() {
        long now = System.currentTimeMillis();
        if (isFinishing() || (netDialog != null && netDialog.isShowing()) || now - lastNetPopup < 4000) return;
        lastNetPopup = now;
        netDialog = new android.app.AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle(R.string.net_title)
            .setMessage(R.string.net_text)
            .setPositiveButton(R.string.net_settings, (d, w) -> openNetworkSettings())
            .setNegativeButton(R.string.ok, null)
            .show();
    }

    private void openNetworkSettings() {
        Intent i = new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_INTERNET_CONNECTIVITY : Settings.ACTION_WIRELESS_SETTINGS);
        try { startActivity(i); } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignored) { }
        }
    }

    /** Offline / back-online snackbar, and the page hears about it (window "quantix-net" event). */
    private void watchNetwork() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        netCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) { ui.post(() -> netChanged(online())); }
            @Override public void onLost(Network n) { ui.postDelayed(() -> netChanged(online()), 400); }
        };
        try { cm.registerDefaultNetworkCallback(netCallback); } catch (Exception ignored) { netCallback = null; }
    }

    private void netChanged(boolean ok) {
        if (ok == netOk) return;
        netOk = ok;
        if (ok) {
            forcedOffline = false;
            showSnack(getString(R.string.back_online));
            if (netDialog != null && netDialog.isShowing()) netDialog.dismiss();
        } else showSnack(getString(R.string.went_offline));
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('quantix-net',{detail:" + ok + "}))", null);
    }

    @SuppressWarnings("deprecation")
    private void applyBars(boolean dark, String bg) {
        int c;
        try { c = Color.parseColor(bg.trim()); } catch (Exception e) { c = Color.parseColor(dark ? "#050a16" : "#eef3fb"); }
        Window w = getWindow();
        w.setStatusBarColor(c);
        w.setNavigationBarColor(c);
        View d = w.getDecorView();
        int f = d.getSystemUiVisibility();
        if (dark) f &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0));
        else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
        d.setSystemUiVisibility(f);
    }

    /** Once per start: if the site offers a newer APK, offer it (the app is not on a store, so this is how updates reach people). */
    private void checkForUpdate(boolean manual) {
        if (manual && offline()) { askForInternet(); return; }
        new Thread(() -> {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(SITE + "/web/app/version.json").openConnection();
                c.setConnectTimeout(6000); c.setReadTimeout(6000);
                java.io.InputStream in = c.getInputStream();
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                in.close();
                org.json.JSONObject j = new org.json.JSONObject(b.toString("UTF-8"));
                int code = j.optInt("versionCode", 0);
                if (code <= BuildConfig.VERSION_CODE) {
                    if (manual) runOnUiThread(() -> toast(getString(R.string.up_to_date) + " (" + BuildConfig.VERSION_NAME + ")"));
                    return;
                }
                String name = j.optString("versionName", "");
                boolean hi = "hi".equals(getResources().getConfiguration().locale.getLanguage());
                org.json.JSONObject notes = j.optJSONObject("notes");
                String text = notes != null ? notes.optString(hi ? "hi" : "en", "") : "";
                String url = j.optString("url", "/web/app/Quantix.apk");
                String full = url.startsWith("http") ? url : SITE + url;
                runOnUiThread(() -> {
                    if (isFinishing()) return;
                    new android.app.AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                        .setTitle(getString(R.string.update_title) + " " + name)
                        .setMessage(text.isEmpty() ? getString(R.string.update_text) : text)
                        .setPositiveButton(R.string.update_now, (dlg, w) -> openOutside(Uri.parse(full)))
                        .setNegativeButton(R.string.later, null)
                        .show();
                });
            } catch (Exception ignored) {                 // offline or no file
                if (manual) runOnUiThread(this::askForInternet);
            }
        }).start();
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
        s.setSupportZoom(false);                // an app does not pinch-zoom its whole screen (the labs zoom their own boards)
        s.setBuiltInZoomControls(false);
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
        // a service worker left by app 1.1 would fetch past shouldInterceptRequest: route its requests the same way
        android.webkit.ServiceWorkerController.getInstance().setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebResourceRequest req) { return intercept(req); }
        });

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
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) { return intercept(req); }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                ui.removeCallbacks(showSpinner);
                ui.postDelayed(showSpinner, 700);                        // fast pages never show it
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) { hideSplash(); }

            @Override
            public void onPageFinished(WebView view, String url) {
                ui.removeCallbacks(showSpinner);
                spinner.setVisibility(View.GONE);
                hideSplash();
                if (!url.startsWith("file:")) { showingOffline = false; injectDownloadHook(); }
                // labs: keep the screen awake while an experiment runs
                String path = Uri.parse(url).getPath();
                boolean lab = path != null && path.matches("^/(circuit|plc|chemlab|physics|graph)/?$");
                if (lab) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                Uri u = req.getUrl();
                // "connected" but the server can't be reached (no data balance, captive Wi-Fi, server down):
                // switch to the offline copy if this page is in it
                if (!forcedOffline && HOST.equals(u.getHost()) && fromBundle(u) != null) {
                    forcedOffline = true;
                    showSnack(getString(R.string.server_down));
                    view.post(() -> view.loadUrl(u.toString()));
                    return;
                }
                showOffline(u.toString());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) { if (p >= 80) hideSplash(); }

            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                if (m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR)
                    android.util.Log.w("QuantixWeb", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }

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
            if (offline()) { askForInternet(); return; }      // formula PDFs are made by the server
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

    private WebResourceResponse intercept(WebResourceRequest req) {
        Uri u = req.getUrl();
        if (!HOST.equals(u.getHost())) {
            // offline, a web font stylesheet would hold up the page's scripts until it times out: fail it at once
            return offline() && u.getScheme() != null && u.getScheme().startsWith("http") ? notFound() : null;
        }
        String path = u.getPath() == null ? "/" : u.getPath();
        if ("/sw.js".equals(path)) return notFound();               // the app has its own offline copy
        if (!offline()) return null;                                 // online: always the live site
        if ("/api/v1/health".equals(path)) return silentOffline();   // the server dot turns red, no popup
        if ("GET".equals(req.getMethod())) {
            WebResourceResponse r = fromBundle(u);
            if (r != null) return r;
        }
        if (path.startsWith("/api/")) return offlineApi();           // photo AI, solver, PDFs ... need the server
        return null;                                                 // not packed: normal error -> offline screen
    }

    private static WebResourceResponse silentOffline() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("application/json", "utf-8", 503, "Offline", h,
            new ByteArrayInputStream("{\"success\":false,\"error\":{\"errorCode\":\"OFFLINE\"}}".getBytes(StandardCharsets.UTF_8)));
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
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

        /** The page reports its theme so the status and navigation bars match it (dark or light). */
        @JavascriptInterface
        public void theme(boolean dark, String bg) { runOnUiThread(() -> applyBars(dark, bg)); }

        @JavascriptInterface
        public void share(String title, String url) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, title);
                i.putExtra(Intent.EXTRA_TEXT, title + "\n" + url);
                try { startActivity(Intent.createChooser(i, getString(R.string.share))); } catch (ActivityNotFoundException ignored) { }
            });
        }

        /** A short tap vibration, like native buttons and tabs (no permission needed). */
        @JavascriptInterface
        public void haptic() { runOnUiThread(() -> web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)); }

        @JavascriptInterface
        public boolean isOnline() { return !offline(); }

        @JavascriptInterface
        public void needInternet() { runOnUiThread(MainActivity.this::askForInternet); }

        @JavascriptInterface
        public void networkSettings() { runOnUiThread(MainActivity.this::openNetworkSettings); }

        @JavascriptInterface
        public void checkUpdate() { runOnUiThread(() -> checkForUpdate(true)); }

        @JavascriptInterface
        public String version() { return BuildConfig.VERSION_NAME; }

        @JavascriptInterface
        public void shareApp() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, getString(R.string.share_app) + "\n" + SITE + "/web/app/Quantix.apk");
                try { startActivity(Intent.createChooser(i, getString(R.string.share))); } catch (ActivityNotFoundException ignored) { }
            });
        }
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

    /** A network that really reaches the internet (Android checks it: "validated"), not just Wi-Fi switched on. */
    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities c = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private void showOffline(String failedUrl) {
        if (showingOffline) return;
        showingOffline = true;
        web.loadUrl("file:///android_asset/offline.html?u=" + Uri.encode(failedUrl));
    }

    /** "Try again" on the offline screen. */
    public void retry(String url) {
        showingOffline = false;
        if (online()) forcedOffline = false;
        // offline the packed copy opens instead (Home if that page is not in it)
        String target = url != null && url.startsWith(SITE) ? url : SITE + "/";
        if (offline() && fromBundle(Uri.parse(target)) == null) target = SITE + "/";
        web.loadUrl(target);
    }

    /** Back first closes what is open on the page (menu, sheet, dialog), then goes back, then asks before exiting. */
    @Override
    public void onBackPressed() {
        if (showingOffline) { if (web.canGoBack()) { showingOffline = false; web.goBack(); } else finish(); return; }
        web.evaluateJavascript("window.__quantixBack ? window.__quantixBack() : false", v -> {
            if ("true".equals(v)) return;
            if (web.canGoBack()) { web.goBack(); return; }
            long now = System.currentTimeMillis();
            if (now - lastBack < 2000) { finish(); return; }
            lastBack = now;
            toast(getString(R.string.press_again));
        });
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
        if (netCallback != null) {
            try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCallback); } catch (Exception ignored) { }
        }
        ui.removeCallbacksAndMessages(null);
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }
}
