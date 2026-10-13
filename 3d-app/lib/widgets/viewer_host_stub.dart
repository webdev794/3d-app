import 'package:flutter/widgets.dart';

/// Platforms without a WebView or browser: the 2D preview is shown instead.
class ViewerHost {
  ViewerHost(void Function(String message) onMessage);

  static bool get supported => false;

  void send(String json) {}

  Widget build() => const SizedBox.shrink();

  void dispose() {}
}
