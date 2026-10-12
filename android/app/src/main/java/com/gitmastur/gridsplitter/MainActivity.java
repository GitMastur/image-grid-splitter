package com.gitmastur.gridsplitter;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "GridSplitter";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        setupWebView();
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Native Android Bridge for saving photos directly to Gallery & Downloads
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient());

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");

                try {
                    startActivityForResult(Intent.createChooser(intent, "Select Image"), FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    Log.e(TAG, "Cannot launch file chooser", e);
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    Uri dataUri = data.getData();
                    if (dataUri != null) {
                        results = new Uri[]{dataUri};
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public class AndroidBridge {

        /**
         * Directly saves an image to the Android system Photo Gallery under Pictures/GridSplitter
         */
        @JavascriptInterface
        public boolean saveImageToGallery(final String filename, final String base64Data, final String mimeType) {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                    values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GridSplitter");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);

                    Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                            }
                        }
                        values.clear();
                        values.put(MediaStore.Images.Media.IS_PENDING, 0);
                        getContentResolver().update(uri, values, null, null);
                        return true;
                    }
                } else {
                    File picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                    File appDir = new File(picturesDir, "GridSplitter");
                    if (!appDir.exists()) appDir.mkdirs();
                    File file = new File(appDir, filename);
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        fos.write(bytes);
                        fos.flush();
                    }
                    sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(file)));
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "Error saving to gallery", e);
                return false;
            }
            return false;
        }

        /**
         * Saves ZIP archives or generic files into the system Downloads folder
         */
        @JavascriptInterface
        public void saveBase64File(final String filename, final String base64Data, final String mimeType) {
            new Thread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                        values.put(MediaStore.Downloads.IS_PENDING, 1);

                        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri != null) {
                            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                                if (os != null) {
                                    os.write(bytes);
                                    os.flush();
                                }
                            }
                            values.clear();
                            values.put(MediaStore.Downloads.IS_PENDING, 0);
                            getContentResolver().update(uri, values, null, null);
                        }
                    } else {
                        File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        if (!downloadsDir.exists()) downloadsDir.mkdirs();
                        File file = new File(downloadsDir, filename);
                        try (FileOutputStream fos = new FileOutputStream(file)) {
                            fos.write(bytes);
                            fos.flush();
                        }
                    }

                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved: " + filename, Toast.LENGTH_SHORT).show());
                } catch (Exception e) {
                    Log.e(TAG, "Save failed", e);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Error saving: " + e.getMessage(), Toast.LENGTH_LONG).show());
                }
            }).start();
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
    }
}
