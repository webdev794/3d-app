import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'ui.dart';

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
