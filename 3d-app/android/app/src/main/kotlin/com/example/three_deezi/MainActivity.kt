package com.example.three_deezi

import android.app.Activity
import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/** Uses Android's standard document picker; no storage permission is required. */
class MainActivity : FlutterActivity() {
    private var pendingSave: MethodChannel.Result? = null
    private var pendingBytes: ByteArray? = null
    private var pendingName: String = "3DEEZI-demo.zip"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "3deezi/files")
            .setMethodCallHandler { call, result ->
                if (call.method != "saveZip") {
                    result.notImplemented()
                } else if (pendingSave != null) {
                    result.error("busy", "A save is already in progress.", null)
                } else {
                    val bytes = call.argument<ByteArray>("bytes")
                    if (bytes == null) {
                        result.error("invalid_data", "No ZIP data was supplied.", null)
                        return@setMethodCallHandler
                    }
                    pendingSave = result
                    pendingBytes = bytes
                    pendingName = call.argument<String>("name") ?: "3DEEZI-demo.zip"
                    try {
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "application/zip"
                            putExtra(Intent.EXTRA_TITLE, pendingName)
                        }
                        @Suppress("DEPRECATION")
                        startActivityForResult(intent, 3041)
                    } catch (error: Exception) {
                        pendingSave = null
                        pendingBytes = null
                        result.error("save_unavailable", error.message, null)
                    }
                }
            }
    }

    @Deprecated("Used for the platform document picker")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 3041) return
        val result = pendingSave ?: return
        val bytes = pendingBytes
        pendingSave = null
        pendingBytes = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null || bytes == null) {
            result.success("Save cancelled")
            return
        }
        try {
            val stream = contentResolver.openOutputStream(uri)
                ?: throw IllegalStateException("The selected location could not be opened.")
            stream.use { it.write(bytes) }
            result.success("Saved $pendingName to your selected location.")
        } catch (error: Exception) {
            result.error("save_failed", error.message, null)
        }
    }
}
