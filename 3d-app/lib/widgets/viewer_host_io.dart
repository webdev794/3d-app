import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Hosts a bundled page (the 3D viewer or the artboard) in a native
/// WebView (Android, iOS).
class ViewerHost {
  ViewerHost(
    void Function(String message) onMessage, {
    this.page = 'viewer',
    String channel = 'Viewer',
  }) {
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff03060a))
      ..addJavaScriptChannel(
        channel,
        onMessageReceived: (m) => onMessage(m.message),
      )
      ..loadFlutterAsset('assets/$page/index.html');
  }

  /// Asset folder of the page; its script exposes `window.<page>.receive`.
  final String page;

  late final WebViewController _web;

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

  void dispose() {}
}
