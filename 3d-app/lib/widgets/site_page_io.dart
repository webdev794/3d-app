import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'ui.dart';

const _browser = MethodChannel('3deezi/browser');

/// Opens [url] in the phone's own browser (Chrome, Safari): true when it opened.
/// Only http(s) links. (Replaced in tests.)
Future<bool> Function(String url) openExternalBrowser = _openExternal;

Future<bool> _openExternal(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || !(uri.isScheme('https') || uri.isScheme('http'))) return false;
  try {
    return await _browser.invokeMethod<bool>('open', {'url': url}) ?? false;
  } on PlatformException {
    return false;
  } on MissingPluginException {
    return false;
  }
}

/// The pay page inside the app, when no browser opens (replaced in tests).
Future<void> Function(BuildContext context, String url, String title) openPayFallback = openSitePage;

/// Phones: the invoice's pay page (a signed 2-hour link) opens in the phone's
/// own browser, where Apple Pay and Google Pay work. Returns when the customer
/// is back in the app, so the caller reads the invoice again. If no browser
/// opens, the page opens inside the app instead (and returns when it closes).
Future<void> openPayLink(BuildContext context, String url, String title) async {
  final back = Completer<void>();
  final listener = AppLifecycleListener(onResume: () {
    if (!back.isCompleted) back.complete();
  });
  try {
    if (!await openExternalBrowser(url)) {
      if (context.mounted) await openPayFallback(context, url, title);
      return;
    }
    await back.future;
  } finally {
    listener.dispose();
  }
}

/// Phones: the website page opens inside the app (signed in with the app's
/// token, see ApiClient.sitePage). Links to other sites stay in the page.
Future<void> openSitePage(BuildContext context, String url, String title) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => _SitePage(url: url, title: title)),
    );

class _SitePage extends StatefulWidget {
  const _SitePage({required this.url, required this.title});
  final String url, title;
  @override
  State<_SitePage> createState() => _SitePageState();
}

class _SitePageState extends State<_SitePage> {
  late final WebViewController _web = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..setBackgroundColor(Palette.bg)
    ..loadRequest(Uri.parse(widget.url));

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    appBar: AppBar(
      backgroundColor: Palette.bg,
      title: Text(widget.title, style: const TextStyle(fontSize: 16)),
    ),
    body: WebViewWidget(controller: _web),
  );
}
