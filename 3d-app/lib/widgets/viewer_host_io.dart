import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// Hosts a bundled page (the 3D viewer or the artboard) in a native
/// WebView (Android, iOS).
class ViewerHost {
  ViewerHost(
    void Function(String message) onMessage, {
    this.page = 'viewer',
    String channel = 'Viewer',
    String query = '',
  }) {
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff03060a))
      ..addJavaScriptChannel(
        channel,
        onMessageReceived: (m) => onMessage(m.message),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            // iOS loads bundled files without a query: the page is opened
            // once more with it (?hq=1), next to its files (hq-jersey.js).
            if (_pendingQuery case final q?) {
              _pendingQuery = null;
              _web.runJavaScript(
                "location.replace(location.pathname + '?$q');",
              );
            }
          },
        ),
      );
    if (query.isEmpty) {
      _web.loadFlutterAsset('assets/$page/index.html');
    } else if (Platform.isAndroid) {
      // Android serves the bundled files at android_asset and ignores the
      // query when it finds the file.
      _web.loadRequest(
        Uri.parse(
          'file:///android_asset/flutter_assets/assets/$page/index.html?$query',
        ),
      );
    } else {
      _pendingQuery = query;
      _web.loadFlutterAsset('assets/$page/index.html');
    }
    final android = _web.platform;
    if (android is AndroidWebViewController) {
      android.setOnShowFileSelector(_pickFiles);
    }
  }

  /// Android WebViews show no file picker for `<input type="file">` (the
  /// artboard's Import: images, SVG, CorelDRAW) unless the app opens one;
  /// iOS opens its own. The page checks the file types itself.
  static Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final files = params.mode == FileSelectorMode.openMultiple
        ? await openFiles()
        : [if (await openFile() case final file?) file];
    return [for (final file in files) File(file.path).uri.toString()];
  }

  /// Asset folder of the page; its script exposes `window.<page>.receive`.
  final String page;

  late final WebViewController _web;
  String? _pendingQuery;

  /// Tests and desktop VMs have no WebView implementation registered.
  static bool get supported => WebViewPlatform.instance != null;

  /// [json] is a `{cmd, arg}` object literal.
  void send(String json) => _web.runJavaScript('window.$page.receive($json)');

  Widget build() => WebViewWidget(
    controller: _web,
    gestureRecognizers: {
      Factory<OneSequenceGestureRecognizer>(EagerGestureRecognizer.new),
    },
  );

  /// A drag that started outside the view keeps its touch on phones.
  set passThrough(bool on) {}

  void dispose() {}
}
