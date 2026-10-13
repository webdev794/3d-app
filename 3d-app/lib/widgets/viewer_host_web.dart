import 'dart:convert';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

/// Hosts the 3D viewer in an iframe (Flutter web). Commands and replies
/// travel over postMessage; each viewer tags its replies with its own id.
class ViewerHost {
  ViewerHost(
    void Function(String message) onMessage, {
    String page = 'viewer',
    String channel = 'Viewer',
  }) {
    final id = '3deezi-$page-${_next++}';
    _viewType = id;
    _iframe = web.HTMLIFrameElement()
      ..src = 'assets/assets/$page/index.html?host=$id'
      ..allow = 'fullscreen';
    _iframe.style
      ..border = 'none'
      ..width = '100%'
      ..height = '100%';
    ui_web.platformViewRegistry.registerViewFactory(id, (int _) => _iframe);
    _listener = ((web.MessageEvent event) {
      final data = event.data;
      if (!data.isA<JSString>()) return;
      final text = (data as JSString).toDart;
      try {
        if ((jsonDecode(text) as Map)['host'] == id) onMessage(text);
      } on FormatException {
        // Not one of ours.
      }
    }).toJS;
    web.window.addEventListener('message', _listener);
  }

  static int _next = 0;
  late final String _viewType;
  late final web.HTMLIFrameElement _iframe;
  late final JSFunction _listener;

  static bool get supported => true;

  void send(String json) =>
      _iframe.contentWindow?.postMessage(json.toJS, '*'.toJS);

  Widget build() => HtmlElementView(viewType: _viewType);

  void dispose() => web.window.removeEventListener('message', _listener);
}
