import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Hosts the 3D viewer in a native WebView (Android, iOS).
class ViewerHost {
  ViewerHost(void Function(String message) onMessage) {
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff03060a))
      ..addJavaScriptChannel(
        'Viewer',
        onMessageReceived: (m) => onMessage(m.message),
      )
      ..loadFlutterAsset('assets/viewer/index.html');
  }

  late final WebViewController _web;

  /// Tests and desktop VMs have no WebView implementation registered.
  static bool get supported => WebViewPlatform.instance != null;

  /// [json] is a `{cmd, arg}` object literal.
  void send(String json) => _web.runJavaScript('window.viewer.receive($json)');

  Widget build() => WebViewWidget(
    controller: _web,
    gestureRecognizers: {
      Factory<OneSequenceGestureRecognizer>(EagerGestureRecognizer.new),
    },
  );

  void dispose() {}
}
