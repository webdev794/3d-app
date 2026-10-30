import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

/// Flutter web: the website page opens in a new tab.
Future<void> openSitePage(
  BuildContext context,
  String url,
  String title,
) async {
  web.window.open(url, '_blank');
}

/// Flutter web: the pay page opens in a new tab too (wallets work there).
Future<void> openPayLink(BuildContext context, String url, String title) =>
    openSitePage(context, url, title);
